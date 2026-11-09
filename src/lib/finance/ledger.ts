import { sum } from "./money";
import type { Account, Chart, Fund, Transaction } from "./types";

/** Total of a transaction's split lines, in cents. */
export const txnTotal = (t: Transaction) => sum(t.lines.map((l) => l.amount));

export const inRange = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to);

/**
 * Activity on an income or expense account, in its natural direction: income counts money in,
 * expenses count money out. A refund (money back in on an expense line) reduces the expense.
 */
export function naturalAmount(t: Transaction, type: Account["type"], amount: number): number {
  if (type === "income") return t.direction === "in" ? amount : -amount;
  if (type === "expense") return t.direction === "out" ? amount : -amount;
  return 0;
}

/** Net activity per income/expense account between two dates (inclusive). */
export function accountActivity(chart: Chart, txns: Transaction[], from?: string, to?: string, fundId?: string): Map<string, number> {
  const types = new Map(chart.accounts.map((a) => [a.id, a.type]));
  const out = new Map<string, number>();
  for (const t of txns) {
    if (!inRange(t.date, from, to)) continue;
    for (const l of t.lines) {
      if (fundId && l.fundId !== fundId) continue;
      const type = types.get(l.accountId);
      if (type !== "income" && type !== "expense") continue;
      out.set(l.accountId, (out.get(l.accountId) ?? 0) + naturalAmount(t, type, l.amount));
    }
  }
  return out;
}

export type FundBalance = {
  fund: Fund;
  opening: number;
  /** Income and expenses from the books' start through asOf. */
  income: number;
  expenses: number;
  balance: number;
};

/**
 * Fund balances (net assets by fund) as of a date: opening balance, plus income lines, less expense lines.
 * Moves between balance-sheet accounts (a transfer to savings, paying down a liability) don't change a fund.
 */
export function fundBalances(chart: Chart, txns: Transaction[], asOf?: string): FundBalance[] {
  const types = new Map(chart.accounts.map((a) => [a.id, a.type]));
  const totals = new Map(chart.funds.map((f) => [f.id, { income: 0, expenses: 0 }]));
  for (const t of txns) {
    if (asOf && t.date > asOf) continue;
    for (const l of t.lines) {
      const row = totals.get(l.fundId);
      const type = types.get(l.accountId);
      if (!row || !type) continue;
      if (type === "income") row.income += naturalAmount(t, type, l.amount);
      if (type === "expense") row.expenses += naturalAmount(t, type, l.amount);
    }
  }
  return chart.funds.map((fund) => {
    const { income, expenses } = totals.get(fund.id)!;
    return { fund, opening: fund.openingBalance, income, expenses, balance: fund.openingBalance + income - expenses };
  });
}

/** How a transaction changes a balance-sheet account (bank, savings or liability), in cents. */
export function balanceEffect(t: Transaction, account: Account): number {
  let effect = 0;
  if (t.bankAccountId === account.id) effect += t.direction === "in" ? txnTotal(t) : -txnTotal(t);
  for (const l of t.lines) {
    if (l.accountId !== account.id) continue;
    // The other side of the bank movement: money out of checking into savings raises savings;
    // money out to pay a liability lowers it (and borrowing raises it).
    if (account.type === "asset") effect += t.direction === "out" ? l.amount : -l.amount;
    if (account.type === "liability") effect += t.direction === "in" ? l.amount : -l.amount;
  }
  return effect;
}

/** Balance of a bank account or liability as of a date. With clearedOnly, only what the bank has seen. */
export function accountBalance(account: Account, txns: Transaction[], opts: { asOf?: string; clearedOnly?: boolean } = {}): number {
  let balance = account.openingBalance ?? 0;
  for (const t of txns) {
    if (opts.asOf && t.date > opts.asOf) continue;
    if (opts.clearedOnly && !t.cleared) continue;
    balance += balanceEffect(t, account);
  }
  return balance;
}

export type LineProblem = string;

/** Checks a transaction against the chart before it's saved. Returns the problems found. */
export function validateTransaction(chart: Chart, t: Pick<Transaction, "bankAccountId" | "lines" | "date" | "description">): LineProblem[] {
  const problems: string[] = [];
  const accounts = new Map(chart.accounts.map((a) => [a.id, a]));
  const funds = new Set(chart.funds.map((f) => f.id));
  const bank = accounts.get(t.bankAccountId);
  if (!bank || !bank.bank) problems.push("Pick the bank account the money moved through.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) problems.push("Give the date as yyyy-mm-dd.");
  if (!t.description.trim()) problems.push("Add a description.");
  if (!t.lines.length) problems.push("Add at least one line.");
  t.lines.forEach((l, i) => {
    const a = accounts.get(l.accountId);
    if (!a || a.archived) problems.push(`Line ${i + 1}: pick an account.`);
    else if (a.id === t.bankAccountId) problems.push(`Line ${i + 1}: a line can't post to the same bank account.`);
    if (!funds.has(l.fundId)) problems.push(`Line ${i + 1}: pick a fund.`);
    if (!Number.isInteger(l.amount) || l.amount <= 0) problems.push(`Line ${i + 1}: the amount must be more than zero.`);
  });
  return problems;
}
