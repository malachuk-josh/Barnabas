import { addDays } from "../dates";
import type { AttendanceRecord, Person, ServingRecord, Team } from "../chms/types";
import { scoreVolunteers } from "../radar/burnout";
import type { CareBook, CaseStatus } from "../care/types";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, PATHWAY_STEPS } from "../care/types";
import type { EventsBook } from "../events/types";
import type { KidsBook } from "../kids/types";
import { ratioWarning, staffKey } from "../kids/service";
import type { Books } from "../finance/types";

/**
 * Pure report math over each area's records. Everything here returns counts, sums, rates and medians:
 * no names, except the care pipeline by assignee, which only `care.view_all` (pastors) gets.
 */

export const sundaysBack = (lastSunday: string, n: number) => Array.from({ length: n }, (_, i) => addDays(lastSunday, -7 * (n - 1 - i)));

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

/* ---------- Attendance ---------- */

export function attendanceTrend(records: AttendanceRecord[], kids: KidsBook | null, sundays: string[]) {
  return sundays.map((d) => {
    const worship = records.filter((r) => r.kind === "worship" && r.date === d && r.present).length;
    // Groups meet during the week before the Sunday.
    const groups = records.filter((r) => r.kind === "group" && r.present && r.date > addDays(d, -7) && r.date <= d).length;
    const kidsCount = kids ? new Set(kids.checkins.filter((c) => c.date === d).map((c) => c.childId)).size : 0;
    return { date: d, worship, groups, kids: kidsCount };
  });
}

/* ---------- Giving vs budget (aggregates only) ---------- */

export function givingVsBudget(books: Books, asOf: string) {
  const year = Number(asOf.slice(0, 4));
  const months = Array.from({ length: Number(asOf.slice(5, 7)) }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const givingAccounts = new Set(books.chart.funds.map((f) => f.incomeAccountId));
  const budget = books.budgets.find((b) => b.year === year);
  const annual = budget ? budget.lines.filter((l) => givingAccounts.has(l.accountId)).reduce((a, l) => a + l.annual, 0) : 0;
  const gifts = books.gifts.filter((g) => g.date.startsWith(`${year}-`) && g.date <= asOf);
  const lastYear = books.gifts.filter((g) => g.date.startsWith(`${year - 1}-`) && g.date <= `${year - 1}${asOf.slice(4)}`);
  let cumulative = 0;
  const rows = months.map((m, i) => {
    const total = gifts.filter((g) => g.date.startsWith(m)).reduce((a, g) => a + g.amount, 0);
    cumulative += total;
    const daysInMonth = new Date(Date.UTC(year, i + 1, 0)).getUTCDate();
    const share = m === asOf.slice(0, 7) ? Number(asOf.slice(8, 10)) / daysInMonth : 1;
    return { month: m, total, cumulative, budgetCumulative: Math.round((annual / 12) * (i + share)) };
  });
  const ytd = cumulative;
  const pace = rows.length ? rows[rows.length - 1].budgetCumulative : 0;
  const donors = new Set(gifts.filter((g) => !g.anonymous).map((g) => g.personId ?? g.donorName.toLowerCase()));
  const before = new Set(books.gifts.filter((g) => !g.anonymous && g.date < `${year}-01-01`).map((g) => g.personId ?? g.donorName.toLowerCase()));
  return { year, rows, ytd, annual, pace, lastYear: lastYear.reduce((a, g) => a + g.amount, 0), gifts: gifts.length, givers: donors.size, newGivers: [...donors].filter((d) => !before.has(d)).length, hasBudget: annual > 0 };
}

/* ---------- Volunteer health ---------- */

export function volunteerHealth(input: { people: Person[]; teams: Team[]; serving: ServingRecord[]; attendance: AttendanceRecord[]; sundays: string[]; today: string }) {
  const weekly = input.sundays.map((s) => {
    const radar = scoreVolunteers({ people: input.people, teams: input.teams, serving: input.serving.filter((x) => x.date <= s), attendance: input.attendance.filter((x) => x.date <= s), mostRecentSunday: s, today: s });
    const active = new Set(input.serving.filter((x) => x.status === "served" && x.date > addDays(s, -56) && x.date <= s).map((x) => x.personId)).size;
    return { date: s, high: radar.filter((r) => r.band === "high").length, watch: radar.filter((r) => r.band === "watch").length, active };
  });
  const since = input.sundays[0];
  const last = input.sundays[input.sundays.length - 1];
  const teamName = new Map(input.teams.map((t) => [t.id, t.name]));
  const byTeam = new Map<string, { slots: number; people: Set<string>; declined: number }>();
  for (const s of input.serving) {
    if (s.date < since || s.date > last) continue;
    const t = byTeam.get(s.teamId) ?? { slots: 0, people: new Set<string>(), declined: 0 };
    if (s.status === "served") {
      t.slots++;
      t.people.add(s.personId);
    } else if (s.status === "declined") t.declined++;
    byTeam.set(s.teamId, t);
  }
  const teams = [...byTeam]
    .map(([id, t]) => ({ team: teamName.get(id) ?? id, slots: t.slots, volunteers: t.people.size, perVolunteer: t.people.size ? Math.round((t.slots / t.people.size) * 10) / 10 : 0, declined: t.declined }))
    .sort((a, b) => b.perVolunteer - a.perVolunteer);
  return { weekly, teams };
}

/* ---------- Care pipeline ---------- */

export function carePipeline(book: CareBook, months: string[], opts: { byAssignee: boolean; memberName: (id: string) => string }) {
  const open = book.cases.filter((c) => c.status !== "closed");
  const byStatus = (["new", "assigned", "active", "follow_up"] as CaseStatus[]).map((s) => ({ status: CASE_STATUS_LABELS[s], count: open.filter((c) => c.status === s).length }));
  const byType = [...new Set(open.map((c) => c.type))].map((t) => ({ type: CASE_TYPE_LABELS[t], count: open.filter((c) => c.type === t).length })).sort((a, b) => b.count - a.count);
  const firstContactDays = book.cases
    .map((c) => {
      const first = [...c.contacts].sort((a, b) => a.at - b.at)[0];
      return first ? Math.max(0, (first.at - c.openedAt) / 86_400_000) : null;
    })
    .filter((d): d is number => d !== null);
  const monthly = months.map((m) => ({
    month: m,
    opened: book.cases.filter((c) => new Date(c.openedAt).toISOString().startsWith(m)).length,
    closed: book.cases.filter((c) => c.closedAt && new Date(c.closedAt).toISOString().startsWith(m)).length,
  }));
  const noContactYet = open.filter((c) => !c.contacts.length).length;
  const assignees = opts.byAssignee
    ? [...new Set(open.map((c) => c.assigneeId ?? ""))].map((id) => ({ name: id ? opts.memberName(id) : "Unassigned", count: open.filter((c) => (c.assigneeId ?? "") === id).length })).sort((a, b) => b.count - a.count)
    : undefined;
  return { open: open.length, closed: book.cases.length - open.length, byStatus, byType, medianDaysToFirstContact: median(firstContactDays), noContactYet, monthly, assignees };
}

/* ---------- Guest follow-up ---------- */

const NEXT_STEPS = PATHWAY_STEPS.filter((s) => s !== "first_visit");

export function guestConversion(book: CareBook, months: string[]) {
  const guests = book.guests;
  const within48 = guests.filter((g) => g.contactedAt && g.contactedAt - g.createdAt <= 48 * 3600_000).length;
  const contacted = guests.filter((g) => g.contactedAt).length;
  const returned = guests.filter((g) => g.visits.length >= 2).length;
  const nextStep = guests.filter((g) => {
    const p = book.pathways.find((x) => x.guestId === g.id || (g.personId && x.personId === g.personId));
    return p && NEXT_STEPS.some((s) => p.steps[s]);
  }).length;
  const monthly = months.map((m) => ({ month: m, guests: guests.filter((g) => (g.visits[0] ?? new Date(g.createdAt).toISOString()).startsWith(m)).length }));
  return { total: guests.length, contacted, within48, returned, nextStep, monthly, rates: { contacted48: pct(within48, guests.length), returned: pct(returned, guests.length), nextStep: pct(nextStep, guests.length) } };
}

/* ---------- Events ---------- */

export function eventRates(book: EventsBook, asOf: string) {
  return book.events
    .map((e) => {
      const regs = book.registrations.filter((r) => r.eventId === e.id && r.status === "registered");
      const registered = regs.reduce((n, r) => n + r.partySize, 0);
      const checkedIn = regs.filter((r) => r.checkedInAt).reduce((n, r) => n + r.partySize, 0);
      const waitlisted = book.registrations.filter((r) => r.eventId === e.id && r.status === "waitlisted").reduce((n, r) => n + r.partySize, 0);
      return { title: e.title, date: e.date, past: e.date < asOf, registered, capacity: e.capacity ?? null, fill: e.capacity ? pct(registered, e.capacity) : null, checkedIn, checkInRate: e.date <= asOf ? pct(checkedIn, registered) : null, waitlisted };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Kids ---------- */

export function kidsReport(book: KidsBook, sundays: string[]) {
  const weekly = sundays.map((d) => {
    const day = book.checkins.filter((c) => c.date === d);
    let warnings = 0;
    for (const room of book.rooms) {
      for (const g of room.gatherings) {
        const n = day.filter((c) => c.roomId === room.id && c.gathering === g).length;
        if (n && ratioWarning(n, book.staffing[staffKey(d, g, room.id)] ?? 0, room.ratio, room.capacity)) warnings++;
      }
    }
    return { date: d, checkins: day.length, children: new Set(day.map((c) => c.childId)).size, warnings };
  });
  const byRoom = book.rooms.map((r) => ({ room: r.name, checkins: book.checkins.filter((c) => c.roomId === r.id && sundays.includes(c.date)).length }));
  return { weekly, byRoom, families: book.households.length };
}
