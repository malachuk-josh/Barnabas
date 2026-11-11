import { NextResponse } from "next/server";
import { z } from "zod";
import { accessCode, config } from "@/lib/config";
import { SESSION_COOKIE, leaderIdFor, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { ensureProfile, handsFreeOnSignIn } from "@/lib/profile";
import { getLeaderRecord, maySignIn, recordSignIn } from "@/lib/team";
import { inviteFor, redeemInvite } from "@/lib/team/invites";

// Email and the church access code, or email and a personal invite link (then no code is needed).
const Body = z
  .object({
    email: z.string().trim().email().max(200),
    code: z.string().max(200).optional().default(""),
    invite: z.string().max(100).optional(),
    timezone: z.string().max(80).optional(),
  })
  .refine((b) => b.code.trim() || b.invite, { message: "code" });

/** A name for someone who signs in before anyone has written one down: the part of their email before the @. */
function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter((w) => /^[a-z]+$/i.test(w));
  return words.length ? words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join(" ") : "Friend";
}

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
    return NextResponse.json({ error: "Enter your email and the church access code." }, { status: 400 });
  }
  const { email, invite } = parsed.data;
  const leaderId = await leaderIdFor(config.churchId, email);
  // An invite link lets its own person in without the access code.
  const invited = invite ? await inviteFor(config.churchId, invite) : null;
  if (invite && !parsed.data.code.trim()) {
    if (!invited) return NextResponse.json({ error: "This invitation has expired or was replaced by a newer one. Ask your church administrator to send a new one, or use the church access code." }, { status: 401 });
    if (invited.leaderId !== leaderId) return NextResponse.json({ error: "This invitation is for a different email. Use the email it was sent to." }, { status: 401 });
  } else {
    const expected = accessCode();
    if (!expected) {
      return NextResponse.json({ error: "Sign-in isn't set up yet. Ask your administrator to set BARNABAS_ACCESS_CODE." }, { status: 503 });
    }
    if (!sameText(parsed.data.code.trim(), expected)) {
      return NextResponse.json({ error: "That access code didn't match. Check with your church administrator." }, { status: 401 });
    }
  }
  // Only people an admin has added (Church office → Admin), and the admins from the server settings.
  if (!(await maySignIn(config.churchId, leaderId, email))) {
    return NextResponse.json({ error: "That email isn't on Barnabas yet. Ask your church administrator to add you." }, { status: 403 });
  }
  // Their name comes from the Admin page (or their own Settings later), not the sign-in form.
  const record = await getLeaderRecord(config.churchId, leaderId);
  const leader = { churchId: config.churchId, leaderId, name: record?.name || nameFromEmail(email), email: email.toLowerCase(), role: record?.role ?? "" };
  const profile = await handsFreeOnSignIn(leader, await ensureProfile(leader, parsed.data.timezone));
  // A returning leader keeps the name and role they set in Settings.
  leader.name = profile.name;
  leader.role = profile.role;
  // The team list, and the permission role an admin manages (new leaders start as "leader").
  await recordSignIn(leader);
  if (invited && invited.leaderId === leaderId) await redeemInvite(config.churchId, invited);
  const token = await signSession(leader);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
