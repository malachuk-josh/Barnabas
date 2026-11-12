"use client";

import { useEffect, useMemo, useState } from "react";
import { LEVELS, LEVEL_DESCRIPTIONS, LEVEL_LABELS, TEAM_ROLES, TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_LABELS, type Level, type TeamRole } from "@/lib/auth/roles";
import type { AdminPerson } from "@/app/api/admin/users/route";
import type { InviteSend } from "@/lib/team/invites";

type LevelChoice = { level: Level | ""; finance: boolean; teamRole: TeamRole };

const blank: LevelChoice = { level: "", finance: false, teamRole: "serving" };

function summary(p: AdminPerson) {
  if (!p.levelChosen) return `No level yet (older role: ${p.olderRole ?? "Leader"})`;
  if (p.level === "leader") return p.finance ? "Leader, with finance" : "Leader";
  if (p.level === "team") return `Team: ${TEAM_ROLE_LABELS[p.teamRole ?? "serving"]}`;
  return LEVEL_LABELS[p.level];
}

/** The level picker: level cards, then the finance switch for Leaders or the team role for Team. */
function LevelFields({ id, value, onChange }: { id: string; value: LevelChoice; onChange: (v: LevelChoice) => void }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <fieldset className="admin-levels">
        <legend>Level</legend>
        <div className="admin-level-cards">
          {LEVELS.map((l) => (
            <label key={l} className={`admin-level-card${value.level === l ? " is-picked" : ""}`}>
              <input type="radio" className="sr-only" name={`${id}-level`} value={l} checked={value.level === l} onChange={() => onChange({ ...value, level: l })} />
              <span className={`admin-level-mark admin-level-${l}`} aria-hidden="true" />
              <strong>{LEVEL_LABELS[l]}</strong>
              <span className="small muted">{LEVEL_DESCRIPTIONS[l]}.</span>
            </label>
          ))}
        </div>
        {value.level === "" && <span className="small muted">Choose a level.</span>}
      </fieldset>
      {value.level === "leader" && (
        <label className="check admin-sub">
          <input id={`${id}-finance`} type="checkbox" checked={value.finance} onChange={(e) => onChange({ ...value, finance: e.target.checked })} />
          Finance access (budgets, giving and donors)
        </label>
      )}
      {value.level === "team" && (
        <div className="field admin-sub">
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

/** "DW" from "Dana Whitfield". */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

const shortDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function inviteStatus(p: AdminPerson) {
  const inv = p.invite;
  if (!inv) return "Not invited yet";
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (inv.expired) return `Invite from ${day(inv.sentAt)} has expired`;
  const ways = inv.sends.map((s) => `${s.via === "email" ? "email" : "text"} ${s.ok ? "sent" : /set up/.test(s.message ?? "") ? "not set up" : "didn't go"}`);
  return `Invited ${day(inv.sentAt)}${ways.length ? `: ${ways.join(", ")}` : " (link to copy)"} · works until ${day(inv.expiresAt)}`;
}

const choiceOf = (p: AdminPerson): LevelChoice => ({ level: p.levelChosen ? p.level : "", finance: p.finance, teamRole: p.teamRole ?? "serving" });
const body = (c: LevelChoice) => ({ level: c.level, ...(c.level === "leader" ? { finance: c.finance } : {}), ...(c.level === "team" ? { teamRole: c.teamRole } : {}) });

/** Church office → Admin → People: add and remove people, and set their access. */
export function AdminPeople() {
  const [people, setPeople] = useState<AdminPerson[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [add, setAdd] = useState({ name: "", email: "", phone: "", inviteEmail: true, inviteText: false, choice: { ...blank, level: "member" as Level | "" } });
  const [channels, setChannels] = useState<{ email: boolean; text: boolean }>({ email: false, text: false });
  // The latest invite link, to copy when it couldn't be sent (or to send yourself).
  const [lastInvite, setLastInvite] = useState<{ leaderId: string; name: string; link: string; sends: InviteSend[] } | null>(null);
  const [inviting, setInviting] = useState<{ id: string; email: boolean; text: boolean; phone: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; choice: LevelChoice } | null>(null);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setPeople(j.people);
        if (j.channels) setChannels(j.channels);
      })
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
      if (json.channels) setChannels(json.channels);
      if (json.invite) {
        const who = (json.people as AdminPerson[]).find((p) => p.leaderId === json.invite.leaderId);
        setLastInvite({ ...json.invite, name: who?.name ?? "" });
        const sends = json.invite.sends as InviteSend[];
        const sent = sends.filter((s) => s.ok).map((s) => (s.via === "email" ? "email" : "text"));
        const failed = sends.filter((s) => !s.ok);
        setMessage({ ok: failed.length === 0, text: `${done}${sent.length ? ` Invite sent by ${sent.join(" and ")}.` : ""}${failed.map((f) => ` The ${f.via === "email" ? "email" : "text"} didn't go: ${f.message}`).join("")}${!sends.length || failed.length ? " You can copy their invite link below and send it yourself." : ""}` });
      } else setMessage({ ok: true, text: done });
      return true;
    }
    setMessage({ ok: false, text: json.error ?? "That didn't work. Try again." });
    return false;
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!add.choice.level) return;
    const invite = { inviteEmail: add.inviteEmail, inviteText: add.inviteText && Boolean(add.phone.trim()) };
    const ok = await call("POST", { name: add.name, email: add.email, ...(add.phone.trim() ? { phone: add.phone } : {}), ...invite, ...body(add.choice) }, `${add.name} is on Barnabas.`, "add");
    if (ok) setAdd({ name: "", email: "", phone: "", inviteEmail: true, inviteText: false, choice: { ...blank, level: "member" } });
  }

  async function sendInvite(p: AdminPerson, how: { email: boolean; text: boolean; phone?: string }, quiet = false) {
    const ok = await call("PUT", { leaderId: p.leaderId, email: how.email, text: how.text, ...(how.phone !== undefined ? { phone: how.phone } : {}) }, quiet ? `A fresh invite link for ${p.name} is ready to copy.` : `${p.name}'s invite is on its way.`, p.leaderId);
    if (ok) setInviting(null);
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setMessage({ ok: true, text: "Invite link copied. Paste it into a text or email." });
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  }

  const pending = useMemo(() => (people ?? []).filter((p) => !p.lastSignedInAt && !p.fromServer).sort((a, b) => a.name.localeCompare(b.name)), [people]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (people ?? []).filter((p) => (p.lastSignedInAt || p.fromServer) && (!q || p.name.toLowerCase().includes(q) || p.email.includes(q)));
    const order: Record<string, number> = { admin: 0, leader: 1, team: 2, member: 3 };
    return list.sort((a, b) => Number(a.levelChosen) - Number(b.levelChosen) || order[a.level]! - order[b.level]! || a.name.localeCompare(b.name));
  }, [people, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of people ?? []) c[p.level] = (c[p.level] ?? 0) + 1;
    return c;
  }, [people]);

  // Open when there's hardly anyone yet; folded once the church is on Barnabas.
  const showAdd = addOpen ?? (people !== null && people.length <= 1);

  return (
    <div className="stack" style={{ gap: 20 }}>
      {people && (
        <dl className="admin-counts">
          {LEVELS.map((l) => (
            <div key={l}>
              <dt>
                <span className={`admin-level-mark admin-level-${l}`} aria-hidden="true" />
                {LEVEL_LABELS[l]}
              </dt>
              <dd className="tabular">{counts[l] ?? 0}</dd>
            </div>
          ))}
          <div className={pending.length ? "is-pending" : undefined}>
            <dt>Invites waiting</dt>
            <dd className="tabular">{pending.length}</dd>
          </div>
        </dl>
      )}

      <section className={`card stack admin-add${showAdd ? " is-open" : ""}`} aria-labelledby="add-person">
        <div className="admin-add-head">
          <div>
            <h2 id="add-person">Add someone</h2>
            <p className="muted small">Only people on this list can sign in. An invite&apos;s link signs them in without the access code; they can also use their email and the church access code.</p>
          </div>
          {!showAdd && (
            <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)} aria-controls="add-form">
              Add someone
            </button>
          )}
        </div>
        {showAdd && (
        <form className="stack" id="add-form" onSubmit={onAdd}>
          <div className="admin-add-grid">
            <div className="field">
              <label htmlFor="add-name">Name</label>
              <input id="add-name" type="text" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} required maxLength={80} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="add-email">Email</label>
              <input id="add-email" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} required maxLength={200} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="add-phone">Mobile (optional, for a texted invite)</label>
              <input id="add-phone" type="tel" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value, inviteText: e.target.value.trim() ? add.inviteText || channels.text : false })} maxLength={30} autoComplete="off" />
            </div>
          </div>
          <LevelFields id="add" value={add.choice} onChange={(choice) => setAdd({ ...add, choice })} />
          <fieldset className="admin-invite-ways">
            <legend>Send an invite</legend>
            <label className="check">
              <input id="add-invite-email" type="checkbox" checked={add.inviteEmail} onChange={(e) => setAdd({ ...add, inviteEmail: e.target.checked })} />
              By email
            </label>
            <label className="check">
              <input id="add-invite-text" type="checkbox" checked={add.inviteText} disabled={!add.phone.trim()} onChange={(e) => setAdd({ ...add, inviteText: e.target.checked })} />
              By text
            </label>
            {(!channels.email || !channels.text) && (
              <span className="small muted">
                {!channels.email && !channels.text ? "Email and texting aren't set up yet" : !channels.email ? "Email isn't set up yet" : "Texting isn't set up yet"}, so you&apos;ll get a link to copy and send yourself.
              </span>
            )}
          </fieldset>
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy === "add" || !add.choice.level}>
              {busy === "add" ? "Adding…" : add.inviteEmail || add.inviteText ? "Add and send invite" : "Add to Barnabas"}
            </button>
            {people && people.length > 1 && (
              <button type="button" className="btn btn-quiet" onClick={() => setAddOpen(false)}>
                Close
              </button>
            )}
          </div>
        </form>
        )}
      </section>

      {message && (
        <p className={`notice small ${message.ok ? "success" : "notice-danger"}`} role="status">
          {message.text}
        </p>
      )}

      {lastInvite && (
        <section className="card admin-invite-link" aria-label="Invite link">
          <p className="small">
            <strong>{lastInvite.name}&apos;s invite link</strong> · works for 30 days, just for them
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <input readOnly value={lastInvite.link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn" onClick={() => void copy(lastInvite.link)}>
              Copy
            </button>
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section className="card stack" aria-labelledby="pending-invites">
          <h2 id="pending-invites">Pending invites</h2>
          <p className="muted small">Added, and haven&apos;t signed in yet.</p>
          <ul className="admin-people">
            {pending.map((p) => {
              const open = inviting?.id === p.leaderId;
              return (
                <li key={p.leaderId}>
                  <div className="admin-person">
                    <span className="admin-avatar is-pending" aria-hidden="true">
                      {initials(p.name)}
                    </span>
                    <div className="admin-person-who">
                      <strong>{p.name}</strong>
                      <span className="small muted">
                        {p.email}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </span>
                      <span className={`small ${p.invite?.expired ? "admin-invite-bad" : "muted"}`}>{inviteStatus(p)}</span>
                    </div>
                    <span className={`admin-level admin-level-${p.levelChosen ? p.level : "unset"}`}>{summary(p)}</span>
                    {!open && (
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => setInviting({ id: p.leaderId, email: Boolean(channels.email), text: Boolean(channels.text && p.phone), phone: p.phone ?? "" })}>
                          {p.invite ? "Resend" : "Send invite"}
                        </button>
                        <button type="button" className="btn btn-sm btn-quiet" disabled={busy === p.leaderId} onClick={() => void sendInvite(p, { email: false, text: false }, true)}>
                          New link
                        </button>
                        <button
                          type="button"
                          className="admin-remove"
                          disabled={busy === p.leaderId}
                          onClick={() => {
                            if (window.confirm(`Cancel ${p.name}'s invite and take them off Barnabas?`)) void call("DELETE", { leaderId: p.leaderId }, `${p.name}'s invite is cancelled.`, p.leaderId);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  {open && inviting && (
                    <div className="admin-edit stack">
                      <label className="check">
                        <input type="checkbox" checked={inviting.email} onChange={(e) => setInviting({ ...inviting, email: e.target.checked })} />
                        Email to {p.email}
                      </label>
                      <div className="field">
                        <label htmlFor={`inv-phone-${p.leaderId}`}>Mobile</label>
                        <input id={`inv-phone-${p.leaderId}`} type="tel" value={inviting.phone} onChange={(e) => setInviting({ ...inviting, phone: e.target.value, text: e.target.value.trim() ? inviting.text : false })} maxLength={30} />
                      </div>
                      <label className="check">
                        <input type="checkbox" checked={inviting.text} disabled={!inviting.phone.trim()} onChange={(e) => setInviting({ ...inviting, text: e.target.checked })} />
                        Text it
                      </label>
                      <p className="small muted">A new invite replaces the old link.</p>
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-primary" disabled={busy === p.leaderId || (!inviting.email && !inviting.text)} onClick={() => void sendInvite(p, { email: inviting.email, text: inviting.text, phone: inviting.phone.trim() !== (p.phone ?? "") ? inviting.phone.trim() : undefined })}>
                          {busy === p.leaderId ? "Sending…" : "Send"}
                        </button>
                        <button type="button" className="btn" onClick={() => setInviting(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card stack" aria-labelledby="people-list">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 id="people-list">People on Barnabas</h2>
          {people && <span className="small muted">{shown.length} signed in</span>}
        </div>
        {people && people.length > 6 && (
          <label className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="sr-only">Find someone</span>
            <input id="people-search" type="search" placeholder="Find someone by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        )}
        {!people && !message && <p className="muted">Loading…</p>}
        <ul className="admin-people">
          {shown.map((p) => {
            const open = editing?.id === p.leaderId;
            return (
              <li key={p.leaderId} className={p.levelChosen ? undefined : "is-unset"}>
                <div className="admin-person">
                  <span className={`admin-avatar admin-avatar-${p.levelChosen ? p.level : "unset"}`} aria-hidden="true">
                    {initials(p.name)}
                  </span>
                  <div className="admin-person-who">
                    <strong>
                      {p.name}
                      {p.me && <span className="muted small"> (you)</span>}
                    </strong>
                    <span className="small muted">
                      {p.email} · {p.lastSignedInAt ? `last signed in ${shortDay(p.lastSignedInAt)}` : "hasn't signed in yet"}
                    </span>
                  </div>
                  <span className={`admin-level admin-level-${p.levelChosen ? p.level : "unset"}`}>{summary(p)}</span>
                  {p.fromServer ? (
                    <span className="small muted admin-server">Admin from the server settings</span>
                  ) : (
                    !open && (
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className={p.levelChosen ? "btn btn-sm" : "btn btn-sm btn-primary"} onClick={() => setEditing({ id: p.leaderId, choice: choiceOf(p) })}>
                          {p.levelChosen ? "Change access" : "Choose a level"}
                        </button>
                        {!p.me && (
                          <button
                            type="button"
                            className="admin-remove"
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
