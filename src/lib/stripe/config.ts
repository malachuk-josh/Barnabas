/**
 * Stripe settings from the environment. Server-only. Secrets are read here and passed only to the Stripe
 * client; nothing in this file (or anything that calls it) returns or logs a key.
 *
 *   STRIPE_SECRET_KEY        sk_live_... or sk_test_... (a restricted key rk_... works too)
 *   STRIPE_WEBHOOK_SECRET    whsec_... from the webhook endpoint pointed at {APP_URL}/api/stripe/webhook
 *   STRIPE_PORTAL_LOGIN_URL  optional: the Customer Portal's "login link" (givers manage recurring gifts)
 *   STRIPE_FEE_PERCENT       optional: card rate used for "cover the processing fee" (default 2.9)
 *   STRIPE_FEE_FIXED_CENTS   optional: per-charge fee in cents for the same (default 30)
 *   STRIPE_API_BASE          development and tests only: send API calls to a local stub (ignored in production)
 */

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string | null;
  testMode: boolean;
  portalLoginUrl: string | null;
  feePercent: number;
  feeFixedCents: number;
  /** Development/test stub server, never in production. */
  apiBase: { host: string; port: number; protocol: "http" | "https" } | null;
};

const KEY_RE = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/;

export function stripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey || !KEY_RE.test(secretKey)) return null;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const portal = env.STRIPE_PORTAL_LOGIN_URL?.trim();
  const pct = Number(env.STRIPE_FEE_PERCENT);
  const fixed = Number(env.STRIPE_FEE_FIXED_CENTS);
  return {
    secretKey,
    webhookSecret: webhookSecret && webhookSecret.startsWith("whsec_") ? webhookSecret : null,
    testMode: /^(sk|rk)_test_/.test(secretKey),
    portalLoginUrl: portal && /^https:\/\/billing\.stripe\.com\//.test(portal) ? portal : null,
    feePercent: Number.isFinite(pct) && pct >= 0 && pct < 10 ? pct : 2.9,
    feeFixedCents: Number.isInteger(fixed) && fixed >= 0 && fixed < 500 ? fixed : 30,
    apiBase: apiBase(env),
  };
}

function apiBase(env: NodeJS.ProcessEnv) {
  const raw = env.STRIPE_API_BASE?.trim();
  if (!raw || env.NODE_ENV === "production") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return { host: u.hostname, port: Number(u.port || (u.protocol === "https:" ? 443 : 80)), protocol: u.protocol.slice(0, -1) as "http" | "https" };
  } catch {
    return null;
  }
}

/** Whether online giving and event payments can run: a valid secret key. (The webhook secret records them.) */
export function stripeReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return stripeConfig(env) !== null;
}

/** What the Finance screen shows about the connection. Never the keys themselves. */
export function stripeStatus(env: NodeJS.ProcessEnv = process.env) {
  const cfg = stripeConfig(env);
  const rawKey = env.STRIPE_SECRET_KEY?.trim();
  return {
    connected: Boolean(cfg),
    testMode: cfg?.testMode ?? false,
    webhook: Boolean(cfg?.webhookSecret),
    portalLogin: Boolean(cfg?.portalLoginUrl),
    /** A key is set but isn't a Stripe secret key (e.g. a publishable pk_ key was pasted). */
    keyLooksWrong: Boolean(rawKey) && !cfg,
  };
}
export type StripeStatus = ReturnType<typeof stripeStatus>;

/** The estimated card fee for "cover the processing fee": the extra that makes the church receive `amount`. */
export function coverFee(amount: number, cfg: Pick<StripeConfig, "feePercent" | "feeFixedCents">): number {
  const gross = Math.ceil((amount + cfg.feeFixedCents) / (1 - cfg.feePercent / 100));
  return gross - amount;
}

/** Online gift limits in cents: at least $1, at most $25,000 per gift (larger gifts by check or wire). */
export const GIFT_MIN = 1_00;
export const GIFT_MAX = 25_000_00;
