import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "@/lib/finance/http";
import { clientAddress, RATE_LIMITS, rateLimit, tokenHash, TOKEN_RE } from "@/lib/care/welcome";
import { attachCheckout, EventsError, HOLD_MINUTES, register, resolveEventToken } from "@/lib/events/service";
import { eventSessionParams, returnOrigin } from "@/lib/stripe/checkout";
import { stripePort } from "@/lib/stripe/client";
import { stripeReady } from "@/lib/stripe/config";

export const runtime = "nodejs";

const notFound = () => NextResponse.json({ error: "This registration link isn't active. Check with the church for the current link." }, { status: 404 });
const tooMany = () => NextResponse.json({ error: "We've had a lot of registrations from here. Please try again in a few minutes." }, { status: 429 });

/**
 * Public: register for an event. No session. The token must be an event's current link; submissions are
 * rate-limited per network address and per link, with a honeypot; the response says only how it went.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientAddress(request);
  if (!TOKEN_RE.test(token)) {
    await rateLimit(`register:miss:${ip}`, RATE_LIMITS.miss);
    return notFound();
  }
  const found = await resolveEventToken(token);
  if (!found) {
    if (!(await rateLimit(`register:miss:${ip}`, RATE_LIMITS.miss))) return tooMany();
    return notFound();
  }
  if (!(await rateLimit(`register:ip:${ip}`, RATE_LIMITS.ip))) return tooMany();
  if (!(await rateLimit(`register:tok:${await tokenHash(token)}`, { limit: 200, windowSeconds: 60 * 60 }))) return tooMany();

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof raw.website === "string" && raw.website.trim()) return NextResponse.json({ ok: true, status: "registered" });
  try {
    const reg = await register(found.churchId, found.event.id, { name: raw.name, email: raw.email || undefined, phone: raw.phone || undefined, partySize: raw.partySize ?? 1, answers: raw.answers ?? {} }, null);
    // A paid event with Stripe connected: hold the spot and send them to Stripe Checkout. Waitlisted
    // registrations pay later (a leader marks it); if Checkout can't be reached, it's due at the door.
    const port = stripeReady() ? stripePort() : null;
    if (port && reg.status === "registered" && reg.payment.status === "due" && found.event.priceCents) {
      try {
        const params = eventSessionParams({ id: found.event.id, title: found.event.title, priceCents: found.event.priceCents, date: found.event.date }, reg, { churchId: found.churchId, origin: returnOrigin(request), token, holdMinutes: HOLD_MINUTES });
        const session = await port.createCheckout(params, `reg-${reg.id}`);
        await attachCheckout(found.churchId, reg.id, session.id, (params.expires_at ?? 0) * 1000);
        return NextResponse.json({ ok: true, status: reg.status, paymentDue: reg.payment.amountCents, checkoutUrl: session.url, holdMinutes: HOLD_MINUTES });
      } catch (err) {
        console.error("[barnabas] event checkout failed", err instanceof Error ? err.message : "unknown");
      }
    }
    return NextResponse.json({ ok: true, status: reg.status, paymentDue: reg.payment.status === "due" ? reg.payment.amountCents : undefined });
  } catch (err) {
    if (err instanceof EventsError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err).replace(/^Check answers\.[^:]*: /, "").replace(/^Check [^:]*: /, "") }, { status: 400 });
    console.error("[barnabas] public registration failed", err);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again, or contact the church." }, { status: 500 });
  }
}
