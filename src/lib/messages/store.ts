import { getJSON, kv, setJSON } from "../store";
import { normalizeEmail, normalizePhone } from "./phone";

/**
 * Redis layout, per church:
 *   msg:{church}:dnt                 do-not-text: E.164 numbers that replied STOP or hit Twilio 21610
 *   msg:{church}:dne                 do-not-email: addresses that unsubscribed, bounced hard or complained
 *   msg:{church}:log                 set of delivery ids (the send log)
 *   msg:{church}:d:{id}              one delivery: a recipient of an approved draft, with its status
 *   msg:{church}:idem:{key}          per-recipient idempotency claim (the delivery id), 30 days
 *   msgref:{provider}:{providerId}   maps a Twilio SID or Resend email id back to church and delivery
 *   msg:{church}:rate:*              send-rate counters
 */

export type DeliveryStatus =
  | "sending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "undelivered"
  | "bounced"
  | "complained"
  | "opted_out"
  | "no_contact";

export const FINAL_BAD: DeliveryStatus[] = ["failed", "undelivered", "bounced", "complained", "opted_out", "no_contact"];

export type Delivery = {
  id: string;
  churchId: string;
  draftId: string;
  /** Who approved it (the leader who tapped Send). */
  approvedBy: string;
  approvedByName: string;
  personId: string;
  name: string;
  channel: "sms" | "email";
  /** The normalized number or address, kept for status webhooks and opt-out; screens show it masked. */
  to?: string;
  status: DeliveryStatus;
  providerId?: string;
  error?: string;
  errorCode?: string;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
  events: { at: number; status: DeliveryStatus; detail?: string }[];
};

const k = (church: string, part: string) => `msg:${church}:${part}`;
export const deliveryKey = (church: string, id: string) => k(church, `d:${id}`);
export const refKey = (provider: "twilio" | "resend", providerId: string) => `msgref:${provider}:${providerId}`;

/* ---------- Opt-out lists ---------- */

export async function optOutPhone(church: string, phone: string) {
  const n = normalizePhone(phone);
  if (n) await kv().sadd(k(church, "dnt"), n);
  return n;
}
export async function optInPhone(church: string, phone: string) {
  const n = normalizePhone(phone);
  if (n) await kv().srem(k(church, "dnt"), n);
}
export async function optOutEmail(church: string, email: string) {
  const n = normalizeEmail(email);
  if (n) await kv().sadd(k(church, "dne"), n);
  return n;
}
export async function optInEmail(church: string, email: string) {
  const n = normalizeEmail(email);
  if (n) await kv().srem(k(church, "dne"), n);
}
export async function optOuts(church: string) {
  const [phones, emails] = await Promise.all([kv().smembers(k(church, "dnt")), kv().smembers(k(church, "dne"))]);
  return { phones: new Set(phones), emails: new Set(emails) };
}

/* ---------- Deliveries ---------- */

export async function saveDelivery(d: Delivery) {
  await setJSON(deliveryKey(d.churchId, d.id), d);
  await kv().sadd(k(d.churchId, "log"), d.id);
  if (d.providerId) await setJSON(refKey(d.channel === "sms" ? "twilio" : "resend", d.providerId), { churchId: d.churchId, id: d.id });
}

export async function getDelivery(church: string, id: string) {
  return getJSON<Delivery>(deliveryKey(church, id));
}

export async function deliveryByRef(provider: "twilio" | "resend", providerId: string) {
  const ref = await getJSON<{ churchId: string; id: string }>(refKey(provider, providerId));
  return ref ? getDelivery(ref.churchId, ref.id) : null;
}

export async function listDeliveries(church: string, limit = 500): Promise<Delivery[]> {
  const ids = await kv().smembers(k(church, "log"));
  const all = await Promise.all(ids.map((id) => getDelivery(church, id)));
  return all.filter((d): d is Delivery => Boolean(d)).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** Claims an idempotency key. Returns the delivery id already holding it, or null when this call got it. */
export async function claimIdempotency(church: string, key: string, deliveryId: string): Promise<string | null> {
  const won = await kv().setIfAbsent(k(church, `idem:${key}`), deliveryId, 30 * 24 * 3600 * 1000);
  if (won) return null;
  return (await kv().get(k(church, `idem:${key}`))) ?? "unknown";
}

export async function releaseIdempotency(church: string, key: string) {
  await kv().del(k(church, `idem:${key}`));
}

/* ---------- Rate limits ---------- */

export const RATE_LIMITS = {
  /** Messages per church per minute (Twilio long codes allow about one segment a second). */
  perMinute: 60,
  /** Messages per church per day. */
  perDay: 1000,
  /** Drafts one leader may send per ten minutes. */
  draftsPerLeader: 20,
};

/** Counts `n` messages against the church's minute and day windows, and one draft against the leader; false when any is over. */
export async function takeRate(church: string, leaderId: string, n: number, now = Date.now()): Promise<{ ok: true } | { ok: false; reason: string }> {
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const tenMin = Math.floor(now / 600_000);
  const drafts = await kv().incr(k(church, `rate:leader:${leaderId}:${tenMin}`), 600);
  if (drafts > RATE_LIMITS.draftsPerLeader) return { ok: false, reason: `You've sent ${RATE_LIMITS.draftsPerLeader} drafts in the last few minutes. Wait a few minutes and try again.` };
  let perMinute = 0;
  let perDay = 0;
  for (let i = 0; i < n; i++) {
    perMinute = await kv().incr(k(church, `rate:min:${minute}`), 120);
    perDay = await kv().incr(k(church, `rate:day:${day}`), 172_800);
  }
  if (perMinute > RATE_LIMITS.perMinute) return { ok: false, reason: `That's more than ${RATE_LIMITS.perMinute} messages in a minute for the church. Wait a minute and send again; nothing went out twice.` };
  if (perDay > RATE_LIMITS.perDay) return { ok: false, reason: `The church has reached today's limit of ${RATE_LIMITS.perDay} messages. Try again tomorrow.` };
  return { ok: true };
}
