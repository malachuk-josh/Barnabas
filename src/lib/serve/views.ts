import type { Leader } from "../auth/session";
import type { Person, ServingRecord } from "../chms/types";
import { addDays, today } from "../dates";
import { gathering, gatheringsOn, type GatheringKey } from "../ops/gatherings";
import { canEditTeam, selfVolunteer, serveActor, type ServeActor } from "./service";
import { loadServe } from "./store";
import type { Assignment, ServeBook } from "./types";

export async function serveFor(leader: Leader) {
  const [actor, book] = await Promise.all([serveActor(leader), loadServe(leader.churchId)]);
  return { actor, book };
}

export type SlotView = {
  assignmentId?: string;
  volunteerId?: string;
  name?: string;
  status?: Assignment["status"];
  mine: boolean;
  reminded?: boolean;
  pendingSwap?: { id: string; toName: string; toMe: boolean; fromMe: boolean };
};

export type PositionView = { id: string; name: string; needed: number; slots: SlotView[]; open: number };
export type TeamRoster = { teamId: string; teamName: string; lead?: string; canEdit: boolean; positions: PositionView[]; open: number; filled: number };
export type GatheringRoster = { key: GatheringKey; label: string; time: string; teams: TeamRoster[] };

/** The roster for one date: each gathering, each team that serves at it, each position's slots (filled and open). */
export function rosterFor(book: ServeBook, actor: ServeActor, date: string): GatheringRoster[] {
  const me = selfVolunteer(book, actor.leader);
  const name = (id: string) => book.volunteers.find((v) => v.id === id)?.name ?? "A former volunteer";
  return gatheringsOn(date)
    .filter((g) => book.teams.some((t) => t.gatherings.includes(g.key)))
    .map((g) => ({
      key: g.key,
      label: g.label,
      time: g.time,
      teams: book.teams
        .filter((t) => t.gatherings.includes(g.key))
        .map((t) => {
          const positions = t.positions.map((p) => {
            const here = book.assignments.filter((a) => a.date === date && a.gathering === g.key && a.teamId === t.id && a.positionId === p.id);
            const live = here.filter((a) => a.status !== "declined");
            const slots: SlotView[] = here.map((a) => {
              const swap = book.swaps.find((s) => s.assignmentId === a.id && s.status === "pending");
              return {
                assignmentId: a.id,
                volunteerId: a.volunteerId,
                name: name(a.volunteerId),
                status: a.status,
                mine: a.volunteerId === me?.id,
                reminded: Boolean(a.remindedAt),
                pendingSwap: swap ? { id: swap.id, toName: name(swap.toVolunteerId), toMe: swap.toVolunteerId === me?.id, fromMe: swap.fromVolunteerId === me?.id } : undefined,
              };
            });
            const open = Math.max(0, p.needed - live.length);
            for (let i = 0; i < open; i++) slots.push({ mine: false });
            return { id: p.id, name: p.name, needed: p.needed, slots, open };
          });
          const open = positions.reduce((n, p) => n + p.open, 0);
          const filled = positions.reduce((n, p) => n + p.slots.filter((s) => s.assignmentId && s.status !== "declined").length, 0);
          return { teamId: t.id, teamName: t.name, lead: t.lead, canEdit: canEditTeam(actor, t), positions, open, filled };
        }),
    }));
}

/** Upcoming dates with gatherings (Sundays and Wednesdays) for the date picker. */
export function upcomingDates(from = today(), count = 8) {
  const out: string[] = [];
  for (let d = from; out.length < count; d = addDays(d, 1)) if (gatheringsOn(d).length) out.push(d);
  return out;
}

/** This leader's own upcoming slots and swap requests waiting on them. */
export function myServing(book: ServeBook, actor: ServeActor, from = today()) {
  const me = selfVolunteer(book, actor.leader);
  if (!me) return { volunteer: null, upcoming: [], swapsForMe: [], swapsFromMe: [] };
  const teamName = (id: string) => book.teams.find((t) => t.id === id)?.name ?? id;
  const posName = (a: Assignment) => book.teams.find((t) => t.id === a.teamId)?.positions.find((p) => p.id === a.positionId)?.name ?? a.positionId;
  const nameOf = (id: string) => book.volunteers.find((v) => v.id === id)?.name ?? "A former volunteer";
  const upcoming = book.assignments
    .filter((a) => a.volunteerId === me.id && a.date >= from && a.status !== "declined")
    .sort((a, b) => (a.date + a.gathering).localeCompare(b.date + b.gathering))
    .map((a) => ({ ...a, teamName: teamName(a.teamId), positionName: posName(a), label: gathering(a.gathering)?.label ?? a.gathering }));
  const swapRow = (s: ServeBook["swaps"][number]) => {
    const a = book.assignments.find((x) => x.id === s.assignmentId);
    return { ...s, fromName: nameOf(s.fromVolunteerId), toName: nameOf(s.toVolunteerId), date: a?.date, label: a ? gathering(a.gathering)?.label : undefined, teamName: a ? teamName(a.teamId) : undefined, positionName: a ? posName(a) : undefined };
  };
  return {
    volunteer: me,
    upcoming,
    swapsForMe: book.swaps.filter((s) => s.status === "pending" && s.toVolunteerId === me.id).map(swapRow),
    swapsFromMe: book.swaps.filter((s) => s.status === "pending" && s.fromVolunteerId === me.id).map(swapRow),
  };
}

/** Every pending swap a scheduler or lead can answer. */
export function pendingSwaps(book: ServeBook, actor: ServeActor) {
  const nameOf = (id: string) => book.volunteers.find((v) => v.id === id)?.name ?? "A former volunteer";
  return book.swaps
    .filter((s) => s.status === "pending")
    .map((s) => {
      const a = book.assignments.find((x) => x.id === s.assignmentId);
      const t = a ? book.teams.find((x) => x.id === a.teamId) : undefined;
      return { ...s, fromName: nameOf(s.fromVolunteerId), toName: nameOf(s.toVolunteerId), date: a?.date, label: a ? gathering(a.gathering)?.label : undefined, teamName: t?.name, canAnswer: Boolean(t && canEditTeam(actor, t)) };
    })
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/**
 * Roster data for the burnout radar: past assignments as serving records (declined ones as declines),
 * the teams that have any roster data in the window, and people for volunteers not in the directory.
 */
export function rosterServing(book: ServeBook, sinceISO: string, throughISO: string) {
  const records: ServingRecord[] = [];
  const teamsWithData = new Set<string>();
  const people: Person[] = [];
  for (const a of book.assignments) {
    if (a.date < sinceISO || a.date > throughISO) continue;
    const v = book.volunteers.find((x) => x.id === a.volunteerId);
    if (!v) continue;
    teamsWithData.add(a.teamId);
    records.push({ personId: v.personId ?? `vol:${v.id}`, teamId: a.teamId, date: a.date, status: a.status === "declined" ? "declined" : "served" });
  }
  for (const v of book.volunteers) {
    if (v.personId) continue;
    people.push({ id: `vol:${v.id}`, name: v.name, firstName: v.name.split(/\s+/)[0], language: "en", leadership: v.leadership });
  }
  return { records, teamsWithData, people, teams: book.teams.map((t) => ({ id: t.id, name: t.name, lead: t.lead })) };
}
