import Stripe from "stripe";
import { stripeConfig, type StripeConfig } from "./config";

/**
 * The few Stripe calls Barnabas makes, behind one small interface so tests can use a fake. Barnabas only
 * creates hosted Checkout and Customer Portal sessions and reads payments and payouts: it never creates a
 * charge or a refund, and no card or bank number ever passes through it.
 */

export type PaymentFacts = {
  paymentIntentId: string;
  chargeId: string | null;
  /** What the giver paid, in cents. */
  gross: number;
  /** Stripe's processing fee, in cents (0 when Stripe hasn't settled it yet). */
  fee: number;
  net: number;
  /** "card" (cards, Apple Pay, Google Pay, Link) or "us_bank_account" (ACH). */
  method: string;
  email: string | null;
  name: string | null;
  created: number;
};

export type PayoutFacts = { id: string; amount: number; arrivalDate: string; status: string; gross: number; fees: number; refunds: number; count: number; automatic: boolean };

export interface StripePort {
  createCheckout(params: Stripe.Checkout.SessionCreateParams, idempotencyKey: string): Promise<{ id: string; url: string }>;
  /** The settled amounts for a payment (gross, fee, net) from its latest charge's balance transaction. */
  paymentFacts(paymentIntentId: string): Promise<PaymentFacts | null>;
  /** The PaymentIntent that paid a subscription invoice. */
  invoicePaymentIntent(invoiceId: string): Promise<string | null>;
  /** The Stripe customer behind a finished Checkout session (for the "manage my recurring gift" link). */
  checkoutCustomer(sessionId: string): Promise<string | null>;
  portalSession(customerId: string, returnUrl: string): Promise<string>;
  /** Gross, fees and refunds of the charges a payout paid out. */
  payoutFacts(payoutId: string): Promise<PayoutFacts>;
  recentPayouts(limit: number): Promise<PayoutFacts[]>;
}

const isoDay = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

export function sdk(cfg: StripeConfig): Stripe {
  return new Stripe(cfg.secretKey, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Barnabas" },
    ...(cfg.apiBase ? { host: cfg.apiBase.host, port: cfg.apiBase.port, protocol: cfg.apiBase.protocol } : {}),
  });
}

export class LiveStripe implements StripePort {
  private readonly s: Stripe;
  constructor(cfg: StripeConfig) {
    this.s = sdk(cfg);
  }

  async createCheckout(params: Stripe.Checkout.SessionCreateParams, idempotencyKey: string) {
    const session = await this.s.checkout.sessions.create(params, { idempotencyKey });
    if (!session.url) throw new Error("Stripe didn't return a Checkout address.");
    return { id: session.id, url: session.url };
  }

  async paymentFacts(paymentIntentId: string): Promise<PaymentFacts | null> {
    const pi = await this.s.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    const gross = charge?.amount ?? pi.amount_received ?? pi.amount;
    const fee = bt?.fee ?? 0;
    return {
      paymentIntentId: pi.id,
      chargeId: charge?.id ?? null,
      gross,
      fee,
      net: bt?.net ?? gross - fee,
      method: charge?.payment_method_details?.type ?? pi.payment_method_types?.[0] ?? "card",
      email: charge?.billing_details?.email ?? pi.receipt_email ?? null,
      name: charge?.billing_details?.name ?? null,
      created: charge?.created ?? pi.created,
    };
  }

  async invoicePaymentIntent(invoiceId: string) {
    const list = await this.s.invoicePayments.list({ invoice: invoiceId, limit: 10 });
    const paid = list.data.find((p) => p.status === "paid") ?? list.data[0];
    const pi = paid?.payment?.payment_intent;
    return typeof pi === "string" ? pi : (pi?.id ?? null);
  }

  async checkoutCustomer(sessionId: string) {
    const session = await this.s.checkout.sessions.retrieve(sessionId);
    const c = session.customer;
    return typeof c === "string" ? c : (c?.id ?? null);
  }

  async portalSession(customerId: string, returnUrl: string) {
    const p = await this.s.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return p.url;
  }

  private async summarize(payout: Stripe.Payout): Promise<PayoutFacts> {
    let gross = 0;
    let fees = 0;
    let refunds = 0;
    let count = 0;
    for await (const bt of this.s.balanceTransactions.list({ payout: payout.id, limit: 100 })) {
      if (bt.type === "payout") continue;
      if (bt.type === "charge" || bt.type === "payment") {
        gross += bt.amount;
        count++;
      } else if (bt.type === "refund" || bt.type === "payment_refund" || bt.type === "adjustment") refunds += -bt.amount;
      fees += bt.fee;
    }
    return { id: payout.id, amount: payout.amount, arrivalDate: isoDay(payout.arrival_date), status: payout.status, gross, fees, refunds, count, automatic: payout.automatic };
  }

  async payoutFacts(payoutId: string) {
    return this.summarize(await this.s.payouts.retrieve(payoutId));
  }

  async recentPayouts(limit: number) {
    const list = await this.s.payouts.list({ limit: Math.min(limit, 20) });
    const out: PayoutFacts[] = [];
    for (const p of list.data) out.push(p.status === "paid" ? await this.summarize(p) : { id: p.id, amount: p.amount, arrivalDate: isoDay(p.arrival_date), status: p.status, gross: 0, fees: 0, refunds: 0, count: 0, automatic: p.automatic });
    return out;
  }
}

let override: StripePort | null = null;

/** The Stripe client, or null when Stripe isn't connected. Tests install a fake with `setStripePort`. */
export function stripePort(): StripePort | null {
  if (override) return override;
  const cfg = stripeConfig();
  return cfg ? new LiveStripe(cfg) : null;
}

export function setStripePort(port: StripePort | null) {
  override = port;
}

/** Verifies a webhook's Stripe-Signature against the raw body. Throws when it doesn't match or is stale. */
export function verifyWebhook(rawBody: string, signature: string, secret: string, tolerance = 300): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret, tolerance);
}

export type { Stripe };
