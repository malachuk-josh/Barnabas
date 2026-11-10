import type { Leader } from "../auth/session";
import { audit } from "../data/records";
import { notificationSettingsFor } from "../profile";
import { pushConfig, sendWebPush } from "../push/vapid";
import { accessFor, getLeaderRecord } from "../team";
import { listSubscriptions, recordSends } from "./subscriptions";
import { recordNotice } from "../inbox/notices";
import { typesFor, type NotificationPayload, type NotificationType } from "./types";

/**
 * Sends a notification to leaders. For each leader: their master switch and the type's toggle must be on,
 * and their role must be one that gets this type. Every device is sent to in parallel with a short
 * timeout; subscriptions the push service says are gone (404/410) are pruned. Never throws: a failure is
 * logged and the caller carries on.
 *
 * `test: true` is the Settings "Send a test notification" button: it skips the type toggles (not the
 * master switch) and is the only send that's audited.
 */
export type NotifyOptions = { test?: boolean; timeoutMs?: number };
export type NotifyResult = { leaders: number; sent: number; failed: number; pruned: number; skipped: number };

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export async function notifyLeaders(churchId: string, leaderIds: string[], type: NotificationType, payload: NotificationPayload, opts: NotifyOptions = {}): Promise<NotifyResult> {
  const total: NotifyResult = { leaders: 0, sent: 0, failed: 0, pruned: 0, skipped: 0 };
  const canPush = Boolean(pushConfig());
  const ids = [...new Set(leaderIds.filter(Boolean))];
  const body = JSON.stringify({
    title: clean(payload.title, 80),
    body: clean(payload.body, 200),
    url: payload.url.startsWith("/") && !payload.url.startsWith("//") ? payload.url : "/",
    tag: clean(payload.tag, 64) || type,
  } satisfies NotificationPayload);
  const saveToMessages: string[] = [];
  await Promise.all(
    ids.map(async (leaderId) => {
      try {
        const who = { churchId, leaderId };
        const [settings, record] = await Promise.all([notificationSettingsFor(churchId, leaderId), getLeaderRecord(churchId, leaderId)]);
        if (!record || record.removed) return void total.skipped++;
        if (!opts.test) {
          if (!settings.types[type]) return void total.skipped++;
          const access = await accessFor({ churchId, leaderId, email: record.email });
          if (!typesFor(access).includes(type)) return void total.skipped++;
          // It also lands in their Messages (Notifications), after the push and whatever their devices.
          if (type !== "messages") saveToMessages.push(leaderId);
        }
        if (!canPush || !settings.enabled) return void total.skipped++;
        const subs = await listSubscriptions(who);
        if (!subs.length) return void total.skipped++;
        total.leaders++;
        const results = await Promise.all(subs.map(async (s) => ({ endpoint: s.endpoint, result: await sendWebPush(s, body, { timeoutMs: opts.timeoutMs ?? 6000, ttlSeconds: type === "briefing" ? 6 * 3600 : 24 * 3600 }) })));
        const gone = results.filter((r) => r.result === "gone").map((r) => r.endpoint);
        const sent = results.filter((r) => r.result === "sent").map((r) => r.endpoint);
        total.sent += sent.length;
        total.pruned += gone.length;
        total.failed += results.length - sent.length - gone.length;
        await recordSends(who, gone, sent);
        if (opts.test) {
          const leader: Leader = { churchId, leaderId, name: record.name, email: record.email, role: record.role };
          await audit(leader, { action: "push.test", detail: `${sent.length} of ${subs.length} devices${gone.length ? `, ${gone.length} expired` : ""}` });
        }
      } catch (err) {
        total.failed++;
        console.error("[barnabas] notification failed", type, err instanceof Error ? err.message : "unknown");
      }
    }),
  );
  if (saveToMessages.length) {
    const p = JSON.parse(body) as NotificationPayload;
    for (const leaderId of saveToMessages) {
      await recordNotice(churchId, leaderId, { title: p.title, body: p.body, url: p.url }).catch((err) =>
        console.error("[barnabas] notification not saved to Messages", err instanceof Error ? err.message : "unknown"),
      );
    }
  }
  return total;
}
