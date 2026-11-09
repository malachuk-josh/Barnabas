"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLASS_KINDS, CLASS_LABELS, PATHWAY_LABELS, PATHWAY_STEPS, type CareClass, type ClassKind, type Pathway, type PathwayStep } from "@/lib/care/types";
import { careApi, localToday, shortDate } from "./client";

type Who = { key: string; name: string };

function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(body: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await careApi("discipleship", body);
      after?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }
  return { act, error, busy };
}

export function ClassCard({ cls, everyone, canEdit, today }: { cls: CareClass; everyone: Who[]; canEdit: boolean; today: string }) {
  const { act, error, busy } = useAct();
  const [add, setAdd] = useState("");
  const enrolled = new Set(cls.enrollees.map((e) => e.key));
  const upcoming = cls.sessions.filter((s) => s.date >= today);
  return (
    <section className="fin-card">
      <div className="fin-card-head">
        <h3>{cls.name}</h3>
        <span className="muted small">
          {CLASS_LABELS[cls.kind]}
          {cls.teacherName ? ` · taught by ${cls.teacherName}` : ""}
        </span>
      </div>
      <div className="small muted">
        {cls.sessions.length} sessions, {cls.enrollees.length} enrolled{upcoming.length ? `; next ${shortDate(upcoming[0].date)}${upcoming[0].time ? ` at ${upcoming[0].time}` : ""}` : "; finished"}
      </div>
      {cls.enrollees.length > 0 && (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                {cls.sessions.map((s, i) => (
                  <th key={s.id} scope="col" title={s.topic}>
                    {i + 1}. {shortDate(s.date)}
                  </th>
                ))}
                <th scope="col">Finished</th>
              </tr>
            </thead>
            <tbody>
              {cls.enrollees.map((e) => (
                <tr key={e.key}>
                  <td className="nowrap">{e.name}</td>
                  {cls.sessions.map((s) => {
                    const here = (cls.attendance[s.id] ?? []).includes(e.key);
                    return (
                      <td key={s.id}>
                        <input
                          type="checkbox"
                          aria-label={`${e.name} at session ${s.topic}`}
                          checked={here}
                          disabled={!canEdit || busy || s.date > today}
                          onChange={(ev) => void act({ action: "attendance", classId: cls.id, sessionId: s.id, key: e.key, present: ev.target.checked })}
                        />
                      </td>
                    );
                  })}
                  <td className="nowrap">
                    {e.completedAt ? (
                      shortDate(e.completedAt)
                    ) : canEdit ? (
                      <button className="linklike small" type="button" disabled={busy} onClick={() => void act({ action: "complete", classId: cls.id, key: e.key, date: localToday() })}>
                        Mark finished
                      </button>
                    ) : (
                      "Not yet"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (add) void act({ action: "enroll", classId: cls.id, key: add }, () => setAdd(""));
          }}
        >
          <label className="care-select" style={{ flex: 1, minWidth: 0 }}>
            <span className="sr-only">Enroll someone</span>
            <select value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Enroll someone…</option>
              {everyone
                .filter((w) => !enrolled.has(w.key))
                .map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="btn" type="submit" disabled={busy || !add}>
            Enroll
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p className="fin-source">Enrollment and attendance recorded in Barnabas. Finishing the class records that step on their pathway.</p>
    </section>
  );
}

export function StepForm({ everyone }: { everyone: Who[] }) {
  const { act, error, busy } = useAct();
  const [f, setF] = useState({ key: "", step: "baptism" as PathwayStep, date: localToday() });
  return (
    <form
      className="fin-card fin-form"
      onSubmit={(e) => {
        e.preventDefault();
        void act({ action: "set-step", step: { key: f.key, step: f.step, date: f.date } });
      }}
    >
      <h2>Record a step</h2>
      <div className="field">
        <label htmlFor="st-who">Who</label>
        <select id="st-who" required value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })}>
          <option value="">Choose…</option>
          {everyone.map((w) => (
            <option key={w.key} value={w.key}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="st-step">Step</label>
          <select id="st-step" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value as PathwayStep })}>
            {PATHWAY_STEPS.map((s) => (
              <option key={s} value={s}>
                {PATHWAY_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="st-date">Date</label>
          <input id="st-date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div>
        <button className="btn btn-primary" type="submit" disabled={busy || !f.key}>
          Save step
        </button>
      </div>
    </form>
  );
}

export function NewClass({ teachers }: { teachers: { id: string; name: string }[] }) {
  const { act, error, busy } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "discover_faith" as ClassKind, name: "", teacherId: "", first: localToday(), count: 4, time: "9:45 AM" });
  if (!open)
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        Add a class
      </button>
    );
  return (
    <form
      className="fin-card fin-form"
      onSubmit={(e) => {
        e.preventDefault();
        const sessions = Array.from({ length: f.count }, (_, i) => {
          const d = new Date(`${f.first}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 7 * i);
          return { date: d.toISOString().slice(0, 10), time: f.time || undefined, topic: `Session ${i + 1}` };
        });
        void act({ action: "add-class", class: { kind: f.kind, name: f.name || `${CLASS_LABELS[f.kind]}`, teacherId: f.teacherId || undefined, sessions } }, () => setOpen(false));
      }}
    >
      <h2>Add a class</h2>
      <div className="form-row">
        <div className="field">
          <label htmlFor="cl-kind">Class</label>
          <select id="cl-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ClassKind })}>
            {CLASS_KINDS.map((k) => (
              <option key={k} value={k}>
                {CLASS_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cl-name">Name</label>
          <input id="cl-name" type="text" maxLength={80} placeholder="Discover Faith: winter" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="cl-teacher">Teacher</label>
          <select id="cl-teacher" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>
            <option value="">Not set</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cl-first">First session</label>
          <input id="cl-first" type="date" required value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="cl-count">Weekly sessions</label>
          <input id="cl-count" type="number" min={1} max={12} value={f.count} onChange={(e) => setF({ ...f, count: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} />
        </div>
        <div className="field">
          <label htmlFor="cl-time">Time</label>
          <input id="cl-time" type="text" maxLength={20} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Add class
        </button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export type { Pathway };
