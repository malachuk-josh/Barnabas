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
      {(setupFor || (unconfigured && open.length > 0)) && messaging && <MessagingSetup sms={messaging.sms} email={messaging.email} focus={setupFor?.channel} />}
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
          <article key={d.id} className="card stack draft-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>
                {d.channel === "sms" ? "Text" : "Email"} to {n} {n === 1 ? "person" : "people"}
                {d.kind === "care" && <span className="badge" style={{ marginLeft: 8 }}>Shepherding follow-up</span>}
                {d.kind === "report" && <span className="badge" style={{ marginLeft: 8 }}>Report</span>}
                {d.status === "failed" && <span className="badge badge-warn" style={{ marginLeft: 8 }}>Not sent yet</span>}
              </strong>
              <div className="row">
                {d.canSend ? (
                  confirming === d.id ? (
                    <span className="row draft-confirm" role="group" aria-label="Confirm sending">
                      <span className="small">
                        Send to {n} {n === 1 ? "person" : "people"} by {d.channel === "sms" ? "text" : "email"} now?
                      </span>
                      <button className="btn btn-primary" type="button" disabled={busy === d.id} onClick={() => void send(d)}>
                        {busy === d.id ? "Sending…" : "Yes, send"}
                      </button>
                      <button className="btn" type="button" disabled={busy === d.id} onClick={() => setConfirming(null)}>
                        Not yet
                      </button>
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => (channelReady ? setConfirming(d.id) : setSetupFor({ channel: d.channel, missing: messaging?.[d.channel].missing ?? [] }))}
                      aria-describedby={channelReady ? undefined : `setup-${d.id}`}
                    >
                      Send
                    </button>
                  )
                ) : (
                  <span className="small muted">{d.kind === "care" ? "A pastor, deacon or staff member sends this" : "A pastor or staff member sends this"}</span>
                )}
                {confirming !== d.id && (
                  <button className="btn" type="button" onClick={() => void discard(d.id)}>
                    Discard
                  </button>
                )}
              </div>
            </div>
            {!channelReady && d.canSend && (
              <p id={`setup-${d.id}`} className="small muted">
                {d.channel === "sms" ? "Texting" : "Email"} isn&apos;t set up yet, so Send shows the setup steps.
              </p>
            )}
            {d.subject && <p className="small muted">Subject: {d.subject}</p>}
            {[...byLang.entries()].map(([lang, people]) => (
              <div key={lang} className="recipient">
                <span className="label">
                  {LANG[lang]} · {people.length}
                </span>
                <p style={{ whiteSpace: "pre-wrap" }}>{people[0].text}</p>
                <span className="small muted">{people.map((p) => p.name).join(", ")}</span>
              </div>
            ))}
            {d.channel === "email" && <p className="small muted">Every email ends with an unsubscribe link. People who replied STOP or unsubscribed are skipped automatically.</p>}
            {results?.id === d.id && <ResultList rows={results.rows} />}
          </article>
        );
      })}
      {done.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.2rem" }}>Recent</h2>
          {done.map((d) => (
            <div key={d.id} className="card small stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {STATUS_LABEL[d.status] ?? d.status} · {d.channel === "sms" ? "text" : "email"} to {d.recipients.length}
                </strong>
                {d.delivery && <span className="muted tabular">{summary(d.delivery)}</span>}
              </div>
              <span className="muted">
                {d.baseText.slice(0, 140)}
                {d.baseText.length > 140 ? "…" : ""}
              </span>
              {results?.id === d.id && <ResultList rows={results.rows} />}
            </div>
          ))}
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
