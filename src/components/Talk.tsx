"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SentenceChunker } from "@/lib/speech/chunker";
import {
  BrowserListener,
  BrowserSpeaker,
  CloudSpeaker,
  DeepgramListener,
  browserRecognitionAvailable,
  type Listener,
  type Speaker,
} from "@/lib/voice/client";

type Turn = { id: number; role: "leader" | "barnabas"; text: string; unheard: string; tools: string[] };
type Status = "idle" | "listening" | "thinking" | "speaking";
type Lang = "en-US" | "es-US" | "ko-KR";

type VoicePrefs = { speakReplies: boolean; language: Lang; rate: number; handsFree: boolean };

const LANGS: { value: Lang; label: string }[] = [
  { value: "en-US", label: "English" },
  { value: "es-US", label: "Español" },
  { value: "ko-KR", label: "한국어" },
];

function statusText(status: Status, handsFree: boolean) {
  if (status === "listening") return handsFree ? "Listening… just talk. Tap to stop." : "Listening… tap when you're done";
  if (status === "thinking") return "Thinking…";
  if (status === "speaking") return handsFree ? "Speaking… talk anytime to interrupt" : "Speaking… tap to interrupt";
  return handsFree ? "Tap to start a hands-free conversation" : "Tap to talk";
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTime() {
  return new Date().toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });
}

let nextId = 1;

export function Talk({
  greetingName,
  voice,
  pronunciations,
  cloudVoice,
  cloudListening,
}: {
  greetingName: string;
  voice: VoicePrefs;
  pronunciations: { word: string; sayAs: string }[];
  /** Barnabas's own ElevenLabs voice is set up. */
  cloudVoice: boolean;
  /** Deepgram listening is set up (needed for hands-free). */
  cloudListening: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Timing readout for tuning voice speed: visit /?timing=1 to turn it on, /?timing=0 to turn it off.
  const [showTiming, setShowTiming] = useState(false);
  const [lastTiming, setLastTiming] = useState<string | null>(null);
  const timing = useRef<{ start: number; firstText?: number; firstVoice?: number; server?: string } | null>(null);
  useEffect(() => {
    try {
      const flag = new URLSearchParams(window.location.search).get("timing");
      if (flag === "1") localStorage.setItem("barnabas.timing", "1");
      if (flag === "0") localStorage.removeItem("barnabas.timing");
      setShowTiming(localStorage.getItem("barnabas.timing") === "1");
    } catch {
      // storage unavailable: leave the readout off
    }
  }, []);
  const [offRecord, setOffRecord] = useState(false);
  const [speak, setSpeak] = useState(voice.speakReplies);
  const [lang, setLang] = useState<Lang>(voice.language);
  const [handsFree, setHandsFree] = useState(voice.handsFree && cloudListening);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const convRef = useRef<{ id: string; offRecord: boolean } | null>(null);
  const creating = useRef<Promise<string> | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const listener = useRef<Listener | null>(null);
  const streamOpen = useRef(false);
  const ignoreReply = useRef(false);
  const pendingInterrupt = useRef<string | null>(null);
  const pushBuffer = useRef<string[]>([]);
  const handsFreeRef = useRef(handsFree);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  handsFreeRef.current = handsFree;

  useEffect(() => {
    setVoiceSupported(cloudListening || browserRecognitionAvailable());
  }, [cloudListening]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, interim]);

  const settle = useCallback(() => {
    if (speaker.current?.busy() || streamOpen.current) return;
    setStatus(listener.current && handsFreeRef.current ? "listening" : "idle");
  }, []);

  // One speaker for the current voice settings: Barnabas's own voice when it's set up, the device voice otherwise.
  useEffect(() => {
    speaker.current?.stop();
    const opts = {
      lang,
      rate: voice.rate,
      pronunciations,
      onStart: () => {
        const t = timing.current;
        if (t && t.firstVoice === undefined) t.firstVoice = performance.now();
        setStatus("speaking");
      },
      onIdle: () => settle(),
    };
    speaker.current = cloudVoice ? new CloudSpeaker({ ...opts, onError: () => setError("Barnabas's voice didn't load for one sentence. The text is on screen.") }) : new BrowserSpeaker(opts);
  }, [cloudVoice, lang, voice.rate, pronunciations, settle]);

  const stopListening = useCallback(() => {
    listener.current?.close();
    listener.current = null;
    setInterim("");
  }, []);

  const endConversation = useCallback(
    async (reason: "button" | "idle" | "toggle") => {
      const conv = convRef.current;
      convRef.current = null;
      setConversationId(null);
      speaker.current?.stop();
      stopListening();
      setStatus("idle");
      if (!conv) return;
      try {
        await fetch(`/api/conversations/${conv.id}/end`, { method: "POST" });
      } catch {
        /* best effort */
      }
      if (reason !== "toggle") setTurns([]);
      setNotice(null);
    },
    [stopListening],
  );

  const touch = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => void endConversation("idle"), 10 * 60 * 1000);
  }, [endConversation]);

  useEffect(() => {
    const onHide = () => {
      const conv = convRef.current;
      if (conv) navigator.sendBeacon?.(`/api/conversations/${conv.id}/end`);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      listener.current?.close();
    };
  }, []);

  function ensureConversation(mode: "voice" | "text"): Promise<string> {
    if (convRef.current) return Promise.resolve(convRef.current.id);
    if (!creating.current) {
      creating.current = (async () => {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, offRecord, localDate: localDate() }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't start a conversation.");
        const data = (await res.json()) as { id: string; offRecord: boolean };
        convRef.current = { id: data.id, offRecord: data.offRecord };
        setConversationId(data.id);
        return data.id;
      })().finally(() => {
        creating.current = null;
      });
    }
    return creating.current;
  }

  function interrupt() {
    const wasSpeaking = speaker.current?.busy() ?? false;
    speaker.current?.stop();
    if (streamOpen.current || wasSpeaking) {
      ignoreReply.current = true;
      pendingInterrupt.current = speaker.current?.lastHeard || "(nothing yet)";
    }
  }

  async function send(text: string, via: "voice" | "text") {
    const clean = text.trim();
    if (!clean) return;
    timing.current = { start: performance.now() };
    setError(null);
    touch();
    let id: string;
    try {
      id = await ensureConversation(via);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a conversation.");
      setStatus("idle");
      return;
    }
    const reply: Turn = { id: nextId++, role: "barnabas", text: "", unheard: "", tools: [] };
    setTurns((t) => [...t, { id: nextId++, role: "leader", text: clean, unheard: "", tools: [] }, reply]);
    setStatus("thinking");
    ignoreReply.current = false;
    if (speaker.current) speaker.current.lastHeard = "";
    const interruptedAfter = pendingInterrupt.current ?? undefined;
    pendingInterrupt.current = null;

    const update = (fn: (t: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === reply.id ? fn(t) : t)));
    const voiced = via === "voice" && speak;
    // Whole sentences only: speaking an opening clause on its own flattens its intonation.
    const chunker = new SentenceChunker();
    const say = (s: string) => {
      if (voiced && !ignoreReply.current) speaker.current?.speak(s);
    };
    streamOpen.current = true;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, text: clean, interruptedAfter, localTime: localTime(), voice: via === "voice" }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) {
          convRef.current = null;
          setConversationId(null);
        }
        throw new Error(body.error ?? "Barnabas couldn't answer just now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as
            | { type: "text"; text: string }
            | { type: "tool"; name: string; phrase?: string }
            | { type: "notice"; text: string }
            | { type: "timing"; model: string; setupMs: number; firstTextMs: number | null }
            | { type: "done" }
            | { type: "error"; message: string };
          if (event.type === "text" && timing.current && timing.current.firstText === undefined) timing.current.firstText = performance.now();
          if (event.type === "timing" && timing.current) {
            timing.current.server = `${event.model.replace(/^claude-/, "")}, server setup ${event.setupMs}ms, model ${event.firstTextMs ?? "-"}ms`;
          }
          if (event.type === "text") {
            if (ignoreReply.current) update((t) => ({ ...t, unheard: t.unheard + event.text }));
            else {
              update((t) => ({ ...t, text: t.text + event.text }));
              chunker.push(event.text).forEach(say);
            }
          } else if (event.type === "tool") {
            update((t) => ({ ...t, tools: [...t.tools, event.name] }));
            if (event.phrase && !speaker.current?.busy()) say(event.phrase);
          } else if (event.type === "notice") {
            setNotice(event.text);
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
      chunker.flush().forEach(say);
      const t = timing.current;
      if (t) {
        const s = (v?: number) => (v === undefined ? "-" : `${((v - t.start) / 1000).toFixed(1)}s`);
        const line = `First words ${s(t.firstText)} · voice ${s(t.firstVoice)} (${t.server ?? "no server timing"})`;
        setLastTiming(line);
        // Voice may start after the stream ends; refresh the line once it does.
        if (voiced && t.firstVoice === undefined) {
          setTimeout(() => {
            if (timing.current === t) setLastTiming(`First words ${s(t.firstText)} · voice ${s(t.firstVoice)} (${t.server ?? "no server timing"})`);
          }, 4000);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Barnabas couldn't answer just now.");
    } finally {
      streamOpen.current = false;
      settle();
      touch();
    }
  }

  async function startListening(continuous: boolean) {
    let continuousFallback = false;
    setError(null);
    speaker.current?.unlock();
    pushBuffer.current = [];
    const events = {
      onInterim: (text: string) => {
        setInterim(text);
        // Hands-free: speaking over Barnabas interrupts it (two words, so a cough doesn't).
        if (continuous && text.split(/\s+/).filter(Boolean).length >= 2 && (speaker.current?.busy() || streamOpen.current) && !ignoreReply.current) {
          interrupt();
          setStatus("listening");
        }
      },
      onUtterance: (text: string) => {
        if (continuous) {
          if (speaker.current?.busy() || streamOpen.current) interrupt();
          void send(text, "voice");
        } else {
          pushBuffer.current.push(text);
        }
      },
      onError: (message: string) => setError(message),
      onClose: () => {
        listener.current = null;
        setInterim("");
        if (!continuous || continuousFallback) {
          const text = pushBuffer.current.join(" ").trim();
          pushBuffer.current = [];
          if (text) void send(text, "voice");
          else setStatus((s) => (s === "listening" ? "idle" : s));
        } else {
          setStatus((s) => (s === "listening" ? "idle" : s));
        }
      },
    };
    const l: Listener = cloudListening ? new DeepgramListener(lang, events) : new BrowserListener(lang, events);
    listener.current = l;
    setStatus("listening");
    // Start the conversation (and warm Claude's cache) while the leader is still talking.
    void ensureConversation("voice").catch(() => {});
    try {
      await l.start();
    } catch (err) {
      l.close();
      // If the listening service is unavailable, fall back to the browser's own recognition (push-to-talk).
      if (cloudListening && browserRecognitionAvailable()) {
        const fallback = new BrowserListener(lang, { ...events, onUtterance: (t: string) => pushBuffer.current.push(t), onClose: () => events.onClose() });
        continuousFallback = true;
        listener.current = fallback;
        try {
          await fallback.start();
          setError("Hands-free listening isn't available right now, so Barnabas is using your device's speech recognition. Tap when you're done.");
          return;
        } catch {
          /* fall through */
        }
      }
      listener.current = null;
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Couldn't start listening.");
    }
  }

  function onOrb() {
    if (handsFree) {
      if (listener.current) {
        interrupt();
        stopListening();
        setStatus("idle");
      } else {
        void startListening(true);
      }
      return;
    }
    if (status === "listening") {
      listener.current?.finish();
      return;
    }
    if (status === "speaking" || status === "thinking") interrupt();
    void startListening(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft;
    setDraft("");
    if (status === "speaking" || status === "thinking") interrupt();
    await send(text, "text");
  }

  function toggleOffRecord(next: boolean) {
    if (convRef.current) void endConversation("toggle");
    setTurns([]);
    setOffRecord(next);
  }

  function toggleHandsFree(next: boolean) {
    stopListening();
    setStatus("idle");
    setHandsFree(next);
  }

  return (
    <section className="talk" aria-label="Talk with Barnabas">
      <div className="stack" style={{ gap: 6 }}>
        <h1>How can I encourage you today{greetingName ? `, ${greetingName}` : ""}?</h1>
        <p className="sub">
          Ask who needs a call, get ready for a visit, check on your volunteers, or plan your week.
          {offRecord ? " This conversation is off the record: nothing will be saved." : ""}
        </p>
      </div>

      <div className="orb-row">
        <button type="button" className="orb" data-state={status} onClick={onOrb} disabled={!voiceSupported} aria-label={statusText(status, handsFree)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <p className="orb-status" aria-live="polite">
          {voiceSupported ? statusText(status, handsFree) : "Voice isn't available in this browser. You can type below."}
        </p>
      </div>

      {showTiming && lastTiming && <p className="small muted" aria-live="off">{lastTiming}</p>}
      {notice && (
        <div className="notice notice-danger" role="alert">
          {notice}
        </div>
      )}
      {error && (
        <div className="notice" role="alert" style={{ color: "var(--night)", background: "var(--sea-glass)" }}>
          {error}
        </div>
      )}

      <div className="transcript" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className={`bubble ${t.role === "leader" ? "bubble-leader" : "bubble-barnabas"}`}>
            {t.tools.length > 0 && t.role === "barnabas" && !t.text && !t.unheard && <span className="tool-line">Looking that up…</span>}
            {t.text}
            {t.unheard && <span className="bubble-unheard"> {t.unheard}</span>}
          </div>
        ))}
        {interim && <div className="bubble bubble-leader bubble-unheard">{interim}</div>}
        <div ref={transcriptEnd} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <label htmlFor="message" style={{ position: "absolute", left: -9999 }}>
          Message Barnabas
        </label>
        <input id="message" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type to Barnabas…" autoComplete="off" />
        <button type="submit" className="btn btn-send" disabled={!draft.trim()}>
          Send
        </button>
      </form>

      <div className="toggles">
        <label>
          <input id="off-record" type="checkbox" checked={offRecord} onChange={(e) => toggleOffRecord(e.target.checked)} />
          Off the record
        </label>
        <label>
          <input id="speak-replies" type="checkbox" checked={speak} onChange={(e) => { setSpeak(e.target.checked); if (!e.target.checked) speaker.current?.stop(); }} />
          Speak replies
        </label>
        {cloudListening && (
          <label>
            <input id="hands-free" type="checkbox" checked={handsFree} onChange={(e) => toggleHandsFree(e.target.checked)} />
            Hands-free
          </label>
        )}
        <label>
          Language
          <select id="voice-language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        {conversationId && (
          <button type="button" className="btn" onClick={() => void endConversation("button")} style={{ marginLeft: "auto" }}>
            End conversation
          </button>
        )}
      </div>
    </section>
  );
}
