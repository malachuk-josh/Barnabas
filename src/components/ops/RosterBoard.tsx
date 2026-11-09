"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { GatheringRoster, SlotView, TeamRoster } from "@/lib/serve/views";
import { Status, useOps } from "./client";

export type BoardTeam = TeamRoster & { available: { id: string; name: string; recent: number }[]; unavailable: { id: string; name: string; reason: string }[] };
export type BoardGathering = Omit<GatheringRoster, "teams"> & { teams: BoardTeam[] };

/** The roster for one date: a section per gathering, a card per team, a row per slot with what this leader can do. */
export function RosterBoard({ date, gatherings, myVolunteerId, scheduler }: { date: string; gatherings: BoardGathering[]; myVolunteerId: string | null; scheduler: boolean }) {
  const ops = useOps("serve");
  const anyEdit = gatherings.some((g) => g.teams.some((t) => t.canEdit));
  return (
    <div className="fin-stack">
      <Status error={ops.error} notice={ops.notice} />
      {anyEdit && (
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={ops.busy}
            onClick={() => void ops.act<{ recipients: number }>({ action: "remind", date }, (o) => (o.recipients ? `Drafted reminders for ${o.recipients} volunteer${o.recipients === 1 ? "" : "s"}. They're in Drafts for review; nothing was sent.` : "No one is scheduled yet, so there's nothing to remind."))}
          >
            Draft reminders for {scheduler ? "everyone" : "your team"}
          </button>
          <span className="small muted">Drafts go to your review queue. Text and email delivery comes later.</span>
        </div>
      )}
      {gatherings.length === 0 && <EmptyState title="No teams serve on this day">Pick another date above.</EmptyState>}
      {gatherings.map((g) => (
        <section key={g.key} className="ops-gathering" aria-labelledby={`g-${g.key}`}>
          <h2 id={`g-${g.key}`}>
            {g.label}
          </h2>
          <div className="ops-teams">
            {g.teams.map((t) => (
              <TeamCard key={t.teamId} date={date} gathering={g.key} team={t} myVolunteerId={myVolunteerId} ops={ops} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type Ops = ReturnType<typeof useOps>;

function TeamCard({ date, gathering, team, myVolunteerId, ops }: { date: string; gathering: string; team: BoardTeam; myVolunteerId: string | null; ops: Ops }) {
  const empty = team.filled === 0;
  return (
    <article className="fin-card ops-team">
      <div className="fin-card-head">
        <h3>{team.teamName}</h3>
        <span className={`pill ${team.open ? "pill-watch" : "pill-ok"}`}>{team.open ? `${team.open} open` : "Full"}</span>
      </div>
      {team.lead && <span className="small muted">Lead: {team.lead}</span>}
      {empty && <p className="small muted">No one is scheduled yet. {team.canEdit ? "Assign teammates below, or fill the open slots from who's available." : "Sign up below if you can serve."}</p>}
      <ul className="ops-positions">
        {team.positions.map((p) => (
          <li key={p.id}>
            <span className="ops-pos-name">{p.name}</span>
            <ul className="ops-slots">
              {p.slots.map((s, i) => (
                <Slot key={s.assignmentId ?? `open-${i}`} slot={s} date={date} gathering={gathering} team={team} positionId={p.id} myVolunteerId={myVolunteerId} ops={ops} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {team.canEdit && team.open > 0 && (
        <button
          className="btn"
          type="button"
          disabled={ops.busy || team.available.length === 0}
          onClick={() => void ops.act<{ added: number }>({ action: "autofill", date, gathering, teamId: team.teamId }, (o) => (o.added ? `Filled ${o.added} slot${o.added === 1 ? "" : "s"} on ${team.teamName}, respecting away dates and monthly limits.` : `No one on ${team.teamName} is free for this one.`))}
        >
          {team.available.length ? "Fill open slots from who's free" : "No teammates free to fill"}
        </button>
      )}
    </article>
  );
}

function Slot({ slot, date, gathering, team, positionId, myVolunteerId, ops }: { slot: SlotView; date: string; gathering: string; team: BoardTeam; positionId: string; myVolunteerId: string | null; ops: Ops }) {
  const [mode, setMode] = useState<null | "assign" | "swap">(null);
  const [pick, setPick] = useState("");
  if (!slot.assignmentId) {
    return (
      <li className="ops-slot open">
        <span className="ops-slot-name">Open</span>
        <span className="ops-slot-actions">
          <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "signup", slot: { date, gathering, teamId: team.teamId, positionId } }, () => "You're signed up. Thank you!")}>
            Sign up
          </button>
          {team.canEdit &&
            (mode === "assign" ? (
              <span className="row">
                <label className="sr-only" htmlFor={`as-${team.teamId}-${positionId}`}>
                  Who
                </label>
                <select id={`as-${team.teamId}-${positionId}`} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Pick a teammate…</option>
                  {team.available.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.recent} in 8 weeks)
                    </option>
                  ))}
                  {team.unavailable.map((v) => (
                    <option key={v.id} value={v.id} disabled>
                      {v.name}: {v.reason}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" type="button" disabled={!pick || ops.busy} onClick={() => void ops.act({ action: "assign", slot: { date, gathering, teamId: team.teamId, positionId, volunteerId: pick } }, () => { setMode(null); return "Scheduled. Nothing is sent until you draft and approve a reminder."; })}>
                  Assign
                </button>
              </span>
            ) : (
              <button className="btn" type="button" onClick={() => setMode("assign")} disabled={!team.available.length && !team.unavailable.length}>
                Assign
              </button>
            ))}
        </span>
      </li>
    );
  }
  const mine = slot.volunteerId === myVolunteerId;
  const swap = slot.pendingSwap;
  return (
    <li className={`ops-slot${slot.status === "declined" ? " declined" : ""}${mine ? " mine" : ""}`}>
      <span className="ops-slot-name">
        {slot.name}
        {mine && <span className="badge badge-barnabas">You</span>}
        {slot.status === "declined" && <span className="badge">Can&apos;t make it</span>}
        {slot.reminded && <span className="badge">Reminder drafted</span>}
      </span>
      {swap && <span className="small muted">Asked {swap.toName} to cover</span>}
      <span className="ops-slot-actions">
        {swap && (swap.toMe || team.canEdit) && (
          <>
            <button className="btn btn-primary" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "swap-answer", id: swap.id, accept: true }, () => "Swap accepted: the roster is updated.")}>
              {swap.toMe ? "I'll cover" : `Accept for ${swap.toName.split(" ")[0]}`}
            </button>
            <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "swap-answer", id: swap.id, accept: false })}>
              Decline
            </button>
          </>
        )}
        {swap && swap.fromMe && (
          <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "swap-cancel", id: swap.id })}>
            Cancel request
          </button>
        )}
        {!swap && (mine || team.canEdit) && slot.status !== "declined" &&
          (mode === "swap" ? (
            <span className="row">
              <label className="sr-only" htmlFor={`sw-${slot.assignmentId}`}>
                Teammate
              </label>
              <select id={`sw-${slot.assignmentId}`} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Ask a teammate…</option>
                {team.available.filter((v) => v.id !== slot.volunteerId).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" type="button" disabled={!pick || ops.busy} onClick={() => void ops.act({ action: "swap", swap: { assignmentId: slot.assignmentId, toVolunteerId: pick } }, () => { setMode(null); return "Asked. When they accept, the roster updates."; })}>
                Ask
              </button>
            </span>
          ) : (
            <button className="btn" type="button" onClick={() => setMode("swap")} disabled={!team.available.some((v) => v.id !== slot.volunteerId)} title={team.available.some((v) => v.id !== slot.volunteerId) ? undefined : "No teammate is free for this one"}>
              Ask someone to cover
            </button>
          ))}
        {mine && slot.status !== "declined" && !swap && (
          <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "status", id: slot.assignmentId, status: "declined" }, () => "Got it. Your slot is open again, and your team lead can see it.")}>
            Can&apos;t make it
          </button>
        )}
        {team.canEdit && (
          <button className="btn btn-danger" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "unassign", id: slot.assignmentId })}>
            Remove
          </button>
        )}
      </span>
    </li>
  );
}
