"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SentenceChunker } from "@/lib/speech/chunker";
import { normalizeForSpeech } from "@/lib/speech/normalize";

/* ---------- Browser speech types (Web Speech API) ---------- */
type Recognition = {
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
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Turn = { id: number; role: "leader" | "barnabas"; text: string; unheard: string; tools: string[] };
type Status = "idle" | "listening" | "thinking" | "speaking";
type Lang = "en-US" | "es-US" | "ko-KR";

const LANGS: { value: Lang; label: string }[] = [
  { value: "en-US", label: "English" },
  { value: "es-US", label: "Español" },
  { value: "ko-KR", label: "한국어" },
];

const STATUS_TEXT: Record<Status, string> = {
  idle: "Tap to talk",
  listening: "Listening… tap when you're done",
  thinking: "Thinking…",
  speaking: "Speaking… tap to interrupt",
};

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTime() {
  return new Date().toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const preferred = voices.find((v) => /natural|neural|premium|enhanced|samantha|google/i.test(v.name));
  return preferred ?? voices[0] ?? null;
}

let nextId = 1;

export function Talk() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offRecord, setOffRecord] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [lang, setLang] = useState<Lang>("en-US");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const convRef = useRef<{ id: string; offRecord: boolean } | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const speakingQueue = useRef(0);
  const streamOpen = useRef(false);
  const ignoreReply = useRef(false);
  const lastHeard = useRef("");
  const pendingInterrupt = useRef<string | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVoiceSupported(Boolean(recognitionCtor()) && typeof speechSynthesis !== "undefined");
    try {
      const saved = localStorage.getItem("barnabas.lang") as Lang | null;
      if (saved && LANGS.some((l) => l.value === saved)) setLang(saved);
      if (localStorage.getItem("barnabas.speak") === "off") setSpeak(false);
    } catch {
      /* storage unavailable */
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, interim]);

  const settle = useCallback(() => {
    if (speakingQueue.current === 0 && !streamOpen.current) setStatus((s) => (s === "listening" ? s : "idle"));
  }, []);

  const endConversation = useCallback(async (reason: "button" | "idle" | "toggle") => {
    const conv = convRef.current;
    convRef.current = null;
    setConversationId(null);
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    if (!conv) return;
    try {
      await fetch(`/api/conversations/${conv.id}/end`, { method: "POST" });
    } catch {
      /* best effort */
    }
    if (reason !== "toggle") setTurns([]);
    setNotice(null);
  }, []);

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
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const creating = useRef<Promise<string> | null>(null);

  function ensureConversation(mode: "voice" | "text"): Promise<string> {
    if (convRef.current) return Promise.resolve(convRef.current.id);
    if (!creating.current) {
      creating.current = createConversation(mode).finally(() => {
        creating.current = null;
      });
    }
    return creating.current;
  }

  async function createConversation(mode: "voice" | "text") {
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
  }

  function speakSentence(sentence: string) {
    if (!speak || typeof speechSynthesis === "undefined" || ignoreReply.current) return;
    const text = normalizeForSpeech(sentence);
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = 1.02;
    speakingQueue.current += 1;
    setStatus("speaking");
    u.onstart = () => {
      lastHeard.current = sentence;
    };
    const done = () => {
      speakingQueue.current = Math.max(0, speakingQueue.current - 1);
      settle();
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  function interrupt() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    speakingQueue.current = 0;
    if (streamOpen.current || status === "speaking") {
      ignoreReply.current = true;
      pendingInterrupt.current = lastHeard.current || "(nothing yet)";
    }
  }

  async function send(text: string, via: "voice" | "text") {
    const clean = text.trim();
    if (!clean) return;
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
    const leaderTurn: Turn = { id: nextId++, role: "leader", text: clean, unheard: "", tools: [] };
    const reply: Turn = { id: nextId++, role: "barnabas", text: "", unheard: "", tools: [] };
    setTurns((t) => [...t, leaderTurn, reply]);
    setStatus("thinking");
    ignoreReply.current = false;
    lastHeard.current = "";
    const interruptedAfter = pendingInterrupt.current ?? undefined;
    pendingInterrupt.current = null;

    const update = (fn: (t: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === reply.id ? fn(t) : t)));
    const chunker = new SentenceChunker();
    const voiceReply = via === "voice";
    streamOpen.current = true;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, text: clean, interruptedAfter, localTime: localTime() }),
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
            | { type: "done" }
            | { type: "error"; message: string };
          if (event.type === "text") {
            if (ignoreReply.current) update((t) => ({ ...t, unheard: t.unheard + event.text }));
            else {
              update((t) => ({ ...t, text: t.text + event.text }));
              if (voiceReply) chunker.push(event.text).forEach(speakSentence);
            }
          } else if (event.type === "tool") {
            update((t) => ({ ...t, tools: [...t.tools, event.name] }));
            if (voiceReply && event.phrase && speakingQueue.current === 0) speakSentence(event.phrase);
          } else if (event.type === "notice") {
            setNotice(event.text);
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
      if (voiceReply) chunker.flush().forEach(speakSentence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Barnabas couldn't answer just now.");
    } finally {
      streamOpen.current = false;
      settle();
      touch();
    }
  }

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("Voice isn't available in this browser. Try Chrome, Edge or Safari, or type below.");
      return;
    }
    // Prime speech output on iOS, which only allows it after a tap.
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.getVoices().length === 0) speechSynthesis.getVoices();
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(finalText + interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access is blocked. Allow it in your browser settings, or type below.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("I couldn't hear that. Try again.");
      }
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setInterim("");
      if (finalText.trim()) void send(finalText, "voice");
      else setStatus((s) => (s === "listening" ? "idle" : s));
    };
    recognitionRef.current = rec;
    setStatus("listening");
    setError(null);
    // Warm the conversation (and Claude's cache) while the leader is still talking.
    void ensureConversation("voice").catch(() => {});
    rec.start();
  }

  function onOrb() {
    if (status === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    if (status === "speaking" || status === "thinking") interrupt();
    startListening();
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

  function changeLang(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem("barnabas.lang", next);
    } catch {
      /* ignore */
    }
  }

  function toggleSpeak(next: boolean) {
    setSpeak(next);
    if (!next && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    try {
      localStorage.setItem("barnabas.speak", next ? "on" : "off");
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="talk" aria-label="Talk with Barnabas">
      <div className="stack" style={{ gap: 6 }}>
        <h1>How can I encourage you today?</h1>
        <p className="sub">
          Ask who needs a call, get ready for a visit, check on your volunteers, or draft a message.
          {offRecord ? " This conversation is off the record: nothing will be saved." : ""}
        </p>
      </div>

      <div className="orb-row">
        <button
          type="button"
          className="orb"
          data-state={status}
          onClick={onOrb}
          disabled={!voiceSupported}
          aria-label={STATUS_TEXT[status]}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <p className="orb-status" aria-live="polite">
          {voiceSupported ? STATUS_TEXT[status] : "Voice isn't available in this browser. You can type below."}
        </p>
      </div>

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
        <label htmlFor="message" className="sr-only" style={{ position: "absolute", left: -9999 }}>
          Message Barnabas
        </label>
        <input
          id="message"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Or type to Barnabas…"
          autoComplete="off"
        />
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
          <input id="speak-replies" type="checkbox" checked={speak} onChange={(e) => toggleSpeak(e.target.checked)} />
          Speak replies
        </label>
        <label>
          Language
          <select id="voice-language" value={lang} onChange={(e) => changeLang(e.target.value as Lang)}>
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
