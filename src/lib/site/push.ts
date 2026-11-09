import { audit } from "../data/records";
import type { SiteActor } from "./service";
import { SiteError } from "./service";
import { loadSite, updateSite } from "./store";
import { pushConfig, sendWebPush } from "../push/vapid";

/**
 * Optional web push for the member app's announcements. The VAPID keys and the sender are shared with the
 * leader app (`src/lib/push/vapid.ts`); the member app's subscriptions stay here, on the site book.
 * Without the keys the member app shows no "notify me" button and the leader app says push isn't set up.
 */

export { pushConfig, vapidPublicKey } from "../push/vapid";

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
  const payload = JSON.stringify({ title: a.title, body: a.body.slice(0, 180), url } satisfies PushPayload);
  const results = await Promise.all(book.push.map(async (sub) => ({ endpoint: sub.endpoint, result: await sendWebPush(sub, payload) })));
  const gone = results.filter((r) => r.result === "gone").map((r) => r.endpoint);
  const sent = results.filter((r) => r.result === "sent").length;
  await updateSite(actor.leader.churchId, ["push", "announcements"], (b) => {
    b.push = b.push.filter((p) => !gone.includes(p.endpoint));
    const x = b.announcements.find((y) => y.id === announcementId);
    if (x) x.pushedAt = Date.now();
  });
  await audit(actor.leader, { action: "site.push.send", detail: `${announcementId} to ${sent} devices, ${gone.length} expired` });
  return { sent, expired: gone.length, devices: book.push.length };
}
