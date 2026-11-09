import { config } from "../config";
import { openTasks } from "../care/guests";
import { loadCare } from "../care/store";
import { memberIdsFor } from "../care/team";
import type { CareBook } from "../care/types";
import { canSeeCase, isMine, type Viewer } from "../care/visibility";
import { timezoneFor } from "../profile";
import { loadServe } from "../serve/store";
import type { ServeBook } from "../serve/types";
import { kv } from "../store";
import { accessFor, listLeaders, type LeaderRecord } from "../team";
import { notifyLeaders } from "./send";
import type { NotificationPayload } from "./types";

/**
 * The morning briefing: one push at about 7:00 AM in each leader's own time zone, sent by the hourly
 * Vercel Cron job (`/api/cron/notify`). Counts only. Skipped on days nothing is waiting.
 */

export const BRIEFING_HOUR = 7;

/** The hour (0–23) and date (yyyy-mm-dd) it is in `timezone` at `now`. */
export function localTime(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")) % 24, date: `${get("year")}-${get("month")}-${get("day")}` };
}

export type BriefingCounts = { needs: number; guests: number; swaps: number };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * What's waiting on this leader today: their own open needs with a next step due today or overdue (or
 * newly assigned and not yet started), their guest follow-ups due by tonight, and requests to cover a slot.
 */
export function briefingCounts(viewer: Viewer, leader: Pick<LeaderRecord, "leaderId" | "name">, care: CareBook, serve: ServeBook, asOf: string, endOfDay: number): BriefingCounts {
  const needs = care.cases.filter(
    (c) => c.status !== "closed" && isMine(viewer, c.assigneeId) && canSeeCase(viewer, c) && ((c.nextStep?.due && c.nextStep.due <= asOf) || (c.status === "assigned" && c.contacts.length === 0)),
  ).length;
  const guests = care.guests.filter((g) => openTasks(g).some((t) => isMine(viewer, t.assigneeId) && t.dueAt <= endOfDay)).length;
  const self = serve.volunteers.find((v) => v.leaderId === leader.leaderId) ?? serve.volunteers.find((v) => !v.leaderId && slug(v.name) === slug(leader.name));
  const swaps = self ? serve.swaps.filter((s) => s.status === "pending" && s.toVolunteerId === self.id).length : 0;
  return { needs, guests, swaps };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Good morning. 2 needs are waiting on you today, 1 guest to welcome and 1 request to cover a slot." */
export function briefingPayload(c: BriefingCounts): NotificationPayload | null {
  const parts: string[] = [];
  if (c.needs) parts.push(plural(c.needs, "need", "needs"));
  if (c.guests) parts.push(plural(c.guests, "guest to welcome", "guests to welcome"));
  if (c.swaps) parts.push(plural(c.swaps, "request to cover a slot", "requests to cover a slot"));
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const total = c.needs + c.guests + c.swaps;
  return { title: "Good morning", body: `Good morning. ${list} ${total === 1 ? "is" : "are"} waiting on you today.`, url: "/", tag: "briefing" };
}

/** Leaders whose local hour is `hour` right now, with their local date. */
export async function leadersAtHour(churchId: string, now: Date, hour = BRIEFING_HOUR) {
  const leaders = await listLeaders(churchId);
  const out: { record: LeaderRecord; date: string; timezone: string }[] = [];
  for (const record of leaders) {
    const timezone = await timezoneFor(churchId, record.leaderId);
    const t = localTime(timezone, now);
    if (t.hour === hour) out.push({ record, date: t.date, timezone });
  }
  return out;
}

/** End of `date` in `timezone`, roughly (the next local midnight), in ms. */
function endOfLocalDay(now: Date, timezone: string) {
  const t = localTime(timezone, now);
  const hoursLeft = 24 - t.hour;
  return now.getTime() + hoursLeft * 3_600_000;
}

/** Runs the briefing for every leader at 7 AM local. Each leader gets at most one per local day. */
export async function runMorningBriefing(now = new Date(), churchId = config.churchId) {
  const due = await leadersAtHour(churchId, now);
  const summary = { due: due.length, sent: 0, nothingWaiting: 0, alreadySent: 0 };
  if (!due.length) return summary;
  const [care, serve] = await Promise.all([loadCare(churchId), loadServe(churchId)]);
  for (const { record, date, timezone } of due) {
    try {
      const access = await accessFor(record);
      const counts = briefingCounts({ access, memberIds: memberIdsFor(record) }, record, care, serve, date, endOfLocalDay(now, timezone));
      const payload = briefingPayload(counts);
      if (!payload) {
        summary.nothingWaiting++;
        continue;
      }
      // One per leader per local day, even if the cron job runs twice in the hour.
      if (!(await kv().setIfAbsent(`lpush:briefing:${churchId}:${record.leaderId}:${date}`, "1", 36 * 3_600_000))) {
        summary.alreadySent++;
        continue;
      }
      const r = await notifyLeaders(churchId, [record.leaderId], "briefing", payload);
      if (r.sent) summary.sent++;
    } catch (err) {
      console.error("[barnabas] briefing failed", err instanceof Error ? err.message : "unknown");
    }
  }
  return summary;
}
