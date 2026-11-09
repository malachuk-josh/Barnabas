import { balanceEffect } from "./ledger";
import type { Account, Reconciliation, Transaction } from "./types";

/** Transactions that touch a bank account (directly, or as the other side of a transfer). */
export function touches(t: Transaction, account: Account) {
  return t.bankAccountId === account.id || t.lines.some((l) => l.accountId === account.id);
}

export type ReconcileState = {
  /** Opening balance plus every cleared transaction up to the statement date. */
  clearedBalance: number;
  statementBalance: number;
  /** Statement minus cleared: zero means the books agree with the bank. */
  difference: number;
  clearedCount: number;
  /** Still waiting to clear, up to the statement date (outstanding checks, deposits in transit). */
  outstanding: Transaction[];
  /** Everything up to the statement date that isn't locked by an earlier reconciliation. */
  open: Transaction[];
  canFinish: boolean;
};

export function reconcileState(account: Account, txns: Transaction[], rec: Pick<Reconciliation, "statementDate" | "statementBalance">): ReconcileState {
  let cleared = account.openingBalance ?? 0;
  let clearedCount = 0;
  const outstanding: Transaction[] = [];
  const open: Transaction[] = [];
  for (const t of txns) {
    if (!touches(t, account) || t.date > rec.statementDate) continue;
    if (t.cleared) {
      cleared += balanceEffect(t, account);
      clearedCount++;
    } else {
      outstanding.push(t);
    }
    if (!t.reconciliationId) open.push(t);
  }
  const difference = rec.statementBalance - cleared;
  return { clearedBalance: cleared, statementBalance: rec.statementBalance, difference, clearedCount, outstanding, open, canFinish: difference === 0 };
}

/** Locks every cleared transaction up to the statement date into the reconciliation. Returns how many. */
export function finishReconciliation(account: Account, txns: Transaction[], rec: Reconciliation): number {
  let locked = 0;
  for (const t of txns) {
    if (touches(t, account) && t.cleared && !t.reconciliationId && t.date <= rec.statementDate) {
      t.reconciliationId = rec.id;
      locked++;
    }
  }
  return locked;
}
