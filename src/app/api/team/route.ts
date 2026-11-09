import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { ROLES } from "@/lib/auth/roles";
import { audit } from "@/lib/data/records";
import { getLeaderRecord, isAdminRecord, listLeaders, setLeaderRole } from "@/lib/team";

export const runtime = "nodejs";

function teamView(records: Awaited<ReturnType<typeof listLeaders>>) {
  return records.map((r) => ({
    leaderId: r.leaderId,
    name: r.name,
    email: r.email,
    title: r.role,
    role: r.access,
    admin: isAdminRecord(r, r.email),
    lastSignedInAt: r.signedInAt,
  }));
}

/** The leaders who have signed in, with their roles. Admins only. */
export async function GET() {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  return NextResponse.json({ leaders: teamView(await listLeaders(leader.churchId)) });
}

const Body = z.object({ leaderId: z.string().regex(/^[a-f0-9]{8,64}$/), role: z.enum(ROLES) });

export async function PUT(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pick a leader and a role." }, { status: 400 });
  const current = await getLeaderRecord(leader.churchId, parsed.data.leaderId);
  if (!current || current.status === "removed") return NextResponse.json({ error: "That leader hasn't signed in yet." }, { status: 404 });
  const updated = await setLeaderRole(leader.churchId, parsed.data.leaderId, parsed.data.role, leader.leaderId);
  if (!updated) return NextResponse.json({ error: "That leader hasn't signed in yet." }, { status: 404 });
  await audit(leader, { action: "team.role", detail: `${updated.leaderId} -> ${parsed.data.role}` });
  return NextResponse.json({ leaders: teamView(await listLeaders(leader.churchId)) });
}
