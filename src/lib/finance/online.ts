import type { Leader } from "../auth/session";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { dollars } from "./money";
import { FinanceError, postGifts } from "./service";
import { loadBooks, updateBooks } from "./store";
import type { Account, Books, Gift, GiftMethod, OnlineRef, Transaction } from "./types";

/**
 * Online giving in the books. Stripe holds the money between a gift and the payout to the bank, so online
 * gifts are deposited into a "Stripe balance" clearing account (a bank-type account the treasurer can
 * reconcile against Stripe's dashboard):
 *
 *   gift      Stripe balance  <- income (the gift's fund), the gross the giver paid
 *   fee       Stripe balance  -> Bank and processing fees (same fund), Stripe's fee
 *   refund    Stripe balance  -> income (the gift's fund), a reversing entry
 *   payout    Operating checking <- Stripe balance, a transfer; the bank import then flags the deposit
 *             as this payout, so it is never counted as gifts a second time
 *
 * Every entry carries a stable key from Stripe's ids, so a webhook delivered twice never posts twice.
 */

export const STRIPE_ACCOUNT_ID = "acct_1050";
export const FEE_ACCOUNT_ID = "acct_5620";

/** The audit identity for writes that come from Stripe's webhook. */
export const stripeActor = (churchId: string): Leader => ({ churchId, leaderId: "stripe-webhook", name: "Online giving (Stripe)", email: "", role: "system" });

async function log(leader: Leader, action: string, detail: string) {
  await audit(leader, { action: `finance.${action}`, detail: detail.slice(0, 300) });
}

/** Adds the Stripe clearing account (and the fees account) to the chart if the church doesn't have them. */
export function ensureStripeAccounts(books: Books): { stripe: Account; fees: Account } {
  let stripe = books.chart.accounts.find((a) => a.id === STRIPE_ACCOUNT_ID);
  if (!stripe) {
    stripe = { id: STRIPE_ACCOUNT_ID, number: "1050", name: "Stripe balance (online giving)", type: "asset", group: "Bank accounts", bank: true, openingBalance: 0 };
    books.chart.accounts = [...books.chart.accounts, stripe].sort((a, b) => a.number.localeCompare(b.number));
  }
  let fees = books.chart.accounts.find((a) => a.id === FEE_ACCOUNT_ID) ?? books.chart.accounts.find((a) => a.type === "expense" && /fee/i.test(a.name) && !a.archived);
  if (!fees) {
    fees = { id: FEE_ACCOUNT_ID, number: "5620", name: "Bank and processing fees", type: "expense", group: "Administration" };
    books.chart.accounts = [...books.chart.accounts, fees].sort((a, b) => a.number.localeCompare(b.number));
  }
  return { stripe, fees };
}

/** The bank account payouts arrive in: the first active bank account that isn't the Stripe balance. */
export function payoutBank(books: Books): Account | null {
  return books.chart.accounts.find((a) => a.bank && !a.archived && a.id !== STRIPE_ACCOUNT_ID) ?? null;
}

export const giftKey = (paymentIntentId: string) => `stripe:${paymentIntentId}`;

export type OnlineGiftInput = {
  date: string;
  personId?: string;
  donorName: string;
  /** Gross, in cents. */
  amount: number;
  fee: number;
  coveredFee?: number;
  fundId: string;
  method: Extract<GiftMethod, "online" | "ach">;
  online: OnlineRef;
};

/**
 * Records one online gift through Finance's gift posting, with its fee, under the books' lock. Returns the
 * existing gift (and `duplicate: true`) when this Stripe payment is already in the books.
 */
export async function recordOnlineGift(actor: Leader, input: OnlineGiftInput): Promise<{ gift: Gift; duplicate: boolean }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new FinanceError("An online gift needs an amount above zero.");
  const key = giftKey(input.online.paymentIntentId);
  const result = await updateBooks(actor.churchId, ["chart", "gifts", "transactions"], (books) => {
    const existing = books.gifts.find((g) => g.importKey === key);
    if (existing) return { gift: existing, duplicate: true };
    const { stripe, fees } = ensureStripeAccounts(books);
    // A fund closed (or removed) since the giver started still gets the gift: it goes to that fund if it
    // exists, otherwise to the General fund, so money is never dropped.
    const fund = books.chart.funds.find((f) => f.id === input.fundId) ?? books.chart.funds.find((f) => !f.restricted) ?? books.chart.funds[0];
    const posted = postGifts(
      books,
      actor,
      { depositDate: input.date, bankAccountId: stripe.id, description: input.method === "ach" ? "Online gift (bank transfer)" : "Online gift" },
      [{ date: input.date, personId: input.personId, donorName: input.donorName, amount: input.amount, fundId: fund.id, method: input.method, importKey: key }],
      "stripe",
    );
    const gift = posted.gifts[0];
    const fee = Math.max(0, Math.min(input.fee, input.amount));
    Object.assign(gift, { fee, net: input.amount - fee, coveredFee: input.coveredFee || undefined, online: input.online });
    posted.txn.cleared = true;
    posted.txn.reference = input.online.paymentIntentId;
    if (fee > 0) {
      books.transactions.push({
        id: newId("txn"),
        date: input.date,
        description: "Stripe processing fee",
        bankAccountId: stripe.id,
        direction: "out",
        lines: [{ accountId: fees.id, fundId: fund.id, amount: fee, memo: `Fee on online gift ${gift.id}` }],
        cleared: true,
        source: "stripe",
        reference: input.online.paymentIntentId,
        importKey: `${key}:fee`,
        createdAt: Date.now(),
        createdBy: actor.leaderId,
      });
    }
    return { gift, duplicate: false };
  });
  if (!result.duplicate) await log(actor, "online.gift", `${result.gift.id} ${dollars(result.gift.amount)} fee ${dollars(result.gift.fee ?? 0)} ${input.online.testMode ? "(test mode)" : ""}`.trim());
  return result;
}

export type ReversalInput = {
  /** Find the original by its PaymentIntent or charge id. */
  paymentIntentId?: string | null;
  chargeId?: string | null;
  /** For refunds, the charge's total refunded so far (Stripe's amount_refunded); for a lost dispute, the amount. */
  cumulative: number;
  kind: "refund" | "dispute";
  /** Stable key for this reversal (the charge and cumulative refund, or the dispute id). */
  key: string;
  date: string;
};

/**
 * Posts a reversing entry for a refund or a lost dispute: a negative gift against the original (so giving
 * totals and the giver's statement go down) and the money out of the Stripe balance. Refunds are made in
 * the Stripe dashboard; Barnabas only records what Stripe reports.
 */
export async function reverseOnlineGift(actor: Leader, input: ReversalInput): Promise<{ reversal: Gift | null; reason?: string }> {
  const result = await updateBooks(actor.churchId, ["chart", "gifts", "transactions"], (books) => {
    if (books.gifts.some((g) => g.importKey === input.key)) return { reversal: null, reason: "already recorded" };
    const original = books.gifts.find((g) => !g.reversalOf && g.online && ((input.paymentIntentId && g.online.paymentIntentId === input.paymentIntentId) || (input.chargeId && g.online.chargeId === input.chargeId)));
    if (!original) return { reversal: null, reason: "no matching online gift" };
    const reversed = books.gifts.filter((g) => g.reversalOf === original.id).reduce((a, g) => a - g.amount, 0);
    const target = input.kind === "refund" ? Math.min(input.cumulative, original.amount) : Math.min(reversed + input.cumulative, original.amount);
    const delta = target - reversed;
    if (delta <= 0) return { reversal: null, reason: "nothing left to reverse" };
    const { stripe } = ensureStripeAccounts(books);
    const fund = books.chart.funds.find((f) => f.id === original.fundId) ?? books.chart.funds[0];
    const txnId = newId("txn");
    const batchId = newId("batch");
    const now = Date.now();
    const reversal: Gift = {
      id: newId("gift"),
      date: input.date,
      personId: original.personId,
      donorName: original.donorName,
      amount: -delta,
      fundId: fund.id,
      method: original.method,
      batchId,
      txnId,
      reversalOf: original.id,
      importKey: input.key,
      online: original.online,
      createdAt: now,
      createdBy: actor.leaderId,
    };
    const txn: Transaction = {
      id: txnId,
      date: input.date,
      description: input.kind === "refund" ? "Refund of an online gift" : "Disputed online gift (chargeback lost)",
      bankAccountId: stripe.id,
      direction: "out",
      lines: [{ accountId: fund.incomeAccountId, fundId: fund.id, amount: delta, memo: `Reverses gift ${original.id}` }],
      cleared: true,
      source: "stripe",
      reference: original.online?.chargeId ?? original.online?.paymentIntentId,
      giftBatchId: batchId,
      importKey: input.key,
      createdAt: now,
      createdBy: actor.leaderId,
    };
    books.gifts.push(reversal);
    books.transactions.push(txn);
    return { reversal };
  });
  if (result.reversal) await log(actor, `online.${input.kind}`, `${result.reversal.reversalOf} reversed ${dollars(-result.reversal.amount)}`);
  return result;
}

/** Flags (or clears) a dispute on an online gift. The money moves only if the dispute is lost. */
export async function flagDispute(actor: Leader, chargeId: string, paymentIntentId: string | null, disputed: boolean) {
  const gift = await updateBooks(actor.churchId, ["gifts"], (books) => {
    const g = books.gifts.find((x) => !x.reversalOf && x.online && (x.online.chargeId === chargeId || (paymentIntentId && x.online.paymentIntentId === paymentIntentId)));
    if (g) g.disputed = disputed || undefined;
    return g ?? null;
  });
  if (gift) await log(actor, "online.dispute", `${gift.id} ${disputed ? "disputed" : "dispute closed"}`);
  return gift;
}

export type PayoutRecord = { id: string; amount: number; arrivalDate: string; gross: number; fees: number; refunds: number; count: number };

export const payoutKey = (id: string) => `stripe-payout:${id}`;

/** Posts a Stripe payout as a transfer from the Stripe balance to the bank account it landed in. */
export async function recordPayout(actor: Leader, payout: PayoutRecord) {
  const result = await updateBooks(actor.churchId, ["chart", "transactions"], (books) => {
    const key = payoutKey(payout.id);
    const existing = books.transactions.find((t) => t.importKey === key);
    if (existing) return { txn: existing, duplicate: true };
    const { stripe } = ensureStripeAccounts(books);
    const bank = payoutBank(books);
    if (!bank) throw new FinanceError("Add a bank account for Stripe payouts first.");
    if (payout.amount <= 0) return { txn: null, duplicate: false };
    const general = books.chart.funds.find((f) => !f.restricted) ?? books.chart.funds[0];
    const txn: Transaction = {
      id: newId("txn"),
      date: payout.arrivalDate,
      description: "Stripe payout (online giving)",
      bankAccountId: bank.id,
      direction: "in",
      lines: [{ accountId: stripe.id, fundId: general.id, amount: payout.amount, memo: `${payout.count} payments, ${dollars(payout.gross)} gross, ${dollars(payout.fees)} fees` }],
      cleared: false,
      source: "stripe",
      reference: payout.id,
      importKey: key,
      createdAt: Date.now(),
      createdBy: actor.leaderId,
    };
    books.transactions.push(txn);
    return { txn, duplicate: false };
  });
  if (result.txn && !result.duplicate) await log(actor, "online.payout", `${payout.id} ${dollars(payout.amount)} on ${payout.arrivalDate}`);
  return result;
}

/** Opens or closes a fund for online giving (pastor or treasurer; the caller checks finance.edit). */
export async function setFundOnline(leader: Leader, fundId: string, online: boolean) {
  const fund = await updateBooks(leader.churchId, ["chart"], (books) => {
    const f = books.chart.funds.find((x) => x.id === fundId);
    if (!f) throw new FinanceError("That fund wasn't found.");
    f.online = online || undefined;
    return f;
  });
  await log(leader, "fund.online", `${fund.name} ${online ? "opened" : "closed"} for online giving`);
  return fund;
}

/** Funds open for online giving, for the public Give form: names and descriptions only. */
export async function onlineFunds(churchId: string): Promise<{ id: string; name: string; description?: string }[]> {
  const books = await loadBooks(churchId);
  return books.chart.funds.filter((f) => f.online).map((f) => ({ id: f.id, name: f.name, description: f.description }));
}

/** Online giving totals for a period: aggregates only (no names), for the Finance view and Barnabas. */
export function onlineTotals(books: Books, from: string, to: string) {
  const scoped = books.gifts.filter((g) => g.online && g.date >= from && g.date <= to);
  const gifts = scoped.filter((g) => !g.reversalOf);
  const reversals = scoped.filter((g) => g.reversalOf);
  const sumOf = (list: Gift[], f: (g: Gift) => number) => list.reduce((a, g) => a + f(g), 0);
  const byFund: Record<string, number> = {};
  for (const g of scoped) byFund[g.fundId] = (byFund[g.fundId] ?? 0) + g.amount;
  return {
    from,
    to,
    gross: sumOf(gifts, (g) => g.amount),
    fees: sumOf(gifts, (g) => g.fee ?? 0),
    refunded: -sumOf(reversals, (g) => g.amount),
    net: sumOf(gifts, (g) => g.net ?? g.amount) + sumOf(reversals, (g) => g.amount),
    count: gifts.length,
    recurringCount: gifts.filter((g) => g.online?.subscriptionId).length,
    card: sumOf(gifts.filter((g) => g.method === "online"), (g) => g.amount),
    ach: sumOf(gifts.filter((g) => g.method === "ach"), (g) => g.amount),
    coveredFees: sumOf(gifts, (g) => g.coveredFee ?? 0),
    disputed: gifts.filter((g) => g.disputed).length,
    byFund,
  };
}

export const EVENT_INCOME_ID = "acct_4600";

/**
 * An event registration paid online: income to "Event registrations" (General fund) in the Stripe balance,
 * with its fee. Not a gift, so it never appears on a giving statement. Keyed by the payment, like gifts.
 */
export async function recordEventPayment(actor: Leader, input: { date: string; paymentIntentId: string; amount: number; fee: number; eventTitle: string; registrationId: string }) {
  const key = `stripe:${input.paymentIntentId}`;
  const result = await updateBooks(actor.churchId, ["chart", "transactions"], (books) => {
    if (books.transactions.some((t) => t.importKey === key)) return { duplicate: true };
    const { stripe, fees } = ensureStripeAccounts(books);
    let income = books.chart.accounts.find((a) => a.id === EVENT_INCOME_ID);
    if (!income) {
      income = { id: EVENT_INCOME_ID, number: "4600", name: "Event registrations", type: "income", group: "Other income" };
      books.chart.accounts = [...books.chart.accounts, income].sort((a, b) => a.number.localeCompare(b.number));
    }
    const general = books.chart.funds.find((f) => !f.restricted) ?? books.chart.funds[0];
    const now = Date.now();
    books.transactions.push({
      id: newId("txn"), date: input.date, description: `Event registration: ${input.eventTitle}`.slice(0, 160), bankAccountId: stripe.id, direction: "in",
      lines: [{ accountId: income.id, fundId: general.id, amount: input.amount, memo: `Registration ${input.registrationId}` }],
      cleared: true, source: "stripe", reference: input.paymentIntentId, importKey: key, createdAt: now, createdBy: actor.leaderId,
    });
    const fee = Math.max(0, Math.min(input.fee, input.amount));
    if (fee > 0) {
      books.transactions.push({
        id: newId("txn"), date: input.date, description: "Stripe processing fee", bankAccountId: stripe.id, direction: "out",
        lines: [{ accountId: fees.id, fundId: general.id, amount: fee, memo: `Fee on registration ${input.registrationId}` }],
        cleared: true, source: "stripe", reference: input.paymentIntentId, importKey: `${key}:fee`, createdAt: now, createdBy: actor.leaderId,
      });
    }
    return { duplicate: false };
  });
  if (!result.duplicate) await log(actor, "online.event", `${input.registrationId} ${dollars(input.amount)}`);
  return result;
}
