import { addDays, daysBetween } from "../dates";
import { CASE_TYPE_LABELS, type CareCase, type CaseType } from "./types";

/**
 * A pastor's or deacon's care load: private to them. Others only ever see the team aggregate
 * (teamSpread), which has no individual wellbeing details.
 */

/** Heavier cases count more: a crisis or a death in the family takes more than a routine visit. */
export const CASE_WEIGHTS: Record<CaseType, number> = {
  crisis: 3,
  grief: 2,
  hospital: 2,
  counseling_referral: 2,
  illness: 1.5,
  new_baby: 1,
  homebound: 1,
  other: 1,
  prayer: 0.5,
};

export const LOAD_THRESHOLDS = {
  /** Weighted open cases. */
  weighted: { full: 8, stretched: 14 },
  /** Consecutive days without a day off. */
  noDayOff: { full: 8, stretched: 14 },
  /** Contacts made in the last 7 days. */
  contacts: { full: 15, stretched: 25 },
  /** Open crisis cases. */
  crisis: { full: 2, stretched: 4 },
  /** Next steps past their due date. */
  overdue: { full: 3, stretched: 6 },
};

export type LoadSignal = "steady" | "full" | "stretched";
export const SIGNAL_LABELS: Record<LoadSignal, string> = { steady: "Steady", full: "Full", stretched: "Stretched" };

export type LoadFactor = { key: keyof typeof LOAD_THRESHOLDS; level: 0 | 1 | 2; text: string };

export type CareLoad = {
  asOf: string;
  openCases: number;
  byType: { type: CaseType; label: string; count: number; weight: number }[];
  weighted: number;
  crisisOpen: number;
  overdue: number;
  contactsThisWeek: number;
  /** Days since the last day off (0 if today is one). */
  daysWithoutDayOff: number;
  lastDayOff: string | null;
  /** When counting started, if no day off has been recorded yet. */
  countingSince: string | null;
  restDaysLast30: string[];
  signal: LoadSignal;
  factors: LoadFactor[];
  /** Plain reasons for the signal, heaviest first. */
  reasons: string[];
  sources: string[];
};

export type LoadInput = {
  asOf: string;
  /** Open and closed cases assigned to this person. */
  cases: Pick<CareCase, "type" | "status" | "nextStep">[];
  /** Dates of contacts this person made. */
  contactDates: string[];
  /** Dates they rested: "rest" events on their Barnabas calendar and days off they logged. */
  restDates: string[];
  /** When they started using Barnabas (yyyy-mm-dd); days without a day off are counted from here at most. */
  trackingStart: string;
};

function level(value: number, t: { full: number; stretched: number }): 0 | 1 | 2 {
  return value >= t.stretched ? 2 : value >= t.full ? 1 : 0;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The gentle signal: stretched if any one thing is heavy or two things are full; full if one is; otherwise steady. */
export function signalFor(levels: number[]): LoadSignal {
  if (levels.some((l) => l >= 2) || levels.filter((l) => l >= 1).length >= 2) return "stretched";
  if (levels.some((l) => l >= 1)) return "full";
  return "steady";
}

export function careLoad(input: LoadInput): CareLoad {
  const { asOf } = input;
  const open = input.cases.filter((c) => c.status !== "closed");
  const counts = new Map<CaseType, number>();
  for (const c of open) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  const byType = [...counts.entries()]
    .map(([type, count]) => ({ type, label: CASE_TYPE_LABELS[type], count, weight: count * CASE_WEIGHTS[type] }))
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  const weighted = Math.round(byType.reduce((a, t) => a + t.weight, 0) * 10) / 10;
  const crisisOpen = counts.get("crisis") ?? 0;
  const overdue = open.filter((c) => c.nextStep?.due && c.nextStep.due < asOf).length;

  const weekStart = addDays(asOf, -6);
  const contactsThisWeek = input.contactDates.filter((d) => d >= weekStart && d <= asOf).length;

  const rest = [...new Set(input.restDates.filter((d) => d <= asOf))].sort();
  const lastDayOff = rest.length ? rest[rest.length - 1] : null;
  const start = input.trackingStart <= asOf ? input.trackingStart : asOf;
  const daysWithoutDayOff = lastDayOff ? daysBetween(lastDayOff, asOf) : daysBetween(start, asOf);
  const restDaysLast30 = rest.filter((d) => d > addDays(asOf, -30));

  const factors: LoadFactor[] = [
    {
      key: "weighted",
      level: level(weighted, LOAD_THRESHOLDS.weighted),
      text: `${plural(open.length, "open case")}${byType.length ? ` (${byType.map((t) => `${t.count} ${t.label.toLowerCase()}`).join(", ")})` : ""}, a weighted load of ${weighted}`,
    },
    {
      key: "noDayOff",
      level: level(daysWithoutDayOff, LOAD_THRESHOLDS.noDayOff),
      text: lastDayOff
        ? daysWithoutDayOff === 0
          ? "Today is a day off"
          : `No day off in ${plural(daysWithoutDayOff, "day")}`
        : `No day off recorded since ${start === asOf ? "today" : start}`,
    },
    { key: "contacts", level: level(contactsThisWeek, LOAD_THRESHOLDS.contacts), text: `${plural(contactsThisWeek, "care contact")} in the last 7 days` },
    { key: "crisis", level: level(crisisOpen, LOAD_THRESHOLDS.crisis), text: `${plural(crisisOpen, "crisis case")} open` },
    { key: "overdue", level: level(overdue, LOAD_THRESHOLDS.overdue), text: `${plural(overdue, "next step")} past due` },
  ];
  const signal = signalFor(factors.map((f) => f.level));
  const heavy = factors.filter((f) => f.level > 0).sort((a, b) => b.level - a.level);
  const reasons = heavy.length
    ? heavy.map((f) => f.text)
    : [factors[0].text, lastDayOff ? (daysWithoutDayOff === 0 ? "Today is a day off" : `Last day off ${plural(daysWithoutDayOff, "day")} ago`) : factors[1].text];

  return {
    asOf,
    openCases: open.length,
    byType,
    weighted,
    crisisOpen,
    overdue,
    contactsThisWeek,
    daysWithoutDayOff,
    lastDayOff,
    countingSince: lastDayOff ? null : start,
    restDaysLast30,
    signal,
    factors,
    reasons,
    sources: [
      "Open cases assigned to you in Care, weighted: crisis 3, grief, hospital and counseling referral 2, illness 1.5, new baby, homebound and other 1, prayer 0.5.",
      "Contacts you logged on any case in the last 7 days, today included.",
      "Days off: \"Rest / sabbath\" events on your Barnabas calendar and days you logged with \"I took a day off\".",
    ],
  };
}

export type TeamSpread = {
  totalOpen: number;
  unassigned: number;
  carers: number;
  /** Each carer's share of the assigned open cases, largest first, without names. */
  shares: number[];
  evenness: "even" | "uneven" | "concentrated" | "none";
  text: string;
};

/** The team view: how many cases are open and how evenly they're spread. No names, no wellbeing details. */
export function teamSpread(openCases: Pick<CareCase, "assigneeId">[]): TeamSpread {
  const per = new Map<string, number>();
  let unassigned = 0;
  for (const c of openCases) {
    if (!c.assigneeId) unassigned++;
    else per.set(c.assigneeId, (per.get(c.assigneeId) ?? 0) + 1);
  }
  const assigned = openCases.length - unassigned;
  const shares = [...per.values()].sort((a, b) => b - a).map((n) => n / (assigned || 1));
  const carers = per.size;
  let evenness: TeamSpread["evenness"] = "none";
  let text = "No open cases are assigned yet.";
  if (carers === 1) {
    evenness = "concentrated";
    text = "One person is carrying every assigned case.";
  } else if (carers > 1) {
    const fair = 1 / carers;
    const top = shares[0];
    evenness = top <= fair * 1.5 ? "even" : top <= fair * 2 ? "uneven" : "concentrated";
    const pct = Math.round(top * 100);
    text =
      evenness === "even"
        ? `Fairly even: the busiest carer holds ${pct}% of assigned cases across ${carers} people.`
        : evenness === "uneven"
          ? `A little uneven: one carer holds ${pct}% of assigned cases across ${carers} people.`
          : `Concentrated: one carer holds ${pct}% of assigned cases across ${carers} people.`;
  }
  return { totalOpen: openCases.length, unassigned, carers, shares, evenness, text };
}
