import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "../finance/http";
import { appUrl, twilioConfig } from "./config";
import { MessagingError } from "./service";
import { validTwilioSignature } from "./signatures";

const STATUS: Record<MessagingError["code"], number> = { not_found: 404, forbidden: 403, conflict: 409, not_configured: 503, rate_limited: 429, invalid: 400 };

export async function respondMessages(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (err) {
    if (err instanceof MessagingError) return NextResponse.json({ error: err.message, code: err.code, missing: err.missing }, { status: STATUS[err.code] });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] messaging request failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}

/**
 * Reads a Twilio webhook (form-encoded) and checks X-Twilio-Signature against TWILIO_AUTH_TOKEN, for the URL
 * as the request arrived and as APP_URL spells it. Returns the parameters, or null when it isn't from Twilio.
 */
export async function verifiedTwilioParams(request: Request): Promise<Record<string, string> | null> {
  const cfg = twilioConfig();
  if (!cfg) return null;
  const text = await request.text();
  if (text.length > 20_000) return null;
  const params = Object.fromEntries(new URLSearchParams(text));
  const signature = request.headers.get("x-twilio-signature");
  const url = new URL(request.url);
  const candidates = [request.url];
  const base = appUrl();
  if (base) candidates.push(`${base}${url.pathname}${url.search}`);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) candidates.push(`${request.headers.get("x-forwarded-proto") ?? "https"}://${forwardedHost}${url.pathname}${url.search}`);
  return candidates.some((u) => validTwilioSignature(cfg.authToken, u, params, signature)) ? params : null;
}

export const emptyTwiml = () => new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "Content-Type": "text/xml" } });
