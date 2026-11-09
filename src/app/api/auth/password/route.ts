import { NextResponse } from "next/server";
import { z } from "zod";
import { accessCode } from "@/lib/config";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { checkStoredPassword, credentialState, setPassword } from "@/lib/auth/credentials";
import { isLocked, recordFailure, clearFailures } from "@/lib/auth/lockout";
import { PASSWORD_MAX, burnPasswordCheck, checkPassword } from "@/lib/auth/password";
import { sameSecret } from "@/lib/auth/signin";
import { clientAddress } from "@/lib/care/welcome";
import { audit } from "@/lib/data/records";
import { bumpSessionVersion } from "@/lib/team";

export const runtime = "nodejs";

const Body = z.object({
  current: z.string().max(PASSWORD_MAX * 2).optional().default(""),
  /** For a leader still signed in from before passwords, who hasn't chosen one yet. */
  code: z.string().max(200).optional().default(""),
  password: z.string().min(1).max(PASSWORD_MAX * 2),
});

/** Whether the signed-in leader has a password yet. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return NextResponse.json(await credentialState(leader.churchId, leader.leaderId));
}

/**
 * Change (or first set) your own password. Every other session ends; this one gets a fresh cookie.
 * Wrong current passwords count toward the same lockout as sign-in.
 */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter your current password and a new one." }, { status: 400 });
  if (await isLocked(leader.churchId, leader.email)) {
    return NextResponse.json({ error: "Too many tries. Password changes are paused for 15 minutes." }, { status: 429 });
  }
  const { hasPassword } = await credentialState(leader.churchId, leader.leaderId);
  let ok: boolean;
  if (hasPassword) ok = (await checkStoredPassword(leader.churchId, leader.leaderId, parsed.data.current)) === "match";
  else {
    await burnPasswordCheck(parsed.data.code || "-");
    const expected = accessCode();
    ok = Boolean(expected) && sameSecret(parsed.data.code.trim(), expected ?? "");
  }
  if (!ok) {
    await recordFailure(leader.churchId, leader.email, clientAddress(request));
    return NextResponse.json({ error: hasPassword ? "Your current password didn't match." : "The church access code didn't match.", field: "current" }, { status: 401 });
  }
  await clearFailures(leader.churchId, leader.email);
  const policy = checkPassword(parsed.data.password, leader.email);
  if (!policy.ok) return NextResponse.json({ error: policy.error, field: "password" }, { status: 400 });
  if (hasPassword && parsed.data.password === parsed.data.current) {
    return NextResponse.json({ error: "Your new password is the same as your current one.", field: "password" }, { status: 400 });
  }
  await setPassword(leader.churchId, leader.leaderId, parsed.data.password);
  const sv = (await bumpSessionVersion(leader.churchId, leader.leaderId)) ?? 0;
  await audit(leader, { action: hasPassword ? "auth.password.change" : "auth.password.create", detail: "Other sessions signed out" });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await signSession({ ...leader, sv }), sessionCookieOptions);
  return response;
}
