import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { deleteEvent, updateEvent } from "@/lib/calendar/service";
import { EventInputSchema } from "@/lib/calendar/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  const parsed = EventInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the event details." }, { status: 400 });
  const event = await updateEvent(leader, id, parsed.data, "leader");
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  return NextResponse.json({ event });
}

export async function DELETE(_request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  const removed = await deleteEvent(leader, id, "leader");
  if (!removed) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
