import { churchData } from "../chms";
import type { Leader } from "../auth/session";
import { addDays, lastSunday, today as todayIso } from "../dates";
import { careFollowUps, careFor } from "../care/views";
import { scoreVolunteers, type RadarEntry } from "../radar/burnout";
import { config } from "../config";
import { loadServe } from "../serve/store";
import { rosterServing } from "../serve/views";

export type FollowUp = { id: string; personId: string; name: string; reason: string; due?: string; overdue?: boolean; href?: string; source: "care" | "guest" | "attendance" };

export type Briefing = {
  date: string;
  radar: RadarEntry[];
  followUps: FollowUp[];
  upcoming: { date: string; title: string; time: string; location: string }[];
};

/**
 * The radar's inputs. Teams with rosters in Barnabas (Serve) use them; any team without roster data in
 * the window falls back to the church database's serving history.
 */
export async function radarNow(date = todayIso(), churchId = config.churchId) {
  const data = churchData();
  const sunday = lastSunday(date);
  const since = addDays(sunday, -7 * 11);
  const [people, teams, chmsServing, attendance, serveBook] = await Promise.all([
    data.listPeople(),
    data.teams(),
    data.serving(since),
    data.attendance(since),
    loadServe(churchId).catch((err) => {
      console.warn("[barnabas] roster data unavailable for the radar", err);
      return null;
    }),
  ]);
  let serving = chmsServing;
  let allPeople = people;
  let allTeams = teams;
  if (serveBook) {
    const roster = rosterServing(serveBook, since, date);
    serving = [...chmsServing.filter((s) => !roster.teamsWithData.has(s.teamId)), ...roster.records];
    allPeople = [...people, ...roster.people.filter((p) => !people.some((x) => x.id === p.id))];
    allTeams = [...teams, ...roster.teams.filter((t) => !teams.some((x) => x.id === t.id))];
  }
  return { radar: scoreVolunteers({ people: allPeople, teams: allTeams, serving, attendance, mostRecentSunday: sunday, today: date }), people: allPeople, serving, attendance, sunday };
}

export async function followUps(leader: Leader, date = todayIso()): Promise<FollowUp[]> {
  const { people, attendance, serving, sunday } = await radarNow(date);
  const out: FollowUp[] = [];
  // Next steps on the leader's own care cases (older log_care_event records are folded in first) and their guest follow-ups.
  const { actor, book } = await careFor(leader);
  out.push(...careFollowUps(book, actor, date));
  // People who have dropped out of worship and aren't serving: a gentle check-in.
  const recent = addDays(sunday, -21);
  for (const p of people) {
    const worship = attendance.filter((a) => a.personId === p.id && a.kind === "worship" && a.date >= recent);
    const servingRecently = serving.some((s) => s.personId === p.id && s.date >= recent && s.status === "served");
    if (worship.length >= 3 && worship.every((a) => !a.present) && !servingRecently) {
      if (!out.some((f) => f.personId === p.id)) {
        out.push({ id: `att_${p.id}`, personId: p.id, name: p.name, reason: `Hasn't been at worship the last ${worship.length} Sundays; check in.`, source: "attendance" });
      }
    }
  }
  return out.sort((a, b) => (a.due ?? "9999") < (b.due ?? "9999") ? -1 : 1);
}

export async function briefing(leader: Leader, date = todayIso()): Promise<Briefing> {
  const data = churchData();
  const [{ radar, people }, follow, events] = await Promise.all([
    radarNow(date),
    followUps(leader, date),
    data.events(date, addDays(date, 45)),
  ]);
  // Belt and braces: the demo directory has only the real leaders, and the home card never shows anyone else there.
  const realLeaders = new Set(people.filter((p) => p.leadership).map((p) => p.id));
  return {
    date,
    radar: radar.filter((r) => r.band !== "ok" && (data.source !== "demo" || realLeaders.has(r.personId))),
    followUps: follow,
    // Special events only; the weekly services and groups are on the calendar.
    upcoming: events.filter((e) => !e.recurring).map(({ date, title, time, location }) => ({ date, title, time, location })),
  };
}
