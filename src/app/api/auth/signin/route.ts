import { NextResponse } from "next/server";
import { z } from "zod";
import { accessCode, config } from "@/lib/config";
import { SESSION_COOKIE, leaderIdFor, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { ensureProfile } from "@/lib/profile";
import { setJSON } from "@/lib/store";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  role: z.string().trim().max(80).optional().default(""),
  code: z.string().min(1).max(200),
  timezone: z.string().max(80).optional(),
});

function sameText(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your name, a valid email and the church access code." }, { status: 400 });
  }
  const expected = accessCode();
  if (!expected) {
    return NextResponse.json({ error: "Sign-in isn't set up yet. Ask your administrator to set BARNABAS_ACCESS_CODE." }, { status: 503 });
  }
  if (!sameText(parsed.data.code.trim(), expected)) {
    return NextResponse.json({ error: "That access code didn't match. Check with your church administrator." }, { status: 401 });
  }
  const { name, email, role } = parsed.data;
  const leaderId = await leaderIdFor(config.churchId, email);
  const leader = { churchId: config.churchId, leaderId, name, email: email.toLowerCase(), role };
  await setJSON(`leader:${config.churchId}:${leaderId}`, { ...leader, signedInAt: Date.now() });
  const profile = await ensureProfile(leader, parsed.data.timezone);
  // A returning leader keeps the name and role they set in Settings.
  leader.name = profile.name;
  leader.role = profile.role;
  const token = await signSession(leader);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
