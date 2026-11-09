import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time comparison of two strings (false when lengths differ). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Twilio's request signature (X-Twilio-Signature): base64 HMAC-SHA1, keyed with the auth token, of the full
 * URL Twilio requested followed by every POST parameter, sorted by name, as name then value.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature || !authToken) return false;
  const expected = twilioSignature(authToken, url, params);
  if (safeEqual(expected, signature)) return true;
  // Twilio signs the URL as it was configured; tolerate a port being added or dropped by a proxy.
  const u = new URL(url);
  const alt = new URL(url);
  alt.port = u.port ? "" : u.protocol === "https:" ? "443" : "80";
  return safeEqual(twilioSignature(authToken, alt.toString(), params), signature);
}

/**
 * Svix webhook signatures, used by Resend: `svix-signature` holds space-separated `v1,<base64>` entries,
 * each an HMAC-SHA256 of `${svix-id}.${svix-timestamp}.${body}` keyed with the base64 part of the
 * `whsec_...` secret. Timestamps more than five minutes off are refused (replay protection).
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
export function svixSignature(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function validSvix(
  secret: string | undefined,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = svixSignature(secret, id, timestamp, body);
  return signature
    .split(" ")
    .map((part) => part.split(","))
    .some(([version, sig]) => version === "v1" && Boolean(sig) && safeEqual(sig, expected));
}

/** A short HMAC (SESSION_SECRET-keyed by the caller) for unsubscribe links. */
export function hmacToken(key: string | Uint8Array, data: string): string {
  return createHmac("sha256", key).update(data).digest("base64url").slice(0, 32);
}
