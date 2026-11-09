"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadSummary } from "@/lib/inbox/service";

type Person = { leaderId: string; name: string; label: string };
type Message = { id: string; mine: boolean; name: string; text: string; at: number };
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

  const paneOpen = view.kind !== "none";
  return (
    <div className={`inbox${paneOpen ? " inbox-pane-open" : ""}`}>
      <section className="inbox-list" aria-label="Conversations">
        <div className="inbox-list-head">
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
          <p className="small muted inbox-empty">No conversations yet. Start one with New message.</p>
        ) : (
          <ul>
            {threads.map((t) => (
              <li key={t.id}>
                <button type="button" className="inbox-thread" aria-current={openId === t.id ? "true" : undefined} onClick={() => show(t.id)}>
                  <span className="inbox-thread-top">
                    <strong>{names(t)}</strong>
                    <span className="small muted">{when(t.updatedAt)}</span>
                  </span>
                  {t.about && <span className="small inbox-about">About {t.about}</span>}
                  <span className="inbox-thread-bottom">
                    <span className="small muted inbox-preview">{t.last ? `${t.last.mine ? "You: " : ""}${t.last.text}` : ""}</span>
                    {t.unread > 0 && (
                      <span className="inbox-dot" aria-label={`${t.unread} unread`}>
                        {t.unread > 9 ? "9+" : t.unread}
                      </span>
                    )}
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
          <p className="muted inbox-placeholder">Choose a conversation, or start a new message.</p>
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
      await onSent();
    } catch (err) {
      setSendError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inbox-thread-view">
      <header className="inbox-thread-head">
        <button className="linklike inbox-back" type="button" onClick={onBack}>
          ← All messages
        </button>
        <h2>{names(open.thread)}</h2>
        {open.thread.about && <span className="small inbox-about">About {open.thread.about}</span>}
      </header>
      <div className="inbox-messages" aria-live="polite">
        {open.messages.map((m) => (
          <div key={m.id} className={`inbox-msg${m.mine ? " mine" : ""}`}>
            <span className="small muted">
              {m.mine ? "You" : m.name} · {when(m.at)}
            </span>
            <p>{m.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="inbox-reply" onSubmit={(e) => void send(e)}>
        {sendError && <p className="notice notice-danger">{sendError}</p>}
        <label className="sr-only" htmlFor="inbox-reply">
          Reply
        </label>
        <textarea
          id="inbox-reply"
          rows={2}
          maxLength={MAX}
          placeholder="Write a reply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
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
                  <span>{p.name}</span>
                  <span className="small muted">{p.label}</span>
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
