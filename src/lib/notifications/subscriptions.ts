import { z } from "zod";
import { getJSON, kv, setJSON, withLock } from "../store";

/**
 * Leaders' push subscriptions, one list per leader at `lpush:{church}:{leaderId}`, one entry per device
 * (keyed by its endpoint). Separate from the member app's, which live on the site book.
 */

export const MAX_DEVICES = 10;

export const SubscriptionInput = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints are https."),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

export type LeaderSubscription = { endpoint: string; keys: { p256dh: string; auth: string }; createdAt: number; lastSentAt?: number };

type Who = { churchId: string; leaderId: string };

export const subscriptionsKey = (w: Who) => `lpush:${w.churchId}:${w.leaderId}`;
const lockKey = (w: Who) => `lock:lpush:${w.churchId}:${w.leaderId}`;

export async function listSubscriptions(w: Who): Promise<LeaderSubscription[]> {
  return (await getJSON<LeaderSubscription[]>(subscriptionsKey(w))) ?? [];
}

async function update<T>(w: Who, fn: (subs: LeaderSubscription[]) => { next: LeaderSubscription[]; result: T }): Promise<T> {
  return withLock(lockKey(w), async () => {
    const { next, result } = fn(await listSubscriptions(w));
    if (next.length) await setJSON(subscriptionsKey(w), next);
    else await kv().del(subscriptionsKey(w));
    return result;
  }, 5000);
}

/** Adds (or refreshes) this device. Keeps the newest MAX_DEVICES; the oldest fall off. */
export async function addSubscription(w: Who, input: z.input<typeof SubscriptionInput>) {
  const sub = SubscriptionInput.parse(input);
  return update(w, (subs) => {
    const existing = subs.find((s) => s.endpoint === sub.endpoint);
    const entry: LeaderSubscription = { endpoint: sub.endpoint, keys: sub.keys, createdAt: existing?.createdAt ?? Date.now(), lastSentAt: existing?.lastSentAt };
    const next = [entry, ...subs.filter((s) => s.endpoint !== sub.endpoint)].slice(0, MAX_DEVICES);
    return { next, result: { devices: next.length, added: !existing } };
  });
}

export async function removeSubscription(w: Who, endpoint: string) {
  return update(w, (subs) => {
    const next = subs.filter((s) => s.endpoint !== endpoint);
    return { next, result: { removed: next.length !== subs.length, devices: next.length } };
  });
}

/** Drops subscriptions the push service says are gone, and notes when the others last got something. */
export async function recordSends(w: Who, gone: string[], sent: string[]) {
  if (!gone.length && !sent.length) return;
  await update(w, (subs) => {
    const now = Date.now();
    const next = subs.filter((s) => !gone.includes(s.endpoint)).map((s) => (sent.includes(s.endpoint) ? { ...s, lastSentAt: now } : s));
    return { next, result: null };
  });
}

export async function clearSubscriptions(w: Who) {
  await kv().del(subscriptionsKey(w));
}
