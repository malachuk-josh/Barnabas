import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "@/lib/finance/http";
import { clientAddress, RATE_LIMITS, rateLimit, tokenHash, TOKEN_RE } from "@/lib/care/welcome";
import { EventsError, register, resolveEventToken } from "@/lib/events/service";

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
    return NextResponse.json({ ok: true, status: reg.status, paymentDue: reg.payment.status === "due" ? reg.payment.amountCents : undefined });
  } catch (err) {
    if (err instanceof EventsError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err).replace(/^Check answers\.[^:]*: /, "").replace(/^Check [^:]*: /, "") }, { status: 400 });
    console.error("[barnabas] public registration failed", err);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again, or contact the church." }, { status: 500 });
  }
}
