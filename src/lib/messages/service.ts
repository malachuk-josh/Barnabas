import { createHash } from "node:crypto";
import type { Leader } from "../auth/session";
import { config } from "../config";
import { audit, getDraft, saveDraft, type Draft } from "../data/records";
import { newId } from "../data/ids";
import { withLock } from "../store";
import { accessFor } from "../team";
import { appUrl, messagingStatus, resendConfig, twilioConfig } from "./config";
import { resolveContact } from "./contacts";
import { canSendDraft } from "./permissions";
import { emailHtml, emailText, sendEmail, sendSms, type Fetch } from "./providers";
import {
  claimIdempotency, deliveryByRef, FINAL_BAD, optInPhone, optOutEmail, optOutPhone, optOuts, releaseIdempotency, saveDelivery, takeRate,
  type Delivery, type DeliveryStatus,
} from "./store";
import { unsubscribeUrl } from "./unsubscribe";

/**
 * Delivery of approved drafts. This is the only code that sends anything, and the only caller is the
 * Drafts screen's Send button (POST /api/drafts/{id} with action "send"): a signed-in leader approving that
 * specific draft. Barnabas's tools can draft and put things in the queue; none of them can reach here.
 */

export class MessagingError extends Error {
  constructor(message: string, readonly code: "not_found" | "forbidden" | "conflict" | "not_configured" | "rate_limited" | "invalid" = "invalid", readonly missing?: string[]) {
    super(message);
  }
}

let transport: Fetch | undefined;
/** Tests replace the network; production uses global fetch. */
export function setMessagingFetch(f: Fetch | undefined) {
  transport = f;
}

const SENDABLE: Draft["status"][] = ["needs_review", "failed", "partly_sent"];

/** One key per draft, recipient, channel and address: the same person never gets the same draft twice. */
export function idempotencyKey(churchId: string, draftId: string, personId: string, channel: string, to: string) {
  return createHash("sha256").update([churchId, draftId, personId, channel, to].join("|")).digest("hex").slice(0, 40);
}

export type SendSummary = { draft: Draft; sent: number; failed: number; skipped: number; optedOut: number; noContact: number; deliveries: Delivery[] };

const churchLabel = () => config.churchName.replace(/\s*\(demo\)\s*$/i, "");

export async function sendApprovedDraft(leader: Leader, draftId: string, opts: { origin?: string } = {}): Promise<SendSummary> {
  const access = await accessFor(leader);
  const found = await getDraft(leader, draftId);
  if (!found) throw new MessagingError("Draft not found.", "not_found");
  if (!canSendDraft(access, found)) {
    throw new MessagingError(
      access.role === "deacon" ? "Deacons can send shepherding follow-ups. Ask a pastor or staff member to send this one." : "Your role can draft messages but not send them. Ask a pastor or staff member to send it.",
      "forbidden",
    );
  }
  const status = messagingStatus();
  const channel = status[found.channel === "sms" ? "sms" : "email"];
  if (!channel.configured) {
    throw new MessagingError(`${found.channel === "sms" ? "Text messages" : "Email"} aren't set up yet.`, "not_configured", channel.missing);
  }
  const base = appUrl() ?? opts.origin?.replace(/\/+$/, "") ?? null;

  return withLock(`msg:${leader.churchId}:send:${draftId}`, async () => {
    const draft = (await getDraft(leader, draftId))!;
    if (!SENDABLE.includes(draft.status)) throw new MessagingError(`This draft is already ${draft.status.replace("_", " ")}.`, "conflict");
    const blocked = await optOuts(leader.churchId);
    const now = Date.now();

    // Work out every recipient's address first, so the rate check covers exactly what will go out.
    const plan = await Promise.all(
      draft.recipients.map(async (r) => {
        const to = await resolveContact(leader.churchId, r, draft.channel);
        const optedOut = Boolean(to && (draft.channel === "sms" ? blocked.phones.has(to) : blocked.emails.has(to)));
        return { r, to, optedOut };
      }),
    );
    const sendable = plan.filter((p) => p.to && !p.optedOut).length;
    if (sendable) {
      const rate = await takeRate(leader.churchId, leader.leaderId, sendable, now);
      if (!rate.ok) throw new MessagingError(rate.reason, "rate_limited");
    }
    draft.status = "sending";
    await saveDraft(leader, draft);

    const deliveries: Delivery[] = [];
    let sent = 0, failed = 0, skipped = 0, optedOut = 0, noContact = 0;
    const tw = twilioConfig();
    const rs = resendConfig();
    for (const { r, to, optedOut: blockedOne } of plan) {
      const d: Delivery = {
        id: newId("dlv"),
        churchId: leader.churchId,
        draftId: draft.id,
        approvedBy: leader.leaderId,
        approvedByName: leader.name,
        personId: r.personId,
        name: r.name,
        channel: draft.channel,
        to: to ?? undefined,
        status: "sending",
        idempotencyKey: to ? idempotencyKey(leader.churchId, draft.id, r.personId, draft.channel, to) : "",
        createdAt: now,
        updatedAt: now,
        events: [],
      };
      const finish = async (s: DeliveryStatus, detail?: string) => {
        d.status = s;
        d.updatedAt = Date.now();
        d.events.push({ at: d.updatedAt, status: s, detail });
        await saveDelivery(d);
        deliveries.push(d);
      };
      if (!to) {
        noContact++;
        d.error = draft.channel === "sms" ? "No mobile number on file." : "No email address on file.";
        await finish("no_contact", d.error);
        continue;
      }
      if (blockedOne) {
        optedOut++;
        d.error = draft.channel === "sms" ? "On the do-not-text list (replied STOP)." : "Unsubscribed from email.";
        await finish("opted_out", d.error);
        continue;
      }
      const holder = await claimIdempotency(leader.churchId, d.idempotencyKey, d.id);
      if (holder) {
        skipped++;
        continue; // already sent to this person for this draft
      }
      const result =
        draft.channel === "sms"
          ? await sendSms(tw!, { to, body: r.text, idempotencyKey: d.idempotencyKey, statusCallback: base ? `${base}/api/messages/twilio/status?c=${encodeURIComponent(leader.churchId)}` : undefined }, transport)
          : await (async () => {
              const unsub = base ? unsubscribeUrl(base, leader.churchId, to) : undefined;
              return sendEmail(
                rs!,
                { to, subject: draft.subject?.trim() || `A note from ${churchLabel()}`, text: emailText(r.text, churchLabel(), unsub), html: emailHtml(r.text, churchLabel(), unsub), idempotencyKey: d.idempotencyKey, unsubscribeUrl: unsub, tags: [{ name: "draft", value: draft.id.replace(/[^\w-]/g, "_") }] },
                transport,
              );
            })();
      if (result.ok) {
        sent++;
        d.providerId = result.providerId;
        await finish(result.status === "queued" || result.status === "accepted" ? "queued" : "sent");
      } else if (result.optedOut) {
        optedOut++;
        await optOutPhone(leader.churchId, to);
        d.error = result.message;
        d.errorCode = result.code;
        await finish("opted_out", result.message);
      } else {
        failed++;
        d.error = result.message;
        d.errorCode = result.code;
        // A retryable failure (network, 429, 5xx) frees the key so Send can try this person again.
        if (result.retryable) await releaseIdempotency(leader.churchId, d.idempotencyKey);
        await finish("failed", result.message);
      }
    }
    const reached = sent + skipped;
    draft.status = reached && !failed ? "sent" : reached ? "partly_sent" : "failed";
    if (!sendable && !skipped) draft.status = "failed";
    draft.sentAt = Date.now();
    draft.sentBy = leader.leaderId;
    draft.delivery = { sent, failed, skipped, optedOut, noContact };
    await saveDraft(leader, draft);
    await audit(leader, { action: "message.send", detail: `${draft.id} ${draft.channel}: ${sent} sent, ${failed} failed, ${optedOut} opted out, ${noContact} without contact, ${skipped} already sent` });
    return { draft, sent, failed, skipped, optedOut, noContact, deliveries };
  });
}

/* ---------- Status webhooks ---------- */

const RANK: Record<DeliveryStatus, number> = { sending: 0, queued: 1, sent: 2, delivered: 3, failed: 4, undelivered: 4, bounced: 4, complained: 5, opted_out: 5, no_contact: 5 };

async function applyStatus(d: Delivery, next: DeliveryStatus, detail?: string, code?: string) {
  // Callbacks arrive out of order: never move backwards (delivered stays delivered after a late "sent").
  if (RANK[next] < RANK[d.status] && !FINAL_BAD.includes(next)) return d;
  if (d.status === next) return d;
  d.status = next;
  d.updatedAt = Date.now();
  if (code) d.errorCode = code;
  if (detail) d.error = detail;
  d.events.push({ at: d.updatedAt, status: next, detail });
  await saveDelivery(d);
  return d;
}

const TWILIO_STATUS: Record<string, DeliveryStatus> = { accepted: "queued", queued: "queued", sending: "queued", sent: "sent", delivered: "delivered", undelivered: "undelivered", failed: "failed", read: "delivered" };

/** A verified Twilio status callback. */
export async function applyTwilioCallback(params: Record<string, string>) {
  const sid = params.MessageSid || params.SmsSid;
  if (!sid) return null;
  const d = await deliveryByRef("twilio", sid);
  if (!d) return null;
  const code = params.ErrorCode || undefined;
  if (code === "21610") {
    if (d.to) await optOutPhone(d.churchId, d.to);
    return applyStatus(d, "opted_out", "Replied STOP; added to the do-not-text list.", code);
  }
  const next = TWILIO_STATUS[(params.MessageStatus || params.SmsStatus || "").toLowerCase()];
  if (!next) return d;
  return applyStatus(d, next, next === "failed" || next === "undelivered" ? `The carrier didn't deliver it${code ? ` (error ${code})` : ""}.` : undefined, code);
}

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"];
const START_WORDS = ["start", "unstop", "yes"];

/** A verified inbound text: STOP and its synonyms add the number to the church's do-not-text list; START removes it. */
export async function applyInboundSms(churchId: string, params: Record<string, string>) {
  const word = (params.Body ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const from = params.From ?? "";
  if (STOP_WORDS.includes(word)) {
    await optOutPhone(churchId, from);
    return "opted_out" as const;
  }
  if (START_WORDS.includes(word)) {
    await optInPhone(churchId, from);
    return "opted_in" as const;
  }
  return "ignored" as const;
}

type ResendEvent = { type?: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string } } };

/** A verified Resend webhook (svix-signed). */
export async function applyResendEvent(evt: ResendEvent) {
  const id = evt.data?.email_id;
  if (!id || !evt.type) return null;
  const d = await deliveryByRef("resend", id);
  if (!d) return null;
  switch (evt.type) {
    case "email.sent":
      return applyStatus(d, "sent");
    case "email.delivered":
      return applyStatus(d, "delivered");
    case "email.bounced": {
      const permanent = !evt.data?.bounce?.type || /permanent|hard/i.test(evt.data.bounce.type);
      if (permanent && d.to) await optOutEmail(d.churchId, d.to);
      return applyStatus(d, "bounced", permanent ? "The address bounced; it won't be emailed again." : "The email bounced for now.");
    }
    case "email.complained":
      if (d.to) await optOutEmail(d.churchId, d.to);
      return applyStatus(d, "complained", "Marked as spam; added to the do-not-email list.");
    case "email.failed":
      return applyStatus(d, "failed", "Resend couldn't send it.");
    default:
      return d;
  }
}
