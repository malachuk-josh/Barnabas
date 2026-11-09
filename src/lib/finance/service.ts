import { z } from "zod";
import type { Leader } from "../auth/session";
import { churchData } from "../chms";
import { newId } from "../data/ids";
import { audit } from "../data/records";
import { copyBudget } from "./budget";
import { bankImportKeys, findDuplicate } from "./csv";
import { dueOccurrences } from "./giving";
import { validateTransaction } from "./ledger";
import { dollars } from "./money";
import { finishReconciliation as lockReconciled, reconcileState } from "./reconcile";
import { loadBooks, resetBooks, updateBooks } from "./store";
import { GIFT_METHODS, type Books, type Gift, type Transaction } from "./types";

/**
 * Every change to the church's finances goes through here: validated, applied under the books' lock,
 * and written to the audit log. Callers check the leader's permission first.
 */

export class FinanceError extends Error {}

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-08.");
const Cents = z.number().int().positive().max(100_000_000_00);

async function log(leader: Leader, action: string, detail: string, conversationId?: string) {
  await audit(leader, { action: `finance.${action}`, detail: detail.slice(0, 300), conversationId });
}

/* ---------- Budget ---------- */

export const BudgetInput = z.object({
  year: z.number().int().min(2000).max(2100),
  lines: z.array(z.object({
    accountId: z.string().min(1).max(40),
    annual: z.number().int().min(0).max(100_000_000_00),
    basis: z.enum(["annual", "monthly"]),
    timing: z.enum(["even", "seasonal"]).optional(),
    note: z.string().max(200).optional(),
  })).max(300),
  notes: z.string().max(4000),
});

export async function saveBudget(leader: Leader, input: z.infer<typeof BudgetInput>) {
  return updateBooks(leader.churchId, ["budgets"], async (books) => {
    const accounts = new Map(books.chart.accounts.map((a) => [a.id, a]));
    for (const l of input.lines) {
      const a = accounts.get(l.accountId);
      if (!a || (a.type !== "income" && a.type !== "expense")) throw new FinanceError("Budget lines must be income or expense accounts.");
    }
    const seen = new Set<string>();
    const lines = input.lines.filter((l) => (seen.has(l.accountId) ? false : (seen.add(l.accountId), true)));
    const budget = { year: input.year, lines, notes: input.notes, updatedAt: Date.now(), updatedBy: leader.leaderId };
    books.budgets = [...books.budgets.filter((b) => b.year !== input.year), budget].sort((a, b) => a.year - b.year);
    await log(leader, "budget.save", `${input.year}: ${lines.length} lines`);
    return budget;
  });
}

export async function copyBudgetYear(leader: Leader, from: number, to: number) {
  return updateBooks(leader.churchId, ["budgets"], async (books) => {
    const source = books.budgets.find((b) => b.year === from);
    if (!source) throw new FinanceError(`There's no ${from} budget to copy.`);
    if (books.budgets.some((b) => b.year === to)) throw new FinanceError(`A ${to} budget already exists. Edit it instead.`);
    const budget = copyBudget(source, to, leader.leaderId);
    books.budgets = [...books.budgets, budget].sort((a, b) => a.year - b.year);
    await log(leader, "budget.copy", `${from} -> ${to}`);
    return budget;
  });
}

/* ---------- Chart of accounts and funds ---------- */

export const AccountInput = z.object({
  number: z.string().regex(/^\d{3,6}$/, "Account numbers are 3 to 6 digits."),
  name: z.string().trim().min(1).max(80),
  type: z.enum(["asset", "liability", "income", "expense"]),
  group: z.string().trim().min(1).max(60),
  bank: z.boolean().optional(),
  openingBalance: z.number().int().optional(),
});

export async function addAccount(leader: Leader, input: z.infer<typeof AccountInput>) {
  return updateBooks(leader.churchId, ["chart"], async (books) => {
    if (books.chart.accounts.some((a) => a.number === input.number)) throw new FinanceError(`Account ${input.number} already exists.`);
    const account = { id: `acct_${input.number}`, ...input, bank: input.type === "asset" ? Boolean(input.bank) : undefined };
    books.chart.accounts = [...books.chart.accounts, account].sort((a, b) => a.number.localeCompare(b.number));
    await log(leader, "account.add", `${input.number} ${input.name}`);
    return account;
  });
}

export const FundInput = z.object({
  name: z.string().trim().min(1).max(60),
  restricted: z.boolean(),
  description: z.string().max(300).optional(),
  openingBalance: z.number().int().min(0).optional(),
});

export async function addFund(leader: Leader, input: z.infer<typeof FundInput>) {
  return updateBooks(leader.churchId, ["chart"], async (books) => {
    const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || newId("fund");
    if (books.chart.funds.some((f) => f.id === id || f.name.toLowerCase() === input.name.toLowerCase())) throw new FinanceError(`There's already a fund called ${input.name}.`);
    const general = books.chart.funds.find((f) => !f.restricted);
    const fund = { id, name: input.name, restricted: input.restricted, description: input.description, openingBalance: input.openingBalance ?? 0, incomeAccountId: general?.incomeAccountId ?? "acct_4000" };
    books.chart.funds = [...books.chart.funds, fund];
    await log(leader, "fund.add", input.name);
    return fund;
  });
}

/* ---------- Transactions ---------- */

export const TxnInput = z.object({
  date: ISO,
  description: z.string().trim().min(1).max(160),
  bankAccountId: z.string().min(1).max(40),
  direction: z.enum(["in", "out"]),
  reference: z.string().max(40).optional(),
  lines: z.array(z.object({
    accountId: z.string().min(1).max(40),
    fundId: z.string().min(1).max(40),
    amount: Cents,
    memo: z.string().max(160).optional(),
    partnerId: z.string().max(40).optional(),
  })).min(1).max(40),
});

export async function addTransaction(leader: Leader, input: z.infer<typeof TxnInput>, source: Transaction["source"] = "manual", conversationId?: string) {
  return updateBooks(leader.churchId, ["transactions"], async (books) => {
    const problems = validateTransaction(books.chart, input);
    if (problems.length) throw new FinanceError(problems.join(" "));
    const txn: Transaction = { id: newId("txn"), ...input, cleared: false, source, createdAt: Date.now(), createdBy: leader.leaderId };
    books.transactions.push(txn);
    await log(leader, "txn.add", `${txn.id} ${input.direction} ${dollars(input.lines.reduce((a, l) => a + l.amount, 0))} ${input.description}`, conversationId);
    return txn;
  });
}

export async function deleteTransaction(leader: Leader, id: string) {
  return updateBooks(leader.churchId, ["transactions"], async (books) => {
    const txn = books.transactions.find((t) => t.id === id);
    if (!txn) throw new FinanceError("That transaction wasn't found.");
    if (txn.reconciliationId) throw new FinanceError("That transaction is part of a finished reconciliation, so it can't be deleted.");
    if (txn.giftBatchId) throw new FinanceError("That deposit holds gift records. Delete the gifts in Giving instead.");
    books.transactions = books.transactions.filter((t) => t.id !== id);
    await log(leader, "txn.delete", `${id} ${txn.description}`);
    return txn;
  });
}

export async function setCleared(leader: Leader, ids: string[], cleared: boolean) {
  return updateBooks(leader.churchId, ["transactions"], async (books) => {
    let changed = 0;
    for (const t of books.transactions) {
      if (!ids.includes(t.id) || t.reconciliationId) continue;
      if (t.cleared !== cleared) {
        t.cleared = cleared;
        changed++;
      }
    }
    await log(leader, "txn.clear", `${changed} marked ${cleared ? "cleared" : "not cleared"}`);
    return changed;
  });
}

/* ---------- Reconciliation ---------- */

export const ReconInput = z.object({ bankAccountId: z.string().min(1).max(40), statementDate: ISO, statementBalance: z.number().int() });

export async function startReconciliation(leader: Leader, input: z.infer<typeof ReconInput>) {
  return updateBooks(leader.churchId, ["reconciliations"], async (books) => {
    const account = books.chart.accounts.find((a) => a.id === input.bankAccountId && a.bank);
    if (!account) throw new FinanceError("Pick a bank account.");
    const open = books.reconciliations.find((r) => r.bankAccountId === account.id && r.status === "open");
    if (open) {
      open.statementDate = input.statementDate;
      open.statementBalance = input.statementBalance;
      await log(leader, "recon.update", `${account.name} ${input.statementDate} ${dollars(input.statementBalance)}`);
      return open;
    }
    const rec = { id: newId("recon"), ...input, status: "open" as const };
    books.reconciliations.push(rec);
    await log(leader, "recon.start", `${account.name} ${input.statementDate} ${dollars(input.statementBalance)}`);
    return rec;
  });
}

export async function finishReconciliation(leader: Leader, id: string) {
  return updateBooks(leader.churchId, ["reconciliations", "transactions"], async (books) => {
    const rec = books.reconciliations.find((r) => r.id === id && r.status === "open");
    if (!rec) throw new FinanceError("That reconciliation isn't open.");
    const account = books.chart.accounts.find((a) => a.id === rec.bankAccountId)!;
    const state = reconcileState(account, books.transactions, rec);
    if (!state.canFinish) throw new FinanceError(`The books are ${dollars(Math.abs(state.difference))} ${state.difference > 0 ? "below" : "above"} the statement. Tick what cleared, or check the statement balance.`);
    const locked = lockReconciled(account, books.transactions, rec);
    rec.status = "finished";
    rec.finishedAt = Date.now();
    rec.finishedBy = leader.leaderId;
    await log(leader, "recon.finish", `${account.name} ${rec.statementDate}: ${locked} transactions`);
    return { rec, locked };
  });
}

/* ---------- CSV import ---------- */

export const ImportInput = z.object({
  bankAccountId: z.string().min(1).max(40),
  rows: z.array(z.object({
    date: ISO,
    description: z.string().trim().min(1).max(160),
    amount: z.number().int().refine((n) => n !== 0, "Amount can't be zero."),
    reference: z.string().max(40).optional(),
    accountId: z.string().min(1).max(40),
    fundId: z.string().min(1).max(40),
    /** From the preview, computed over the whole file (so unticking a row doesn't shift the others' keys). */
    importKey: z.string().regex(/^bank:[0-9a-f]{32}$/).optional(),
  })).min(1).max(1000),
  skipDuplicates: z.boolean().default(true),
});

export async function importTransactions(leader: Leader, input: z.infer<typeof ImportInput>) {
  return updateBooks(leader.churchId, ["transactions"], async (books) => {
    const added: Transaction[] = [];
    let skipped = 0;
    let alreadyImported = 0;
    const problems: string[] = [];
    // Every row gets a stable key; a key already in the books is never imported again, whatever the checkbox says.
    const computed = bankImportKeys(input.bankAccountId, input.rows);
    const keys = input.rows.map((r, i) => r.importKey ?? computed[i]);
    const existing = new Set(books.transactions.map((t) => t.importKey).filter(Boolean));
    input.rows.forEach((row, i) => {
      if (existing.has(keys[i])) {
        alreadyImported++;
        return;
      }
      if (input.skipDuplicates && findDuplicate(books.transactions, input.bankAccountId, row.date, row.amount)) {
        skipped++;
        return;
      }
      const t = {
        date: row.date,
        description: row.description,
        bankAccountId: input.bankAccountId,
        direction: row.amount > 0 ? ("in" as const) : ("out" as const),
        reference: row.reference,
        lines: [{ accountId: row.accountId, fundId: row.fundId, amount: Math.abs(row.amount) }],
      };
      const p = validateTransaction(books.chart, t);
      if (p.length) {
        problems.push(`Row ${i + 1}: ${p.join(" ")}`);
        return;
      }
      existing.add(keys[i]);
      added.push({ id: newId("txn"), ...t, cleared: true, source: "import", importKey: keys[i], createdAt: Date.now(), createdBy: leader.leaderId });
    });
    if (problems.length) throw new FinanceError(problems.slice(0, 5).join(" "));
    books.transactions.push(...added);
    await log(leader, "import", `${added.length} imported, ${skipped} duplicates skipped, ${alreadyImported} already imported`);
    return { added: added.length, skipped, alreadyImported };
  });
}

/* ---------- Giving ---------- */

export const GiftInput = z.object({
  date: ISO,
  personId: z.string().max(40).optional(),
  donorName: z.string().trim().max(100).optional(),
  amount: Cents,
  fundId: z.string().min(1).max(40),
  method: z.enum(GIFT_METHODS),
  checkNumber: z.string().max(20).optional(),
});

export const GiftBatchInput = z.object({
  depositDate: ISO,
  bankAccountId: z.string().min(1).max(40).optional(),
  description: z.string().trim().max(160).optional(),
  gifts: z.array(GiftInput).min(1).max(500),
});

async function donorFor(personId: string | undefined, name: string | undefined) {
  if (personId) {
    const p = await churchData().getPerson(personId);
    if (!p) throw new FinanceError(`No one with id ${personId} is in the directory.`);
    return { personId: p.id, donorName: p.name };
  }
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (!n) throw new FinanceError("Each gift needs a donor: pick someone from the directory or type a name.");
  return { personId: undefined, donorName: n };
}

type Donor = { personId?: string; donorName: string };
type GiftRow = Omit<z.infer<typeof GiftInput>, "personId" | "donorName"> & Donor & { recurringId?: string; importKey?: string };

/** Adds gifts to the books and posts them as one deposit, with a line per fund. */
function postGifts(books: Books, leader: Leader, input: { depositDate: string; bankAccountId?: string; description?: string }, rows: GiftRow[], source: Transaction["source"]) {
  const bank = books.chart.accounts.find((a) => a.id === (input.bankAccountId ?? "") && a.bank) ?? books.chart.accounts.find((a) => a.bank && !a.archived);
  if (!bank) throw new FinanceError("Add a bank account first.");
  const funds = new Map(books.chart.funds.map((f) => [f.id, f]));
  for (const g of rows) if (!funds.has(g.fundId)) throw new FinanceError(`Unknown fund ${g.fundId}.`);
  const batchId = newId("batch");
  const txnId = newId("txn");
  const now = Date.now();
  const gifts: Gift[] = rows.map((g) => ({
    id: newId("gift"),
    date: g.date,
    personId: g.personId,
    donorName: g.donorName,
    amount: g.amount,
    fundId: g.fundId,
    method: g.method,
    checkNumber: g.checkNumber || undefined,
    recurringId: g.recurringId,
    importKey: g.importKey,
    batchId,
    txnId,
    createdAt: now,
    createdBy: leader.leaderId,
  }));
  const perFund = new Map<string, number>();
  for (const g of gifts) perFund.set(g.fundId, (perFund.get(g.fundId) ?? 0) + g.amount);
  const txn: Transaction = {
    id: txnId,
    date: input.depositDate,
    description: input.description || (gifts.length === 1 ? "Gift deposit" : `Offering deposit (${gifts.length} gifts)`),
    bankAccountId: bank.id,
    direction: "in",
    lines: [...perFund].map(([fundId, amount]) => ({ accountId: funds.get(fundId)!.incomeAccountId, fundId, amount })),
    cleared: false,
    source,
    giftBatchId: batchId,
    createdAt: now,
    createdBy: leader.leaderId,
  };
  books.gifts.push(...gifts);
  books.transactions.push(txn);
  return { batchId, txn, gifts, total: gifts.reduce((a, g) => a + g.amount, 0) };
}

/** Records gifts (one, or a Sunday batch) and posts them as one deposit. */
export async function recordGifts(leader: Leader, input: z.infer<typeof GiftBatchInput>, opts: { source?: Transaction["source"]; conversationId?: string } = {}) {
  const donors = await Promise.all(input.gifts.map((g) => donorFor(g.personId, g.donorName)));
  const rows: GiftRow[] = input.gifts.map((g, i) => ({ ...g, ...donors[i] }));
  return updateBooks(leader.churchId, ["gifts", "transactions"], async (books) => {
    const result = postGifts(books, leader, input, rows, opts.source ?? "giving");
    // The audit log notes the batch, not who gave.
    await log(leader, "gifts.record", `${result.gifts.length} gift${result.gifts.length > 1 ? "s" : ""}, ${dollars(result.total)}, deposit ${result.txn.id}`, opts.conversationId);
    return result;
  });
}

export async function deleteGift(leader: Leader, id: string) {
  return updateBooks(leader.churchId, ["gifts", "transactions"], async (books) => {
    const gift = books.gifts.find((g) => g.id === id);
    if (!gift) throw new FinanceError("That gift wasn't found.");
    const txn = books.transactions.find((t) => t.id === gift.txnId);
    if (txn?.reconciliationId) throw new FinanceError("Its deposit is part of a finished reconciliation, so the gift can't be deleted. Record a correction instead.");
    books.gifts = books.gifts.filter((g) => g.id !== id);
    if (txn) {
      const line = txn.lines.find((l) => l.fundId === gift.fundId);
      if (line) line.amount -= gift.amount;
      txn.lines = txn.lines.filter((l) => l.amount > 0);
      if (!txn.lines.length) books.transactions = books.transactions.filter((t) => t.id !== txn.id);
    }
    await log(leader, "gift.delete", `${id} ${dollars(gift.amount)}`);
    return gift;
  });
}

export const RecurringInput = z.object({
  personId: z.string().max(40).optional(),
  donorName: z.string().trim().max(100).optional(),
  amount: Cents,
  fundId: z.string().min(1).max(40),
  method: z.enum(GIFT_METHODS),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  startDate: ISO,
});

export async function addRecurring(leader: Leader, input: z.infer<typeof RecurringInput>) {
  const donor = await donorFor(input.personId, input.donorName);
  return updateBooks(leader.churchId, ["recurring"], async (books) => {
    if (!books.chart.funds.some((f) => f.id === input.fundId)) throw new FinanceError("Pick a fund.");
    const rec = { id: newId("rec"), ...input, ...donor, active: true };
    books.recurring.push(rec);
    await log(leader, "recurring.add", `${rec.id} ${input.frequency} ${dollars(input.amount)}`);
    return rec;
  });
}

export async function setRecurringActive(leader: Leader, id: string, active: boolean) {
  return updateBooks(leader.churchId, ["recurring"], async (books) => {
    const rec = books.recurring.find((r) => r.id === id);
    if (!rec) throw new FinanceError("That recurring gift wasn't found.");
    rec.active = active;
    await log(leader, "recurring.set", `${id} ${active ? "resumed" : "paused"}`);
    return rec;
  });
}

/** Records every recurring gift that has come due, as one online/ACH deposit. */
export async function recordDueRecurring(leader: Leader, asOf: string) {
  return updateBooks(leader.churchId, ["gifts", "transactions", "recurring"], async (books) => {
    const due = books.recurring.flatMap((r) => dueOccurrences(r, asOf).map((date) => ({ r, date })));
    if (!due.length) return { recorded: 0, total: 0 };
    const rows: GiftRow[] = due.map(({ r, date }) => ({ date, personId: r.personId, donorName: r.donorName, amount: r.amount, fundId: r.fundId, method: r.method, recurringId: r.id }));
    const result = postGifts(books, leader, { depositDate: asOf, description: "Online and ACH giving payout" }, rows, "giving");
    for (const { r, date } of due) if (!r.lastRecorded || date > r.lastRecorded) r.lastRecorded = date;
    await log(leader, "recurring.record", `${due.length} recurring gifts, ${dollars(result.total)}`);
    return { recorded: due.length, total: result.total };
  });
}

/* ---------- Missions ---------- */

export const PartnerInput = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["missionary", "organization"]),
  field: z.string().trim().min(1).max(100),
  type: z.string().trim().max(80),
  supportLevel: z.enum(["full", "partial", "project"]),
  monthly: z.number().int().min(0).max(10_000_000),
  pledgeStart: ISO,
  pledgeEnd: ISO.optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export async function savePartner(leader: Leader, input: z.infer<typeof PartnerInput>, id?: string) {
  return updateBooks(leader.churchId, ["missions"], async (books) => {
    const data = { ...input, pledgeEnd: input.pledgeEnd || undefined };
    if (id) {
      const p = books.missions.partners.find((x) => x.id === id);
      if (!p) throw new FinanceError("That partner wasn't found.");
      Object.assign(p, data);
      await log(leader, "partner.update", p.name);
      return p;
    }
    const partner = { id: newId("partner"), ...data, updates: [] };
    books.missions.partners.push(partner);
    await log(leader, "partner.add", partner.name);
    return partner;
  });
}

export async function addPrayerUpdate(leader: Leader, partnerId: string, date: string, text: string) {
  return updateBooks(leader.churchId, ["missions"], async (books) => {
    const p = books.missions.partners.find((x) => x.id === partnerId);
    if (!p) throw new FinanceError("That partner wasn't found.");
    const update = { id: newId("upd"), date, text: text.trim().slice(0, 1000) };
    p.updates = [update, ...p.updates];
    await log(leader, "partner.update-log", p.name);
    return update;
  });
}

export const PledgeInput = z.object({ personId: z.string().max(40).optional(), donorName: z.string().trim().max(100).optional(), amount: Cents, campaignId: z.string().max(40).optional() });

export async function addPledge(leader: Leader, input: z.infer<typeof PledgeInput>) {
  const donor = await donorFor(input.personId, input.donorName);
  return updateBooks(leader.churchId, ["missions"], async (books) => {
    if (input.campaignId && !books.missions.campaigns.some((c) => c.id === input.campaignId)) throw new FinanceError("Pick a campaign.");
    const pledge = { id: newId("pledge"), ...donor, amount: input.amount, campaignId: input.campaignId, createdAt: Date.now() };
    books.missions.pledges.push(pledge);
    await log(leader, "pledge.add", `${pledge.id} ${dollars(input.amount)}`);
    return pledge;
  });
}

export const CampaignInput = z.object({ name: z.string().trim().min(1).max(100), goal: Cents, start: ISO, end: ISO, note: z.string().max(300).optional() });

export async function addCampaign(leader: Leader, input: z.infer<typeof CampaignInput>) {
  if (input.end < input.start) throw new FinanceError("The campaign ends before it starts.");
  return updateBooks(leader.churchId, ["missions"], async (books) => {
    const campaign = { id: newId("camp"), ...input };
    books.missions.campaigns.push(campaign);
    await log(leader, "campaign.add", `${input.name} goal ${dollars(input.goal)}`);
    return campaign;
  });
}

/* ---------- Demo data ---------- */

export async function clearDemoData(leader: Leader): Promise<Books> {
  const books = await loadBooks(leader.churchId);
  if (!books.meta.demo) throw new FinanceError("There's no demo data to clear.");
  const fresh = await resetBooks(leader.churchId);
  await log(leader, "demo.clear", "Cleared demo finance data; started fresh books");
  return fresh;
}

/* ---------- Giving import (ChurchTrac contributions CSV) ---------- */

export type ImportGift = { date: string; personId?: string; donorName: string; amount: number; fundId: string; method: z.infer<typeof GiftInput>["method"]; checkNumber?: string; importKey: string };

/**
 * Imports gifts from a giving CSV, one deposit per date, skipping any row whose stable key is already in the
 * books (so re-importing an overlapping export never double-counts). With `dryRun`, only the counts.
 */
export async function importGifts(leader: Leader, rows: ImportGift[], opts: { dryRun: boolean; bankAccountId?: string; newFunds?: { id: string; name: string }[] }) {
  return updateBooks(leader.churchId, opts.dryRun ? [] : ["chart", "gifts", "transactions"], async (books) => {
    const existing = new Set(books.gifts.map((g) => g.importKey).filter(Boolean));
    const fresh = rows.filter((r) => !existing.has(r.importKey));
    const total = fresh.reduce((a, r) => a + r.amount, 0);
    const byDate = new Map<string, ImportGift[]>();
    for (const r of fresh) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    const created = { gifts: [] as string[], txns: [] as string[], funds: [] as string[] };
    if (opts.dryRun) return { dryRun: true, add: fresh.length, alreadyImported: rows.length - fresh.length, deposits: byDate.size, total, created };
    // Funds named in the file that the books don't have yet (restricted, posting to general giving income).
    for (const f of opts.newFunds ?? []) {
      if (books.chart.funds.some((x) => x.id === f.id)) continue;
      const income = books.chart.funds.find((x) => !x.restricted)?.incomeAccountId ?? books.chart.accounts.find((a) => a.type === "income")!.id;
      books.chart.funds.push({ id: f.id, name: f.name, restricted: true, incomeAccountId: income, openingBalance: 0, description: "Created by the migration tool from the giving file." });
      created.funds.push(f.id);
    }
    for (const [date, list] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
      const r = postGifts(books, leader, { depositDate: date, bankAccountId: opts.bankAccountId, description: `Imported giving (${list.length} gift${list.length > 1 ? "s" : ""})` }, list, "import");
      created.gifts.push(...r.gifts.map((g) => g.id));
      created.txns.push(r.txn.id);
    }
    await log(leader, "gifts.import", `${fresh.length} gifts imported in ${byDate.size} deposits, ${dollars(total)}, ${rows.length - fresh.length} already imported`);
    return { dryRun: false, add: fresh.length, alreadyImported: rows.length - fresh.length, deposits: byDate.size, total, created };
  });
}

/** Undo for a migration batch: removes its gifts and their deposits, and the funds it created if nothing else uses them. */
export async function removeImportedGifts(leader: Leader, created: { gifts: string[]; txns: string[]; funds: string[] }) {
  return updateBooks(leader.churchId, ["chart", "gifts", "transactions"], async (books) => {
    const txns = new Set(created.txns);
    if (books.transactions.some((t) => txns.has(t.id) && t.reconciliationId)) throw new FinanceError("Some of these deposits are in a finished reconciliation, so this import can't be undone. Record corrections instead.");
    const gifts = new Set(created.gifts);
    const before = books.gifts.length;
    books.gifts = books.gifts.filter((g) => !gifts.has(g.id));
    books.transactions = books.transactions.filter((t) => !txns.has(t.id));
    const used = new Set([...books.gifts.map((g) => g.fundId), ...books.transactions.flatMap((t) => t.lines.map((l) => l.fundId))]);
    books.chart.funds = books.chart.funds.filter((f) => !created.funds.includes(f.id) || used.has(f.id));
    await log(leader, "gifts.import.undo", `${before - books.gifts.length} gifts removed`);
    return { gifts: before - books.gifts.length };
  });
}
