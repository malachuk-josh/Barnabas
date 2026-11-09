import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "@/lib/finance/http";
import { CareError, GuestInput, recordGuest } from "@/lib/care/service";
import { teamMembers } from "@/lib/care/team";
import { clientAddress, RATE_LIMITS, rateLimit, resolveToken, tokenHash, TOKEN_RE } from "@/lib/care/welcome";

export const runtime = "nodejs";

const notFound = () => NextResponse.json({ error: "This guest card link isn't active. Ask someone at the welcome table for a card." }, { status: 404 });
const tooMany = () => NextResponse.json({ error: "Thanks! We've had a lot of cards from here. Please try again in a few minutes." }, { status: 429 });

/**
 * Public: a guest fills in their own card. No session. The token must be an active link; submissions
 * are rate-limited per network address and per link; the response says only whether it worked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientAddress(request);
  if (!TOKEN_RE.test(token)) {
    await rateLimit(`welcome:miss:${ip}`, RATE_LIMITS.miss);
    return notFound();
  }
  const found = await resolveToken(token);
  if (!found) {
    if (!(await rateLimit(`welcome:miss:${ip}`, RATE_LIMITS.miss))) return tooMany();
    return notFound();
  }
  if (!(await rateLimit(`welcome:ip:${ip}`, RATE_LIMITS.ip))) return tooMany();
  if (!(await rateLimit(`welcome:tok:${await tokenHash(token)}`, RATE_LIMITS.token))) return tooMany();

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // Bots fill every field; people never see this one. Say thanks and keep nothing.
  if (typeof raw.website === "string" && raw.website.trim()) return NextResponse.json({ ok: true });
  try {
    const input = GuestInput.parse({
      name: raw.name,
      email: raw.email || undefined,
      phone: raw.phone || undefined,
      howHeard: raw.howHeard || undefined,
      kidsAges: raw.kidsAges || undefined,
      prayerRequest: raw.prayerRequest || undefined,
      prayerShareable: raw.prayerShareable === true,
      interests: Array.isArray(raw.interests) ? raw.interests : [],
    });
    await recordGuest(found.churchId, null, input, await teamMembers(found.churchId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CareError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] public guest card failed", err);
    return NextResponse.json({ error: "Something went wrong on our side. Please hand your card to a greeter." }, { status: 500 });
  }
}
