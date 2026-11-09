"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { GROUP_KINDS, GROUP_LABELS, type GroupKind } from "@/lib/people/types";
import { peoplePost } from "./client";

type Group = { id: string; name: string; kind: GroupKind; meets?: string; leaderIds: string[]; memberIds: string[] };
type P = { id: string; name: string };

export function GroupsView({ groups, people, edit }: { groups: Group[]; people: P[]; edit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Group | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  async function save(g: Group) {
    setErr(null);
    try {
      await peoplePost({ action: "group", id: g.id || undefined, group: { name: g.name, kind: g.kind, meets: g.meets, leaderIds: g.leaderIds, memberIds: g.memberIds } });
      setDraft(null);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  const editor = (g: Group) => (
    <div className="stack" style={{ gap: 10 }} data-no-pull>
      <div className="fin-form-row">
        <div className="field"><label htmlFor={`g-n-${g.id}`}>Name</label><input id={`g-n-${g.id}`} type="text" value={g.name} onChange={(e) => setDraft({ ...g, name: e.target.value })} /></div>
        <div className="field"><label htmlFor={`g-k-${g.id}`}>Kind</label><select id={`g-k-${g.id}`} value={g.kind} onChange={(e) => setDraft({ ...g, kind: e.target.value as GroupKind })}>{GROUP_KINDS.map((k) => <option key={k} value={k}>{GROUP_LABELS[k]}</option>)}</select></div>
        <div className="field"><label htmlFor={`g-m-${g.id}`}>Meets</label><input id={`g-m-${g.id}`} type="text" value={g.meets ?? ""} placeholder="Tuesdays 7:00 PM" onChange={(e) => setDraft({ ...g, meets: e.target.value })} /></div>
      </div>
      <fieldset className="ppl-checks">
        <legend>Members (tick the leaders too)</legend>
        {people.map((p) => (
          <label key={p.id} className="row small">
            <input type="checkbox" checked={g.memberIds.includes(p.id)} onChange={(e) => setDraft({ ...g, memberIds: e.target.checked ? [...g.memberIds, p.id] : g.memberIds.filter((x) => x !== p.id), leaderIds: e.target.checked ? g.leaderIds : g.leaderIds.filter((x) => x !== p.id) })} />
            {p.name}
            {g.memberIds.includes(p.id) && (
              <span className="muted">
                <input type="checkbox" aria-label={`${p.name} leads`} checked={g.leaderIds.includes(p.id)} onChange={(e) => setDraft({ ...g, leaderIds: e.target.checked ? [...g.leaderIds, p.id] : g.leaderIds.filter((x) => x !== p.id) })} /> leads
              </span>
            )}
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={!g.name.trim()} onClick={() => void save(g)}>Save group</button>
        <button type="button" className="btn btn-sm" onClick={() => setDraft(null)}>Cancel</button>
        {g.id && <button type="button" className="btn btn-sm btn-danger" onClick={async () => { await peoplePost({ action: "group-archive", id: g.id }).catch((e) => setErr(e.message)); setDraft(null); router.refresh(); }}>Archive group</button>}
      </div>
      {err && <p className="error small">{err}</p>}
    </div>
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      {edit && !draft && <div><button type="button" className="btn btn-primary" onClick={() => setDraft({ id: "", name: "", kind: "small_group", leaderIds: [], memberIds: [] })}>New group</button></div>}
      {draft && !draft.id && <section className="fin-card">{editor(draft)}</section>}
      {groups.length === 0 && !draft ? (
        <EmptyState title="No groups yet" actions={edit ? [{ label: "Move groups in from ChurchTrac", href: "/people/import" }] : []}>
          Growth Groups, Life Groups, classes and ministry teams live here, with who&apos;s in each and who leads. Groups come over with the migration tool, or start one here.
        </EmptyState>
      ) : (
        <ul className="mesa-results">
          {groups.map((g) => (
            <li key={g.id} className="fin-card">
              <div className="fin-card-head">
                <span className="label">{GROUP_LABELS[g.kind]}</span>
                <span className="small muted tabular">{g.memberIds.length} {g.memberIds.length === 1 ? "person" : "people"}</span>
              </div>
              <h3>{g.name}</h3>
              {g.meets && <p className="small">{g.meets}</p>}
              {draft?.id === g.id ? editor(draft) : (
                <>
                  <p className="small muted">{g.leaderIds.length ? `Led by ${g.leaderIds.map(nameOf).join(", ")}` : "No leader set"}</p>
                  <div className="row">
                    <button type="button" className="btn btn-sm" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? "Hide members" : "Members"}</button>
                    {edit && <button type="button" className="btn btn-sm" onClick={() => setDraft(g)}>Edit</button>}
                  </div>
                  {open === g.id && <p className="small">{g.memberIds.map(nameOf).join(", ") || "No one yet."}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
