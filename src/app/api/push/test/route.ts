import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { notifyLeaders } from "@/lib/notifications/send";
import { listSubscriptions } from "@/lib/notifications/subscriptions";
import { getProfile } from "@/lib/profile";
import { pushConfig } from "@/lib/push/vapid";

export const runtime = "nodejs";

/** Sends a test notification to every device of the signed-in leader. Audited. */
export async function POST() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!pushConfig()) return NextResponse.json({ error: "Push notifications aren't set up yet." }, { status: 503 });
  const profile = await getProfile(leader);
  if (!profile.notifications.enabled) return NextResponse.json({ error: "Notifications are off. Turn them on first." }, { status: 409 });
  if (!(await listSubscriptions(leader)).length) return NextResponse.json({ error: "No device is set up yet. Turn on notifications for this device first." }, { status: 409 });
  const r = await notifyLeaders(leader.churchId, [leader.leaderId], "briefing", { title: "Barnabas", body: "This is a test notification. You're all set.", url: "/settings#notifications", tag: "test" }, { test: true });
  if (!r.sent) return NextResponse.json({ error: r.pruned ? "This device's subscription had expired. Turn notifications on for this device again." : "The push service didn't accept the test. Try again in a moment." }, { status: 502 });
  return NextResponse.json({ ok: true, sent: r.sent, pruned: r.pruned });
}
