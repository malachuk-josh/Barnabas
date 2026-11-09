"use client";

// Ask: questions about one verse, answered by Claude, under the translations in
// the Compare pop-up.
//
// It sits there because comparing is so often where the question starts — two
// translations disagree, and the reader wants to know why — and because a pill
// of its own would have made a busy row busier. Only the people the owner has
// switched on see it at all (see lib/ask); everyone else's Compare is exactly
// what it was.
//
// The same box sits under the Commentary pop-up, with a row of scholars to
// put the question to instead: Matthew Henry, Spurgeon, Calvin and the rest
// (lib/voices). Every answer there is bylined with his name and "AI", and
// where the app has what he actually wrote on the passage, that goes with the
// question for the answer to be drawn from.
//
// Nothing is kept on the server. The conversation lives here, in memory, one
// per verse and per voice, so closing the pop-up by accident and opening it
// again finds it as it was; a reload starts clean. What is worth keeping goes
// into the verse's note, by the reader's own hand.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { NOTE_MAX } from "@/lib/bible";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { HAS_SOURCE, VOICES, voiceOf, type VoiceId } from "@/lib/voices";
import { wordPortal } from "@/lib/theme";

export interface AskStatus {
  allowed: boolean;
  /** the deployment has an API key; without one nobody can ask yet */
  ready?: boolean;
  left?: number;
  perPerson?: number;
  /** when today's questions come back, ms */
  resetsAt?: number;
  /** with none left, whose allowance ran out: theirs, or the whole app's */
  limit?: "person" | "app" | null;
}

const NOBODY: AskStatus = { allowed: false };

/** Questions in one conversation; the server holds to the same number. */
const MAX_TURNS = 10;

let known: AskStatus | null = null;

/**
 * Whether this reader has Ask, asked once study mode is on.
 *
 * Asked again each time study mode opens rather than once a page load: the
 * owner may have just switched somebody on, and that somebody should not have
 * to reload to find it.
 */
export function useAskStatus(
  on: boolean
): [AskStatus, (next: AskStatus) => void] {
  const [status, setStatus] = useState<AskStatus>(known ?? NOBODY);
  useEffect(() => {
    if (!on) return;
    let live = true;
    fetch("/api/study/ask")
      .then((res) => (res.ok ? (res.json() as Promise<AskStatus>) : NOBODY))
      .then((next) => {
        known = next;
        if (live) setStatus(next);
      })
      // offline: keep whatever was known, and Ask will say it needs a signal
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [on]);
  const update = (next: AskStatus) => {
    known = next;
    setStatus(next);
  };
  return [status, update];
}

interface Exchange {
  q: string;
  a: string;
  state: "streaming" | "done" | "cut" | "stopped" | "failed";
  /** what went wrong, or what to know */
  note?: MessageKey;
  saved?: boolean;
}

/** One conversation per verse and voice, for as long as the page is open. */
const threads = new Map<string, Exchange[]>();

const reasonKey: Record<string, MessageKey> = {
  busy: "ask.busy",
  "not-ready": "ask.notReady",
  "not-allowed": "ask.notReady",
  failed: "ask.failed",
  refusal: "ask.refused",
};

interface AskProps {
  bookNr: number;
  ch: number;
  v: number;
  translation: string;
  /** the verse in each translation that has arrived, by id */
  texts: Record<string, string>;
  status: AskStatus;
  onStatus: (next: AskStatus) => void;
  /** what is written on this verse already */
  note: string | undefined;
  onSaveNote: (text: string) => void;
  /** what the pop-up shows, which scrolls with the conversation under it */
  children: ReactNode;
}

export default function AskVerse({
  scholars,
  ...props
}: AskProps & {
  /**
   * Answer as one of the scholars rather than plainly: the Commentary
   * pop-up's Ask. Which one to start with, and what of theirs is on screen.
   */
  scholars?: {
    first: VoiceId;
    sources: Partial<Record<VoiceId, string>>;
  };
}) {
  const { t, lang } = useI18n();
  const [voice, setVoice] = useState<VoiceId | null>(scholars?.first ?? null);
  if (!scholars || !voice) return <Conversation {...props} voice={null} />;
  const picker = (
    <div className="ask-voices" role="radiogroup" aria-label={t("ask.voices")}>
      {VOICES.map((x) => (
        <button
          key={x.id}
          type="button"
          role="radio"
          aria-checked={x.id === voice}
          className={`chip${x.id === voice ? " chip-active" : ""}`}
          onClick={() => setVoice(x.id)}
        >
          {x.short[lang]}
        </button>
      ))}
    </div>
  );
  return (
    <Conversation
      // each scholar keeps his own conversation on the verse
      key={voice}
      {...props}
      voice={voice}
      source={HAS_SOURCE.includes(voice) ? scholars.sources[voice] : undefined}
      picker={picker}
    />
  );
}

function Conversation({
  bookNr,
  ch,
  v,
  translation,
  texts,
  status,
  onStatus,
  note,
  onSaveNote,
  children,
  voice,
  source,
  picker,
}: AskProps & {
  voice: VoiceId | null;
  /** what this scholar wrote on the passage, when the app has it */
  source?: string;
  picker?: ReactNode;
}) {
  const { t, lang } = useI18n();
  const key = `${bookNr}:${ch}:${v}${voice ? `:${voice}` : ""}`;
  const name = voice ? voiceOf(voice).name[lang] : "";
  const [exchanges, setExchanges] = useState<Exchange[]>(() =>
    // an answer still coming when the pop-up closed was stopped by closing it
    (threads.get(key) ?? []).map((x) =>
      x.state === "streaming"
        ? { ...x, state: "stopped", note: "ask.stopped" }
        : x
    )
  );
  const [draft, setDraft] = useState("");
  /** the scholar's About pop-up: who he was, and how his answers are made */
  const [aboutOpen, setAboutOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const busy = exchanges.some((x) => x.state === "streaming");

  useEffect(() => {
    threads.set(key, exchanges);
  }, [key, exchanges]);

  // closing the pop-up stops an answer still coming, and what it costs
  useEffect(() => () => abortRef.current?.abort(), []);

  // the box grows with the question, to a few lines, then scrolls
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 120)}px`;
  }, [draft]);

  /*
   * As an answer comes in, its end is kept in view — and with it the Save
   * button when it arrives — until its question reaches the top. From there
   * the reader reads down from the question rather than being dragged along
   * by it. A reader who scrolls for themselves is left where they put it.
   */
  useEffect(() => {
    const body = bodyRef.current;
    const last = lastRef.current;
    if (!body || !last || !followRef.current) return;
    const frame = body.getBoundingClientRect();
    const box = last.getBoundingClientRect();
    const by = Math.min(box.top - frame.top - 6, box.bottom - frame.bottom + 4);
    if (by > 1) body.scrollTop += by;
  }, [exchanges]);

  const update = (
    i: number,
    patch: Partial<Exchange> | ((x: Exchange) => Partial<Exchange>)
  ) =>
    setExchanges((prev) =>
      prev.map((x, j) =>
        j === i
          ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) }
          : x
      )
    );

  const resetTime = (at?: number) =>
    new Date(at ?? Date.now()).toLocaleTimeString(
      lang === "es" ? "es" : "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    // only answers that came back whole go up again; a failed exchange is
    // dropped from what the model sees, as though it had not been asked
    const turns = exchanges
      .filter((x) => (x.state === "done" || x.state === "cut") && x.a.trim())
      .flatMap((x) => [
        { role: "user", text: x.q },
        { role: "assistant", text: x.a },
      ]);
    turns.push({ role: "user", text: q });
    const i = exchanges.length;
    followRef.current = true;
    setExchanges((prev) => [...prev, { q, a: "", state: "streaming" }]);
    setDraft("");
    // the keyboard down, so the answer can be read as it comes
    inputRef.current?.blur();

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/study/ask", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          book: bookNr,
          ch,
          v,
          translation,
          texts,
          lang,
          turns,
          voice: voice ?? undefined,
          source: source || undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const detail = (await res.json().catch(() => ({}))) as {
          error?: string;
          resetsAt?: number;
        };
        if (detail.error === "person-limit" || detail.error === "app-limit") {
          onStatus({
            ...status,
            left: 0,
            limit: detail.error === "app-limit" ? "app" : "person",
            resetsAt: detail.resetsAt ?? status.resetsAt,
          });
          setExchanges((prev) => prev.slice(0, i));
          setDraft(q);
          return;
        }
        if (detail.error === "not-ready") onStatus({ ...status, ready: false });
        if (detail.error === "not-allowed") onStatus(NOBODY);
        update(i, {
          state: "failed",
          note: reasonKey[detail.error ?? ""] ?? "ask.failed",
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, cut).trim();
          pending = pending.slice(cut + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as {
            t?: string;
            end?: string;
            left?: number;
            error?: string;
          };
          if (msg.t) {
            const piece = msg.t;
            update(i, (x) => ({ a: x.a + piece }));
          } else if (msg.end) {
            ended = true;
            onStatus({ ...status, left: msg.left ?? status.left });
            if (msg.end === "refusal") {
              update(i, { state: "failed", note: "ask.refused" });
            } else if (msg.end === "max_tokens") {
              update(i, { state: "cut", note: "ask.cut" });
            } else {
              update(i, { state: "done" });
            }
          } else if (msg.error) {
            ended = true;
            update(i, {
              state: "failed",
              note: reasonKey[msg.error] ?? "ask.failed",
            });
          }
        }
      }
      if (!ended) update(i, { state: "failed", note: "ask.failed" });
    } catch {
      if (ctrl.signal.aborted) return; // closed; the remount shows it stopped
      update(i, {
        state: "failed",
        note: navigator.onLine === false ? "ask.offline" : "ask.failed",
      });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  const save = (i: number) => {
    const x = exchanges[i];
    // a scholar's answer says whose style it was in, wherever it ends up
    const entry = voice
      ? `${x.q}\n— ${x.a.trim()}\n(${t("ask.noteAI", { name })})`
      : `${x.q}\n— ${x.a.trim()}`;
    const text = note?.trim() ? `${note.trim()}\n\n${entry}` : entry;
    if (text.length > NOTE_MAX) {
      update(i, { note: "ask.noteFull" });
      return;
    }
    onSaveNote(text);
    update(i, { saved: true });
  };

  const answered = exchanges.filter((x) => x.state !== "failed").length;
  const full = answered >= MAX_TURNS;
  const outOfQuestions = status.left === 0;
  const several = Object.values(texts).filter(Boolean).length > 1;
  // a scholar is asked as a teacher; "what did you mean" only where what
  // he meant is on the screen to be asked about
  const starters: MessageKey[] = voice
    ? ["ask.vTake", "ask.vLive", source ? "ask.vMeant" : "ask.vRead"]
    : [
        ...(several ? (["ask.starterDiffer"] as const) : []),
        "ask.starterContext",
        "ask.starterMeaning",
      ];
  const title = voice ? t("ask.voiceTitle", { name }) : t("ask.title");

  return (
    <>
      <div
        className="ask-body"
        ref={bodyRef}
        onTouchStart={() => (followRef.current = false)}
        onWheel={() => (followRef.current = false)}
      >
        {children}
        {exchanges.length > 0 && (
          <div className="ask-thread" aria-label={title}>
            {exchanges.map((x, i) => (
              <div
                key={i}
                className="ask-exchange"
                ref={i === exchanges.length - 1 ? lastRef : undefined}
              >
                <p className="ask-q">{x.q}</p>
                {voice && <p className="mh-by ask-by">{name} · AI</p>}
                {x.state === "streaming" && !x.a ? (
                  <p className="ask-a ask-wait">{t("ask.thinking")}</p>
                ) : (
                  x.a && (
                    <p className="ask-a" aria-busy={x.state === "streaming"}>
                      {x.a}
                    </p>
                  )
                )}
                {x.note && (
                  <p
                    className={x.state === "failed" ? "error-text" : "cal-hint"}
                  >
                    {t(x.note)}
                  </p>
                )}
                {(x.state === "done" || x.state === "cut") && x.a.trim() && (
                  <button
                    type="button"
                    className="xref-chip ask-save"
                    onClick={() => save(i)}
                    disabled={x.saved}
                  >
                    <Icon name={x.saved ? "check" : "note"} />{" "}
                    {t(x.saved ? "ask.saved" : "ask.save")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The foot of the pop-up, which holds still while the translations
          and the answers scroll above it: the question is one tap away
          wherever the reader has got to. */}
      <div className="ask-box">
        {picker}
        <div className="ask-title-row">
          <p className="ask-title">
            <Icon name="lamp" /> {title}
          </p>
          {voice && (
            <button
              type="button"
              className="xref-chip ask-about-btn"
              onClick={() => setAboutOpen(true)}
              aria-haspopup="dialog"
            >
              {t("ask.about")}
            </button>
          )}
        </div>
        {/* Over the commentary rather than inside it. Sent to the end of the
            page because the pop-up this sits in is glass, and a backdrop
            filter makes an element the frame for anything fixed inside it — an
            overlay drawn here would be the size of the commentary, not the
            screen. */}
        {aboutOpen &&
          voice &&
          createPortal(
            <div
              className="modal-overlay about-overlay"
              onClick={(e) => {
                e.stopPropagation();
                setAboutOpen(false);
              }}
            >
              <div
                className="glass modal about-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="about-voice-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mh-head">
                  <h2 id="about-voice-title">{name}</h2>
                  <button
                    type="button"
                    className="lex-close"
                    onClick={() => setAboutOpen(false)}
                    aria-label={t("common.close")}
                  >
                    ✕
                  </button>
                </div>
                <p className="about-years">{voiceOf(voice).years}</p>
                {/* written by hand in lib/voices, not generated. Only who he
                    was: how the answers are made is the same for all seven,
                    and is told once, on the About page */}
                {voiceOf(voice).bio[lang].map((para) => (
                  <p key={para.slice(0, 24)} className="about-bio">
                    {para}
                  </p>
                ))}
              </div>
            </div>,
            wordPortal()
          )}
        {status.ready === false ? (
          <p className="cal-hint">{t("ask.notReady")}</p>
        ) : outOfQuestions ? (
          <p className="cal-hint">
            {t(status.limit === "app" ? "ask.appLimit" : "ask.personLimit", {
              n: String(status.perPerson ?? ""),
              time: resetTime(status.resetsAt),
            })}
          </p>
        ) : full ? (
          <div className="ask-full">
            <p className="cal-hint">{t("ask.full")}</p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setExchanges([])}
            >
              {t("ask.fresh")}
            </button>
          </div>
        ) : (
          <>
            {exchanges.length === 0 && (
              <div className="ask-starters">
                {starters.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="chip"
                    onClick={() => void ask(t(k))}
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
            )}
            <form
              className="ask-row"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(draft);
              }}
            >
              <textarea
                ref={inputRef}
                className="ask-input"
                value={draft}
                rows={1}
                maxLength={1000}
                enterKeyHint="send"
                placeholder={t("ask.placeholder")}
                aria-label={t("ask.placeholder")}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
              />
              <button
                type="submit"
                className="ask-send"
                disabled={busy || !draft.trim()}
                aria-label={t("ask.send")}
                title={t("ask.send")}
              >
                <Icon name="send" />
              </button>
            </form>
          </>
        )}
        <p className="ask-hint">
          {t("ask.credit")}
          {typeof status.left === "number" && status.left > 0 && (
            <> · {t("ask.left", { n: String(status.left) })}</>
          )}
        </p>
      </div>
    </>
  );
}
