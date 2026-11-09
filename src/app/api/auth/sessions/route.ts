import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { audit } from "@/lib/data/records";
import { bumpSessionVersion } from "@/lib/team";

export const runtime = "nodejs";

/** "Sign out of other devices": ends every session, then gives this one a fresh cookie. */
export async function DELETE() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const sv = (await bumpSessionVersion(leader.churchId, leader.leaderId)) ?? 0;
  await audit(leader, { action: "auth.sessions.sign_out_others", detail: "" });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await signSession({ ...leader, sv }), sessionCookieOptions);
  return response;
}
