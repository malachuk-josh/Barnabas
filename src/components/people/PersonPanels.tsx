"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HOUSEHOLD_ROLES, ROLE_LABELS, type HouseholdRole } from "@/lib/people/types";
import { peoplePost } from "./client";

type Member = { personId: string; name: string; role: HouseholdRole };

/** Rename a household and choose who's in it and their place in it. */
export function HouseholdEditor({ household, members, directory }: { household: { id: string; name: string }; members: Member[]; directory: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(household.name);
  const [list, setList] = useState(members);
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  async function save() {
    setMsg(null);
    try {
      await peoplePost({ action: "household", id: household.id, household: { name, members: list.map((m) => ({ personId: m.personId, role: m.role })) } });
      setMsg("Saved.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  if (!editing) {
    return (
      <div className="hh-view">
        <p className="hh-name">{household.name}</p>
        <ul className="hh-members">
          {members.map((m) => (
            <li key={m.personId}>
              <span className="hh-avatar" aria-hidden="true">
                {m.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]!.toUpperCase())
                  .join("")}
              </span>
              <Link href={`/people/${m.personId}`}>{m.name}</Link>
              <span className="small muted">{ROLE_LABELS[m.role]}</span>
            </li>
          ))}
        </ul>
        {msg && (
          <p className="small" role="status">
            {msg}
          </p>
        )}
        <button
          type="button"
          className="btn btn-sm btn-quiet hh-edit"
          onClick={() => {
            setName(household.name);
            setList(members);
            setMsg(null);
            setEditing(true);
          }}
        >
          Edit household
        </button>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }} data-no-pull>
      <div className="field">
        <label htmlFor="hh-name">Household name</label>
        <input id="hh-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <ul className="list">
        {list.map((m, i) => (
          <li key={m.personId} className="row" style={{ justifyContent: "space-between" }}>
            <Link href={`/people/${m.personId}`}>{m.name}</Link>
            <span className="row">
              <select aria-label={`${m.name}'s place in the household`} value={m.role} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, role: e.target.value as HouseholdRole } : x)))} style={{ width: "auto" }}>
                {HOUSEHOLD_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button type="button" className="btn btn-sm" onClick={() => setList(list.filter((_, j) => j !== i))}>Remove</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="row">
        <select aria-label="Add someone to this household" value={add} onChange={(e) => setAdd(e.target.value)} style={{ flex: "1 1 200px", width: "auto" }}>
          <option value="">Add someone…</option>
          {directory.filter((d) => !list.some((m) => m.personId === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button type="button" className="btn btn-sm" disabled={!add} onClick={() => { const d = directory.find((x) => x.id === add)!; setList([...list, { personId: d.id, name: d.name, role: "other" }]); setAdd(""); }}>Add</button>
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()}>Save household</button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing(false)}>Cancel</button>
        {msg && <span className="small" role="status">{msg}</span>}
      </div>
    </div>
  );
}

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    try {
      await peoplePost({ action: "archive", id, archived: !archived });
      setAsking(false);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  if (archived) return <button className="btn" type="button" onClick={() => void run()}>Restore to the directory</button>;
  return asking ? (
    <span className="row">
      <span className="small">Archive them? They leave the directory and lists, and their history stays.</span>
      <button className="btn btn-danger" type="button" onClick={() => void run()}>Archive</button>
      <button className="btn" type="button" onClick={() => setAsking(false)}>Keep</button>
      {err && <span className="error small">{err}</span>}
    </span>
  ) : (
    <button className="btn" type="button" onClick={() => setAsking(true)}>Archive</button>
  );
}

type Note = { id: string; text: string; byName: string; at: number; private: boolean; mine: boolean };

/** Notes on a person, held to the same privacy rules as memory and care notes. */
export function Notes({ personId, notes, canPrivate, canRemoveAll }: { personId: string; notes: Note[]; canPrivate: boolean; canRemoveAll: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [priv, setPriv] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function add() {
    setErr(null);
    try {
      await peoplePost({ action: "note", personId, note: { text, private: priv } });
      setText("");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="stack" style={{ gap: 10 }} data-no-pull>
      {notes.length === 0 ? <p className="small muted">No notes yet.</p> : (
        <ul className="list">
          {notes.map((n) => (
            <li key={n.id}>
              <span>{n.text}</span>
              <span className="small muted">
                {n.byName} · {new Date(n.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {n.private && " · pastors only"}
                {(n.mine || canRemoveAll) && (
                  <button type="button" className="linkish" onClick={async () => { await peoplePost({ action: "note-remove", id: n.id }).catch(() => {}); router.refresh(); }}>
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="field">
        <label htmlFor="note-text">Add a note</label>
        <input id="note-text" type="text" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="A minimal note, e.g. prefers a call to a text" />
      </div>
      <div className="row">
        {canPrivate && (
          <label className="row small">
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Pastors only
          </label>
        )}
        <button type="button" className="btn btn-sm" disabled={!text.trim()} onClick={() => void add()}>Save note</button>
      </div>
      {err && <p className="error small" role="alert">{err}</p>}
      <p className="small muted">Notes follow the church&apos;s privacy policy: no health, counseling, family or money details, and never codes or passwords.</p>
    </div>
  );
}
