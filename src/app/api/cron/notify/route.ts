import { NextResponse } from "next/server";
import { runMorningBriefing } from "@/lib/notifications/briefing";
import { cronAuthorized } from "@/lib/notifications/cron";
import { pushConfig } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron, hourly (vercel.json): sends the morning briefing to leaders whose local time is 7 AM.
 * No session: public in the middleware, protected here by CRON_SECRET (at least 16 characters).
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET isn't set." }, { status: 503 });
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!pushConfig()) return NextResponse.json({ ok: true, skipped: "Push notifications aren't set up (no VAPID keys)." });
  const briefing = await runMorningBriefing(new Date());
  return NextResponse.json({ ok: true, briefing });
}
