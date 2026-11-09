import { getJSON, kv, setJSON, withLock } from "../store";
import type { PayoutFacts } from "./client";

/**
 * Redis layout:
 *   stripe:evt:{event id}           "done" once a webhook event was handled (kept 90 days), for replays
 *   stripe:{church}:settings        online-giving settings (thank-you drafts)
 *   stripe:{church}:payouts         the last 100 payouts seen, newest first, with gross, fees and net
 */

const EVENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const eventKey = (id: string) => `stripe:evt:${id}`;

/**
 * Runs `fn` once per Stripe event id. Concurrent deliveries of the same event wait on a lock; an event is
 * marked done only after `fn` succeeds, so a failure is retried by Stripe and a success is never repeated.
 */
export async function onceForEvent<T>(eventId: string, fn: () => Promise<T>): Promise<{ replay: true } | { replay: false; result: T }> {
  return withLock(`stripe:evt-lock:${eventId}`, async () => {
    if (await kv().get(eventKey(eventId))) return { replay: true as const };
    const result = await fn();
    await kv().set(eventKey(eventId), "done", { ttlSeconds: EVENT_TTL_MS / 1000 });
    return { replay: false as const, result };
  }, 20_000);
}

export type OnlineSettings = {
  /** Draft a thank-you email (into this leader's Drafts) for each online gift. Barnabas never sends it. */
  thankYou: { on: boolean; leaderId?: string; leaderName?: string };
  updatedAt?: number;
};

const settingsKey = (church: string) => `stripe:${church}:settings`;
export async function loadOnlineSettings(church: string): Promise<OnlineSettings> {
  return (await getJSON<OnlineSettings>(settingsKey(church))) ?? { thankYou: { on: false } };
}
export async function saveOnlineSettings(church: string, s: OnlineSettings) {
  await setJSON(settingsKey(church), { ...s, updatedAt: Date.now() });
}

export type StoredPayout = PayoutFacts & { recordedAt: number; txnId?: string };
const payoutsKey = (church: string) => `stripe:${church}:payouts`;

export async function listPayouts(church: string): Promise<StoredPayout[]> {
  return (await getJSON<StoredPayout[]>(payoutsKey(church))) ?? [];
}

export async function savePayouts(church: string, payouts: StoredPayout[]) {
  await withLock(`${payoutsKey(church)}:lock`, async () => {
    const existing = await listPayouts(church);
    const byId = new Map(existing.map((p) => [p.id, p]));
    for (const p of payouts) byId.set(p.id, { ...byId.get(p.id), ...p });
    const all = [...byId.values()].sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate) || b.recordedAt - a.recordedAt).slice(0, 100);
    await setJSON(payoutsKey(church), all);
  });
}
