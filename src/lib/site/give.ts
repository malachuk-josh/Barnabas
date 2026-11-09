import { stripeReady } from "../stripe/config";
import type { SiteDoc } from "./types";

/**
 * Where the Give block, the Give page and the member app's Give tab send people.
 *
 *   - Stripe connected (STRIPE_SECRET_KEY): `{ kind: "checkout" }`. The block shows Barnabas's own give form
 *     (funds a treasurer opened for online giving, an amount, one-time or recurring, "cover the fee"), which
 *     posts to `href` (/api/s/give) and goes on to Stripe's hosted Checkout. The webhook records the gift
 *     in Finance.
 *   - Otherwise, the church's existing giving page (`doc.give.url`) if it has one,
 *   - or "online giving is coming soon".
 *
 * The block, page and tab render whatever this returns, so nothing else changes.
 */
export type GiveTarget = { kind: "checkout"; href: string; note?: string } | { kind: "link"; href: string; note?: string } | { kind: "soon"; note?: string };

export function giveTarget(doc: Pick<SiteDoc, "give">, stripe: boolean = stripeReady()): GiveTarget {
  const note = doc.give.note || undefined;
  if (stripe) return { kind: "checkout", href: "/api/s/give", note };
  const url = doc.give.url?.trim();
  if (url) return { kind: "link", href: url, note };
  return { kind: "soon", note };
}
