import { config } from "../config";
import { audit, saveDraft, type Draft } from "../data/records";
import { newId } from "../data/ids";
import { today } from "../dates";
import { loadEvents, updateEvents } from "../events/store";
import { onlinePayment } from "../events/service";
import { dollars } from "../finance/money";
import { flagDispute, recordEventPayment, recordOnlineGift, recordPayout, reverseOnlineGift, stripeActor } from "../finance/online";
import { loadBooks, updateBooks } from "../finance/store";
import type { Gift } from "../finance/types";
import { normalizeEmail } from "../messages/phone";
import { matchGiver } from "../people/online";
import { quote } from "../language";
import { getLeaderRecord } from "../team";
import type { Stripe, StripePort } from "./client";
import { FREQUENCIES, type Frequency } from "./checkout";
import { loadOnlineSettings, onceForEvent, savePayouts } from "./store";

/**
 * Stripe's webhook events, after the route has checked the signature. Each event runs once (by event id),
 * and every write below also carries a stable key from Stripe's ids, so even a replay with a new event id
 * never records a gift, a fee, a refund or a payout twice.
 */

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "invoice.paid",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "payout.paid",
] as const;

export type HandleResult = { replay: boolean; outcome: string };

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
const dayOf = (unix: number) => today(new Date(unix * 1000));
const freq = (v: unknown): Frequency => ((FREQUENCIES as readonly string[]).includes(String(v)) ? (v as Frequency) : "once");
const cents = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

export async function handleStripeEvent(event: Stripe.Event, port: StripePort): Promise<HandleResult> {
  const run = await onceForEvent(event.id, () => dispatch(event, port));
  if (run.replay) return { replay: true, outcome: "already handled" };
  return { replay: false, outcome: run.result };
}

async function dispatch(event: Stripe.Event, port: StripePort): Promise<string> {
  const church = config.churchId;
  const testMode = !event.livemode;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return sessionPaid(church, event.data.object, port, testMode, event.type === "checkout.session.async_payment_succeeded");
    case "checkout.session.async_payment_failed": {
      const s = event.data.object;
      if (s.metadata?.barnabas === "event" && s.metadata.registrationId) {
        await onlinePayment(church, s.metadata.registrationId, "failed", { sessionId: s.id });
        return "event bank payment failed; spot released";
      }
      if (s.metadata?.barnabas === "gift") {
        await audit(stripeActor(church), { action: "finance.online.failed", detail: `Bank transfer for checkout ${s.id} failed; nothing recorded` });
        return "gift bank transfer failed; nothing recorded";
      }
      return "ignored";
    }
    case "checkout.session.expired": {
      const s = event.data.object;
      if (s.metadata?.barnabas === "event" && s.metadata.registrationId) {
        await onlinePayment(church, s.metadata.registrationId, "expired", { sessionId: s.id });
        return "event checkout expired; spot released";
      }
      return "ignored";
    }
    case "invoice.paid":
      return invoicePaid(church, event.data.object, port, testMode);
    case "charge.refunded":
      return chargeRefunded(church, event.data.object, dayOf(event.created));
    case "charge.dispute.created": {
      const d = event.data.object;
      const gift = await flagDispute(stripeActor(church), idOf(d.charge) ?? "", idOf(d.payment_intent), true);
      return gift ? "dispute flagged on gift" : "dispute on a payment that isn't a gift";
    }
    case "charge.dispute.closed": {
      const d = event.data.object;
      if (d.status === "lost") {
        const r = await reverseOnlineGift(stripeActor(church), { chargeId: idOf(d.charge), paymentIntentId: idOf(d.payment_intent), cumulative: d.amount, kind: "dispute", key: `stripe-dispute:${d.id}`, date: dayOf(event.created) });
        return r.reversal ? "lost dispute reversed" : `dispute lost: ${r.reason}`;
      }
      await flagDispute(stripeActor(church), idOf(d.charge) ?? "", idOf(d.payment_intent), false);
      return `dispute ${d.status}`;
    }
    case "payout.paid": {
      const p = event.data.object;
      const facts = await port.payoutFacts(p.id);
      const r = await recordPayout(stripeActor(church), { id: facts.id, amount: facts.amount, arrivalDate: facts.arrivalDate, gross: facts.gross, fees: facts.fees, refunds: facts.refunds, count: facts.count });
      await savePayouts(church, [{ ...facts, recordedAt: Date.now(), txnId: r.txn?.id }]);
      return r.duplicate ? "payout already in the books" : "payout recorded";
    }
    default:
      return "ignored";
  }
}

async function sessionPaid(church: string, s: Stripe.Checkout.Session, port: StripePort, testMode: boolean, asyncSuccess: boolean): Promise<string> {
  const kind = s.metadata?.barnabas;
  if (kind === "event") {
    const regId = s.metadata?.registrationId;
    if (!regId) return "event session without a registration";
    const pi = idOf(s.payment_intent);
    if (s.payment_status !== "paid" && !asyncSuccess) {
      await onlinePayment(church, regId, "processing", { sessionId: s.id, paymentIntentId: pi ?? undefined });
      return "event payment processing (bank transfer)";
    }
    const reg = await onlinePayment(church, regId, "paid", { sessionId: s.id, paymentIntentId: pi ?? undefined });
    if (pi && reg) {
      const facts = await port.paymentFacts(pi);
      const ev = (await loadEvents(church)).events.find((e) => e.id === reg.eventId);
      if (facts) await recordEventPayment(stripeActor(church), { date: dayOf(facts.created), paymentIntentId: pi, amount: facts.gross, fee: facts.fee, eventTitle: ev?.title ?? "event", registrationId: regId });
    }
    return reg ? "registration marked paid" : "registration not found";
  }
  if (kind !== "gift") return "ignored";
  // Recurring gifts are recorded from each invoice.paid (the first one included).
  if (s.mode === "subscription") return "recurring gift set up; payments arrive as invoices";
  if (s.payment_status !== "paid" && !asyncSuccess) return "gift pending (bank transfer clears in a few days)";
  const pi = idOf(s.payment_intent);
  if (!pi) return "gift session without a payment";
  return recordGiftPayment(church, port, pi, {
    fundId: s.metadata?.fundId ?? "",
    coveredFee: cents(s.metadata?.coveredFee),
    email: s.customer_details?.email ?? s.customer_email ?? null,
    name: s.customer_details?.name ?? null,
    online: { provider: "stripe", paymentIntentId: pi, checkoutSessionId: s.id, frequency: "once", testMode },
  });
}

async function invoicePaid(church: string, inv: Stripe.Invoice, port: StripePort, testMode: boolean): Promise<string> {
  const meta = inv.parent?.subscription_details?.metadata ?? null;
  if (meta?.barnabas !== "gift") return "ignored";
  if (!inv.amount_paid) return "nothing paid";
  const pi = await port.invoicePaymentIntent(inv.id);
  if (!pi) return "invoice without a payment";
  return recordGiftPayment(church, port, pi, {
    fundId: meta.fundId ?? "",
    coveredFee: cents(meta.coveredFee),
    email: inv.customer_email ?? null,
    name: inv.customer_name ?? null,
    online: { provider: "stripe", paymentIntentId: pi, invoiceId: inv.id, subscriptionId: idOf(inv.parent?.subscription_details?.subscription) ?? undefined, frequency: freq(meta.frequency), testMode },
  });
}

async function recordGiftPayment(church: string, port: StripePort, paymentIntentId: string, info: { fundId: string; coveredFee: number; email: string | null; name: string | null; online: Gift["online"] & object }): Promise<string> {
  const actor = stripeActor(church);
  // Already in the books (a replay with a new event id): don't touch People or Drafts again.
  const books = await loadBooks(church);
  if (books.gifts.some((g) => g.importKey === `stripe:${paymentIntentId}`)) return "gift already in the books";
  const facts = await port.paymentFacts(paymentIntentId);
  if (!facts) return "payment not found";
  const email = info.email ?? facts.email;
  const giver = await matchGiver(actor, { email, name: info.name ?? facts.name });
  const { gift, duplicate } = await recordOnlineGift(actor, {
    date: dayOf(facts.created),
    personId: giver.personId,
    donorName: giver.donorName,
    amount: facts.gross,
    fee: facts.fee,
    coveredFee: Math.min(info.coveredFee, facts.gross),
    fundId: info.fundId,
    method: facts.method === "us_bank_account" ? "ach" : "online",
    online: { ...info.online, chargeId: facts.chargeId ?? undefined },
  });
  if (duplicate) return "gift already in the books";
  await draftThankYou(church, gift, normalizeEmail(email)).catch((err) => console.error("[barnabas] thank-you draft failed", err instanceof Error ? err.message : "unknown"));
  return giver.created ? "gift recorded; new person added for review" : giver.ambiguous ? "gift recorded; email matches several people (not linked)" : "gift recorded";
}

async function chargeRefunded(church: string, charge: Stripe.Charge, date: string): Promise<string> {
  const actor = stripeActor(church);
  const pi = idOf(charge.payment_intent);
  const r = await reverseOnlineGift(actor, { chargeId: charge.id, paymentIntentId: pi, cumulative: charge.amount_refunded, kind: "refund", key: `stripe-refund:${charge.id}:${charge.amount_refunded}`, date });
  if (r.reversal) return "refund reversed";
  if (r.reason === "no matching online gift" && pi) {
    // An event registration paid online: mark it refunded (and take the income back out) when it's refunded in full.
    const book = await loadEvents(church);
    const reg = book.registrations.find((x) => x.payment.paymentIntentId === pi);
    if (reg) {
      await refundEvent(church, reg.id, pi, charge, date);
      return "event payment refunded";
    }
  }
  return `refund not recorded: ${r.reason}`;
}

async function refundEvent(church: string, regId: string, pi: string, charge: Stripe.Charge, date: string) {
  if (charge.refunded) {
    await updateEvents(church, ["registrations"], (b) => {
      const r = b.registrations.find((x) => x.id === regId);
      if (r && r.payment.status === "paid") r.payment = { ...r.payment, status: "refunded", markedBy: "Refunded in Stripe", markedAt: Date.now() };
    });
  }
  const key = `stripe-refund:${charge.id}:${charge.amount_refunded}`;
  await updateBooks(church, ["transactions"], (books) => {
    if (books.transactions.some((t) => t.importKey === key)) return;
    const original = books.transactions.find((t) => t.importKey === `stripe:${pi}`);
    if (!original) return;
    const already = books.transactions.filter((t) => t.importKey?.startsWith(`stripe-refund:${charge.id}:`)).reduce((a, t) => a + t.lines.reduce((x, l) => x + l.amount, 0), 0);
    const delta = charge.amount_refunded - already;
    if (delta <= 0) return;
    books.transactions.push({ ...original, id: newId("txn"), date, description: "Refund of an event registration", direction: "out", lines: original.lines.map((l) => ({ ...l, amount: delta })), importKey: key, createdAt: Date.now(), createdBy: "stripe-webhook" });
  });
  await audit(stripeActor(church), { action: "finance.online.event-refund", detail: `${regId} ${dollars(charge.amount_refunded)}` });
}

/**
 * When the church turned it on, a thank-you email for the gift goes into a leader's Drafts for review.
 * Barnabas never sends it; a leader taps Send.
 */
export async function draftThankYou(church: string, gift: Gift, email: string | null) {
  const settings = await loadOnlineSettings(church);
  if (!settings.thankYou.on || !settings.thankYou.leaderId || !email) return null;
  const owner = await getLeaderRecord(church, settings.thankYou.leaderId);
  if (!owner) return null;
  const books = await loadBooks(church);
  const fund = books.chart.funds.find((f) => f.id === gift.fundId)?.name ?? "the church";
  const churchName = config.churchName.replace(/\s*\(demo\)\s*$/i, "");
  const first = gift.donorName.split(/\s+/)[0] || "friend";
  const text = [
    `Dear ${first},`,
    "",
    `Thank you for your gift of ${dollars(gift.amount)} to the ${fund} at ${churchName}. We thank God for you and for your fellowship with us in the gospel.`,
    "",
    quote("giving"),
    "",
    "Your gift will appear on your year-end giving statement.",
    "",
    `In Christ,`,
    owner.name,
  ].join("\n");
  const leader = { churchId: church, leaderId: owner.leaderId, name: owner.name, email: owner.email, role: owner.role };
  const draft: Draft = {
    id: newId("draft"),
    leaderId: owner.leaderId,
    conversationId: `online-gift:${gift.id}`,
    channel: "email",
    kind: "general",
    subject: `Thank you for your gift to ${churchName}`.slice(0, 120),
    baseText: text,
    recipients: [{ personId: gift.personId ?? `online:${gift.id}`, name: gift.donorName, language: "en", text, email }],
    status: "needs_review",
    createdAt: Date.now(),
  };
  await saveDraft(leader, draft);
  await audit(leader, { action: "draft.create", detail: `${draft.id} thank-you for online gift ${gift.id}` });
  return draft;
}
