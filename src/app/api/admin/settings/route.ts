import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse } from "@/lib/auth/require";
import { JOIN_POLICIES, type JoinPolicy } from "@/lib/auth/settings";
import { adminOverview, changeJoinPolicy } from "@/lib/auth/admin";
import { requireOwner } from "@/lib/auth/adminHttp";

export const runtime = "nodejs";

const Body = z.object({ join: z.enum(JOIN_POLICIES as [JoinPolicy, ...JoinPolicy[]]) });

/** "Who can join": invite only, or anyone with the church access code. */
export async function PUT(request: Request) {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pick who can join." }, { status: 400 });
  await changeJoinPolicy(owner, parsed.data.join);
  return NextResponse.json(await adminOverview(owner.churchId));
}
