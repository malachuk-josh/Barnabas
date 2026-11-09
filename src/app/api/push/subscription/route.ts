import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { addSubscription, MAX_DEVICES, removeSubscription, SubscriptionInput } from "@/lib/notifications/subscriptions";
import { pushConfig } from "@/lib/push/vapid";

export const runtime = "nodejs";

const notSetUp = () => NextResponse.json({ error: "Push notifications aren't set up yet." }, { status: 503 });

/** Saves this device's push subscription for the signed-in leader (up to 10 devices; the oldest fall off). */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!pushConfig()) return notSetUp();
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = SubscriptionInput.safeParse(raw.subscription ?? raw);
  if (!parsed.success) return NextResponse.json({ error: "That push subscription isn't valid." }, { status: 400 });
  const result = await addSubscription(leader, parsed.data);
  return NextResponse.json({ ok: true, devices: result.devices, max: MAX_DEVICES });
}

const Remove = z.object({ endpoint: z.string().url().max(1000) });

/** Forgets this device. */
export async function DELETE(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = Remove.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Say which device to remove." }, { status: 400 });
  const result = await removeSubscription(leader, parsed.data.endpoint);
  return NextResponse.json({ ok: true, ...result });
}
