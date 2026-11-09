import { churchData } from "../chms";
import type { Leader } from "../auth/session";
import { addDays, lastSunday, today as todayIso } from "../dates";
import { careFollowUps, careFor } from "../care/views";
import { scoreVolunteers, type RadarEntry } from "../radar/burnout";

export type FollowUp = { id: string; personId: string; name: string; reason: string; due?: string; overdue?: boolean; href?: string; source: "care" | "guest" | "attendance" };

export type Briefing = {
  date: string;
  radar: RadarEntry[];
  followUps: FollowUp[];
  upcoming: { date: string; title: string; time: string; location: string }[];
};

export async function radarNow(date = todayIso()) {
  const data = churchData();
  const sunday = lastSunday(date);
  const since = addDays(sunday, -7 * 11);
  const [people, teams, serving, attendance] = await Promise.all([
    data.listPeople(),
    data.teams(),
    data.serving(since),
    data.attendance(since),
  ]);
  return { radar: scoreVolunteers({ people, teams, serving, attendance, mostRecentSunday: sunday, today: date }), people, serving, attendance, sunday };
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
  const [{ radar }, follow, events] = await Promise.all([
    radarNow(date),
    followUps(leader, date),
    data.events(date, addDays(date, 45)),
  ]);
  return {
    date,
    radar: radar.filter((r) => r.band !== "ok"),
    followUps: follow,
    // Special events only; the weekly services and groups are on the calendar.
    upcoming: events.filter((e) => !e.recurring).map(({ date, title, time, location }) => ({ date, title, time, location })),
  };
}
