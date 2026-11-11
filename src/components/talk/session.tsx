"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { playEarcon, unlockEarcons } from "@/lib/voice/earcons";
import { SentenceChunker } from "@/lib/speech/chunker";
import { FILLER_DELAY_MS, FILLERS } from "@/lib/voice/fillers";
import {
  BrowserListener,
  BrowserSpeaker,
  CloudSpeaker,
  DeepgramListener,
  browserRecognitionAvailable,
  type Listener,
  type Speaker,
} from "@/lib/voice/client";

/**
 * The conversation with Barnabas, kept above the pages (in the root layout) so it carries on while the
 * leader moves around the app: listening, speaking, the transcript and the open conversation all
 * survive opening a verse in The Word or any other page. Today's Talk panel shows it in full; other
 * pages show a slim bar while Barnabas is listening, thinking or speaking. It stays inert until a page
 * with the Talk panel configures it.
 */

export type Turn = { id: number; role: "leader" | "barnabas"; text: string; unheard: string; tools: string[]; links?: { label: string; href: string }[] };
export type Status = "idle" | "listening" | "thinking" | "speaking";
export type Lang = "en-US" | "es-US" | "ko-KR";

export type VoicePrefs = { speakReplies: boolean; language: Lang; rate: number; handsFree: boolean; readTyped?: boolean; pauseMs?: number; fillers?: boolean };

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTime() {
  return new Date().toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });
}

export const LANGS: { value: Lang; label: string }[] = [
  { value: "en-US", label: "English" },
  { value: "es-US", label: "Español" },
  { value: "ko-KR", label: "한국어" },
];

export function statusText(status: Status, handsFree: boolean) {
  if (status === "listening") return handsFree ? "Listening… just talk. Tap to stop." : "Listening… tap when you're done";
  if (status === "thinking") return "Thinking…";
  if (status === "speaking") return handsFree ? "Speaking… talk anytime to interrupt" : "Speaking… tap to interrupt";
  return handsFree ? "Tap to start a hands-free conversation" : "Tap to talk";
}

let nextId = 1;

export type TalkConfig = {
  voice: VoicePrefs;
  pronunciations: { word: string; sayAs: string }[];
  /** Barnabas's own ElevenLabs voice is set up. */
  cloudVoice: boolean;
  /** Deepgram listening is set up (needed for hands-free). */
  cloudListening: boolean;
  /** Team and Member levels: Barnabas by typing only (no microphone, no spoken replies). */
  typedOnly?: boolean;
};

const DEFAULT_CONFIG: TalkConfig = { voice: { speakReplies: true, language: "en-US", rate: 1, handsFree: false }, pronunciations: [], cloudVoice: false, cloudListening: false };

function useTalkEngine(config: TalkConfig | null) {
  const { voice, pronunciations, cloudVoice, cloudListening, typedOnly = false } = config ?? DEFAULT_CONFIG;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");
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
  const [speak, setSpeak] = useState(voice.speakReplies && !typedOnly);
  const [readTyped, setReadTyped] = useState(Boolean(voice.readTyped) && !typedOnly);
  const lastFiller = useRef(-1);
  const [lang, setLang] = useState<Lang>(voice.language);
  const [handsFree, setHandsFree] = useState(voice.handsFree && cloudListening && !typedOnly);
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
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  handsFreeRef.current = handsFree;

  useEffect(() => {
    setVoiceSupported(cloudListening || browserRecognitionAvailable());
  }, [cloudListening]);

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
    // Have the filler sounds ready before the first reply, so the first one plays instantly.
    if (cloudVoice && voice.fillers !== false && speaker.current instanceof CloudSpeaker) {
      speaker.current.warmFillers((FILLERS[lang.slice(0, 2) as keyof typeof FILLERS] ?? FILLERS.en).length);
    }
  }, [cloudVoice, lang, voice.rate, pronunciations, settle]);

  // Whether the "microphone on" chime has played and the "off" one hasn't yet.
  const micOn = useRef(false);
  const micChime = useCallback((on: boolean) => {
    if (micOn.current === on) return;
    micOn.current = on;
    playEarcon(on ? "on" : "off");
  }, []);

  const stopListening = useCallback(() => {
    if (listener.current) micChime(false);
    listener.current?.close();
    listener.current = null;
    setInterim("");
  }, [micChime]);

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

  async function send(text: string, via: "voice" | "text", opts: { knowInvite?: boolean } = {}) {
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
    const voiced = speak && (via === "voice" || readTyped);
    // Whole sentences only: speaking an opening clause on its own flattens its intonation.
    const chunker = new SentenceChunker();
    const say = (s: string) => {
      if (voiced && !ignoreReply.current) speaker.current?.speak(s);
    };
    streamOpen.current = true;
    // A short "Mm." or "Let me think." in Barnabas's voice if the first words aren't back almost at once.
    let gotText = false;
    const fillerTimer =
      voiced && voice.fillers !== false && speaker.current?.filler
        ? setTimeout(() => {
            if (gotText || ignoreReply.current) return;
            const list = FILLERS[lang.slice(0, 2) as keyof typeof FILLERS] ?? FILLERS.en;
            let i = Math.floor(Math.random() * list.length);
            if (i === lastFiller.current) i = (i + 1) % list.length;
            lastFiller.current = i;
            speaker.current?.filler?.(i, list[i]!);
          }, FILLER_DELAY_MS)
        : null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, text: clean, interruptedAfter, localTime: localTime(), voice: via === "voice", ...(opts.knowInvite ? { knowInvite: true } : {}) }),
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
            | { type: "link"; label: string; href: string }
            | { type: "notice"; text: string }
            | { type: "timing"; model: string; setupMs: number; firstTextMs: number | null }
            | { type: "done" }
            | { type: "error"; message: string };
          if (event.type === "text" && timing.current && timing.current.firstText === undefined) timing.current.firstText = performance.now();
          if (event.type === "timing" && timing.current) {
            timing.current.server = `${event.model.replace(/^claude-/, "")}, server setup ${event.setupMs}ms, model ${event.firstTextMs ?? "-"}ms`;
          }
          if (event.type === "text") gotText = true;
          if (event.type === "text") {
            if (ignoreReply.current) update((t) => ({ ...t, unheard: t.unheard + event.text }));
            else {
              update((t) => ({ ...t, text: t.text + event.text }));
              chunker.push(event.text).forEach(say);
            }
          } else if (event.type === "tool") {
            update((t) => ({ ...t, tools: [...t.tools, event.name] }));
            if (event.phrase && !speaker.current?.busy()) say(event.phrase);
          } else if (event.type === "link") {
            if (event.href.startsWith("/") && !event.href.startsWith("//")) {
              update((t) => (t.links?.some((l) => l.href === event.href) ? t : { ...t, links: [...(t.links ?? []), { label: event.label, href: event.href }] }));
            }
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
      if (fillerTimer) clearTimeout(fillerTimer);
      streamOpen.current = false;
      settle();
      touch();
    }
  }

  async function startListening(continuous: boolean) {
    let continuousFallback = false;
    setError(null);
    speaker.current?.unlock();
    unlockEarcons();
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
        micChime(false);
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
    const l: Listener = cloudListening ? new DeepgramListener(lang, events, voice.pauseMs) : new BrowserListener(lang, events);
    listener.current = l;
    setStatus("listening");
    // Start the conversation (and warm Claude's cache) while the leader is still talking.
    void ensureConversation("voice").catch(() => {});
    try {
      await l.start();
      micChime(true);
    } catch (err) {
      l.close();
      // If the listening service is unavailable, fall back to the browser's own recognition (push-to-talk).
      if (cloudListening && browserRecognitionAvailable()) {
        const fallback = new BrowserListener(lang, { ...events, onUtterance: (t: string) => pushBuffer.current.push(t), onClose: () => events.onClose() });
        continuousFallback = true;
        listener.current = fallback;
        try {
          await fallback.start();
          micChime(true);
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

  // The first time a page configures the session, take the leader's voice settings.
  const synced = useRef(false);
  useEffect(() => {
    if (!config || synced.current) return;
    synced.current = true;
    setSpeak(config.voice.speakReplies && !config.typedOnly);
    setReadTyped(Boolean(config.voice.readTyped) && !config.typedOnly);
    setLang(config.voice.language);
    setHandsFree(config.voice.handsFree && config.cloudListening && !config.typedOnly);
  }, [config]);

  return {
    configured: Boolean(config),
    typedOnly,
    cloudListening,
    turns,
    status,
    interim,
    error,
    notice,
    showTiming,
    lastTiming,
    offRecord,
    speak,
    readTyped,
    lang,
    handsFree,
    voiceSupported,
    conversationId,
    listening: () => Boolean(listener.current),
    hasConversation: () => Boolean(convRef.current),
    setSpeak,
    setReadTyped,
    setLang,
    stopSpeaking: () => speaker.current?.stop(),
    unlockSpeaker: () => speaker.current?.unlock(),
    interrupt,
    send,
    onOrb,
    stopListening: () => {
      interrupt();
      stopListening();
      setStatus("idle");
    },
    endConversation,
    toggleOffRecord,
    toggleHandsFree,
  };
}

export type TalkSession = ReturnType<typeof useTalkEngine>;

const TalkContext = createContext<{ session: TalkSession; configure: (c: TalkConfig) => void } | null>(null);

export function TalkProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<TalkConfig | null>(null);
  const configure = useCallback((next: TalkConfig) => {
    setConfig((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const session = useTalkEngine(config);
  return (
    <TalkContext.Provider value={{ session, configure }}>
      {children}
      <TalkBar session={session} />
    </TalkContext.Provider>
  );
}

/** The session, or null outside the provider. */
export function useTalkSession() {
  return useContext(TalkContext);
}

/**
 * On pages other than Today, while Barnabas is listening, thinking or speaking: who's talking, a mic
 * button (stop or start listening), end, and a tap back to the whole conversation.
 */
function TalkBar({ session: s }: { session: TalkSession }) {
  const pathname = usePathname();
  const router = useRouter();
  const live = s.configured && (s.status !== "idle" || s.listening());
  if (!live || pathname === "/" || s.typedOnly) return null;
  const label = s.status === "listening" ? (s.interim ? s.interim : "Barnabas is listening") : s.status === "thinking" ? "Barnabas is thinking…" : s.status === "speaking" ? "Barnabas is speaking" : "Barnabas";
  const last = [...s.turns].reverse().find((t) => t.role === "barnabas" && t.text)?.text;
  return (
    <div className="talk-bar" data-state={s.status} data-page={pathname.startsWith("/word") ? "word" : undefined} role="region" aria-label="Conversation with Barnabas">
      <button type="button" className="talk-bar-main" onClick={() => router.push("/")} aria-label="Back to the conversation">
        <span className="talk-bar-dot" aria-hidden="true" />
        <span className="talk-bar-text">
          <strong>{label}</strong>
          {s.status !== "listening" && last && <span className="talk-bar-last">{last}</span>}
        </span>
      </button>
      <button
        type="button"
        className="talk-bar-btn"
        aria-label={s.listening() ? "Stop listening" : "Talk"}
        aria-pressed={s.listening()}
        onClick={() => (s.listening() ? (s.handsFree ? s.stopListening() : s.onOrb()) : s.onOrb())}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          {s.listening() && s.handsFree && <path d="M4 4l16 16" />}
        </svg>
      </button>
      <button type="button" className="talk-bar-btn" aria-label="End conversation" onClick={() => void s.endConversation("button")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
