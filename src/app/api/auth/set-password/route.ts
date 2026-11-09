import { NextResponse } from "next/server";
import { z } from "zod";
import { clientAddress, rateLimit } from "@/lib/care/welcome";
import { audit } from "@/lib/data/records";
import { setPassword } from "@/lib/auth/credentials";
import { LINK_TOKEN_RE, consumeLink, resolveLink, revokeLinks } from "@/lib/auth/links";
import { unlock } from "@/lib/auth/lockout";
import { PASSWORD_MAX, checkPassword } from "@/lib/auth/password";
import { activateLeader, bumpSessionVersion, getLeaderRecord } from "@/lib/team";

export const runtime = "nodejs";

const Body = z.object({ token: z.string().regex(LINK_TOKEN_RE), password: z.string().min(1).max(PASSWORD_MAX * 2) });

const EXPIRED = "This link has expired or was already used. Ask your church administrator for a new one.";
const SET_PASSWORD_LIMITS = { ip: { limit: 10, windowSeconds: 10 * 60 } };

/** Public: set a password from an invite or reset link. Rate-limited per network address; each link works once. */
export async function POST(request: Request) {
  if (!(await rateLimit(`setpw:ip:${clientAddress(request)}`, SET_PASSWORD_LIMITS.ip))) {
    return NextResponse.json({ error: "Too many tries. Please wait a few minutes and try again." }, { status: 429 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: EXPIRED }, { status: 400 });
  const link = await resolveLink(parsed.data.token);
  const record = link ? await getLeaderRecord(link.churchId, link.leaderId) : null;
  if (!link || !record || record.status === "removed") return NextResponse.json({ error: EXPIRED }, { status: 400 });
  const policy = checkPassword(parsed.data.password, record.email);
  if (!policy.ok) return NextResponse.json({ error: policy.error, field: "password" }, { status: 400 });
  if (!(await consumeLink(parsed.data.token))) return NextResponse.json({ error: EXPIRED }, { status: 400 });
  await setPassword(link.churchId, link.leaderId, parsed.data.password);
  await revokeLinks(link.churchId, link.leaderId);
  await activateLeader(link.churchId, link.leaderId);
  await unlock(link.churchId, record.email);
  // A reset ends every session the leader had; an invite has none to end.
  if (link.kind === "reset") await bumpSessionVersion(link.churchId, link.leaderId);
  await audit({ churchId: link.churchId, leaderId: link.leaderId, name: record.name, email: record.email, role: record.role }, { action: `auth.password.${link.kind}`, detail: "Password set from a link" });
  return NextResponse.json({ ok: true, email: record.email });
}
