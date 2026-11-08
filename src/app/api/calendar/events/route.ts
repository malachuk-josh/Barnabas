import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { calendarRange, createEvent } from "@/lib/calendar/service";
import { EventInputSchema } from "@/lib/calendar/store";
import { addDaysIso, todayIn } from "@/lib/calendar/time";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { timezone } = await getProfile(leader);
  const params = new URL(request.url).searchParams;
  const from = ISO.test(params.get("from") ?? "") ? params.get("from")! : todayIn(timezone);
  const to = ISO.test(params.get("to") ?? "") ? params.get("to")! : addDaysIso(from, 30);
  if (to < from || to > addDaysIso(from, 100)) return NextResponse.json({ error: "Pick a range of up to 100 days." }, { status: 400 });
  return NextResponse.json({ ...(await calendarRange(leader, from, to)), timezone, today: todayIn(timezone) });
}

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = EventInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the event details." }, { status: 400 });
  return NextResponse.json({ event: await createEvent(leader, parsed.data, "leader") });
}
