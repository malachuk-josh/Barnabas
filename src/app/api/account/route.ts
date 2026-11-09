import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { deleteLeaderData } from "@/lib/account/delete";

export const runtime = "nodejs";

const Body = z.object({ confirm: z.literal("DELETE") });

/** Deletes everything Barnabas stores about the signed-in leader, then signs them out. */
export async function DELETE(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!Body.safeParse(await request.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  }
  await deleteLeaderData(leader);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
