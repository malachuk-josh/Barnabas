import { can } from "../auth/roles";
import { newId } from "../data/ids";
import { audit } from "../data/records";
import { getJSON, kv, setJSON } from "../store";
import { CareError, type CareActor } from "./service";
import { loadCare, updateCare } from "./store";
import type { WelcomeLink } from "./types";

/**
 * The public guest card at /welcome/{token}. Tokens are 32 random bytes (base64url), unguessable;
 * they're looked up by their SHA-256 hash, and a revoked or unknown token reads exactly like a
 * missing page. Submissions are rate-limited per network address and per link.
 */

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const RATE_LIMITS = {
  /** Submissions from one network address. */
  ip: { limit: 5, windowSeconds: 10 * 60 },
  /** Submissions through one link (a Sunday's worth of guests, with room to spare). */
  token: { limit: 60, windowSeconds: 60 * 60 },
  /** Page views of unknown tokens from one address, to slow down guessing. */
  miss: { limit: 20, windowSeconds: 10 * 60 },
};

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Buffer.from(new Uint8Array(digest)).toString("hex");
}

const lookupKey = (hash: string) => `welcome:${hash}`;

type Lookup = { churchId: string; linkId: string };

export async function createWelcomeLink(actor: CareActor, label: string) {
  if (!can(actor.viewer.access, "care.assign")) throw new CareError("Pastors, deacons and staff can make guest-card links.");
  const clean = label.trim().slice(0, 60) || "Guest card";
  const link: WelcomeLink = { id: newId("link"), token: newToken(), label: clean, createdById: actor.self.id, createdAt: Date.now() };
  await updateCare(actor.leader.churchId, ["links"], (book) => {
    book.links.push(link);
  });
  await setJSON(lookupKey(await tokenHash(link.token)), { churchId: actor.leader.churchId, linkId: link.id } satisfies Lookup);
  await audit(actor.leader, { action: "care.link.create", detail: link.id });
  return link;
}

export async function revokeWelcomeLink(actor: CareActor, linkId: string) {
  if (!can(actor.viewer.access, "care.assign")) throw new CareError("Pastors, deacons and staff manage guest-card links.");
  const link = await updateCare(actor.leader.churchId, ["links"], (book) => {
    const l = book.links.find((x) => x.id === linkId);
    if (!l) throw new CareError("That link doesn't exist.");
    l.revokedAt = Date.now();
    return l;
  });
  await kv().del(lookupKey(await tokenHash(link.token)));
  await audit(actor.leader, { action: "care.link.revoke", detail: link.id });
  return link;
}

/** The active link a token belongs to, or null. Malformed, unknown and revoked tokens all return null. */
export async function resolveToken(token: string): Promise<{ churchId: string; link: WelcomeLink } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const found = await getJSON<Lookup>(lookupKey(await tokenHash(token)));
  if (!found) return null;
  const book = await loadCare(found.churchId);
  const link = book.links.find((l) => l.id === found.linkId);
  if (!link || link.revokedAt || link.token !== token) return null;
  return { churchId: found.churchId, link };
}

/** Fixed-window counter. Returns whether this request is allowed. */
export async function rateLimit(bucket: string, rule: { limit: number; windowSeconds: number }) {
  const count = await kv().incr(`rl:${bucket}`, rule.windowSeconds);
  return count <= rule.limit;
}

/** The caller's network address as Vercel reports it. */
export function clientAddress(request: Request) {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || request.headers.get("x-real-ip") || "unknown").slice(0, 64);
}
