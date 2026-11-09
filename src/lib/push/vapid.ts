/**
 * Web push, shared by the member app (announcements, `src/lib/site/push.ts`) and the leader app
 * (`src/lib/notifications`). Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or
 * https: contact). The private key never leaves the server; the public key is public by design (browsers
 * need it to subscribe). Each app keeps its own subscriptions; only the keys and the sender are shared.
 */

/**
 * Forgives the usual paste slips in Vercel: the "NAME=" label pasted along with the value, quotes around
 * it, and spaces or line breaks inside it.
 */
export function cleanEnvValue(raw: string | undefined, name: string): string {
  let v = (raw ?? "").trim();
  if (v.toUpperCase().startsWith(`${name}=`)) v = v.slice(name.length + 1).trim();
  v = v.replace(/^["'`]+|["'`]+$/g, "").trim();
  return v;
}

const b64urlBytes = (v: string) => {
  if (!/^[A-Za-z0-9_+/-]+=*$/.test(v)) return -1;
  return Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64").length;
};

/** Why the keys can't be used, in plain words, or null when they're fine. */
export function vapidProblem(publicKey: string, privateKey: string, subject: string): string | null {
  if (b64urlBytes(publicKey) !== 65 || !publicKey.startsWith("B")) return "VAPID_PUBLIC_KEY doesn't look right. In Vercel it should be one unbroken line of letters, numbers, - and _ (about 87 characters, starting with B), with no quotes and without the name in front.";
  if (b64urlBytes(privateKey) !== 32) return "VAPID_PRIVATE_KEY doesn't look right. It should be one unbroken line of about 43 letters, numbers, - and _, with no quotes and without the name in front.";
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) return "VAPID_SUBJECT should be a contact like mailto:office@yourchurch.org.";
  return null;
}

export function pushConfig() {
  const publicKey = cleanEnvValue(process.env.VAPID_PUBLIC_KEY, "VAPID_PUBLIC_KEY").replace(/\s+/g, "");
  const privateKey = cleanEnvValue(process.env.VAPID_PRIVATE_KEY, "VAPID_PRIVATE_KEY").replace(/\s+/g, "");
  const subject = cleanEnvValue(process.env.VAPID_SUBJECT, "VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return null;
  if (vapidProblem(publicKey, privateKey, subject)) return null;
  return { publicKey, privateKey, subject };
}

/** Set but unusable: the message to show admins in Settings (no key values in it). */
export function pushConfigProblem(): string | null {
  const publicKey = cleanEnvValue(process.env.VAPID_PUBLIC_KEY, "VAPID_PUBLIC_KEY").replace(/\s+/g, "");
  const privateKey = cleanEnvValue(process.env.VAPID_PRIVATE_KEY, "VAPID_PRIVATE_KEY").replace(/\s+/g, "");
  const subject = cleanEnvValue(process.env.VAPID_SUBJECT, "VAPID_SUBJECT");
  if (!publicKey && !privateKey && !subject) return null;
  if (!publicKey || !privateKey || !subject) return "One of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is missing in Vercel.";
  return vapidProblem(publicKey, privateKey, subject);
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
