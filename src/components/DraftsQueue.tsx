"use client";

import { useCallback, useEffect, useState } from "react";

type Recipient = { personId: string; name: string; language: "en" | "es" | "ko"; text: string };
type Draft = { id: string; channel: "sms" | "email"; subject?: string; baseText: string; recipients: Recipient[]; status: string; createdAt: number };

const LANG: Record<string, string> = { en: "English", es: "Spanish", ko: "Korean" };

export function DraftsQueue() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/drafts");
    setDrafts(res.ok ? (await res.json()).drafts : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "queue" | "discard") {
    const res = await fetch(`/api/drafts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await res.json().catch(() => ({}));
    setMessage(
      res.ok
        ? action === "queue"
          ? "Queued. Text and email delivery isn't connected yet, so it's held in the outbox."
          : "Discarded."
        : body.error ?? "That didn't work.",
    );
    await load();
  }

  if (drafts === null) return <p className="muted">Loading…</p>;
  const open = drafts.filter((d) => d.status === "needs_review");
  const done = drafts.filter((d) => d.status !== "needs_review").slice(0, 10);

  return (
    <div className="stack" style={{ gap: 20 }}>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {open.length === 0 && <div className="card muted">No drafts waiting. Ask Barnabas to write a message and it will appear here for review.</div>}
      {open.map((d) => {
        const byLang = new Map<string, Recipient[]>();
        d.recipients.forEach((r) => byLang.set(r.language, [...(byLang.get(r.language) ?? []), r]));
        return (
          <article key={d.id} className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>
                {d.channel === "sms" ? "Text" : "Email"} to {d.recipients.length} {d.recipients.length === 1 ? "person" : "people"}
              </strong>
              <div className="row">
                <button className="btn btn-primary" onClick={() => void act(d.id, "queue")}>
                  Approve
                </button>
                <button className="btn" onClick={() => void act(d.id, "discard")}>
                  Discard
                </button>
              </div>
            </div>
            {d.subject && <p className="small muted">Subject: {d.subject}</p>}
            {[...byLang.entries()].map(([lang, people]) => (
              <div key={lang} className="recipient">
                <span className="label">
                  {LANG[lang]} · {people.length}
                </span>
                <p>{people[0].text}</p>
                <span className="small muted">{people.map((p) => p.name).join(", ")}</span>
              </div>
            ))}
          </article>
        );
      })}
      {done.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.2rem" }}>Recent</h2>
          {done.map((d) => (
            <div key={d.id} className="card small muted">
              {d.status === "queued" ? "Queued" : "Discarded"}: {d.baseText.slice(0, 120)}
              {d.baseText.length > 120 ? "…" : ""}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
