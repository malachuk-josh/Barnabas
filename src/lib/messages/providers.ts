import type { ResendConfig, TwilioConfig } from "./config";

/**
 * Twilio and Resend over their REST APIs with plain fetch (no SDKs). Each call returns a provider id or a
 * classified error; secrets go only into the Authorization header and are never logged or returned.
 */

export type Fetch = typeof fetch;

export type ProviderResult =
  | { ok: true; providerId: string; status: string }
  | { ok: false; code?: string; optedOut?: boolean; retryable: boolean; message: string };

/** Twilio error 21610: the recipient replied STOP. Twilio refuses to send to them until they reply START. */
export const TWILIO_OPTED_OUT = "21610";

export async function sendSms(
  cfg: TwilioConfig,
  msg: { to: string; body: string; statusCallback?: string; idempotencyKey: string },
  fetchImpl: Fetch = fetch,
): Promise<ProviderResult> {
  const form = new URLSearchParams({ To: msg.to, Body: msg.body });
  if (cfg.messagingServiceSid) form.set("MessagingServiceSid", cfg.messagingServiceSid);
  else form.set("From", cfg.from!);
  if (msg.statusCallback) form.set("StatusCallback", msg.statusCallback);
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  let res: Response;
  try {
    res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Twilio drops a repeated request with the same token within its idempotency window.
        "I-Twilio-Idempotency-Token": msg.idempotencyKey,
      },
      body: form.toString(),
    });
  } catch {
    return { ok: false, retryable: true, message: "Couldn't reach Twilio." };
  }
  const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number | string; message?: string };
  if (res.ok && json.sid) return { ok: true, providerId: json.sid, status: json.status ?? "queued" };
  const code = json.code !== undefined ? String(json.code) : undefined;
  if (code === TWILIO_OPTED_OUT) return { ok: false, code, optedOut: true, retryable: false, message: "This number replied STOP, so Twilio won't text it." };
  return { ok: false, code, retryable: res.status === 429 || res.status >= 500, message: twilioMessage(code, res.status) };
}

function twilioMessage(code: string | undefined, status: number) {
  if (code === "21211" || code === "21614") return "That isn't a number that can get texts.";
  if (code === "21408" || code === "21612") return "Twilio can't text that number from this account (check the number's country and registration).";
  if (code === "30034" || code === "21610") return "Twilio refused this text (the number may need A2P 10DLC registration).";
  if (status === 401) return "Twilio didn't accept the account SID and auth token.";
  return `Twilio couldn't send it${code ? ` (error ${code})` : ""}.`;
}

export async function sendEmail(
  cfg: ResendConfig,
  msg: { to: string; subject: string; text: string; html: string; idempotencyKey: string; unsubscribeUrl?: string; tags?: { name: string; value: string }[] },
  fetchImpl: Fetch = fetch,
): Promise<ProviderResult> {
  const headers: Record<string, string> = {};
  if (msg.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${msg.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  let res: Response;
  try {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey },
      body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, headers, tags: msg.tags }),
    });
  } catch {
    return { ok: false, retryable: true, message: "Couldn't reach Resend." };
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
  if (res.ok && json.id) return { ok: true, providerId: json.id, status: "sent" };
  if (res.status === 401 || res.status === 403) return { ok: false, code: json.name, retryable: false, message: "Resend didn't accept the API key or the sending domain isn't verified." };
  if (res.status === 422) return { ok: false, code: json.name, retryable: false, message: "Resend refused this email (check RESEND_FROM uses a verified domain)." };
  return { ok: false, code: json.name, retryable: res.status === 429 || res.status >= 500, message: "Resend couldn't send it." };
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** A plain, readable HTML email with the unsubscribe line at the bottom. */
export function emailHtml(text: string, church: string, unsubscribeUrl?: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const foot = unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#4d625f">Sent by ${escapeHtml(church)}. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#4d625f">Unsubscribe</a> from these emails.</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f6f4;font-family:Figtree,Arial,sans-serif;color:#0f2423;line-height:1.5"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">${paragraphs}${foot}</div></body></html>`;
}

export function emailText(text: string, church: string, unsubscribeUrl?: string) {
  return unsubscribeUrl ? `${text}\n\n--\nSent by ${church}. Unsubscribe: ${unsubscribeUrl}` : text;
}
