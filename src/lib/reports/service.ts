import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { churchData, churchSource } from "../chms";
import { addDays, friendlyDate, lastSunday, today } from "../dates";
import { careFor } from "../care/views";
import { loadEvents } from "../events/store";
import { lastMonths, monthLabel } from "../finance/giving";
import { wholeDollars } from "../finance/money";
import { loadBooks } from "../finance/store";
import { loadKids } from "../kids/store";
import { loadServe } from "../serve/store";
import { rosterServing } from "../serve/views";
import { accessFor } from "../team";
import { attendanceTrend, carePipeline, eventRates, givingVsBudget, guestConversion, kidsReport, pct, sundaysBack, volunteerHealth } from "./aggregates";
import type { Section, SectionId } from "./types";

/**
 * The Reports area. Each section is built only from what the leader's role may see: giving needs
 * finance.view (giver counts need giving.donors), care and guests need a care role (pastors, deacons,
 * staff) and stay aggregate unless care.view_all, kids needs kids.checkin. Everyone sees attendance,
 * volunteer health and events, which are counts.
 */

const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const n = (x: number) => x.toLocaleString("en-US");
const pctText = (x: number | null) => (x === null ? "–" : `${Math.round(x)}%`);

function locked(id: SectionId, title: string, why: string): Section {
  return { id, title, allowed: false, locked: why, summary: why, stats: [], table: { header: [], rows: [] }, source: "" };
}

export type ReportOptions = { asOf?: string; weeks?: number; months?: number };

export async function sectionFor(id: SectionId, leader: Leader, access: Access, opts: ReportOptions = {}): Promise<Section> {
  const asOf = opts.asOf ?? today();
  const sunday = lastSunday(asOf);
  const sundays = sundaysBack(sunday, opts.weeks ?? 12);
  const months = lastMonths(asOf, opts.months ?? 6);
  const careRole = can(access, "care.view_all") || can(access, "care.assign");

  switch (id) {
    case "attendance": {
      const [records, kids, source] = await Promise.all([churchData().attendance(sundays[0]), loadKids(leader.churchId).catch(() => null), churchSource()]);
      const real = source === "demo" ? [] : records;
      const rows = attendanceTrend(real, can(access, "kids.checkin") ? kids : null, sundays);
      const any = rows.some((r) => r.worship || r.groups || r.kids);
      const latest = rows[rows.length - 1];
      const prev4 = rows.slice(-5, -1).filter((r) => r.worship);
      const avg = prev4.length ? Math.round(prev4.reduce((a, r) => a + r.worship, 0) / prev4.length) : 0;
      return {
        id, title: "Attendance", allowed: true,
        empty: any ? undefined : { title: "No attendance recorded yet", text: source === "demo" ? "Record attendance in People (or move it in from ChurchTrac), and kids check-ins on Sundays count here too." : "No attendance is recorded for these Sundays yet. Take attendance in People, and kids check-ins count here as soon as the station is used.", actions: [{ label: "Take attendance", href: "/people/attendance" }, { label: "Move your church to Barnabas", href: "/people/import" }] },
        summary: any ? `Worship attendance was ${n(latest.worship)} on ${shortDay(latest.date)}${avg ? `, against an average of ${n(avg)} over the four Sundays before` : ""}. ${n(latest.kids)} children checked in.` : "No attendance yet.",
        stats: any ? [{ label: `Worship, ${shortDay(latest.date)}`, value: n(latest.worship) }, { label: "4-week average", value: n(avg) }, { label: "Kids checked in", value: n(latest.kids) }] : [],
        chart: any ? { kind: "lines", title: "Attendance by Sunday", x: rows.map((r) => shortDay(r.date)), series: [{ name: "Worship", values: rows.map((r) => r.worship), role: "primary" }, { name: "Kids checked in", values: rows.map((r) => r.kids), role: "reference" }], unit: "count", every: 2 } : undefined,
        table: { header: ["Sunday", "Worship", "Groups that week", "Kids checked in"], rows: rows.map((r) => [r.date, r.worship, r.groups, r.kids]) },
        source: source === "demo" ? "People attendance (the demo has none) and kids check-in." : "Attendance taken in People and kids check-in.",
      };
    }
    case "giving": {
      if (!can(access, "finance.view")) return locked(id, "Giving vs budget", "Giving reports are for the pastor, treasurer and deacons.");
      const books = await loadBooks(leader.churchId);
      const g = givingVsBudget(books, asOf);
      const any = g.gifts > 0;
      const donorStats = can(access, "giving.donors") ? [{ label: "Givers this year", value: n(g.givers), note: `${n(g.newGivers)} new this year` }] : [];
      const status = !g.hasBudget ? undefined : g.ytd >= g.pace ? ("ok" as const) : g.ytd >= g.pace * 0.95 ? ("watch" as const) : ("danger" as const);
      return {
        id, title: "Giving vs budget", allowed: true,
        empty: any ? undefined : { title: "No giving recorded this year", text: "Record a Sunday batch in Finance, or import giving from ChurchTrac, and this fills in month by month.", actions: [{ label: "Record giving", href: "/finance/giving" }, { label: "Move giving in from ChurchTrac", href: "/people/import" }] },
        summary: any
          ? `Giving this year is ${wholeDollars(g.ytd)}${g.hasBudget ? `, ${pctText(pct(g.ytd, g.pace))} of the budget's pace (${wholeDollars(g.pace)} by now)` : " (no giving budget set for this year)"}. Same period last year: ${wholeDollars(g.lastYear)}.`
          : "No giving yet this year.",
        stats: any ? [{ label: "Given this year", value: wholeDollars(g.ytd) }, { label: "Budget pace", value: g.hasBudget ? wholeDollars(g.pace) : "No budget", note: g.hasBudget ? `${pctText(pct(g.ytd, g.pace))} of pace` : undefined, tone: status }, { label: "Same time last year", value: wholeDollars(g.lastYear) }, ...donorStats] : [],
        chart: any ? { kind: "lines", title: "Giving this year, cumulative, vs budget pace", x: g.rows.map((r) => monthLabel(r.month)), series: [{ name: "Given", values: g.rows.map((r) => r.cumulative), role: "primary" }, ...(g.hasBudget ? [{ name: "Budget pace", values: g.rows.map((r) => r.budgetCumulative), role: "reference" as const }] : [])], unit: "usd" } : undefined,
        extra: any ? { kind: "bars", title: "Giving by month", x: g.rows.map((r) => monthLabel(r.month)), series: [{ name: "Given", values: g.rows.map((r) => r.total), role: "primary" }], unit: "usd" } : undefined,
        table: { header: ["Month", "Given (USD)", "Cumulative (USD)", "Budget pace (USD)"], rows: g.rows.map((r) => [r.month, (r.total / 100).toFixed(2), (r.cumulative / 100).toFixed(2), (r.budgetCumulative / 100).toFixed(2)]) },
        source: "Finance: gift records and this year's budget for the funds' income accounts. Totals only; no names.",
      };
    }
    case "volunteers": {
      const data = churchData();
      const since = addDays(sundays[0], -7 * 11);
      const [people, teams, serving, attendance, serve] = await Promise.all([data.listPeople(), data.teams(), data.serving(since), data.attendance(since), loadServe(leader.churchId).catch(() => null)]);
      let allServing = serving;
      let allPeople = people;
      let allTeams = teams;
      if (serve) {
        const r = rosterServing(serve, since, asOf);
        allServing = [...serving.filter((s) => !r.teamsWithData.has(s.teamId)), ...r.records];
        allPeople = [...people, ...r.people.filter((p) => !people.some((x) => x.id === p.id))];
        allTeams = [...teams, ...r.teams.filter((t) => !teams.some((x) => x.id === t.id))];
      }
      const v = volunteerHealth({ people: allPeople, teams: allTeams, serving: allServing.filter((s) => s.date <= asOf), attendance, sundays: sundays.slice(-8), today: asOf });
      const any = v.teams.length > 0;
      const last = v.weekly[v.weekly.length - 1];
      const busiest = v.teams[0];
      return {
        id, title: "Volunteer health", allowed: true,
        empty: any ? undefined : { title: "No serving recorded yet", text: "Once people are on the Serve rosters , this shows how the load is shared and who could use a break, week by week.", actions: [{ label: "Open Serve", href: "/serve" }] },
        summary: any ? `${n(last.active)} people served in the last eight weeks. This week ${n(last.high)} ${last.high === 1 ? "volunteer shows" : "volunteers show"} strong burnout signals and ${n(last.watch)} ${last.watch === 1 ? "is" : "are"} worth watching.${busiest ? ` ${busiest.team} asks the most of each volunteer: ${busiest.perVolunteer} slots each.` : ""}` : "No serving yet.",
        stats: any ? [{ label: "Serving (8 weeks)", value: n(last.active) }, { label: "Check in", value: n(last.high), tone: last.high ? "danger" : "ok" }, { label: "Watch", value: n(last.watch), tone: last.watch ? "watch" : "ok" }] : [],
        chart: any ? { kind: "lines", title: "Burnout radar over eight weeks", x: v.weekly.map((w) => shortDay(w.date)), series: [{ name: "Check in", values: v.weekly.map((w) => w.high), role: "primary" }, { name: "Watch", values: v.weekly.map((w) => w.watch), role: "reference" }], unit: "count" } : undefined,
        extra: any ? { kind: "bars", title: "Serving load: slots per volunteer, by team (8 weeks)", x: v.teams.map((t) => t.team), series: [{ name: "Slots per volunteer", values: v.teams.map((t) => t.perVolunteer), role: "primary" }], unit: "count" } : undefined,
        table: { header: ["Team", "Slots served (8 weeks)", "Volunteers", "Slots per volunteer", "Declined"], rows: v.teams.map((t) => [t.team, t.slots, t.volunteers, t.perVolunteer, t.declined]) },
        source: "Serve rosters, with the church database's serving history for teams without rosters. Counts only; the radar's own reasons are on Talk.",
      };
    }
    case "care": {
      if (!careRole) return locked(id, "Care pipeline", "The care pipeline is for pastors, deacons and staff.");
      const { actor, book } = await careFor(leader);
      const memberName = (mid: string) => actor.members.find((m) => m.id === mid)?.name ?? "Someone on the team";
      const c = carePipeline(book, months, { byAssignee: can(access, "care.view_all"), memberName });
      const any = book.cases.length > 0;
      return {
        id, title: "Care pipeline", allowed: true,
        empty: any ? undefined : { title: "No care cases yet", text: "When someone opens a care case (a hospital visit, a new baby, a hard season), the pipeline shows how many are open, how fast someone reaches out, and how many close each month.", actions: [{ label: "Open Care", href: "/care" }] },
        summary: any ? `${n(c.open)} cases are open and ${n(c.closed)} closed.${c.medianDaysToFirstContact !== null ? ` Someone reaches out a median of ${c.medianDaysToFirstContact < 1 ? "less than a day" : `${Math.round(c.medianDaysToFirstContact * 10) / 10} days`} after a case opens.` : ""}${c.noContactYet ? ` ${n(c.noContactYet)} open ${c.noContactYet === 1 ? "case has" : "cases have"} no contact yet.` : ""}` : "No cases yet.",
        stats: any ? [{ label: "Open", value: n(c.open) }, { label: "Closed", value: n(c.closed) }, { label: "Median days to first contact", value: c.medianDaysToFirstContact === null ? "–" : String(Math.round(c.medianDaysToFirstContact * 10) / 10) }, { label: "Open, no contact yet", value: n(c.noContactYet), tone: c.noContactYet ? "watch" : "ok" }] : [],
        chart: any ? { kind: "bars", title: "Open cases by status", x: c.byStatus.map((s) => s.status), series: [{ name: "Open cases", values: c.byStatus.map((s) => s.count), role: "primary" }], unit: "count" } : undefined,
        extra: any ? { kind: "lines", title: "Cases opened and closed by month", x: c.monthly.map((m) => monthLabel(m.month)), series: [{ name: "Opened", values: c.monthly.map((m) => m.opened), role: "primary" }, { name: "Closed", values: c.monthly.map((m) => m.closed), role: "reference" }], unit: "count" } : undefined,
        table: {
          header: c.assignees ? ["Group", "Label", "Count"] : ["Group", "Label", "Count"],
          rows: [...c.byStatus.map((s) => ["Status", s.status, s.count]), ...c.byType.map((t) => ["Type", t.type, t.count]), ...c.monthly.flatMap((m) => [["Opened", m.month, m.opened], ["Closed", m.month, m.closed]]), ...(c.assignees ?? []).map((a) => ["Held by", a.name, a.count])],
        },
        source: can(access, "care.view_all") ? "Care cases, including confidential ones (pastors only), with who holds them." : "Care cases, as totals only: no names, notes or who holds what.",
      };
    }
    case "guests": {
      if (!careRole) return locked(id, "Guest follow-up", "Guest follow-up reports are for pastors, deacons and staff.");
      const { book } = await careFor(leader);
      const g = guestConversion(book, months);
      const any = g.total > 0;
      return {
        id, title: "Guest follow-up", allowed: true,
        empty: any ? undefined : { title: "No guest cards yet", text: "Each guest card starts a thank-you, a welcome call and an invitation. This shows how many guests heard from someone within two days, came back, and took a next step.", actions: [{ label: "Add a guest", href: "/care/guests" }] },
        summary: any ? `${n(g.total)} guests: ${pctText(g.rates.contacted48)} heard from someone within 48 hours, ${pctText(g.rates.returned)} came back, and ${pctText(g.rates.nextStep)} took a next step.` : "No guests yet.",
        stats: any ? [{ label: "Guests", value: n(g.total) }, { label: "Reached within 48 h", value: pctText(g.rates.contacted48) }, { label: "Came back", value: pctText(g.rates.returned) }, { label: "Took a next step", value: pctText(g.rates.nextStep) }] : [],
        chart: any ? { kind: "bars", title: "New guests by month", x: g.monthly.map((m) => monthLabel(m.month)), series: [{ name: "New guests", values: g.monthly.map((m) => m.guests), role: "primary" }], unit: "count" } : undefined,
        table: { header: ["Measure", "Count", "Percent"], rows: [["Guests", g.total, ""], ["Reached within 48 hours", g.within48, pctText(g.rates.contacted48)], ["Came back", g.returned, pctText(g.rates.returned)], ["Took a next step", g.nextStep, pctText(g.rates.nextStep)], ...g.monthly.map((m) => [`New guests ${m.month}`, m.guests, ""])] },
        source: "Guest cards and the discipleship pathway. Totals only.",
      };
    }
    case "events": {
      const book = await loadEvents(leader.churchId);
      const rows = eventRates(book, asOf).filter((e) => e.date >= addDays(asOf, -120));
      const any = rows.some((r) => r.registered > 0);
      const upcoming = rows.filter((r) => !r.past);
      return {
        id, title: "Events", allowed: true,
        empty: any ? undefined : { title: rows.length ? "No one has registered yet" : "No events take registration yet", text: rows.length ? `${rows.length} ${rows.length === 1 ? "event takes" : "events take"} registration. Share the public sign-up link and registrations, fill rates and check-ins show up here.` : "Create an event with registration and its fill rate and check-in rate show up here.", actions: [{ label: "Open Events", href: "/events" }] },
        summary: any ? `${n(upcoming.length)} upcoming ${upcoming.length === 1 ? "event" : "events"} with registration. ${upcoming.filter((u) => u.registered).map((u) => `${u.title}: ${n(u.registered)}${u.capacity ? ` of ${n(u.capacity)}` : ""}`).slice(0, 3).join("; ")}.` : "No registrations yet.",
        stats: any ? [{ label: "Registered (upcoming)", value: n(upcoming.reduce((a, r) => a + r.registered, 0)) }, { label: "On waitlists", value: n(rows.reduce((a, r) => a + r.waitlisted, 0)) }, { label: "Checked in (past)", value: pctText(pct(rows.filter((r) => r.past).reduce((a, r) => a + r.checkedIn, 0), rows.filter((r) => r.past).reduce((a, r) => a + r.registered, 0))) }] : [],
        chart: any && rows.some((r) => r.fill !== null) ? { kind: "bars", title: "How full each event is (percent of capacity)", x: rows.filter((r) => r.fill !== null).map((r) => r.title), series: [{ name: "Percent full", values: rows.filter((r) => r.fill !== null).map((r) => r.fill), role: "primary" }], unit: "pct" } : undefined,
        table: { header: ["Event", "Date", "Registered", "Capacity", "Percent full", "Waitlist", "Checked in", "Check-in rate"], rows: rows.map((r) => [r.title, r.date, r.registered, r.capacity ?? "", r.fill ?? "", r.waitlisted, r.checkedIn, r.checkInRate ?? ""]) },
        source: "Event registrations: people counted with party size.",
      };
    }
    case "kids": {
      if (!can(access, "kids.checkin")) return locked(id, "Kids check-in", "Kids check-in reports are for the people who run check-in (pastors and staff).");
      const book = await loadKids(leader.churchId);
      const k = kidsReport(book, sundays);
      const any = k.weekly.some((w) => w.checkins);
      const last = k.weekly[k.weekly.length - 1];
      const warn = k.weekly.reduce((a, w) => a + w.warnings, 0);
      return {
        id, title: "Kids check-in", allowed: true,
        empty: any ? undefined : { title: "No check-ins yet", text: `${k.families ? `${n(k.families)} families are on file. ` : ""}Once children are checked in on a Sunday, counts per week and any ratio warnings show here.`, actions: [{ label: "Check-in station", href: "/kids" }, { label: "Families", href: "/kids/families" }] },
        summary: any ? `${n(last.children)} children checked in on ${shortDay(last.date)}. ${warn ? `${n(warn)} room${warn === 1 ? "" : "s"} ran short of adults or over ratio in the last twelve weeks.` : "No ratio warnings in the last twelve weeks."}` : "No check-ins yet.",
        stats: any ? [{ label: `Children, ${shortDay(last.date)}`, value: n(last.children) }, { label: "Ratio warnings (12 weeks)", value: n(warn), tone: warn ? "danger" : "ok" }, { label: "Families on file", value: n(k.families) }] : [],
        chart: any ? { kind: "bars", title: "Children checked in by Sunday", x: k.weekly.map((w) => shortDay(w.date)), series: [{ name: "Children", values: k.weekly.map((w) => w.children), role: "primary" }], unit: "count", every: 2 } : undefined,
        table: { header: ["Sunday", "Check-ins", "Children", "Rooms with a ratio warning"], rows: k.weekly.map((w) => [w.date, w.checkins, w.children, w.warnings]) },
        source: "Kids check-in records and room staffing. Counts only.",
      };
    }
  }
}

export const SECTION_IDS: SectionId[] = ["attendance", "giving", "volunteers", "care", "guests", "events", "kids"];

export async function buildReports(leader: Leader, opts: ReportOptions = {}) {
  const access = await accessFor(leader);
  const sections = await Promise.all(SECTION_IDS.map((id) => sectionFor(id, leader, access, opts)));
  return { asOf: opts.asOf ?? today(), access, sections };
}

/** A plain narrative of the month, built from the same numbers (Barnabas can write its own over these). */
export function monthlyNarrative(sections: Section[], monthName: string, church: string) {
  const lines: string[] = [`${church}: ministry report for ${monthName}`, ""];
  for (const s of sections) {
    if (!s.allowed) continue;
    lines.push(`${s.title}: ${s.empty ? s.empty.title + "." : s.summary}`);
  }
  lines.push("", "Numbers are totals from Barnabas; individual giving, care notes and children's details are never included.");
  return lines.join("\n");
}

export function reportDateLabel(asOf: string) {
  return friendlyDate(asOf);
}
