import type { Leader } from "../auth/session";
import { allEvents } from "../calendar/store";
import { addDays, today } from "../dates";
import { getLeaderRecord } from "../team";
import { seedDemoRest } from "./demo";
import { notContacted, openTasks } from "./guests";
import { careLoad, teamSpread, type CareLoad } from "./load";
import { nextSteps } from "./pathway";
import { absorbLegacyCare, careActor, type CareActor } from "./service";
import { listRest, loadCare } from "./store";
import { memberName } from "./team";
import { CASE_TYPE_LABELS, TASK_LABELS, type CareBook, type CareCase, type CaseType, type GuestCard, type PathwayStep } from "./types";
import { canCloseCase, canSeeCase, canSeePrayer, isMine, visibleCases } from "./visibility";

/** The care records this leader may see, after folding in any older log_care_event records. */
export async function careFor(leader: Leader): Promise<{ actor: CareActor; book: CareBook }> {
  await absorbLegacyCare(leader);
  const [actor, book] = await Promise.all([careActor(leader), loadCare(leader.churchId)]);
  return { actor, book };
}

/* ---------- Cases ---------- */

export type CaseFilters = { scope?: "mine" | "all"; type?: CaseType; overdue?: boolean; includeClosed?: boolean };

export type CaseRow = {
  id: string;
  name: string;
  personId?: string;
  household: boolean;
  type: CaseType;
  typeLabel: string;
  status: CareCase["status"];
  confidential: boolean;
  assigneeId?: string;
  assigneeName: string;
  mine: boolean;
  nextStep?: { text: string; due?: string };
  overdue: boolean;
  lastContact?: { kind: string; date: string; by: string };
  contactCount: number;
  openedAt: number;
  summary?: string;
};

export const isOverdue = (c: Pick<CareCase, "status" | "nextStep">, asOf: string) => c.status !== "closed" && Boolean(c.nextStep?.due && c.nextStep.due < asOf);

export function caseRow(c: CareCase, actor: CareActor, asOf: string): CaseRow {
  const last = c.contacts[c.contacts.length - 1];
  return {
    id: c.id,
    name: c.subject.name,
    personId: c.subject.personId,
    household: c.subject.kind === "household",
    type: c.type,
    typeLabel: CASE_TYPE_LABELS[c.type],
    status: c.status,
    confidential: c.confidential,
    assigneeId: c.assigneeId,
    assigneeName: memberName(actor.members, c.assigneeId),
    mine: isMine(actor.viewer, c.assigneeId),
    nextStep: c.nextStep,
    overdue: isOverdue(c, asOf),
    lastContact: last ? { kind: last.kind, date: last.date, by: last.byName } : undefined,
    contactCount: c.contacts.length,
    openedAt: c.openedAt,
    summary: c.summary,
  };
}

export function caseRows(book: CareBook, actor: CareActor, filters: CaseFilters = {}, asOf = today()): CaseRow[] {
  return visibleCases(actor.viewer, book.cases)
    .filter((c) => filters.includeClosed || c.status !== "closed")
    .filter((c) => filters.scope !== "mine" || isMine(actor.viewer, c.assigneeId))
    .filter((c) => !filters.type || c.type === filters.type)
    .filter((c) => !filters.overdue || isOverdue(c, asOf))
    .map((c) => caseRow(c, actor, asOf))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.nextStep?.due ?? "9999").localeCompare(b.nextStep?.due ?? "9999") || b.openedAt - a.openedAt);
}

export function caseDetail(book: CareBook, actor: CareActor, id: string) {
  const c = book.cases.find((x) => x.id === id);
  if (!c || !canSeeCase(actor.viewer, c)) return null;
  return { ...c, assigneeName: memberName(actor.members, c.assigneeId), canClose: canCloseCase(actor.viewer, c) };
}

/* ---------- Care load (private) and the team view ---------- */

async function restDates(leader: Leader) {
  const [logged, events] = await Promise.all([listRest(leader.churchId, leader.leaderId), allEvents(leader)]);
  return {
    logged,
    dates: [...logged.map((d) => d.date), ...events.filter((e) => e.kind === "rest").map((e) => e.date)],
    calendarRest: events.filter((e) => e.kind === "rest").map((e) => ({ date: e.date, title: e.title })),
  };
}

/** This leader's own care load. Only ever shown to them. */
export async function myCareLoad(leader: Leader, book: CareBook, actor: CareActor, asOf = today()): Promise<CareLoad & { logged: { date: string; note?: string; demo?: boolean }[]; calendarRest: { date: string; title: string }[] }> {
  await seedDemoRest(leader.churchId, leader, book.meta.demo);
  const [rest, record] = await Promise.all([restDates(leader), getLeaderRecord(leader.churchId, leader.leaderId)]);
  const mine = book.cases.filter((c) => isMine(actor.viewer, c.assigneeId));
  const contactDates = book.cases.flatMap((c) => c.contacts.filter((ct) => actor.viewer.memberIds.includes(ct.byId)).map((ct) => ct.date));
  const firstSeen = record?.firstSignedInAt ?? record?.signedInAt ?? Date.now();
  const earliestRest = rest.dates.length ? [...rest.dates].sort()[0] : asOf;
  const trackingStart = [new Date(firstSeen).toISOString().slice(0, 10), earliestRest].sort()[0];
  const load = careLoad({ asOf, cases: mine, contactDates, restDates: rest.dates, trackingStart });
  return { ...load, logged: rest.logged.filter((d) => d.date > addDays(asOf, -60)).reverse(), calendarRest: rest.calendarRest.filter((e) => e.date > addDays(asOf, -30) && e.date <= addDays(asOf, 30)) };
}

/** Everyone may see this: totals and spread, no names and no wellbeing details. */
export function teamView(book: CareBook) {
  const open = book.cases.filter((c) => c.status !== "closed");
  const spread = teamSpread(open);
  const byType = new Map<CaseType, number>();
  for (const c of open) byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  return { ...spread, byType: [...byType.entries()].map(([type, count]) => ({ type, label: CASE_TYPE_LABELS[type], count })).sort((a, b) => b.count - a.count) };
}

/* ---------- Prayer ---------- */

export function prayerRows(book: CareBook, actor: CareActor) {
  return book.prayers
    .filter((p) => canSeePrayer(actor.viewer, p))
    .map((p) => ({ ...p, prayedByMe: p.prayedBy.some((id) => actor.viewer.memberIds.includes(id)), prayedBy: undefined }))
    .sort((a, b) => Number(Boolean(a.answered)) - Number(Boolean(b.answered)) || b.createdAt - a.createdAt);
}

/* ---------- Guests ---------- */

export function guestRows(book: CareBook, actor: CareActor, now = Date.now()) {
  return book.guests
    .map((g) => ({
      ...g,
      assigneeName: memberName(actor.members, g.assigneeId),
      mine: isMine(actor.viewer, g.assigneeId),
      contacted: !notContacted(g),
      tasks: g.tasks.map((t) => ({ ...t, label: TASK_LABELS[t.kind], assigneeName: memberName(actor.members, t.assigneeId), overdue: !t.doneAt && t.dueAt < now, mine: isMine(actor.viewer, t.assigneeId) })),
      // A guest's prayer request follows the prayer list's rules.
      prayer: g.prayerRequestId ? (() => {
        const p = book.prayers.find((x) => x.id === g.prayerRequestId);
        if (!p) return null;
        return canSeePrayer(actor.viewer, p) ? { request: p.request, shareable: p.shareable } : { request: null, shareable: p.shareable };
      })() : null,
    }))
    .sort((a, b) => b.visits[b.visits.length - 1].localeCompare(a.visits[a.visits.length - 1]) || b.createdAt - a.createdAt);
}

/** Guests who have visited and no one has reached yet, most recent first. */
export function recentGuests(book: CareBook, actor: CareActor, opts: { uncontactedOnly?: boolean; withinDays?: number } = {}, asOf = today()) {
  const since = addDays(asOf, -(opts.withinDays ?? 21));
  return guestRows(book, actor).filter((g) => g.visits[g.visits.length - 1] >= since && (!opts.uncontactedOnly || !g.contacted));
}

/* ---------- Discipleship ---------- */

export function discipleship(book: CareBook, asOf = today(), step?: PathwayStep) {
  return { nextSteps: nextSteps(book.pathways, asOf, step), pathways: [...book.pathways].sort((a, b) => a.name.localeCompare(b.name)), classes: book.classes };
}

/* ---------- Follow-ups for the briefing, the calendar and Barnabas ---------- */

export type CareFollowUp = { id: string; personId: string; name: string; reason: string; due?: string; overdue: boolean; source: "care" | "guest"; href: string };

/** Next steps on this leader's own open cases, and their open guest tasks. */
export function careFollowUps(book: CareBook, actor: CareActor, asOf = today(), now = Date.now()): CareFollowUp[] {
  const out: CareFollowUp[] = [];
  for (const c of book.cases) {
    if (c.status === "closed" || !c.nextStep || !isMine(actor.viewer, c.assigneeId) || !canSeeCase(actor.viewer, c)) continue;
    out.push({ id: c.id, personId: c.subject.personId ?? c.id, name: c.subject.name, reason: c.nextStep.text, due: c.nextStep.due, overdue: isOverdue(c, asOf), source: "care", href: `/care/cases/${c.id}` });
  }
  for (const g of book.guests) {
    for (const t of openTasks(g as GuestCard)) {
      if (!isMine(actor.viewer, t.assigneeId)) continue;
      const due = new Date(t.dueAt).toISOString().slice(0, 10);
      out.push({ id: t.id, personId: g.id, name: g.name, reason: `${TASK_LABELS[t.kind]} (guest)`, due, overdue: t.dueAt < now, source: "guest", href: `/care/guests#${g.id}` });
    }
  }
  return out.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

export type CalendarSuggestion = { id: string; title: string; date: string; kind: "visit" | "rest"; reason: string; href: string };

/** Suggestions only: nothing is added to the calendar unless the leader adds it. */
export async function calendarSuggestions(leader: Leader, asOf = today()): Promise<CalendarSuggestion[]> {
  const { actor, book } = await careFor(leader);
  const out: CalendarSuggestion[] = careFollowUps(book, actor, asOf)
    .filter((f) => f.source === "care" && f.due && f.due <= addDays(asOf, 14))
    .slice(0, 6)
    .map((f) => ({ id: f.id, title: `${f.reason.length > 60 ? `${f.reason.slice(0, 57)}…` : f.reason}: ${f.name}`, date: f.due! < asOf ? asOf : f.due!, kind: "visit", reason: f.overdue ? `Overdue since ${f.due}` : `Next step due ${f.due}`, href: f.href }));
  const load = await myCareLoad(leader, book, actor, asOf);
  if (load.signal !== "steady") {
    const events = await allEvents(leader);
    const busy = new Set(events.filter((e) => e.date > asOf).map((e) => e.date));
    const restPlanned = events.some((e) => e.kind === "rest" && e.date > asOf && e.date <= addDays(asOf, 7));
    if (!restPlanned) {
      // Thursday first (a common pastors' day off), then Friday, Monday, Tuesday.
      const prefer = [4, 5, 1, 2];
      const candidates = Array.from({ length: 7 }, (_, i) => addDays(asOf, i + 1));
      const day = prefer.map((dow) => candidates.find((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === dow && !busy.has(d))).find(Boolean) ?? candidates[0];
      out.unshift({ id: "rest", title: "Day off", date: day, kind: "rest", reason: `Your care load is ${load.signal}: ${load.reasons.slice(0, 2).join("; ")}`, href: "/care/load" });
    }
  }
  return out;
}

/** What Barnabas knows at the start of a conversation: the leader's own open cases, what's overdue, and their load. */
export async function careSnapshot(leader: Leader, asOf = today()) {
  const { actor, book } = await careFor(leader);
  const mine = caseRows(book, actor, { scope: "mine" }, asOf);
  const load = await myCareLoad(leader, book, actor, asOf);
  const guestsWaiting = recentGuests(book, actor, { uncontactedOnly: true }, asOf).filter((g) => g.mine);
  return {
    openCases: mine.length,
    overdue: mine.filter((c) => c.overdue).map((c) => ({ id: c.id, name: c.name, type: c.typeLabel, step: c.nextStep?.text ?? "", due: c.nextStep?.due ?? "" })),
    guestsWaiting: guestsWaiting.map((g) => g.name),
    load: { signal: load.signal, reasons: load.reasons, daysWithoutDayOff: load.daysWithoutDayOff, crisisOpen: load.crisisOpen },
  };
}
