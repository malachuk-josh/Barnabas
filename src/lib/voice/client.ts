"use client";

import { normalizeForSpeech } from "../speech/normalize";

/* ======================= Speaking ======================= */

export type SpeakerOptions = {
  lang: "en-US" | "es-US" | "ko-KR";
  rate: number;
  pronunciations: { word: string; sayAs: string }[];
  onStart: () => void;
  onIdle: () => void;
};

export interface Speaker {
  speak(sentence: string): void;
  stop(): void;
  busy(): boolean;
  /** The last sentence the leader actually started hearing (for interruption notes). */
  lastHeard: string;
  /** Call from a tap so phones allow audio. */
  unlock(): void;
}

/** A tenth of a second of silence as a WAV data URI, played on the first tap to unlock audio on phones. */
function silentWav(): string {
  const samples = 4410;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true);
  v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, samples * 2, true);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/** Barnabas's own voice from ElevenLabs, fetched sentence by sentence and played in order. */
export class CloudSpeaker implements Speaker {
  private audio: HTMLAudioElement | null = null;
  private queue: { text: string; url: Promise<string | null>; abort: AbortController }[] = [];
  private playing = false;
  private generation = 0;
  lastHeard = "";

  constructor(private readonly opts: SpeakerOptions & { onError: () => void }) {}

  private el() {
    if (!this.audio) this.audio = new Audio();
    return this.audio;
  }

  unlock() {
    const a = this.el();
    a.src = silentWav();
    a.play().catch(() => {});
  }

  speak(sentence: string) {
    const text = normalizeForSpeech(sentence, this.opts.pronunciations);
    if (!text) return;
    const abort = new AbortController();
    const url = fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: this.opts.lang.slice(0, 2) }),
      signal: abort.signal,
    })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    this.queue.push({ text: sentence, url, abort });
    if (!this.playing) void this.next(this.generation);
  }

  private async next(gen: number) {
    const item = this.queue.shift();
    if (!item) {
      this.playing = false;
      this.opts.onIdle();
      return;
    }
    this.playing = true;
    const url = await item.url;
    if (gen !== this.generation) return;
    if (!url) {
      this.opts.onError();
      void this.next(gen);
      return;
    }
    const a = this.el();
    a.src = url;
    a.playbackRate = this.opts.rate;
    a.onended = a.onerror = () => {
      URL.revokeObjectURL(url);
      if (gen === this.generation) void this.next(gen);
    };
    this.lastHeard = item.text;
    this.opts.onStart();
    await a.play().catch(() => {
      if (gen === this.generation) void this.next(gen);
    });
  }

  stop() {
    this.generation++;
    for (const q of this.queue) q.abort.abort();
    this.queue = [];
    this.playing = false;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
    }
  }

  busy() {
    return this.playing || this.queue.length > 0;
  }
}

/** The device's built-in voice: free, works everywhere, less natural. */
export class BrowserSpeaker implements Speaker {
  private pending = 0;
  lastHeard = "";

  constructor(private readonly opts: SpeakerOptions) {}

  unlock() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
  }

  speak(sentence: string) {
    if (typeof speechSynthesis === "undefined") return;
    const text = normalizeForSpeech(sentence, this.opts.pronunciations);
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.opts.lang;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(this.opts.lang.slice(0, 2)));
    const v = voices.find((x) => /natural|neural|premium|enhanced|samantha|google/i.test(x.name)) ?? voices[0];
    if (v) u.voice = v;
    u.rate = this.opts.rate;
    this.pending++;
    u.onstart = () => {
      this.lastHeard = sentence;
      this.opts.onStart();
    };
    u.onend = u.onerror = () => {
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0) this.opts.onIdle();
    };
    speechSynthesis.speak(u);
  }

  stop() {
    this.pending = 0;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  busy() {
    return this.pending > 0;
  }
}

/* ======================= Listening ======================= */

export type ListenerEvents = {
  /** Words heard so far in this utterance (updates live). */
  onInterim: (text: string) => void;
  /** The leader finished a thought. */
  onUtterance: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
};

export interface Listener {
  start(): Promise<void>;
  /** Push-to-talk: stop and deliver what was heard. */
  finish(): void;
  close(): void;
}

type DGResult = {
  type: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
};

/** Deepgram streaming speech-to-text, with Barnabas's congregation names boosted. */
export class DeepgramListener implements Listener {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private finals: string[] = [];
  private interim = "";
  private closed = false;

  constructor(
    private readonly lang: string,
    private readonly events: ListenerEvents,
  ) {}

  private flush() {
    const text = [...this.finals, this.interim].join(" ").replace(/\s+/g, " ").trim();
    this.finals = [];
    this.interim = "";
    this.events.onInterim("");
    if (text) this.events.onUtterance(text);
  }

  async start() {
    // Create and resume the audio context first, while we're still inside the tap: iPhones require it.
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    void this.ctx.resume();
    const tokenRes = await fetch("/api/voice/stt-token");
    if (!tokenRes.ok) throw new Error((await tokenRes.json().catch(() => ({}))).error ?? "Couldn't start listening.");
    const { token, keyterms } = (await tokenRes.json()) as { token: string; keyterms: string[] };

    this.stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation keeps Barnabas from hearing itself, which makes interruptions work.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const q = new URLSearchParams({
      model: "nova-3",
      language: this.lang.startsWith("en") ? "en" : "multi",
      smart_format: "true",
      interim_results: "true",
      endpointing: "500",
      utterance_end_ms: "1500",
      vad_events: "true",
      // Raw 16-bit PCM works the same on every browser, including iPhone home-screen apps.
      encoding: "linear16",
      sample_rate: String(this.ctx.sampleRate),
      channels: "1",
    });
    for (const k of keyterms) q.append("keyterm", k);
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, ["bearer", token]);
    this.ws = ws;

    ws.onmessage = (msg) => {
      const data = JSON.parse(String(msg.data)) as DGResult;
      if (data.type === "Results") {
        const text = data.channel?.alternatives?.[0]?.transcript ?? "";
        if (data.is_final) {
          if (text) this.finals.push(text);
          this.interim = "";
        } else {
          this.interim = text;
        }
        this.events.onInterim([...this.finals, this.interim].join(" ").trim());
        if (data.speech_final) this.flush();
      } else if (data.type === "UtteranceEnd") {
        this.flush();
      }
    };
    ws.onerror = () => this.events.onError("Lost the connection to the listening service.");
    ws.onclose = () => {
      this.release();
      if (!this.closed) this.events.onClose();
    };

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      setTimeout(() => reject(new Error("Couldn't connect to the listening service.")), 8000);
    });

    if (this.ctx.state !== "running") await this.ctx.resume().catch(() => {});
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const v = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      ws.send(pcm.buffer);
    };
    this.source.connect(this.processor);
    // A muted output keeps the processor running without playing the mic back.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute);
    mute.connect(this.ctx.destination);
  }

  finish() {
    // Give the last words a moment to arrive, then deliver everything heard.
    try {
      this.ws?.send(JSON.stringify({ type: "Finalize" }));
    } catch {
      /* closed */
    }
    setTimeout(() => {
      this.flush();
      this.close();
    }, 700);
  }

  private release() {
    this.processor?.disconnect();
    this.source?.disconnect();
    if (this.processor) this.processor.onaudioprocess = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.processor = null;
    this.source = null;
    this.ctx = null;
    this.stream = null;
  }

  close() {
    this.closed = true;
    this.release();
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "CloseStream" }));
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }
}

type WebRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export function browserRecognitionAvailable() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

/** The browser's built-in recognition (push-to-talk only). */
export class BrowserListener implements Listener {
  private rec: WebRecognition | null = null;
  private finalText = "";

  constructor(
    private readonly lang: string,
    private readonly events: ListenerEvents,
  ) {}

  async start() {
    const w = window as unknown as { SpeechRecognition?: new () => WebRecognition; webkitSpeechRecognition?: new () => WebRecognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) throw new Error("Voice isn't available in this browser. Try Chrome, Edge or Safari, or type below.");
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      this.events.onInterim(this.finalText + interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") this.events.onError("Microphone access is blocked. Allow it in your browser settings, or type below.");
      else if (e.error !== "no-speech" && e.error !== "aborted") this.events.onError("I couldn't hear that. Try again.");
    };
    rec.onend = () => {
      this.events.onInterim("");
      const text = this.finalText.trim();
      this.finalText = "";
      this.rec = null;
      if (text) this.events.onUtterance(text);
      this.events.onClose();
    };
    this.rec = rec;
    rec.start();
  }

  finish() {
    this.rec?.stop();
  }

  close() {
    this.rec?.abort();
    this.rec = null;
  }
}
