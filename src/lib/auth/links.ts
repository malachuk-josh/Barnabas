import { createHash, randomBytes } from "node:crypto";
import { getJSON, kv, setJSON } from "../store";

/**
 * One-time links for setting a password: invites (7 days) and resets (24 hours). The owner copies the link
 * from the Admin console and gives it to the person. Tokens are 32 random bytes (base64url); only their
 * SHA-256 hash is stored. Issuing a new link of the same kind replaces the old one, and a link works once.
 */
export type LinkKind = "invite" | "reset";
export const LINK_TTL_SECONDS: Record<LinkKind, number> = { invite: 7 * 24 * 60 * 60, reset: 24 * 60 * 60 };
export const LINK_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

type StoredLink = { churchId: string; leaderId: string; kind: LinkKind; expiresAt: number; createdBy: string };

export const linkHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const linkKey = (hash: string) => `authlink:${hash}`;
const currentKey = (churchId: string, leaderId: string, kind: LinkKind) => `authlink-cur:${churchId}:${leaderId}:${kind}`;

export async function issueLink(churchId: string, leaderId: string, kind: LinkKind, createdBy: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = linkHash(token);
  const ttl = LINK_TTL_SECONDS[kind];
  const previous = await kv().get(currentKey(churchId, leaderId, kind));
  if (previous) await kv().del(linkKey(previous));
  const link: StoredLink = { churchId, leaderId, kind, expiresAt: Date.now() + ttl * 1000, createdBy };
  await setJSON(linkKey(hash), link, { ttlSeconds: ttl });
  await kv().set(currentKey(churchId, leaderId, kind), hash, { ttlSeconds: ttl });
  return { token, expiresAt: link.expiresAt };
}

/** The live link a token belongs to, or null (malformed, unknown, used, replaced or expired all look the same). */
export async function resolveLink(token: string): Promise<StoredLink | null> {
  if (!LINK_TOKEN_RE.test(token)) return null;
  const link = await getJSON<StoredLink>(linkKey(linkHash(token)));
  if (!link || link.expiresAt <= Date.now()) return null;
  return link;
}

/** Use a link up. Only one caller ever gets it, even if two arrive at once. */
export async function consumeLink(token: string): Promise<StoredLink | null> {
  const link = await resolveLink(token);
  if (!link) return null;
  const hash = linkHash(token);
  if (!(await kv().setIfAbsent(`authlink-used:${hash}`, "1", LINK_TTL_SECONDS[link.kind] * 1000))) return null;
  await kv().del(linkKey(hash), currentKey(link.churchId, link.leaderId, link.kind));
  return link;
}

/** Every outstanding link for a leader stops working (password set, removal). */
export async function revokeLinks(churchId: string, leaderId: string) {
  for (const kind of ["invite", "reset"] as LinkKind[]) {
    const hash = await kv().get(currentKey(churchId, leaderId, kind));
    if (hash) await kv().del(linkKey(hash));
    await kv().del(currentKey(churchId, leaderId, kind));
  }
}

export async function hasOpenInvite(churchId: string, leaderId: string) {
  return Boolean(await kv().get(currentKey(churchId, leaderId, "invite")));
}
