"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadSummary } from "@/lib/inbox/service";

type Person = { leaderId: string; name: string; label: string };
type Message = { id: string; mine: boolean; name: string; text: string; at: number; href?: string };
type Open = { thread: ThreadSummary; messages: Message[] };
type View = { kind: "none" } | { kind: "thread"; id: string } | { kind: "compose" };

const POLL_MS = 8000;
const MAX = 2000;

const names = (t: Pick<ThreadSummary, "with">) => t.with.map((w) => w.name).join(", ") || "Just you";

function when(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "AB" from "Ann Brown"; one letter for a single name. */
function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "")).toUpperCase();
}

/** One person's initials, or a count for a group conversation. */
function Avatar({ people, size, system }: { people: { name: string }[]; size?: "lg"; system?: boolean }) {
  const group = people.length > 1;
  if (system) {
    return (
      <span className={`inbox-avatar is-system${size === "lg" ? " is-lg" : ""}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" />
          <path d="M10 20.5a2 2 0 0 0 4 0" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`inbox-avatar${group ? " is-group" : ""}${size === "lg" ? " is-lg" : ""}`} aria-hidden="true">
      {group ? people.length : initials(people[0]?.name ?? "You")}
    </span>
  );
}

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </svg>
);

/** Messages in runs: a new run starts with a new day, a new sender, or a pause of ten minutes. */
function runs(messages: Message[]) {
  const out: { day?: string; first: boolean; last: boolean; m: Message }[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
    const first = newDay || !prev || prev.mine !== m.mine || prev.name !== m.name || m.at - prev.at > 600_000;
    const nextNewDay = !next || new Date(next.at).toDateString() !== new Date(m.at).toDateString();
    const last = nextNewDay || !next || next.mine !== m.mine || next.name !== m.name || next.at - m.at > 600_000;
    out.push({ day: newDay ? dayLabel(m.at) : undefined, first, last, m });
  });
  return out;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work. Try again.");
  return json as T;
}

/**
 * Messages: the conversation list beside the open conversation (on phones, the list, then the conversation).
 * Checks for new messages every few seconds while the page is open and visible.
 */
export function Inbox({ initialThreads, initialOpen, compose }: { initialThreads: ThreadSummary[]; initialOpen?: string; compose?: { to: string[]; about: string } }) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [view, setView] = useState<View>(compose ? { kind: "compose" } : initialOpen ? { kind: "thread", id: initialOpen } : { kind: "none" });
  const [open, setOpen] = useState<Open | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openId = view.kind === "thread" ? view.id : null;
  const openRef = useRef<string | null>(openId);
  useEffect(() => {
    openRef.current = openId;
  }, [openId]);

  const setUrl = (url: string) => {
    try {
      window.history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
  };

  const refreshList = useCallback(async () => {
    try {
      const r = await api<{ threads: ThreadSummary[] }>("/api/inbox");
      // The open conversation is being read: no dot on it.
      setThreads(r.threads.map((t) => (t.id === openRef.current ? { ...t, unread: 0 } : t)));
    } catch {
      /* the next poll tries again */
    }
  }, []);

  const loadThread = useCallback(
    async (id: string, quiet = false) => {
      try {
        const r = await api<Open>(`/api/inbox/${encodeURIComponent(id)}`);
        setOpen(r);
        setError(null);
        return r;
      } catch (err) {
        if (!quiet) setError((err as Error).message);
        return null;
      }
    },
    [],
  );

  // Opening a conversation marks it read: update the list and the menu badge.
  useEffect(() => {
    if (!openId) return setOpen(null);
    let cancelled = false;
    setOpen((prev) => (prev?.thread.id === openId ? prev : null));
    void loadThread(openId).then((r) => {
      if (cancelled || !r) return;
      const hadUnread = threads.find((t) => t.id === openId)?.unread;
      setThreads((ts) => ts.map((t) => (t.id === openId ? { ...t, unread: 0 } : t)));
      if (hadUnread) router.refresh();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  // Poll while the page is visible.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshList();
      if (openId) await loadThread(openId, true);
    };
    const t = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [openId, refreshList, loadThread]);

  const show = (id: string) => {
    setError(null);
    setView({ kind: "thread", id });
    setUrl(`/inbox?t=${encodeURIComponent(id)}`);
  };
  const back = () => {
    setView({ kind: "none" });
    setUrl("/inbox");
  };

  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return threads;
    return threads.filter((t) => names(t).toLowerCase().includes(f) || (t.about ?? "").toLowerCase().includes(f) || (t.last?.text ?? "").toLowerCase().includes(f));
  }, [threads, filter]);

  const paneOpen = view.kind !== "none";
  return (
    <div className={`inbox${paneOpen ? " inbox-pane-open" : ""}`}>
      <section className="inbox-list" aria-label="Conversations">
        <div className="inbox-list-head">
          <div className="search-field inbox-search">
            <label className="sr-only" htmlFor="inbox-search">
              Search conversations
            </label>
            <input id="inbox-search" type="search" autoComplete="off" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setError(null);
              setView({ kind: "compose" });
              setUrl("/inbox");
            }}
          >
            New message
          </button>
        </div>
        {threads.length === 0 ? (
          <div className="inbox-empty">
            <p>No conversations yet.</p>
            <p className="small muted">Start one with New message. Only the people in a conversation can read it.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="small muted inbox-empty">No conversation matches “{filter.trim()}”.</p>
        ) : (
          <ul>
            {shown.map((t) => (
              <li key={t.id}>
                <button type="button" className={`inbox-thread${t.unread > 0 ? " is-unread" : ""}`} aria-current={openId === t.id ? "true" : undefined} onClick={() => show(t.id)}>
                  <Avatar people={t.with} system={Boolean(t.system)} />
                  <span className="inbox-thread-body">
                    <span className="inbox-thread-top">
                      <strong>{names(t)}</strong>
                      <span className="small muted">{when(t.updatedAt)}</span>
                    </span>
                    {t.about && <span className="inbox-about">About {t.about}</span>}
                    <span className="inbox-thread-bottom">
                      <span className="small muted inbox-preview">{t.last ? `${t.last.mine ? "You: " : ""}${t.last.text}` : ""}</span>
                      {t.unread > 0 && (
                        <span className="inbox-dot" aria-label={`${t.unread} unread`}>
                          {t.unread > 9 ? "9+" : t.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="inbox-pane" aria-label={view.kind === "compose" ? "New message" : "Conversation"}>
        {view.kind === "compose" ? (
          <Compose
            initial={compose}
            onBack={back}
            onSent={(id) => {
              void refreshList();
              show(id);
            }}
          />
        ) : view.kind === "thread" ? (
          <Thread
            open={open && open.thread.id === view.id ? open : null}
            error={error}
            onBack={back}
            onSent={async () => {
              await loadThread(view.id, true);
              await refreshList();
            }}
          />
        ) : (
          <div className="inbox-placeholder">
            <p>Choose a conversation, or start a new message.</p>
            <p className="small muted">Only the people in a conversation can read it.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({ open, error, onBack, onSent }: { open: Open | null; error: string | null; onBack: () => void; onSent: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const count = open?.messages.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  if (!open) {
    return (
      <div className="inbox-thread-view">
        <button className="linklike inbox-back" type="button" onClick={onBack}>
          ← All messages
        </button>
        {error ? <p className="notice notice-danger">{error}</p> : <p className="muted small">Opening…</p>}
      </div>
    );
  }
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!open || !text.trim()) return;
    setBusy(true);
    setSendError(null);
    try {
      await api(`/api/inbox/${encodeURIComponent(open.thread.id)}`, { method: "POST", body: JSON.stringify({ text }) });
      setText("");
      const el = document.getElementById("inbox-reply");
      if (el) el.style.height = "";
      await onSent();
    } catch (err) {
      setSendError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const group = open.thread.with.length > 1;
  return (
    <div className="inbox-thread-view">
      <header className="inbox-thread-head">
        <button className="linklike inbox-back" type="button" onClick={onBack}>
          ← All messages
        </button>
        <div className="inbox-thread-who">
          <Avatar people={open.thread.with} size="lg" system={Boolean(open.thread.system)} />
          <div>
            <h2>{names(open.thread)}</h2>
            <span className="small muted">
              {open.thread.system ? "From Barnabas" : group ? `${open.thread.with.length + 1} people` : "Just the two of you"}
              {open.thread.about && (
                <>
                  {" · "}
                  <span className="inbox-about">About {open.thread.about}</span>
                </>
              )}
            </span>
          </div>
        </div>
      </header>
      <div className="inbox-messages" aria-live="polite">
        {open.messages.length === 0 && <p className="small muted inbox-placeholder">No messages yet.</p>}
        {runs(open.messages).map(({ day, first, last, m }) => (
          <div key={m.id} className="inbox-run-item">
            {day && (
              <p className="inbox-day">
                <span>{day}</span>
              </p>
            )}
            <div className={`inbox-msg${m.mine ? " mine" : ""}${first ? " is-first" : ""}${last ? " is-last" : ""}`}>
              {first && !m.mine && group && <span className="inbox-msg-name">{m.name}</span>}
              <p>{m.text}</p>
              {m.href && (
                <Link href={m.href} className="bubble-link">
                  Open
                </Link>
              )}
              {last && (
                <span className="inbox-msg-time">
                  <span className="sr-only">{m.mine ? "You" : m.name}, </span>
                  {clock(m.at)}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {open.thread.system ? (
        <p className="small muted inbox-system-note">Your notifications from Barnabas land here too. Choose which ones you get in Settings → Notifications.</p>
      ) : (
      <form className="inbox-reply" onSubmit={(e) => void send(e)}>
        {sendError && <p className="notice notice-danger">{sendError}</p>}
        <label className="sr-only" htmlFor="inbox-reply">
          Reply
        </label>
        <textarea
          id="inbox-reply"
          rows={1}
          maxLength={MAX}
          placeholder={group ? "Write to everyone here" : `Write to ${open.thread.with[0]?.name.split(" ")[0] ?? "them"}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <button className="inbox-send" type="submit" disabled={busy || !text.trim()} aria-label={busy ? "Sending" : "Send"} title="Send (Ctrl or ⌘ + Enter)">
          <SendIcon />
        </button>
      </form>
      )}
    </div>
  );
}

function Compose({ initial, onBack, onSent }: { initial?: { to: string[]; about: string }; onBack: () => void; onSent: (id: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [to, setTo] = useState<string[]>(initial?.to ?? []);
  const [about, setAbout] = useState(initial?.about ?? "");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ people: Person[] }>("/api/inbox/people")
      .then((r) => {
        setPeople(r.people);
        // Keep only the prefilled people this person may message.
        setTo((cur) => cur.filter((id) => r.people.some((p) => p.leaderId === id)));
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const byId = useMemo(() => new Map((people ?? []).map((p) => [p.leaderId, p])), [people]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!people) return [];
    return people.filter((p) => !to.includes(p.leaderId) && (!s || p.name.toLowerCase().includes(s))).slice(0, s ? 12 : 8);
  }, [people, q, to]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!to.length || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ threadId: string }>("/api/inbox", { method: "POST", body: JSON.stringify({ to, text, ...(about ? { about } : {}) }) });
      onSent(r.threadId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inbox-compose" onSubmit={(e) => void send(e)}>
      <header className="inbox-thread-head">
        <button className="linklike inbox-back" type="button" onClick={onBack}>
          ← All messages
        </button>
        <h2>New message</h2>
      </header>
      {error && <p className="notice notice-danger">{error}</p>}
      <div className="field">
        <label htmlFor="inbox-to">To</label>
        {to.length > 0 && (
          <ul className="inbox-chips">
            {to.map((id) => (
              <li key={id}>
                <Avatar people={[{ name: byId.get(id)?.name ?? "?" }]} />
                <span>{byId.get(id)?.name ?? "…"}</span>
                <button type="button" aria-label={`Remove ${byId.get(id)?.name ?? "this person"}`} onClick={() => setTo(to.filter((x) => x !== id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <input id="inbox-to" type="text" autoComplete="off" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        {people === null ? (
          !error && <span className="small muted">Loading people…</span>
        ) : people.length === 0 ? (
          <span className="small muted">There&apos;s no one you can message yet.</span>
        ) : matches.length ? (
          <ul className="inbox-people">
            {matches.map((p) => (
              <li key={p.leaderId}>
                <button
                  type="button"
                  onClick={() => {
                    setTo([...to, p.leaderId]);
                    setQ("");
                  }}
                >
                  <Avatar people={[p]} />
                  <span className="inbox-person">
                    <span>{p.name}</span>
                    <span className="small muted">{p.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          q && <span className="small muted">No one by that name.</span>
        )}
      </div>
      {about && (
        <p className="small inbox-about">
          About {about}{" "}
          <button className="linklike" type="button" onClick={() => setAbout("")}>
            Remove
          </button>
        </p>
      )}
      <div className="field">
        <label htmlFor="inbox-text">Message</label>
        <textarea id="inbox-text" rows={4} maxLength={MAX} placeholder={about ? `A note about ${about}` : "Write your message"} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy || !to.length || !text.trim()}>
          {busy ? "Sending…" : "Send"}
        </button>
        <span className="small muted">Only the people you choose can read it.</span>
      </div>
    </form>
  );
}
