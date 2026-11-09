import type { SiteDoc } from "./types";

/**
 * Where the Give block, the Give page and the member app's Give tab send people.
 *
 * STRIPE PLUGS IN HERE. Today a church either links its existing giving page (`doc.give.url`) or shows
 * "online giving is coming soon". When Stripe is added, return `{ kind: "checkout", href: "/api/s/give" }`
 * (a route that creates a Stripe Checkout session for a fund and amount and records the gift through
 * Finance's `recordGifts` from the webhook). The block, page and tab render whatever this returns, so
 * nothing else changes.
 */
export type GiveTarget = { kind: "link"; href: string; note?: string } | { kind: "soon"; note?: string };

export function giveTarget(doc: Pick<SiteDoc, "give">): GiveTarget {
  const url = doc.give.url?.trim();
  if (url) return { kind: "link", href: url, note: doc.give.note || undefined };
  return { kind: "soon", note: doc.give.note || undefined };
}
