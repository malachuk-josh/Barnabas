import { addDays } from "../dates";
import { inRange } from "./ledger";
import { sum } from "./money";
import { GIFT_METHODS, type Fund, type Gift, type GiftMethod, type Recurring } from "./types";

/** One donor across gifts: the ChMS person when known, otherwise the name as typed. */
export function donorKey(g: Pick<Gift, "personId" | "donorName">): string {
  return g.personId ? `p:${g.personId}` : `n:${g.donorName.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export type GivingTotals = {
  total: number;
  count: number;
  /** Distinct donors (anonymous loose offering counts as one). */
  givers: number;
  byFund: Record<string, number>;
  byMethod: Record<GiftMethod, number>;
};

export function givingTotals(gifts: Gift[], from?: string, to?: string): GivingTotals {
  const scoped = gifts.filter((g) => inRange(g.date, from, to));
  const byFund: Record<string, number> = {};
  const byMethod = Object.fromEntries(GIFT_METHODS.map((m) => [m, 0])) as Record<GiftMethod, number>;
  for (const g of scoped) {
    byFund[g.fundId] = (byFund[g.fundId] ?? 0) + g.amount;
    byMethod[g.method] += g.amount;
  }
  return { total: sum(scoped.map((g) => g.amount)), count: scoped.length, givers: new Set(scoped.map(donorKey)).size, byFund, byMethod };
}

export type MonthPoint = { month: string; total: number; byFund: Record<string, number> };

/** Giving per calendar month for the given "yyyy-mm" months, in order. */
export function monthlyTrend(gifts: Gift[], months: string[]): MonthPoint[] {
  const points = new Map(months.map((m) => [m, { month: m, total: 0, byFund: {} as Record<string, number> }]));
  for (const g of gifts) {
    const p = points.get(g.date.slice(0, 7));
    if (!p) continue;
    p.total += g.amount;
    p.byFund[g.fundId] = (p.byFund[g.fundId] ?? 0) + g.amount;
  }
  return months.map((m) => points.get(m)!);
}

/** The n months ending with the month of asOf, oldest first, as "yyyy-mm". */
export function lastMonths(asOf: string, n: number): string[] {
  const [y, m] = asOf.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthLabel(month: string, style: "short" | "long" = "short") {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: style, year: style === "long" ? "numeric" : undefined, timeZone: "UTC" });
}

export type DonorSummary = { key: string; personId?: string; name: string; total: number; count: number; lastGift: string; previousTotal: number };

/** Each donor's giving in a year, with the year before for comparison. */
export function donorSummaries(gifts: Gift[], year: number): DonorSummary[] {
  const map = new Map<string, DonorSummary>();
  for (const g of gifts) {
    const y = Number(g.date.slice(0, 4));
    if (y !== year && y !== year - 1) continue;
    const key = donorKey(g);
    let d = map.get(key);
    if (!d) map.set(key, (d = { key, personId: g.personId, name: g.donorName, total: 0, count: 0, lastGift: "", previousTotal: 0 }));
    if (y === year) {
      d.total += g.amount;
      d.count++;
    } else d.previousTotal += g.amount;
    if (g.date > d.lastGift) d.lastGift = g.date;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export type Statement = {
  donorKey: string;
  donorName: string;
  year: number;
  gifts: Gift[];
  byFund: { fund: Fund; total: number }[];
  total: number;
};

/** A year-end contribution statement for one donor. */
export function contributionStatement(gifts: Gift[], funds: Fund[], key: string, year: number): Statement | null {
  const mine = gifts.filter((g) => donorKey(g) === key && g.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date));
  if (!mine.length) return null;
  const byFund = funds
    .map((fund) => ({ fund, total: sum(mine.filter((g) => g.fundId === fund.id).map((g) => g.amount)) }))
    .filter((f) => f.total > 0);
  return { donorKey: key, donorName: mine[mine.length - 1].donorName, year, gifts: mine, byFund, total: sum(mine.map((g) => g.amount)) };
}

/** Dates a recurring gift fell due after its last recorded gift, through asOf. */
export function dueOccurrences(r: Recurring, asOf: string): string[] {
  if (!r.active) return [];
  const step = r.frequency === "weekly" ? 7 : r.frequency === "biweekly" ? 14 : 0;
  const out: string[] = [];
  let next = r.startDate;
  const advance = (d: string) => {
    if (step) return addDays(d, step);
    const [y, m, day] = d.split("-").map(Number);
    const anchor = Number(r.startDate.slice(8, 10));
    const target = new Date(Date.UTC(y, m, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(anchor || day, last));
    return target.toISOString().slice(0, 10);
  };
  for (let guard = 0; next <= asOf && guard < 600; guard++) {
    if (!r.lastRecorded || next > r.lastRecorded) out.push(next);
    next = advance(next);
  }
  return out;
}
