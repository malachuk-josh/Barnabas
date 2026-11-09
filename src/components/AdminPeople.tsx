"use client";

import { useEffect, useMemo, useState } from "react";
import { LEVELS, LEVEL_DESCRIPTIONS, LEVEL_LABELS, TEAM_ROLES, TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_LABELS, type Level, type TeamRole } from "@/lib/auth/roles";
import type { AdminPerson } from "@/app/api/admin/users/route";

type LevelChoice = { level: Level | ""; finance: boolean; teamRole: TeamRole };

const blank: LevelChoice = { level: "", finance: false, teamRole: "serving" };

function summary(p: AdminPerson) {
  if (!p.levelChosen) return `No level yet (older role: ${p.olderRole ?? "Leader"})`;
  if (p.level === "leader") return p.finance ? "Leader, with finance" : "Leader";
  if (p.level === "team") return `Team: ${TEAM_ROLE_LABELS[p.teamRole ?? "serving"]}`;
  return LEVEL_LABELS[p.level];
}

/** The level picker: level, then the finance switch for Leaders or the team role for Team. */
function LevelFields({ id, value, onChange }: { id: string; value: LevelChoice; onChange: (v: LevelChoice) => void }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="field">
        <label htmlFor={`${id}-level`}>Level</label>
        <select id={`${id}-level`} value={value.level} onChange={(e) => onChange({ ...value, level: e.target.value as Level })}>
          {value.level === "" && <option value="">Choose a level</option>}
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
        {value.level && <span className="small muted">{LEVEL_DESCRIPTIONS[value.level]}.</span>}
      </div>
      {value.level === "leader" && (
        <label className="check">
          <input id={`${id}-finance`} type="checkbox" checked={value.finance} onChange={(e) => onChange({ ...value, finance: e.target.checked })} />
          Finance access (budgets, giving and donors)
        </label>
      )}
      {value.level === "team" && (
        <div className="field">
          <label htmlFor={`${id}-team`}>Team role</label>
          <select id={`${id}-team`} value={value.teamRole} onChange={(e) => onChange({ ...value, teamRole: e.target.value as TeamRole })}>
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {TEAM_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="small muted">{TEAM_ROLE_DESCRIPTIONS[value.teamRole]}.</span>
        </div>
      )}
    </div>
  );
}

const choiceOf = (p: AdminPerson): LevelChoice => ({ level: p.levelChosen ? p.level : "", finance: p.finance, teamRole: p.teamRole ?? "serving" });
const body = (c: LevelChoice) => ({ level: c.level, ...(c.level === "leader" ? { finance: c.finance } : {}), ...(c.level === "team" ? { teamRole: c.teamRole } : {}) });

/** Church office → Admin → People: add and remove people, and set their access. */
export function AdminPeople() {
  const [people, setPeople] = useState<AdminPerson[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [add, setAdd] = useState({ name: "", email: "", choice: { ...blank, level: "member" as Level | "" } });
  const [editing, setEditing] = useState<{ id: string; choice: LevelChoice } | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setPeople(j.people))
      .catch(() => setMessage({ ok: false, text: "Couldn't load the people on Barnabas." }));
  }, []);

  async function call(method: string, payload: unknown, done: string, id: string) {
    setBusy(id);
    setMessage(null);
    const res = await fetch("/api/admin/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(null);
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setPeople(json.people);
      setMessage({ ok: true, text: done });
      return true;
    }
    setMessage({ ok: false, text: json.error ?? "That didn't work. Try again." });
    return false;
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!add.choice.level) return;
    const ok = await call("POST", { name: add.name, email: add.email, ...body(add.choice) }, `${add.name} is on Barnabas. They sign in with this email and the church access code.`, "add");
    if (ok) setAdd({ name: "", email: "", choice: { ...blank, level: "member" } });
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q));
    const order: Record<string, number> = { admin: 0, leader: 1, team: 2, member: 3 };
    return list.sort((a, b) => Number(a.levelChosen) - Number(b.levelChosen) || order[a.level]! - order[b.level]! || a.name.localeCompare(b.name));
  }, [people, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of people ?? []) c[p.level] = (c[p.level] ?? 0) + 1;
    return c;
  }, [people]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card stack" aria-labelledby="add-person">
        <h2 id="add-person">Add someone</h2>
        <p className="muted small">Only people on this list can sign in. They use their email and the church access code.</p>
        <form className="stack" onSubmit={onAdd}>
          <div className="admin-add-grid">
            <div className="field">
              <label htmlFor="add-name">Name</label>
              <input id="add-name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} required maxLength={80} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="add-email">Email</label>
              <input id="add-email" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} required maxLength={200} autoComplete="off" />
            </div>
          </div>
          <LevelFields id="add" value={add.choice} onChange={(choice) => setAdd({ ...add, choice })} />
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy === "add" || !add.choice.level}>
              {busy === "add" ? "Adding…" : "Add to Barnabas"}
            </button>
          </div>
        </form>
      </section>

      {message && (
        <p className={`notice small ${message.ok ? "success" : "notice-danger"}`} role="status">
          {message.text}
        </p>
      )}

      <section className="card stack" aria-labelledby="people-list">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 id="people-list">People on Barnabas</h2>
          {people && (
            <span className="small muted">
              {LEVELS.filter((l) => counts[l]).map((l) => `${counts[l]} ${LEVEL_LABELS[l]}`).join(" · ")}
            </span>
          )}
        </div>
        {people && people.length > 6 && (
          <div className="field">
            <label htmlFor="people-search" style={{ position: "absolute", left: -9999 }}>
              Find someone
            </label>
            <input id="people-search" type="search" placeholder="Find someone by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}
        {!people && !message && <p className="muted">Loading…</p>}
        <ul className="admin-people">
          {shown.map((p) => {
            const open = editing?.id === p.leaderId;
            return (
              <li key={p.leaderId} className={p.levelChosen ? undefined : "is-unset"}>
                <div className="admin-person">
                  <div className="admin-person-who">
                    <strong>
                      {p.name}
                      {p.me && <span className="muted small"> (you)</span>}
                    </strong>
                    <span className="small muted">{p.email}</span>
                    <span className="small muted">{p.lastSignedInAt ? `Last signed in ${new Date(p.lastSignedInAt).toLocaleDateString()}` : "Added, hasn't signed in yet"}</span>
                  </div>
                  <span className={`admin-level admin-level-${p.levelChosen ? p.level : "unset"}`}>{summary(p)}</span>
                  {p.fromServer ? (
                    <span className="small muted">Admin from the server settings</span>
                  ) : (
                    !open && (
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn" onClick={() => setEditing({ id: p.leaderId, choice: choiceOf(p) })}>
                          {p.levelChosen ? "Change access" : "Choose a level"}
                        </button>
                        {!p.me && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={busy === p.leaderId}
                            onClick={() => {
                              if (window.confirm(`Remove ${p.name} from Barnabas? They'll be signed out and can't sign in again unless you add them back.`)) {
                                void call("DELETE", { leaderId: p.leaderId }, `${p.name} has been removed.`, p.leaderId);
                              }
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )
                  )}
                </div>
                {open && editing && (
                  <div className="admin-edit stack">
                    <LevelFields id={`p-${p.leaderId}`} value={editing.choice} onChange={(choice) => setEditing({ ...editing, choice })} />
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!editing.choice.level || busy === p.leaderId}
                        onClick={async () => {
                          const ok = await call("PATCH", { leaderId: p.leaderId, ...body(editing.choice) }, `${p.name}'s access is updated. It applies the next time they open a page.`, p.leaderId);
                          if (ok) setEditing(null);
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="btn" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {people && people.some((p) => !p.levelChosen) && (
          <p className="small muted">People without a level keep exactly what their older role allowed until you choose one.</p>
        )}
      </section>
    </div>
  );
}
