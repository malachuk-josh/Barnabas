import { z } from "zod";
import { newId } from "../data/ids";
import { appUrl } from "../messages/config";
import { siteHosts } from "../site/routing";
import type { Stripe, StripePort } from "./client";
import { coverFee, GIFT_MAX, GIFT_MIN, type StripeConfig } from "./config";

/**
 * Hosted Stripe Checkout sessions for gifts and paid event registrations. Givers and registrants enter
 * their card or bank details on Stripe's page; Barnabas sends only the amount, the fund or event, and
 * where to come back to.
 */

export class CheckoutError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const FREQUENCIES = ["once", "weekly", "biweekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABELS: Record<Frequency, string> = { once: "One time", weekly: "Every week", biweekly: "Every two weeks", monthly: "Every month" };

/** Same-site paths only: "/give", "/s/give", "/m/give". Nothing that could send the giver elsewhere. */
const ReturnPath = z.string().max(120).regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/, "Bad return address.").default("/");

export const GiveInput = z.object({
  fundId: z.string().min(1, "Pick a fund.").max(40),
  amount: z.number({ message: "Enter an amount." }).int().min(GIFT_MIN, `The smallest online gift is $${GIFT_MIN / 100}.`).max(GIFT_MAX, `Online gifts are up to $${(GIFT_MAX / 100).toLocaleString("en-US")}. For a larger gift, please contact the church office.`),
  frequency: z.enum(FREQUENCIES).default("once"),
  coverFee: z.boolean().default(false),
  returnPath: ReturnPath,
});
export type GiveInputT = z.infer<typeof GiveInput>;

/**
 * The origin to send people back to: the address the request came in on, if it's this app or the
 * church's own domain (or localhost in development); otherwise APP_URL.
 */
export function returnOrigin(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const fallback = appUrl(env) ?? new URL(request.url).origin;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase().split(",")[0].trim();
  if (!host) return fallback;
  const bare = host.replace(/:\d+$/, "");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || (bare === "localhost" || bare === "127.0.0.1" ? "http" : "https");
  const own = appUrl(env) ? new URL(appUrl(env)!).hostname : null;
  const vercel = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((h) => h!.toLowerCase());
  const local = env.NODE_ENV !== "production" && (bare === "localhost" || bare === "127.0.0.1");
  if (local || bare === own || siteHosts(env.CHURCH_SITE_HOST).includes(bare) || vercel.includes(bare)) return `${proto}://${host}`;
  return fallback;
}

const withQuery = (path: string, q: string) => `${path}${path.includes("?") ? "&" : "?"}${q}`;

/** Builds the Checkout session for a gift. Exported for tests. */
export function giftSessionParams(input: GiveInputT, fund: { id: string; name: string }, ctx: { churchId: string; churchName: string; origin: string; cfg: Pick<StripeConfig, "feePercent" | "feeFixedCents"> }): Stripe.Checkout.SessionCreateParams {
  const covered = input.coverFee ? coverFee(input.amount, ctx.cfg) : 0;
  const total = input.amount + covered;
  const metadata = { barnabas: "gift", church: ctx.churchId, fundId: fund.id, frequency: input.frequency, coveredFee: String(covered), intended: String(input.amount) };
  const name = `Gift to ${fund.name}`.slice(0, 120);
  const description = `${ctx.churchName}${covered ? " (includes the processing fee)" : ""}`.slice(0, 300);
  const back = `${ctx.origin}${input.returnPath}`;
  const base = {
    allowed_payment_method_types: ["card", "us_bank_account"] as Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[],
    metadata,
    client_reference_id: newId("give"),
    // {CHECKOUT_SESSION_ID} is filled in by Stripe; it lets the thank-you page offer "manage my recurring gift".
    success_url: `${withQuery(back, "gift=thanks")}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: withQuery(back, "gift=cancelled"),
  };
  if (input.frequency === "once") {
    return {
      ...base,
      mode: "payment",
      submit_type: "donate",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: total, product_data: { name, description } } }],
      payment_intent_data: { description: name, metadata },
    };
  }
  const recurring = input.frequency === "monthly" ? { interval: "month" as const, interval_count: 1 } : { interval: "week" as const, interval_count: input.frequency === "biweekly" ? 2 : 1 };
  return {
    ...base,
    mode: "subscription",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: total, recurring, product_data: { name: `${name} (${FREQUENCY_LABELS[input.frequency].toLowerCase()})`, description } } }],
    subscription_data: { description: name, metadata },
    success_url: `${withQuery(back, "gift=thanks&recurring=1")}&session_id={CHECKOUT_SESSION_ID}`,
  };
}

export async function createGiftCheckout(port: StripePort, input: GiveInputT, fund: { id: string; name: string }, ctx: Parameters<typeof giftSessionParams>[2]) {
  return port.createCheckout(giftSessionParams(input, fund, ctx), newId("idem"));
}

/** Checkout for a paid event registration: price per person times the party size, held for 60 minutes. */
export function eventSessionParams(ev: { id: string; title: string; priceCents: number; date: string }, reg: { id: string; partySize: number; email?: string }, ctx: { churchId: string; origin: string; token: string; holdMinutes: number; now?: number }): Stripe.Checkout.SessionCreateParams {
  const metadata = { barnabas: "event", church: ctx.churchId, eventId: ev.id, registrationId: reg.id };
  const back = `${ctx.origin}/register/${ctx.token}`;
  return {
    mode: "payment",
    allowed_payment_method_types: ["card", "us_bank_account"],
    line_items: [{ quantity: reg.partySize, price_data: { currency: "usd", unit_amount: ev.priceCents, product_data: { name: `${ev.title} (${ev.date})`.slice(0, 120), description: "Event registration, per person" } } }],
    customer_email: reg.email || undefined,
    client_reference_id: reg.id,
    metadata,
    payment_intent_data: { description: `Registration: ${ev.title}`.slice(0, 120), metadata },
    expires_at: Math.floor((ctx.now ?? Date.now()) / 1000) + ctx.holdMinutes * 60,
    success_url: `${back}?paid=1`,
    cancel_url: `${back}?paid=0`,
  };
}
