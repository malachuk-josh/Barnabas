"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ASK_EVENT, TALK_EVENT, KNOW_EVENT, KNOW_INVITE_TEXT } from "./NavLinks";
import { LANGS, statusText, useTalkSession, type Lang, type TalkConfig } from "./talk/session";

/** Things a leader can ask, offered before the first turn. */
const SUGGESTIONS = ["Who needs a call this week?", "Help me plan Sunday", "Which co-laborers could use encouragement?"];
const TYPED_SUGGESTIONS = ["Give me a verse for today", "What's on the church calendar this week?", "Help me pray for my family"];

/**
 * Today's Talk panel: the whole conversation with Barnabas. The conversation itself lives in the
 * TalkProvider above the pages, so it carries on while the leader visits other pages.
 */
export function Talk(props: TalkConfig & {
  /** The name the leader goes by (Today's header greets them, so the panel no longer does). */
  greetingName?: string;
}) {
  const ctx = useTalkSession();
  if (!ctx) throw new Error("Talk needs the TalkProvider (in the root layout).");
  const { session, configure } = ctx;
  const { voice, pronunciations, cloudVoice, cloudListening, typedOnly = false } = props;
  const configKey = JSON.stringify({ voice, pronunciations, cloudVoice, cloudListening, typedOnly });
  useEffect(() => {
    configure(JSON.parse(configKey) as TalkConfig);
  }, [configKey, configure]);

  const { turns, status, interim, error, notice, showTiming, lastTiming, offRecord, speak, readTyped, lang, handsFree, voiceSupported, conversationId } = session;
  const { send, onOrb, endConversation, toggleOffRecord, toggleHandsFree, setSpeak, setReadTyped, setLang } = session;
  const [draft, setDraft] = useState("");
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, interim]);
  const convRef = { get current() { return session.hasConversation() ? true : null; } };

  // The tab bar's and sidebar's Talk buttons, and the briefing's "Draft a thank-you" buttons, reach the
  // panel through window events. Refs keep the listeners on the latest handlers without re-subscribing.
  const onOrbRef = useRef(onOrb);
  onOrbRef.current = onOrb;
  const sendRef = useRef(send);
  sendRef.current = send;
  const endConversationRef = useRef(endConversation);
  endConversationRef.current = endConversation;
  const orbRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onTalk = () => {
      if (!orbRef.current) return;
      orbRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      onOrbRef.current();
    };
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== "string" || !text.trim()) return;
      orbRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      void sendRef.current(text, "text");
    };
    // "Let Barnabas get to know you": a fresh conversation where questions are welcome.
    const onKnow = () => {
      orbRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      void (async () => {
        if (convRef.current) await endConversationRef.current("toggle");
        await sendRef.current(KNOW_INVITE_TEXT, "text", { knowInvite: true });
      })();
    };
    window.addEventListener(TALK_EVENT, onTalk);
    window.addEventListener(ASK_EVENT, onAsk);
    window.addEventListener(KNOW_EVENT, onKnow);
    // Arriving from another page's Talk button: the mic needs a tap here, so put the orb in reach.
    const params = new URLSearchParams(window.location.search);
    if (params.get("talk") === "1") {
      orbRef.current?.focus();
      window.history.replaceState(null, "", "/");
    }
    // From Settings: "Let Barnabas get to know you".
    if (params.get("know") === "1") {
      window.history.replaceState(null, "", "/");
      void sendRef.current(KNOW_INVITE_TEXT, "text", { knowInvite: true });
    }
    // "Ask Barnabas" on a person's page arrives with the question, as if typed.
    const ask = params.get("ask")?.trim().slice(0, 300);
    if (ask) {
      window.history.replaceState(null, "", "/");
      void sendRef.current(ask, "text");
    }
    return () => {
      window.removeEventListener(TALK_EVENT, onTalk);
      window.removeEventListener(ASK_EVENT, onAsk);
      window.removeEventListener(KNOW_EVENT, onKnow);
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft;
    setDraft("");
    if (speak && readTyped) session.unlockSpeaker();
    if (status === "speaking" || status === "thinking") session.interrupt();
    await send(text, "text");
  }

  return (
    <section className="talk" aria-label="Talk with Barnabas">
      <div className="talk-head">
        {!typedOnly && <button ref={orbRef} type="button" className="orb" data-state={status} onClick={onOrb} disabled={!voiceSupported} aria-label={statusText(status, handsFree)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>}
        <div className="talk-intro">
          <h2>How can I encourage you today?</h2>
          {!typedOnly && (
            <p className="orb-status" aria-live="polite">
              {voiceSupported ? statusText(status, handsFree) : "Voice isn't available in this browser. You can type below."}
            </p>
          )}
          <p className="sub">
            Nothing is sent without your yes.
            {offRecord ? " This conversation is off the record: nothing will be saved." : ""}
          </p>
        </div>
      </div>

      {turns.length === 0 && (
        <div className="talk-suggestions" role="group" aria-label="Things to ask">
          {(typedOnly ? TYPED_SUGGESTIONS : SUGGESTIONS).map((q) => (
            <button key={q} type="button" className="talk-chip" onClick={() => void send(q, "text")}>
              {q}
            </button>
          ))}
        </div>
      )}

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

      <div className="transcript" aria-live="polite" hidden={turns.length === 0 && !interim}>
        {turns.map((t) => (
          <div key={t.id} className={`bubble ${t.role === "leader" ? "bubble-leader" : "bubble-barnabas"}`}>
            {t.tools.length > 0 && t.role === "barnabas" && !t.text && !t.unheard && <span className="tool-line">Looking that up…</span>}
            {t.text}
            {t.unheard && <span className="bubble-unheard"> {t.unheard}</span>}
            {t.links && t.links.length > 0 && (
              <span className="bubble-links">
                {t.links.map((l) => (
                  <Link key={l.href} href={l.href} className="bubble-link">
                    {l.label}
                  </Link>
                ))}
              </span>
            )}
          </div>
        ))}
        {interim && <div className="bubble bubble-leader bubble-unheard">{interim}</div>}
        <div ref={transcriptEnd} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <label htmlFor="message" style={{ position: "absolute", left: -9999 }}>
          Message Barnabas
        </label>
        <input id="message" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={typedOnly ? "Type to Barnabas…" : "Or type to Barnabas…"} autoComplete="off" />
        <button type="submit" className="btn btn-send" disabled={!draft.trim()}>
          Send
        </button>
      </form>

      <div className="toggles">
        <label>
          <input id="off-record" type="checkbox" checked={offRecord} onChange={(e) => toggleOffRecord(e.target.checked)} />
          Off the record
        </label>
        <details className="talk-options">
          <summary>
            {typedOnly ? "Language" : "Voice and language"}
            <span className="talk-options-now">
              {[!typedOnly ? (speak ? "Speaks replies" : "Quiet") : null, LANGS.find((l) => l.value === lang)?.label].filter(Boolean).join(" · ")}
            </span>
          </summary>
          <div className="talk-options-body">
        {!typedOnly && <>
        <label>
          <input id="speak-replies" type="checkbox" checked={speak} onChange={(e) => { setSpeak(e.target.checked); if (!e.target.checked) session.stopSpeaking(); }} />
          Speak replies
        </label>
        <label title="Barnabas speaks his reply even when you type">
          <input
            id="read-typed"
            type="checkbox"
            checked={readTyped}
            disabled={!speak}
            onChange={(e) => {
              const on = e.target.checked;
              setReadTyped(on);
              if (on) session.unlockSpeaker();
              else session.stopSpeaking();
              void fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voice: { readTyped: on } }) }).catch(() => {});
            }}
          />
          Read typed replies aloud
        </label>
        {cloudListening && (
          <label>
            <input id="hands-free" type="checkbox" checked={handsFree} onChange={(e) => toggleHandsFree(e.target.checked)} />
            Hands-free
          </label>
        )}
        </>}
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
          </div>
        </details>
        {conversationId && (
          <button type="button" className="btn" onClick={() => void endConversation("button")} style={{ marginLeft: "auto" }}>
            End conversation
          </button>
        )}
      </div>
    </section>
  );
}
