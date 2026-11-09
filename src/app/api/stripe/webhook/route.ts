import { NextResponse } from "next/server";
import { stripePort, verifyWebhook } from "@/lib/stripe/client";
import { stripeConfig } from "@/lib/stripe/config";
import { handleStripeEvent } from "@/lib/stripe/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public (no session): Stripe's webhook. The Stripe-Signature header is verified against the raw body
 * with STRIPE_WEBHOOK_SECRET before anything is read; each event is handled once by its id. Responses
 * say only whether it worked: no church data and no secrets.
 */
export async function POST(request: Request) {
  const cfg = stripeConfig();
  if (!cfg?.webhookSecret) return NextResponse.json({ error: "Online giving isn't set up." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let event;
  try {
    event = verifyWebhook(raw, signature, cfg.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signature didn't verify." }, { status: 400 });
  }
  const port = stripePort();
  if (!port) return NextResponse.json({ error: "Online giving isn't set up." }, { status: 503 });
  try {
    const result = await handleStripeEvent(event, port);
    return NextResponse.json({ received: true, replay: result.replay, outcome: result.outcome });
  } catch (err) {
    // Stripe retries a non-2xx for up to three days; nothing was marked done, so the retry starts clean.
    console.error("[barnabas] stripe webhook failed", event.type, event.id, err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Couldn't record that event. Stripe will retry." }, { status: 500 });
  }
}
