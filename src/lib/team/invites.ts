import { createHash, randomBytes } from "crypto";
import { config } from "../config";
import { appUrl, resendConfig, twilioConfig } from "../messages/config";
import { normalizeEmail, normalizePhone } from "../messages/phone";
import { sendEmail, sendSms } from "../messages/providers";
import { getJSON, kv, setJSON } from "../store";
import { getLeaderRecord, leaderKey, type LeaderRecord } from "./index";

/**
 * Invitations to Barnabas. An admin adds someone on the Admin page and sends an invite by email and/or text.
 * The invite carries a personal link (/signin?invite=...) that signs them in without the church access code:
 * good for 30 days, for that email only, and replaced by any newer invite. Only a hash of the token is stored.
 */

export const INVITE_DAYS = 30;
const TTL_SECONDS = INVITE_DAYS * 24 * 3600;

export type InviteSend = { via: "email" | "text"; to: string; ok: boolean; message?: string; at: number };
export type InviteState = { tokenHash: string; createdAt: number; expiresAt: number; by: string; sends: InviteSend[] };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenKey = (churchId: string, h: string) => `invite:${churchId}:${h}`;

export function inviteLink(token: string, origin?: string) {
  const base = appUrl() ?? origin?.replace(/\/+$/, "") ?? "";
  return `${base}/signin?invite=${encodeURIComponent(token)}`;
}

/** Which ways an invite can go right now (the same Twilio and Resend setup as Drafts). */
export function inviteChannels() {
  return { email: Boolean(resendConfig()), text: Boolean(twilioConfig()) };
}

function inviteWords(record: LeaderRecord, by: string, link: string) {
  const first = record.name.split(/\s+/)[0] || "there";
  const church = config.churchName;
  const text = `Hi ${first}, ${by} invited you to Barnabas, ${church}'s ministry app. Open your invitation to sign in: ${link} (good for ${INVITE_DAYS} days)`;
  const subject = `You're invited to Barnabas at ${church}`;
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#1f2a2a;max-width:520px">
<p>Hi ${escape(first)},</p>
<p>${escape(by)} invited you to <strong>Barnabas</strong>, ${escape(church)}'s ministry app.</p>
<p><a href="${escape(link)}" style="display:inline-block;background:#1e4543;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Accept your invitation</a></p>
<p style="color:#5b6b6a;font-size:14px">This link is just for you and works for ${INVITE_DAYS} days. If the button doesn't work, copy this into your browser:<br>${escape(link)}</p>
</div>`;
  return { text, subject, html, emailText: `${text}\n` };
}

/**
 * Makes a fresh invite for someone (replacing any earlier one) and sends it the ways asked for.
 * Returns the link too, so the admin can copy it when email and text aren't set up.
 */
export async function sendInvite(
  churchId: string,
  leaderId: string,
  opts: { by: string; email?: boolean; text?: boolean; origin?: string },
): Promise<{ link: string; sends: InviteSend[]; record: LeaderRecord } | null> {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record || record.removed) return null;
  const token = randomBytes(24).toString("base64url");
  const now = Date.now();
  const link = inviteLink(token, opts.origin);
  const words = inviteWords(record, opts.by, link);
  const sends: InviteSend[] = [];

  if (opts.email) {
    const to = normalizeEmail(record.email);
    const cfg = resendConfig();
    if (!to) sends.push({ via: "email", to: record.email, ok: false, message: "That email doesn't look right.", at: now });
    else if (!cfg) sends.push({ via: "email", to, ok: false, message: "Email isn't set up yet (RESEND_API_KEY and RESEND_FROM in Vercel).", at: now });
    else {
      const r = await sendEmail(cfg, { to, subject: words.subject, text: words.emailText, html: words.html, idempotencyKey: hash(`email|${token}`).slice(0, 40), tags: [{ name: "kind", value: "invite" }] });
      sends.push({ via: "email", to, ok: r.ok, ...(r.ok ? {} : { message: r.message }), at: now });
    }
  }
  if (opts.text) {
    const to = normalizePhone(record.phone);
    const cfg = twilioConfig();
    if (!to) sends.push({ via: "text", to: record.phone ?? "", ok: false, message: "Add a mobile number to text an invite.", at: now });
    else if (!cfg) sends.push({ via: "text", to, ok: false, message: "Texting isn't set up yet (Twilio settings in Vercel).", at: now });
    else {
      const r = await sendSms(cfg, { to, body: words.text, idempotencyKey: hash(`sms|${token}`).slice(0, 40) });
      sends.push({ via: "text", to, ok: r.ok, ...(r.ok ? {} : { message: r.message }), at: now });
    }
  }

  // The newest invite replaces any earlier one.
  if (record.invite?.tokenHash) await kv().del(tokenKey(churchId, record.invite.tokenHash));
  const h = hash(token);
  await setJSON(tokenKey(churchId, h), { leaderId }, { ttlSeconds: TTL_SECONDS });
  const next: LeaderRecord = { ...record, invite: { tokenHash: h, createdAt: now, expiresAt: now + TTL_SECONDS * 1000, by: opts.by, sends } };
  await setJSON(leaderKey(churchId, leaderId), next);
  return { link, sends, record: next };
}

/** The person an invite link is for, if it's current and they're still on the list. */
export async function inviteFor(churchId: string, token: string | undefined | null): Promise<LeaderRecord | null> {
  if (!token || token.length > 100) return null;
  const h = hash(token);
  const hit = await getJSON<{ leaderId: string }>(tokenKey(churchId, h));
  if (!hit) return null;
  const record = await getLeaderRecord(churchId, hit.leaderId);
  if (!record || record.removed || record.invite?.tokenHash !== h || record.invite.expiresAt < Date.now()) return null;
  return record;
}

/** Used once: after they sign in with it, the link stops working. */
export async function redeemInvite(churchId: string, record: LeaderRecord) {
  if (!record.invite) return;
  await kv().del(tokenKey(churchId, record.invite.tokenHash));
  const fresh = await getLeaderRecord(churchId, record.leaderId);
  if (fresh) await setJSON(leaderKey(churchId, record.leaderId), { ...fresh, invite: { ...fresh.invite!, acceptedAt: Date.now() } });
}
