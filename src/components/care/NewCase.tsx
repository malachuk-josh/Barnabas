"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CASE_TYPES, CASE_TYPE_LABELS, CONTACT_KINDS, CONTACT_LABELS, type CaseType } from "@/lib/care/types";
import { careApi, localToday } from "./client";

type Person = { id: string; name: string; household: string | null };
type Member = { id: string; name: string; title: string; role: string };

/** "Note a need": who, what kind, who holds it, and optionally the first contact and next step. */
export function NewCase({ people, members, selfId, canAssign, isPastor }: { people: Person[]; members: Member[]; selfId: string; canAssign: boolean; isPastor: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ personId: "", name: "", household: false, type: "hospital" as CaseType, confidential: false, assignee: "me", summary: "", nextStep: "", due: "", contactKind: "", contactNote: "" });
  const person = people.find((p) => p.id === f.personId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const today = localToday();
      const { case: c } = await careApi<{ case: { id: string } }>("cases", {
        action: "open",
        case: {
          personId: f.personId || undefined,
          name: f.personId ? undefined : f.name,
          household: f.household,
          type: f.type,
          confidential: f.confidential,
          assignee: f.assignee,
          summary: f.summary || undefined,
          nextStep: f.nextStep || undefined,
          due: f.due || undefined,
          contact: f.contactKind ? { kind: f.contactKind, date: today, note: f.contactNote || undefined } : undefined,
        },
      });
      setOpen(false);
      router.push(f.confidential && !isPastor ? "/shepherding?opened=confidential" : `/shepherding/cases/${c.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const holders = canAssign ? members : members.filter((m) => m.id === selfId);
  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Note a need
      </button>
      {open && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-case-title" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form className="sheet" onSubmit={submit}>
            <h2 id="new-case-title">Note a need</h2>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-person">Who</label>
                <select id="nc-person" value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
                  <option value="">Someone not in the directory…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {!f.personId ? (
                <div className="field">
                  <label htmlFor="nc-name">Name</label>
                  <input id="nc-name" type="text" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                </div>
              ) : (
                <label className="check care-check-field">
                  <input type="checkbox" checked={f.household} disabled={!person?.household} onChange={(e) => setF({ ...f, household: e.target.checked })} />
                  {person?.household ? `The whole ${person.household}` : "No household on file"}
                </label>
              )}
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-type">Type</label>
                <select id="nc-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CaseType })}>
                  {CASE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CASE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="nc-holder">Who holds it</label>
                <select id="nc-holder" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
                  <option value="me">Me</option>
                  <option value="unassigned">The pastors&apos; queue (unassigned)</option>
                  {holders
                    .filter((m) => m.id !== selfId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.title ? `, ${m.title}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={f.confidential} onChange={(e) => setF({ ...f, confidential: e.target.checked })} />
              Confidential: pastors only
            </label>
            {f.confidential && !isPastor && <p className="small muted">Only the pastors will see it, so it goes to their queue and you won&apos;t see it afterward.</p>}
            <div className="field">
              <label htmlFor="nc-summary">One-line summary</label>
              <input id="nc-summary" type="text" maxLength={400} placeholder="At Berkshire Medical Center this week" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-next">Next step</label>
                <input id="nc-next" type="text" maxLength={400} placeholder="Call Thursday" value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nc-due">By</label>
                <input id="nc-due" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nc-contact">Already reached them today?</label>
                <select id="nc-contact" value={f.contactKind} onChange={(e) => setF({ ...f, contactKind: e.target.value })}>
                  <option value="">Not yet</option>
                  {CONTACT_KINDS.filter((k) => k !== "other").map((k) => (
                    <option key={k} value={k}>
                      {CONTACT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              {f.contactKind && (
                <div className="field">
                  <label htmlFor="nc-cnote">Note</label>
                  <input id="nc-cnote" type="text" maxLength={400} placeholder="In good spirits" value={f.contactNote} onChange={(e) => setF({ ...f, contactNote: e.target.value })} />
                </div>
              )}
            </div>
            <p className="care-privacy">Keep notes minimal. The type can say &ldquo;illness&rdquo;; notes never hold diagnoses or other health, counseling or family details.</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Note need"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
