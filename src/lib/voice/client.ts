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
  /** A short sound while the reply is being written ("Mm.", "Let me think."). */
  filler?(index: number, text: string): void;
}

/** A tenth of a second of silence as a WAV data URI, played on the first tap to unlock audio on phones. */
export function silentWav(): string {
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

/**
 * Barnabas's own voice from ElevenLabs, fetched sentence by sentence and played in order.
 *
 * Sentences play through one AudioContext that stays open for the whole reply, each with a short fade in
 * and out. Swapping an <audio> element's source between sentences made a click at every clip edge, and on
 * phones with the microphone open (hands-free) the audio route re-engaged between clips, which sounded like
 * a burst of static. At a speaking speed other than 1x the <audio> element is used instead, because it
 * keeps the voice's pitch when sped up.
 */
export class CloudSpeaker implements Speaker {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private queue: { text: string; spoken: string; data: Promise<ArrayBuffer | null> | null; abort: AbortController; filler?: boolean }[] = [];
  private playing = false;
  private generation = 0;
  lastHeard = "";

  constructor(private readonly opts: SpeakerOptions & { onError: () => void }) {}

  /** Web Audio when available and at normal speed. */
  private useWebAudio() {
    return this.opts.rate === 1 && typeof window !== "undefined" && typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) !== "undefined";
  }

  private context(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "playback" });
    }
    return this.ctx;
  }

  private el() {
    if (!this.audio) this.audio = new Audio();
    return this.audio;
  }

  unlock() {
    if (this.useWebAudio()) {
      // Phones only allow audio to start from a tap: resume the context and play one silent sample.
      const ctx = this.context();
      void ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start();
      return;
    }
    const a = this.el();
    a.src = silentWav();
    a.play().catch(() => {});
  }

  /** Filler clips, fetched once per page and replayed from memory. */
  private fillerCache = new Map<string, Promise<ArrayBuffer | null>>();

  filler(index: number, text: string) {
    const lang = this.opts.lang.slice(0, 2);
    const key = `${lang}:${index}`;
    let clip = this.fillerCache.get(key);
    if (!clip) {
      clip = fetch(`/api/voice/filler/${index}?lang=${lang}`).then((r) => (r.ok ? r.arrayBuffer() : null), () => null);
      this.fillerCache.set(key, clip);
    }
    // Copy per play: decoding detaches the buffer.
    const data = clip.then((b) => (b ? b.slice(0) : null));
    this.queue.unshift({ text, spoken: text, data, abort: new AbortController(), filler: true });
    if (!this.playing) void this.next(this.generation);
  }

  /** Fetch the filler clips ahead of time, one at a time (ElevenLabs allows only a few requests at once). */
  warmFillers(count: number) {
    const lang = this.opts.lang.slice(0, 2);
    let chain: Promise<unknown> = Promise.resolve();
    for (let i = 0; i < count; i++) {
      const key = `${lang}:${i}`;
      if (this.fillerCache.has(key)) continue;
      const clip = chain.then(() => fetch(`/api/voice/filler/${i}?lang=${lang}`).then((r) => (r.ok ? r.arrayBuffer() : null), () => null));
      this.fillerCache.set(key, clip);
      chain = clip;
    }
  }

  speak(sentence: string) {
    const text = normalizeForSpeech(sentence, this.opts.pronunciations);
    if (!text) return;
    this.queue.push({ text: sentence, spoken: text, data: null, abort: new AbortController() });
    this.prefetch();
    if (!this.playing) void this.next(this.generation);
  }

  /** ElevenLabs allows a few requests at a time: fetch only the next couple of sentences ahead. */
  private prefetch() {
    for (const item of this.queue.slice(0, 2)) {
      if (item.data) continue;
      item.data = this.fetchAudio(item.spoken, item.abort.signal);
    }
  }

  private async fetchAudio(text: string, signal: AbortSignal, attempt = 0): Promise<ArrayBuffer | null> {
    try {
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: this.opts.lang.slice(0, 2) }),
        signal,
      });
      if (r.status === 429 && attempt < 2) {
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
        return this.fetchAudio(text, signal, attempt + 1);
      }
      return r.ok ? await r.arrayBuffer() : null;
    } catch {
      return null;
    }
  }

  private async next(gen: number) {
    const item = this.queue.shift();
    if (!item) {
      this.playing = false;
      this.current = null;
      this.opts.onIdle();
      return;
    }
    this.playing = true;
    this.prefetch();
    const data = await (item.data ?? (item.data = this.fetchAudio(item.spoken, item.abort.signal)));
    if (gen !== this.generation) return;
    if (!data) {
      if (!item.filler) this.opts.onError();
      void this.next(gen);
      return;
    }
    const done = () => {
      if (gen === this.generation) void this.next(gen);
    };
    if (this.useWebAudio()) {
      try {
        await this.playBuffer(data, gen, item.filler ? null : item.text, done);
        return;
      } catch {
        // decoding failed in this browser: fall back to the <audio> element for this sentence
      }
      if (gen !== this.generation) return;
    }
    this.playElement(data, item.filler ? null : item.text, done, gen);
  }

  private async playBuffer(data: ArrayBuffer, gen: number, text: string | null, done: () => void) {
    const ctx = this.context();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const buffer = await ctx.decodeAudioData(data.slice(0));
    if (gen !== this.generation) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    // A few milliseconds of fade at each edge: no click where one clip ends and the next begins.
    const t = ctx.currentTime + 0.01;
    const end = t + buffer.duration;
    const fadeIn = Math.min(0.012, buffer.duration / 4);
    const fadeOut = Math.min(0.025, buffer.duration / 4);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + fadeIn);
    gain.gain.setValueAtTime(1, Math.max(t + fadeIn, end - fadeOut));
    gain.gain.linearRampToValueAtTime(0, end);
    src.onended = () => {
      if (this.current?.src === src) this.current = null;
      done();
    };
    this.current = { src, gain };
    // Fillers ("Mm.") aren't something the leader "heard" of the reply.
    if (text !== null) this.lastHeard = text;
    this.opts.onStart();
    src.start(t);
  }

  private playElement(data: ArrayBuffer, text: string | null, done: () => void, gen: number) {
    const url = URL.createObjectURL(new Blob([data], { type: "audio/mpeg" }));
    const a = this.el();
    a.src = url;
    a.playbackRate = this.opts.rate;
    a.onended = a.onerror = () => {
      URL.revokeObjectURL(url);
      done();
    };
    if (text !== null) this.lastHeard = text;
    this.opts.onStart();
    a.play().catch(() => {
      if (gen === this.generation) done();
    });
  }

  stop() {
    this.generation++;
    for (const q of this.queue) q.abort.abort();
    this.queue = [];
    this.playing = false;
    if (this.current && this.ctx) {
      // Fade out over a few milliseconds instead of cutting off mid-wave, which clicks.
      const { src, gain } = this.current;
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.03);
      src.onended = null;
      try {
        src.stop(now + 0.035);
      } catch {
        // already stopped
      }
      this.current = null;
    }
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

/** How long a pause ends the leader's turn, in ms. Short feels quick; long is patient with slow speakers. */
export const DEFAULT_PAUSE_MS = 600;
export const MIN_PAUSE_MS = 200;
export const MAX_PAUSE_MS = 2000;
export const clampPause = (ms: number) => Math.round(Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, Number.isFinite(ms) ? ms : DEFAULT_PAUSE_MS)));

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

/*
 * Keeping the microphone between conversations. iPhones ask for microphone permission again when a page
 * asks for the microphone after letting go of it, so after a conversation the stream is held (its tracks
 * disabled, nothing captured or sent) for MIC_HOLD_MS, and the next conversation reuses it without a prompt.
 * It's released after that quiet time, or as soon as the leader leaves the app. A restart of a home-screen
 * app still asks once: iOS doesn't keep the permission for those.
 */
export const MIC_HOLD_MS = 20 * 60 * 1000;
let heldMic: MediaStream | null = null;
let micTimer: ReturnType<typeof setTimeout> | null = null;
let watchingMic = false;

const micLive = (s: MediaStream) => s.getAudioTracks().some((t) => t.readyState === "live");

/** The held microphone if it's still live, otherwise a new one (which may ask for permission). */
export async function takeMic(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (micTimer) clearTimeout(micTimer);
  micTimer = null;
  const held = heldMic;
  heldMic = null;
  if (held && micLive(held)) {
    held.getAudioTracks().forEach((t) => (t.enabled = true));
    return held;
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

/** Hold the microphone quietly for the next conversation instead of letting it go. */
export function holdMic(stream: MediaStream) {
  if (!micLive(stream) || (typeof document !== "undefined" && document.hidden)) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  stream.getAudioTracks().forEach((t) => (t.enabled = false));
  if (heldMic && heldMic !== stream) heldMic.getTracks().forEach((t) => t.stop());
  heldMic = stream;
  if (micTimer) clearTimeout(micTimer);
  micTimer = setTimeout(releaseMic, MIC_HOLD_MS);
  if (!watchingMic && typeof window !== "undefined") {
    watchingMic = true;
    // Leaving the app lets it go at once (the orange dot goes away).
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseMic();
    });
    window.addEventListener("pagehide", releaseMic);
  }
}

/** Let the held microphone go. */
export function releaseMic() {
  if (micTimer) clearTimeout(micTimer);
  micTimer = null;
  heldMic?.getTracks().forEach((t) => t.stop());
  heldMic = null;
}

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
    /** How long a pause (ms) ends the leader's turn: the "Wait before answering" setting. */
    private readonly pauseMs = DEFAULT_PAUSE_MS,
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

    this.stream = await takeMic({
      // Echo cancellation keeps Barnabas from hearing itself, which makes interruptions work.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const q = new URLSearchParams({
      model: "nova-3",
      language: this.lang.startsWith("en") ? "en" : "multi",
      smart_format: "true",
      interim_results: "true",
      // How long a pause ends your turn: short enough to feel quick, long enough not to cut off a breath.
      endpointing: String(clampPause(this.pauseMs)),
      // The backstop for when no clear pause is detected; Deepgram's minimum is 1000 ms.
      utterance_end_ms: String(Math.min(5000, Math.max(1000, clampPause(this.pauseMs) + 700))),
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
    // Kept for the next conversation (see holdMic), so the iPhone doesn't ask again.
    if (this.stream) holdMic(this.stream);
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
