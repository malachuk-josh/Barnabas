// Illumination: questions answered by Claude — about a verse, to the
// scholars, and in the described search — for every signed-in leader.
//
// Ported from Communion, whose owner, trusted and per-tier allowances are
// replaced here by one flat allowance: WORD_ASK_DAILY_LIMIT questions per
// leader per UTC day (50 unless set). The routes still speak of a "tier";
// in Barnabas there is only the one.
//
// Nothing anybody asks is kept here. The conversation lives on the reader's
// device and comes up whole with each question; what the server writes down is
// how many questions, and how many tokens.

import { db, keys } from "@/lib/wordDb";

/** The cheapest current model, as Communion chose it. */
export const ASK_MODEL = "claude-haiku-5-5";

/** Every leader has the same allowance: there are no tiers in Barnabas. */
export type AskTier = "standard";

export const DEFAULT_DAILY_LIMIT = 50;

/** Questions a leader may ask in one UTC day (WORD_ASK_DAILY_LIMIT, default 50). */
export function dailyLimit(): number {
  const raw = Number(process.env.WORD_ASK_DAILY_LIMIT?.trim());
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_DAILY_LIMIT;
}

/** A day's allowance. Never null in Barnabas: everyone has the flat limit. */
export function tierLimit(_tier: AskTier): number | null {
  return dailyLimit();
}

/** Questions in one conversation, after which it starts over. */
export const MAX_TURNS = 10;
export const MAX_QUESTION = 1000;
/** What an answer coming back up from the device may be, at most. */
export const MAX_ANSWER = 6000;

/** A day's tally is kept a little past the day, then lets go. */
const DAY_TTL_SECONDS = 3 * 24 * 60 * 60;

export function utcDay(at = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** When today's allowance comes back: the next midnight, UTC. */
export function nextReset(at = Date.now()): number {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Whether the deployment has an API key at all. */
export function askConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

/** Someone's tier, or null for nobody who may ask at all (not signed in). */
export async function tierOf(userId: string | null): Promise<AskTier | null> {
  return userId ? "standard" : null;
}

export async function canAsk(userId: string | null): Promise<boolean> {
  return (await tierOf(userId)) !== null;
}

/**
 * Questions left today for this leader, and, when none are, that it was
 * their own allowance that ran out (there is no app-wide one here).
 */
export async function questionsLeft(
  userId: string,
  _tier: AskTier
): Promise<{ left: number | null; limit: "person" | "app" | null }> {
  const day = (await db().hgetall(keys.askDay(utcDay(), userId))) ?? {};
  const left = Math.max(0, dailyLimit() - (Number(day.q) || 0));
  return { left, limit: left > 0 ? null : "person" };
}

export type Taken =
  | { ok: true; day: string; left: number | null; capped: boolean }
  | { ok: false; why: "person" | "app" };

/**
 * Take one question out of today's allowance, or say it has run out.
 * Counted before the question is sent rather than after it is answered; one
 * that turns out to be over is put straight back.
 */
export async function takeQuestion(userId: string, _tier: AskTier): Promise<Taken> {
  const kv = db();
  const day = utcDay();
  const key = keys.askDay(day, userId);
  const allowance = dailyLimit();
  const mine = await kv.hincrby(key, "q", 1);
  if (mine > allowance) {
    await kv.hincrby(key, "q", -1);
    await kv.expire(key, DAY_TTL_SECONDS);
    return { ok: false, why: "person" };
  }
  await kv.expire(key, DAY_TTL_SECONDS);
  return { ok: true, day, left: allowance - mine, capped: true };
}

/** A question that never reached the model costs nothing, so it is not counted. */
export async function giveBack(userId: string, taken: { day: string; capped: boolean }): Promise<void> {
  const kv = db();
  const key = keys.askDay(taken.day, userId);
  await kv.hincrby(key, "q", -1);
  await kv.expire(key, DAY_TTL_SECONDS);
}

export interface AskUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What one answer used, kept beside the day's count. */
export async function recordUsage(
  userId: string,
  day: string,
  used: AskUsage
): Promise<void> {
  const kv = db();
  const key = keys.askDay(day, userId);
  const fields: [string, number][] = [
    ["in", used.input],
    ["out", used.output],
    ["cr", used.cacheRead],
    ["cw", used.cacheWrite],
  ];
  let wrote = false;
  for (const [field, n] of fields) {
    if (!n) continue;
    await kv.hincrby(key, field, n);
    wrote = true;
  }
  if (wrote) await kv.expire(key, DAY_TTL_SECONDS);
}
