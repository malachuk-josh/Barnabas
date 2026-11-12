"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "./EmptyState";
import { MessagingSetup, type ChannelStatus } from "./messages/MessagingSetup";

type Recipient = { personId: string; name: string; language: "en" | "es" | "ko"; text: string };
type Delivery = { sent: number; failed: number; skipped: number; optedOut: number; noContact: number };
type Draft = {
  id: string;
  channel: "sms" | "email";
  kind?: string;
  subject?: string;
  baseText: string;
  recipients: Recipient[];
  status: string;
  createdAt: number;
  sentAt?: number;
  delivery?: Delivery;
  canSend: boolean;
};
type Messaging = { sms: ChannelStatus; email: ChannelStatus };
type Result = { name: string; to: string | null; status: string; error?: string };

const LANG: Record<string, string> = { en: "English", es: "Spanish", ko: "Korean" };
const STATUS_LABEL: Record<string, string> = { sent: "Sent", partly_sent: "Partly sent", failed: "Not sent", queued: "Approved (before delivery was connected)", discarded: "Discarded", sending: "Sending" };
const RESULT_LABEL: Record<string, string> = { queued: "Sent", sent: "Sent", delivered: "Delivered", failed: "Failed", opted_out: "Opted out", no_contact: "No contact on file", undelivered: "Undelivered", bounced: "Bounced" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "just now", "12 min ago", "3 h ago", "Nov 9". */
function ago(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TextIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z" />
  </svg>
);
const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

function summary(d: Delivery) {
  const parts = [`${d.sent + d.skipped} sent`];
  if (d.failed) parts.push(`${d.failed} failed`);
  if (d.optedOut) parts.push(`${d.optedOut} opted out`);
  if (d.noContact) parts.push(`${d.noContact} with no contact on file`);
  return parts.join(" · ");
}

export function DraftsQueue() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [messaging, setMessaging] = useState<Messaging | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<{ id: string; rows: Result[] } | null>(null);
  const [setupFor, setSetupFor] = useState<{ channel: "sms" | "email"; missing: string[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/drafts");
    const json = res.ok ? await res.json() : { drafts: [], messaging: null };
    setDrafts(json.drafts);
    setMessaging(json.messaging);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(d: Draft) {
    setBusy(d.id);
    setMessage(null);
    const res = await fetch(`/api/drafts/${d.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", confirm: true }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    setConfirming(null);
    if (res.ok) {
      setResults({ id: d.id, rows: body.results ?? [] });
      const reached = (body.sent ?? 0) + (body.skipped ?? 0);
      setMessage({
        text: reached ? `Sent to ${reached} ${reached === 1 ? "person" : "people"}${body.failed || body.optedOut || body.noContact ? `. ${body.failed + body.optedOut + body.noContact} didn't go out; see below.` : "."}` : "Nothing went out. See why below.",
        tone: reached ? "ok" : "error",
      });
    } else if (body.code === "not_configured") {
      setSetupFor({ channel: d.channel, missing: body.missing ?? [] });
      setMessage({ text: body.error, tone: "error" });
    } else setMessage({ text: body.error ?? "That didn't work.", tone: "error" });
    await load();
  }

  async function discard(id: string) {
    const res = await fetch(`/api/drafts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discard" }) });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? { text: "Discarded.", tone: "ok" } : { text: body.error ?? "That didn't work.", tone: "error" });
    await load();
  }

  if (drafts === null) return <p className="muted">Loading…</p>;
  const open = drafts.filter((d) => d.status === "needs_review" || d.status === "failed");
  const done = drafts.filter((d) => !open.includes(d)).slice(0, 12);
  const unconfigured = messaging && (!messaging.sms.configured || !messaging.email.configured);

  return (
    <div className="stack" style={{ gap: 20 }}>
      {message && (
        <div className={`notice${message.tone === "error" ? " notice-warn" : ""}`} role="status">
          {message.text}
        </div>
      )}
      {(setupFor || (unconfigured && open.length > 0)) && messaging && (
        // One line until it's needed: Send on a channel that isn't set up opens the steps for that channel.
        <details key={setupFor?.channel ?? "closed"} className="setup-strip drafts-setup" open={Boolean(setupFor)}>
          <summary>
            <span className="setup-text">
              <strong>{!messaging.sms.configured && !messaging.email.configured ? "Texting and email aren't set up yet." : !messaging.sms.configured ? "Texting isn't set up yet." : "Email isn't set up yet."}</strong> Drafts wait here until they are.
            </span>
            <span className="setup-more">Setup steps</span>
          </summary>
          <MessagingSetup sms={messaging.sms} email={messaging.email} focus={setupFor?.channel} />
        </details>
      )}
      {open.length === 0 && (
        <EmptyState title="No drafts waiting" actions={[{ label: "Talk with Barnabas", href: "/", primary: true }, { label: "Serving reminders", href: "/serve" }]}>
          Ask Barnabas to write a message, or draft reminders from Serve or a thank-you from a guest card. Each one waits here for you; nothing goes out until you tap Send.
        </EmptyState>
      )}
      {open.map((d) => {
        const byLang = new Map<string, Recipient[]>();
        d.recipients.forEach((r) => byLang.set(r.language, [...(byLang.get(r.language) ?? []), r]));
        const channelReady = messaging ? messaging[d.channel].configured : false;
        const n = d.recipients.length;
        return (
          <article key={d.id} className="draft-card">
            <div className="draft-side">
            <header className="draft-head">
              <span className={`draft-channel draft-${d.channel}`} aria-hidden="true">
                {d.channel === "sms" ? <TextIcon /> : <MailIcon />}
              </span>
              <div className="draft-title">
                <strong>
                  {d.channel === "sms" ? "Text" : "Email"} to {n} {n === 1 ? "person" : "people"}
                </strong>
                <span className="small muted">
                  Drafted {ago(d.createdAt)}
                  {d.kind === "care" && " · Shepherding follow-up"}
                  {d.kind === "report" && " · Report"}
                </span>
              </div>
              {d.status === "failed" && <span className="badge badge-warn">Not sent yet</span>}
            </header>
            <ul className="draft-to" aria-label="Recipients">
              {d.recipients.slice(0, 6).map((r) => (
                <li key={r.personId}>
                  <span className="draft-avatar" aria-hidden="true">
                    {initials(r.name)}
                  </span>
                  {r.name}
                </li>
              ))}
              {n > 6 && <li className="muted">+{n - 6} more</li>}
            </ul>
            {d.subject && (
              <p className="draft-subject">
                <span className="muted">Subject</span> {d.subject}
              </p>
            )}
            </div>
            <div className="draft-main">
            {[...byLang.entries()].map(([lang, people]) => (
              <div key={lang} className="draft-message">
                {byLang.size > 1 && (
                  <span className="label">
                    {LANG[lang]} · {people.length}
                  </span>
                )}
                <p className={d.channel === "sms" ? "draft-bubble" : "draft-email"}>{people[0].text}</p>
                {people.length > 1 && people.some((x) => x.text !== people[0].text) && (
                  <span className="small muted">
                    {people[0].name.split(" ")[0]}&apos;s copy. Each person&apos;s is written to them.
                  </span>
                )}
              </div>
            ))}
            {d.channel === "email" && <p className="small muted">Every email ends with an unsubscribe link. People who replied STOP or unsubscribed are skipped automatically.</p>}
            <footer className="draft-actions">
              {confirming !== d.id && (
                <button className="btn btn-quiet" type="button" onClick={() => void discard(d.id)}>
                  Discard
                </button>
              )}
              {d.canSend ? (
                confirming === d.id ? (
                  <span className="row draft-confirm" role="group" aria-label="Confirm sending">
                    <span className="small">
                      Send to {n} {n === 1 ? "person" : "people"} by {d.channel === "sms" ? "text" : "email"} now?
                    </span>
                    <button className="btn" type="button" disabled={busy === d.id} onClick={() => setConfirming(null)}>
                      Not yet
                    </button>
                    <button className="btn btn-primary" type="button" disabled={busy === d.id} onClick={() => void send(d)}>
                      {busy === d.id ? "Sending…" : "Yes, send"}
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => (channelReady ? setConfirming(d.id) : setSetupFor({ channel: d.channel, missing: messaging?.[d.channel].missing ?? [] }))}
                    aria-describedby={channelReady ? undefined : `setup-${d.id}`}
                  >
                    Send {d.channel === "sms" ? "text" : "email"}
                  </button>
                )
              ) : (
                <span className="small muted">{d.kind === "care" ? "A pastor, deacon or staff member sends this" : "A pastor or staff member sends this"}</span>
              )}
            </footer>
            {!channelReady && d.canSend && (
              <p id={`setup-${d.id}`} className="sr-only">
                {d.channel === "sms" ? "Texting" : "Email"} isn&apos;t set up yet, so Send shows the setup steps.
              </p>
            )}
            {results?.id === d.id && <ResultList rows={results.rows} />}
            </div>
          </article>
        );
      })}
      {done.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.2rem" }}>Recent</h2>
          <div className="list-card draft-recent">
            {done.map((d) => (
              <div key={d.id} className="draft-recent-row">
                <span className={`draft-channel draft-${d.channel}`} aria-hidden="true">
                  {d.channel === "sms" ? <TextIcon /> : <MailIcon />}
                </span>
                <div className="draft-recent-main">
                  <div className="draft-recent-head">
                    <strong>
                      {d.channel === "sms" ? "Text" : "Email"} to {d.recipients.length}
                    </strong>
                    <span className={`status-tag draft-status-${d.status}`}>{STATUS_LABEL[d.status] ?? d.status}</span>
                    <span className="small muted">{ago(d.sentAt ?? d.createdAt)}</span>
                  </div>
                  <span className="small muted draft-recent-text">{d.baseText}</span>
                  {d.delivery && <span className="small muted tabular">{summary(d.delivery)}</span>}
                  {results?.id === d.id && <ResultList rows={results.rows} />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResultList({ rows }: { rows: Result[] }) {
  if (!rows.length) return null;
  return (
    <ul className="send-results" aria-label="What happened for each person">
      {rows.map((r, i) => (
        <li key={i}>
          <span>{r.name}</span>
          <span className="muted">{r.to ?? "no contact"}</span>
          <span className={`send-status send-${r.status}`}>{RESULT_LABEL[r.status] ?? r.status}</span>
          {r.error && r.status !== "queued" && r.status !== "sent" && <span className="small muted send-why">{r.error}</span>}
        </li>
      ))}
    </ul>
  );
}
