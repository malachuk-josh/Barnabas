/**
 * Text and email delivery settings, read from the environment on every call (server only).
 * Nothing here is ever returned to the browser except which variable names are missing.
 */

export type ChannelStatus = { configured: boolean; missing: string[]; from?: string };

export type TwilioConfig = { accountSid: string; authToken: string; from?: string; messagingServiceSid?: string };
export type ResendConfig = { apiKey: string; from: string; webhookSecret?: string };

export function twilioConfig(env: NodeJS.ProcessEnv = process.env): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM_NUMBER?.trim() || undefined;
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined;
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) return null;
  return { accountSid, authToken, from, messagingServiceSid };
}

export function resendConfig(env: NodeJS.ProcessEnv = process.env): ResendConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, webhookSecret: env.RESEND_WEBHOOK_SECRET?.trim() || undefined };
}

/** Last four digits of the sending number, for the setup screen. */
function maskNumber(n?: string) {
  return n ? `•••${n.replace(/\D/g, "").slice(-4)}` : undefined;
}

export function messagingStatus(env: NodeJS.ProcessEnv = process.env): { sms: ChannelStatus; email: ChannelStatus; webhooks: { twilio: boolean; resend: boolean }; appUrl: string | null } {
  const smsMissing = [
    !env.TWILIO_ACCOUNT_SID?.trim() && "TWILIO_ACCOUNT_SID",
    !env.TWILIO_AUTH_TOKEN?.trim() && "TWILIO_AUTH_TOKEN",
    !env.TWILIO_FROM_NUMBER?.trim() && !env.TWILIO_MESSAGING_SERVICE_SID?.trim() && "TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID",
  ].filter((x): x is string => Boolean(x));
  const emailMissing = [!env.RESEND_API_KEY?.trim() && "RESEND_API_KEY", !env.RESEND_FROM?.trim() && "RESEND_FROM"].filter((x): x is string => Boolean(x));
  const tw = twilioConfig(env);
  const rs = resendConfig(env);
  return {
    sms: { configured: !smsMissing.length, missing: smsMissing, from: tw ? (tw.messagingServiceSid ? "Messaging Service" : maskNumber(tw.from)) : undefined },
    email: { configured: !emailMissing.length, missing: emailMissing, from: rs?.from.replace(/^.*<([^>]+)>.*$/, "$1") },
    webhooks: { twilio: Boolean(tw), resend: Boolean(rs?.webhookSecret) },
    appUrl: appUrl(env),
  };
}

/** The public address Twilio and Resend call back, and unsubscribe links point at. */
export function appUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env.APP_URL?.trim() || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return url ? url.replace(/\/+$/, "") : null;
}
