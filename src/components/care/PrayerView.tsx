"use client";

import { EmptyState } from "@/components/EmptyState";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { careApi, localToday, shortDate } from "./client";

type Prayer = { id: string; name: string; request: string; shareable: boolean; prayedCount: number; prayedByMe: boolean; answered?: { date: string; note?: string }; createdByName: string; createdAt: number; guestId?: string };

export function PrayerView({ prayers, people }: { prayers: Prayer[]; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ personId: "", name: "", request: "", shareable: false });

  async function act(body: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await careApi("prayer", body);
      after?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const open = prayers.filter((p) => !p.answered);
  const answered = prayers.filter((p) => p.answered);
  const item = (p: Prayer) => (
    <li key={p.id} className="care-prayer">
      <div className="care-prayer-head">
        <strong>{p.name}</strong>
        <span className={`care-share ${p.shareable ? "" : "private"}`}>{p.shareable ? "Shareable" : "Private"}</span>
      </div>
      <p>{p.request}</p>
      <div className="care-meta">
        <span>
          Prayed for {p.prayedCount} {p.prayedCount === 1 ? "time" : "times"}
          {p.prayedByMe ? ", including by you" : ""}
        </span>
        <span>
          Added {shortDate(new Date(p.createdAt).toISOString().slice(0, 10))} by {p.createdByName}
        </span>
        {p.answered && <span>Answered {shortDate(p.answered.date)}</span>}
      </div>
      {!p.answered && (
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "prayed", id: p.id })}>
            I prayed
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "answered", id: p.id, date: localToday() })}>
            Mark answered
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div className="fin-grid-2">
      <div className="fin-stack">
        {error && (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}
        <section className="fin-card">
          <div className="fin-card-head">
            <h2>Praying for</h2>
            <span className="muted small">{open.length} open</span>
          </div>
          {open.length ? (
            <ul className="care-prayers">{open.map(item)}</ul>
          ) : (
            <EmptyState compact title="No prayer requests yet" actions={[{ label: "Add the first request", href: "#add-prayer", primary: true }]}>
              Requests the team is praying for show here. Keep them short; private ones stay with the pastors and you.
            </EmptyState>
          )}
          <p className="fin-source">Shareable requests from the whole team, and private ones you added. Pastors see every request.</p>
        </section>
        {answered.length > 0 && (
          <section className="fin-card">
            <h2>Answered</h2>
            <ul className="care-prayers">{answered.map(item)}</ul>
          </section>
        )}
      </div>
      <form
        className="fin-card fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "add", prayer: { personId: f.personId || undefined, name: f.personId ? undefined : f.name, request: f.request, shareable: f.shareable } }, () => setF({ personId: "", name: "", request: "", shareable: false }));
        }}
      >
        <h2 id="add-prayer">Add a request</h2>
        <div className="field">
          <label htmlFor="pr-person">Who</label>
          <select id="pr-person" value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
            <option value="">Someone not in the directory…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {!f.personId && (
          <div className="field">
            <label htmlFor="pr-name">Name</label>
            <input id="pr-name" type="text" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
        )}
        <div className="field">
          <label htmlFor="pr-request">Request</label>
          <textarea id="pr-request" className="plain" required minLength={3} maxLength={500} placeholder="Rest and healing as she recovers at home" value={f.request} onChange={(e) => setF({ ...f, request: e.target.value })} />
        </div>
        <label className="check">
          <input type="checkbox" checked={f.shareable} onChange={(e) => setF({ ...f, shareable: e.target.checked })} />
          They&apos;re happy for the prayer team to see it
        </label>
        <p className="care-privacy">Keep it short and general. Health, counseling, family and money details aren&apos;t stored.</p>
        <div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Add request
          </button>
        </div>
      </form>
    </div>
  );
}
