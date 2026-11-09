"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { GATHERINGS } from "@/lib/ops/gatherings";
import type { Blackout } from "@/lib/serve/types";
import { localToday, shortDate, Status, useOps } from "./client";

/* ---------- Swaps ---------- */

export function MySwaps({ forMe, fromMe }: { forMe: { id: string; fromName: string; date?: string; label?: string; teamName?: string; positionName?: string }[]; fromMe: { id: string; toName: string; date?: string; label?: string; teamName?: string }[] }) {
  const ops = useOps("serve");
  return (
    <section className="fin-card">
      <h2>Swap requests</h2>
      <Status error={ops.error} notice={ops.notice} />
      {forMe.length === 0 && fromMe.length === 0 && <p className="muted small">No one is waiting on you, and you haven&apos;t asked anyone to cover.</p>}
      {forMe.length > 0 && (
        <ul className="care-tasks">
          {forMe.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{s.fromName} asked you to cover</strong>
                <span className="small muted">
                  {s.positionName} · {s.teamName} · {s.date ? shortDate(s.date) : ""} {s.label}
                </span>
              </span>
              <span className="row">
                <button className="btn btn-primary" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "swap-answer", id: s.id, accept: true }, () => "Thank you! You're on the roster.")}>
                  I&apos;ll cover
                </button>
                <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "swap-answer", id: s.id, accept: false })}>
                  I can&apos;t
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {fromMe.length > 0 && (
        <ul className="care-tasks">
          {fromMe.map((s) => (
            <li key={s.id}>
              <span>
                <strong>Waiting on {s.toName}</strong>
                <span className="small muted">
                  {s.teamName} · {s.date ? shortDate(s.date) : ""} {s.label}
                </span>
              </span>
              <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "swap-cancel", id: s.id })}>
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Away dates ---------- */

export function AwayDates({ volunteerId, blackouts, cap, name }: { volunteerId: string | null; blackouts: Blackout[]; cap?: number; name?: string }) {
  const ops = useOps("serve");
  const [from, setFrom] = useState(localToday());
  const [to, setTo] = useState(localToday());
  const [note, setNote] = useState("");
  return (
    <section className="fin-card">
      <h2>{name ? `${name}'s away dates` : "Away dates"}</h2>
      <p className="small muted">
        No one can schedule {name ? "them" : "you"} on these dates, and swaps skip {name ? "them" : "you"}.
        {cap ? ` ${name ? "They serve" : "You serve"} at most ${cap} Sundays a month.` : ""}
      </p>
      <Status error={ops.error} notice={ops.notice} />
      {blackouts.length ? (
        <ul className="care-days">
          {blackouts.map((b) => (
            <li key={b.id}>
              <span>
                {shortDate(b.from)}
                {b.to !== b.from ? ` to ${shortDate(b.to)}` : ""}
                {b.note ? ` · ${b.note}` : ""}
              </span>
              {volunteerId && (
                <button className="linklike" type="button" onClick={() => void ops.act({ action: "blackout-remove", volunteerId, id: b.id })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">No away dates.</p>
      )}
      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ops.act<{ clashes: number }>({ action: "blackout", blackout: { volunteerId: volunteerId ?? undefined, from, to, note: note || undefined } }, (o) => {
            setNote("");
            return o.clashes ? `Saved. ${name ?? "You"} ${name ? "is" : "are"} already scheduled ${o.clashes} time${o.clashes === 1 ? "" : "s"} in those dates: ask a teammate to cover from the roster.` : "Saved.";
          });
        }}
      >
        <div className="form-row">
          <div className="field">
            <label htmlFor={`away-from-${volunteerId ?? "me"}`}>From</label>
            <input id={`away-from-${volunteerId ?? "me"}`} type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`away-to-${volunteerId ?? "me"}`}>To</label>
            <input id={`away-to-${volunteerId ?? "me"}`} type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`away-note-${volunteerId ?? "me"}`}>Note (optional)</label>
          <input id={`away-note-${volunteerId ?? "me"}`} type="text" maxLength={80} placeholder="Away, traveling…" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={ops.busy}>
          Add away dates
        </button>
      </form>
    </section>
  );
}

/* ---------- Teams ---------- */

type TeamRow = { id: string; name: string; lead?: string; gatherings: string[]; positions: { id: string; name: string; needed: number }[]; canEdit: boolean; volunteers: { id: string; name: string; maxPerMonth?: number; leadership?: boolean; blackouts: Blackout[]; upcoming: number }[] };

export function TeamsView({ teams, scheduler, directory }: { teams: TeamRow[]; scheduler: boolean; directory: { id: string; name: string }[] }) {
  const ops = useOps("serve");
  return (
    <div className="fin-stack">
      <Status error={ops.error} notice={ops.notice} />
      {teams.length === 0 && (
        <EmptyState title="No teams yet">{scheduler ? "Add your first team below: give it a name and the gatherings it serves." : "A scheduler can add teams."}</EmptyState>
      )}
      <div className="fin-grid-2">
        {teams.map((t) => (
          <TeamPanel key={t.id} team={t} directory={directory} />
        ))}
      </div>
      {scheduler && <NewTeam />}
    </div>
  );
}

function TeamPanel({ team, directory }: { team: TeamRow; directory: { id: string; name: string }[] }) {
  const ops = useOps("serve");
  const [editing, setEditing] = useState(false);
  const [positions, setPositions] = useState(team.positions);
  const [adding, setAdding] = useState({ name: "", personId: "", email: "", phone: "", cap: "" });
  const [away, setAway] = useState<string | null>(null);
  return (
    <section className="fin-card ops-team">
      <div className="fin-card-head">
        <h2>{team.name}</h2>
        {team.canEdit && (
          <button className="btn" type="button" onClick={() => setEditing((e) => !e)}>
            {editing ? "Done" : "Edit positions"}
          </button>
        )}
      </div>
      <span className="small muted">
        {team.lead ? `Lead: ${team.lead} · ` : ""}
        {team.gatherings.map((g) => GATHERINGS.find((x) => x.key === g)?.label).join(", ")}
      </span>
      <Status error={ops.error} notice={ops.notice} />
      {editing ? (
        <form
          className="fin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void ops.act({ action: "positions", team: { teamId: team.id, positions } }, () => {
              setEditing(false);
              return "Positions saved.";
            });
          }}
        >
          {positions.map((p, i) => (
            <div key={i} className="ops-pos-edit">
              <label className="sr-only" htmlFor={`pn-${team.id}-${i}`}>
                Position
              </label>
              <input id={`pn-${team.id}-${i}`} type="text" required maxLength={40} value={p.name} onChange={(e) => setPositions(positions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <label className="sr-only" htmlFor={`pq-${team.id}-${i}`}>
                How many
              </label>
              <input id={`pq-${team.id}-${i}`} type="number" min={1} max={12} value={p.needed} onChange={(e) => setPositions(positions.map((x, j) => (j === i ? { ...x, needed: Number(e.target.value) || 1 } : x)))} />
              <button className="fin-x" type="button" aria-label={`Remove ${p.name}`} onClick={() => setPositions(positions.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <div className="row">
            <button className="btn" type="button" onClick={() => setPositions([...positions, { id: "", name: "", needed: 1 }])}>
              Add a position
            </button>
            <button className="btn btn-primary" type="submit" disabled={ops.busy || !positions.length}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <p className="small">{team.positions.map((p) => `${p.name}${p.needed > 1 ? ` ×${p.needed}` : ""}`).join(" · ")}</p>
      )}
      <h3>Co-laborers</h3>
      {team.volunteers.length ? (
        <ul className="care-tasks">
          {team.volunteers.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{v.name}</strong>
                <span className="small muted">
                  {v.upcoming} upcoming
                  {v.maxPerMonth ? ` · at most ${v.maxPerMonth} a month` : ""}
                  {v.blackouts.length ? ` · ${v.blackouts.length} away date${v.blackouts.length === 1 ? "" : "s"}` : ""}
                </span>
              </span>
              {team.canEdit && (
                <button className="btn" type="button" onClick={() => setAway(away === v.id ? null : v.id)}>
                  {away === v.id ? "Close" : "Away dates"}
                </button>
              )}
              {away === v.id && (
                <div style={{ flexBasis: "100%" }}>
                  <AwayDates volunteerId={v.id} blackouts={v.blackouts} cap={v.maxPerMonth} name={v.name.split(" ")[0]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title={`No one on ${team.name} yet`}>
          {team.canEdit ? "Add your first co-laborer below. Anyone can also join by signing up for an open slot." : "Sign up for an open slot on the Rosters page to join."}
        </EmptyState>
      )}
      {team.canEdit && (
        <details className="fin-details">
          <summary>Add a co-laborer</summary>
          <form
            className="fin-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ops.act(
                { action: "volunteer", volunteer: { name: adding.name, personId: adding.personId || undefined, teamIds: [team.id], email: adding.email || undefined, phone: adding.phone || undefined, maxPerMonth: adding.cap ? Number(adding.cap) : undefined } },
                () => {
                  setAdding({ name: "", personId: "", email: "", phone: "", cap: "" });
                  return "Added.";
                },
              );
            }}
          >
            {directory.length > 0 && (
              <div className="field">
                <label htmlFor={`vd-${team.id}`}>From the directory</label>
                <select id={`vd-${team.id}`} value={adding.personId} onChange={(e) => setAdding({ ...adding, personId: e.target.value, name: directory.find((d) => d.id === e.target.value)?.name ?? adding.name })}>
                  <option value="">Someone new</option>
                  {directory.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor={`vn-${team.id}`}>Name</label>
              <input id={`vn-${team.id}`} type="text" required maxLength={100} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor={`ve-${team.id}`}>Email</label>
                <input id={`ve-${team.id}`} type="email" maxLength={200} value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`vp-${team.id}`}>Phone</label>
                <input id={`vp-${team.id}`} type="tel" maxLength={40} value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`vc-${team.id}`}>Most Sundays a month (optional)</label>
              <input id={`vc-${team.id}`} type="number" min={1} max={10} value={adding.cap} onChange={(e) => setAdding({ ...adding, cap: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={ops.busy}>
              Add to {team.name}
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

function NewTeam() {
  const ops = useOps("serve");
  const [name, setName] = useState("");
  const [gatherings, setGatherings] = useState<string[]>(["sun-0830", "sun-1045"]);
  return (
    <form
      className="fin-card fin-form"
      onSubmit={(e) => {
        e.preventDefault();
        void ops.act({ action: "team", team: { name, gatherings } }, () => {
          setName("");
          return "Team added. Set its positions next.";
        });
      }}
    >
      <h2>Add a team</h2>
      <Status error={ops.error} notice={ops.notice} />
      <div className="field">
        <label htmlFor="nt-name">Team name</label>
        <input id="nt-name" type="text" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset className="care-interests">
        <legend>Serves at</legend>
        {GATHERINGS.map((g) => (
          <label key={g.key} className="check">
            <input type="checkbox" checked={gatherings.includes(g.key)} onChange={(e) => setGatherings(e.target.checked ? [...gatherings, g.key] : gatherings.filter((x) => x !== g.key))} />
            {g.label}
          </label>
        ))}
      </fieldset>
      <button className="btn btn-primary" type="submit" disabled={ops.busy || !gatherings.length}>
        Add team
      </button>
    </form>
  );
}
