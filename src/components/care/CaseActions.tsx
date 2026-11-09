"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CASE_STATUSES, CASE_STATUS_LABELS, CONTACT_KINDS, CONTACT_LABELS, type CaseStatus, type ContactKind } from "@/lib/care/types";
import { careApi, localToday } from "./client";

type Member = { id: string; name: string; title: string; role: string };

export function CaseActions(props: {
  id: string;
  status: CaseStatus;
  confidential: boolean;
  assigneeId?: string;
  nextStep?: { text: string; due?: string };
  members: Member[];
  selfIds: string[];
  canAssign: boolean;
  canClose: boolean;
  isPastor: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState({ kind: "visit" as ContactKind, date: localToday(), note: "", nextStep: "", due: "" });
  const [next, setNext] = useState({ text: props.nextStep?.text ?? "", due: props.nextStep?.due ?? "" });
  const [assignee, setAssignee] = useState(props.assigneeId ?? "");
  const [closing, setClosing] = useState(false);
  const closed = props.status === "closed";

  async function act(body: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await careApi("cases", body);
      after?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) {
    return (
      <section className="fin-card">
        <h2>This case is closed</h2>
        {props.canClose && (
          <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "reopen", id: props.id })}>
            Reopen it
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const holders = props.members.filter((m) => !props.confidential || m.role === "pastor");
  return (
    <div className="fin-stack">
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      <form
        className="fin-card fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "contact", id: props.id, contact: { kind: contact.kind, date: contact.date, note: contact.note || undefined, nextStep: contact.nextStep || undefined, due: contact.due || undefined } }, () =>
            setContact({ ...contact, note: "", nextStep: "", due: "" }),
          );
        }}
      >
        <h2>Log a contact</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ct-kind">Kind</label>
            <select id="ct-kind" value={contact.kind} onChange={(e) => setContact({ ...contact, kind: e.target.value as ContactKind })}>
              {CONTACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONTACT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ct-date">Date</label>
            <input id="ct-date" type="date" required value={contact.date} onChange={(e) => setContact({ ...contact, date: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ct-note">Note (minimal)</label>
          <input id="ct-note" type="text" maxLength={400} placeholder="In good spirits" value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ct-next">New next step</label>
            <input id="ct-next" type="text" maxLength={400} value={contact.nextStep} onChange={(e) => setContact({ ...contact, nextStep: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ct-due">By</label>
            <input id="ct-due" type="date" value={contact.due} onChange={(e) => setContact({ ...contact, due: e.target.value })} />
          </div>
        </div>
        <p className="care-privacy">No diagnoses or other health, counseling or family details. Barnabas checks every note against the church&apos;s privacy policy.</p>
        <div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Log contact
          </button>
        </div>
      </form>

      <form
        className="fin-card fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "update", id: props.id, patch: { nextStep: next.text, due: next.due } });
        }}
      >
        <h2>Next step</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="ns-text">What&apos;s next</label>
            <input id="ns-text" type="text" maxLength={400} value={next.text} onChange={(e) => setNext({ ...next, text: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ns-due">By</label>
            <input id="ns-due" type="date" value={next.due} onChange={(e) => setNext({ ...next, due: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            Save next step
          </button>
          <label className="care-select">
            <span className="sr-only">Status</span>
            <select value={props.status} disabled={busy} onChange={(e) => void act({ action: "update", id: props.id, patch: { status: e.target.value } })}>
              {CASE_STATUSES.filter((s) => s !== "closed").map((s) => (
                <option key={s} value={s}>
                  Status: {CASE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <section className="fin-card fin-form">
        <h2>Who holds it</h2>
        {props.canAssign ? (
          <div className="row">
            <label className="care-select" style={{ flex: 1, minWidth: 0 }}>
              <span className="sr-only">Assign to</span>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">The pastors&apos; queue (unassigned)</option>
                {holders.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.title ? `, ${m.title}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="button" disabled={busy || assignee === (props.assigneeId ?? "")} onClick={() => void act({ action: "assign", id: props.id, assigneeId: assignee || null })}>
              Assign
            </button>
          </div>
        ) : props.assigneeId && props.selfIds.includes(props.assigneeId) ? (
          <p className="muted small">You hold this case. A pastor, deacon or staff member can hand it to someone else.</p>
        ) : (
          <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "assign", id: props.id, assigneeId: props.selfIds[0] })}>
            I&apos;ll take it
          </button>
        )}
        {props.confidential && <p className="small muted">Confidential cases can only go to a pastor.</p>}
        {props.isPastor && (
          <label className="check">
            <input type="checkbox" checked={props.confidential} disabled={busy} onChange={(e) => void act({ action: "update", id: props.id, patch: { confidential: e.target.checked } })} />
            Confidential: pastors only
          </label>
        )}
      </section>

      {props.canClose && (
        <section className="fin-card">
          {closing ? (
            <div className="row">
              <span>Close this case? It stays here, marked closed.</span>
              <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void act({ action: "close", id: props.id }, () => setClosing(false))}>
                Yes, close it
              </button>
              <button className="btn" type="button" onClick={() => setClosing(false)}>
                Not yet
              </button>
            </div>
          ) : (
            <button className="btn" type="button" onClick={() => setClosing(true)}>
              Close case
            </button>
          )}
        </section>
      )}
    </div>
  );
}
