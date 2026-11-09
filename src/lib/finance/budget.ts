import { accountActivity } from "./ledger";
import { sum } from "./money";
import type { Account, Budget, Chart, Transaction } from "./types";

export type Health = "on_track" | "watch" | "over" | "behind";

export const HEALTH_LABELS: Record<Health, string> = { on_track: "On track", watch: "Watch", over: "Over", behind: "Behind" };

const daysInYear = (year: number) => (new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365);

/** The share of the fiscal year (calendar year) that has passed by the end of asOf, from 0 to 1. */
export function elapsedFraction(year: number, asOf: string): number {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  if (asOf < start) return 0;
  if (asOf >= end) return 1;
  const days = Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  return days / daysInYear(year);
}

/**
 * How a line is doing at this point in the year. "Pace" compares the actual with the budget for the
 * time that has passed. Expenses are over once they pass the whole year's budget, and watch when
 * they run more than 10% ahead of pace. Seasonal lines (insurance, a summer trip) are only judged
 * against the whole year. Income is on track down to 5% behind pace, watch to 15%, then behind.
 */
export function health(kind: "income" | "expense", actual: number, annual: number, elapsed: number, timing: "even" | "seasonal" = "even"): Health {
  const expected = annual * elapsed;
  if (kind === "expense") {
    if (annual <= 0) return actual > 0 ? "over" : "on_track";
    if (actual > annual) return "over";
    if (timing === "seasonal" || expected <= 0) return "on_track";
    return actual / expected > 1.1 ? "watch" : "on_track";
  }
  if (timing === "seasonal" && elapsed < 1) return "on_track";
  if (annual <= 0 || expected <= 0) return "on_track";
  const pace = actual / expected;
  return pace >= 0.95 ? "on_track" : pace >= 0.85 ? "watch" : "behind";
}

export type BudgetRow = {
  account: Account;
  kind: "income" | "expense";
  group: string;
  annual: number;
  /** The budget for the part of the year that has passed. */
  toDate: number;
  actual: number;
  /** Positive is good: under budget for expenses, ahead of budget for income. */
  variance: number;
  /** Actual as a percent of the whole year's budget. */
  pctUsed: number | null;
  health: Health;
  note?: string;
  timing: "even" | "seasonal";
  budgeted: boolean;
};

export type BudgetGroup = { group: string; kind: "income" | "expense"; annual: number; toDate: number; actual: number; variance: number; pctUsed: number | null; health: Health; rows: BudgetRow[] };

export type BudgetReport = {
  year: number;
  asOf: string;
  elapsed: number;
  rows: BudgetRow[];
  groups: BudgetGroup[];
  totals: { income: { annual: number; toDate: number; actual: number }; expense: { annual: number; toDate: number; actual: number } };
};

function row(account: Account, annual: number, actual: number, elapsed: number, budgeted: boolean, note?: string, timing: "even" | "seasonal" = "even"): BudgetRow {
  const kind = account.type === "income" ? "income" : "expense";
  const toDate = Math.round(annual * elapsed);
  return {
    account,
    kind,
    group: account.group,
    annual,
    toDate,
    actual,
    variance: kind === "expense" ? toDate - actual : actual - toDate,
    pctUsed: annual ? Math.round((actual / annual) * 1000) / 10 : null,
    health: health(kind, actual, annual, elapsed, timing),
    note,
    timing,
    budgeted,
  };
}

/** Actual vs budget for every budgeted account, plus any income or expense account with unbudgeted activity. */
export function budgetVsActual(chart: Chart, budget: Budget | null, txns: Transaction[], year: number, asOf: string): BudgetReport {
  const end = asOf < `${year}-12-31` ? asOf : `${year}-12-31`;
  const activity = accountActivity(chart, txns, `${year}-01-01`, end);
  const elapsed = elapsedFraction(year, asOf);
  const byId = new Map(chart.accounts.map((a) => [a.id, a]));
  const rows: BudgetRow[] = [];
  const seen = new Set<string>();
  for (const line of budget?.lines ?? []) {
    const account = byId.get(line.accountId);
    if (!account || (account.type !== "income" && account.type !== "expense")) continue;
    seen.add(account.id);
    rows.push(row(account, line.annual, activity.get(account.id) ?? 0, elapsed, true, line.note, line.timing ?? "even"));
  }
  for (const [id, actual] of activity) {
    if (seen.has(id) || !actual) continue;
    rows.push(row(byId.get(id)!, 0, actual, elapsed, false));
  }
  rows.sort((a, b) => (a.kind === b.kind ? a.account.number.localeCompare(b.account.number) : a.kind === "income" ? -1 : 1));

  const groups: BudgetGroup[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.group === r.group && x.kind === r.kind);
    if (!g) groups.push((g = { group: r.group, kind: r.kind, annual: 0, toDate: 0, actual: 0, variance: 0, pctUsed: null, health: "on_track", rows: [] }));
    g.rows.push(r);
    g.annual += r.annual;
    g.toDate += r.toDate;
    g.actual += r.actual;
    g.variance += r.variance;
  }
  for (const g of groups) {
    g.pctUsed = g.annual ? Math.round((g.actual / g.annual) * 1000) / 10 : null;
    // Expense groups are over if any line is over, and watch if any line (or the group's pace) is.
    // Income groups are judged on their combined pace.
    const even = g.rows.filter((r) => r.timing === "even");
    const base = health(g.kind, sum(even.map((r) => r.actual)), sum(even.map((r) => r.annual)), elapsed);
    if (g.kind === "income") g.health = base;
    else g.health = g.rows.some((r) => r.health === "over") ? "over" : base === "watch" || g.rows.some((r) => r.health === "watch") ? "watch" : "on_track";
  }
  const total = (kind: "income" | "expense") => {
    const rs = rows.filter((r) => r.kind === kind);
    return { annual: sum(rs.map((r) => r.annual)), toDate: sum(rs.map((r) => r.toDate)), actual: sum(rs.map((r) => r.actual)) };
  };
  return { year, asOf: end, elapsed, rows, groups, totals: { income: total("income"), expense: total("expense") } };
}

/** A new year's budget from last year's lines, same amounts, notes carried over. */
export function copyBudget(from: Budget, year: number, by: string): Budget {
  return {
    year,
    lines: from.lines.map((l) => ({ ...l })),
    notes: from.notes ? `Copied from ${from.year}.\n\n${from.notes}` : `Copied from ${from.year}.`,
    updatedAt: Date.now(),
    updatedBy: by,
  };
}
