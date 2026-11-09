/**
 * Web push, shared by the member app (announcements, `src/lib/site/push.ts`) and the leader app
 * (`src/lib/notifications`). Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or
 * https: contact). The private key never leaves the server; the public key is public by design (browsers
 * need it to subscribe). Each app keeps its own subscriptions; only the keys and the sender are shared.
 */

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export const vapidPublicKey = () => pushConfig()?.publicKey ?? null;

export type WebPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** "sent", "gone" (the push service says the subscription no longer exists: 404 or 410), or "failed". */
export type PushResult = "sent" | "gone" | "failed";

/**
 * Sends one payload to one subscription. Never throws. `timeoutMs` bounds the whole call, so one slow push
 * service can't hold up the rest.
 */
export async function sendWebPush(sub: WebPushSubscription, payload: string, opts: { ttlSeconds?: number; timeoutMs?: number; urgency?: "low" | "normal" | "high" } = {}): Promise<PushResult> {
  const cfg = pushConfig();
  if (!cfg) return "failed";
  const timeoutMs = opts.timeoutMs ?? 8000;
  try {
    const webpush = (await import("web-push")).default;
    const send = webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
      TTL: opts.ttlSeconds ?? 60 * 60 * 24,
      urgency: opts.urgency ?? "normal",
      timeout: timeoutMs,
      vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("push timed out")), timeoutMs + 500);
    });
    try {
      await Promise.race([send, timeout]);
    } finally {
      clearTimeout(timer);
    }
    return "sent";
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return "gone";
    return "failed";
  }
}
