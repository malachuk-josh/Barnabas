import { createHash } from "node:crypto";
import { kv } from "../store";

/**
 * Failed sign-ins. Counted per email (whether or not an account exists, so the lock itself reveals nothing)
 * and per network address. Eight failures for one email within 15 minutes pause sign-in for that email for
 * 15 minutes; the owner can unlock sooner.
 */
export const LOCKOUT = { failures: 8, windowSeconds: 15 * 60, lockSeconds: 15 * 60 } as const;
/** Failed attempts from one network address in 15 minutes, across all emails. */
export const IP_LIMIT = { failures: 40, windowSeconds: 15 * 60 } as const;

const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
const failKey = (churchId: string, email: string) => `authfail:${churchId}:${emailHash(email)}`;
const lockKey = (churchId: string, email: string) => `authlock:${churchId}:${emailHash(email)}`;
const ipKey = (ip: string) => `authfail-ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;

export async function isLocked(churchId: string, email: string) {
  return Boolean(await kv().get(lockKey(churchId, email)));
}

export async function ipBlocked(ip: string) {
  return Number((await kv().get(ipKey(ip))) ?? 0) >= IP_LIMIT.failures;
}

/** Count a failure; returns true when this one locked the email. */
export async function recordFailure(churchId: string, email: string, ip: string) {
  await kv().incr(ipKey(ip), IP_LIMIT.windowSeconds);
  const n = await kv().incr(failKey(churchId, email), LOCKOUT.windowSeconds);
  if (n >= LOCKOUT.failures) {
    await kv().set(lockKey(churchId, email), "1", { ttlSeconds: LOCKOUT.lockSeconds });
    await kv().del(failKey(churchId, email));
    return true;
  }
  return false;
}

export async function clearFailures(churchId: string, email: string) {
  await kv().del(failKey(churchId, email));
}

export async function unlock(churchId: string, email: string) {
  await kv().del(failKey(churchId, email), lockKey(churchId, email));
}
