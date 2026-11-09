import { audit } from "../data/records";
import type { SiteActor } from "./service";
import { SiteError } from "./service";
import { loadSite, updateSite } from "./store";

/**
 * Optional web push for the member app's announcements. Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
 * VAPID_SUBJECT (a mailto: or https: contact). Without them the member app shows no "notify me" button
 * and the leader app says push isn't set up. The private key never leaves the server; the public key is
 * public by design (browsers need it to subscribe).
 */

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export const vapidPublicKey = () => pushConfig()?.publicKey ?? null;

export type PushPayload = { title: string; body: string; url: string };

/** Sends one announcement to every subscribed device. Expired subscriptions (404/410) are dropped. */
export async function sendAnnouncementPush(actor: SiteActor, announcementId: string, url: string) {
  if (!actor.editor) throw new SiteError("Pastors and staff send notifications.");
  const cfg = pushConfig();
  if (!cfg) throw new SiteError("Push notifications aren't set up. Add the VAPID keys (see the README) and redeploy.");
  const book = await loadSite(actor.leader.churchId);
  if (!book.published) throw new SiteError("Publish the site before sending notifications.");
  const a = book.announcements.find((x) => x.id === announcementId);
  if (!a) throw new SiteError("That announcement is gone.");
  if (a.pushedAt) throw new SiteError("That announcement was already sent as a notification.");
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  const payload = JSON.stringify({ title: a.title, body: a.body.slice(0, 180), url } satisfies PushPayload);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    book.push.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(sub.endpoint);
      }
    }),
  );
  await updateSite(actor.leader.churchId, ["push", "announcements"], (b) => {
    b.push = b.push.filter((p) => !gone.includes(p.endpoint));
    const x = b.announcements.find((y) => y.id === announcementId);
    if (x) x.pushedAt = Date.now();
  });
  await audit(actor.leader, { action: "site.push.send", detail: `${announcementId} to ${sent} devices, ${gone.length} expired` });
  return { sent, expired: gone.length, devices: book.push.length };
}
