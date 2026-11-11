import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission, type PermittedLeader } from "@/lib/auth/require";
import { leaderIdFor } from "@/lib/auth/session";
import { LEVELS, LEVEL_LABELS, ROLE_LABELS, TEAM_ROLES, TEAM_ROLE_LABELS, isAdminEmail, isLevel, isRole, type Level, type TeamRole } from "@/lib/auth/roles";
import { audit } from "@/lib/data/records";
import { addPerson, getLeaderRecord, levelOf, listLeaders, removePerson, setPersonLevel, setPersonPhone, type LeaderRecord } from "@/lib/team";
import { inviteChannels, sendInvite, type InviteSend } from "@/lib/team/invites";
import { normalizePhone } from "@/lib/messages/phone";

export const runtime = "nodejs";

/** What the Admin page shows for each person. */
export type AdminPerson = {
  leaderId: string;
  name: string;
  email: string;
  title: string;
  level: Level;
  /** false: no level chosen yet; they keep their older role until an admin picks one. */
  levelChosen: boolean;
  olderRole?: string;
  finance: boolean;
  teamRole?: TeamRole;
  /** An admin from the server settings (BARNABAS_ADMIN_EMAILS): always Admin, can't be changed here. */
  fromServer: boolean;
  /** 0 = added and not signed in yet. */
  lastSignedInAt: number;
  me: boolean;
  phone?: string;
  /** The latest invite: when, how it went out, and when it stops working. */
  invite?: { sentAt: number; expiresAt: number; by: string; sends: InviteSend[]; expired: boolean };
};

function view(records: LeaderRecord[], me: string): AdminPerson[] {
  return records.map((r) => {
    const fromServer = isAdminEmail(r.email);
    const { level, finance, teamRole } = levelOf(r);
    return {
      leaderId: r.leaderId,
      name: r.name,
      email: r.email,
      title: r.role,
      level,
      levelChosen: fromServer || isLevel(r.level),
      olderRole: !fromServer && !isLevel(r.level) && isRole(r.access) ? ROLE_LABELS[r.access] : undefined,
      finance,
      teamRole,
      fromServer,
      lastSignedInAt: r.signedInAt ?? 0,
      me: r.leaderId === me,
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.invite ? { invite: { sentAt: r.invite.createdAt, expiresAt: r.invite.expiresAt, by: r.invite.by, sends: r.invite.sends, expired: r.invite.expiresAt < Date.now() } } : {}),
    };
  });
}

async function people(leader: PermittedLeader, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ people: view(await listLeaders(leader.churchId), leader.leaderId), channels: inviteChannels(), ...extra });
}

const origin = (request: Request) => new URL(request.url).origin;

/** Everyone on Barnabas, with their access. Admins only. */
export async function GET() {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  return people(leader);
}

const LevelInput = z.object({
  level: z.enum(LEVELS),
  finance: z.boolean().optional(),
  teamRole: z.enum(TEAM_ROLES).optional(),
});

const AddBody = LevelInput.extend({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(30).optional(),
  /** Send the invite right away, by email and/or text. */
  inviteEmail: z.boolean().optional(),
  inviteText: z.boolean().optional(),
});

function describe(input: z.infer<typeof LevelInput>) {
  if (input.level === "leader") return `${LEVEL_LABELS.leader}${input.finance ? " with finance" : ""}`;
  if (input.level === "team") return `${LEVEL_LABELS.team} (${TEAM_ROLE_LABELS[input.teamRole ?? "serving"]})`;
  return LEVEL_LABELS[input.level];
}

/** Add someone. They can sign in with the church access code and this email. */
export async function POST(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  const parsed = AddBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name, a valid email and a level." }, { status: 400 });
  const { name, email, phone: rawPhone, inviteEmail, inviteText, ...level } = parsed.data;
  const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
  if (rawPhone && !phone) return NextResponse.json({ error: "That mobile number doesn't look right. Use a 10-digit number." }, { status: 400 });
  if (isAdminEmail(email)) return NextResponse.json({ error: "That email is already an admin from the server settings." }, { status: 400 });
  const leaderId = await leaderIdFor(leader.churchId, email);
  const existing = await getLeaderRecord(leader.churchId, leaderId);
  if (existing && !existing.removed) return NextResponse.json({ error: `${existing.name} is already on Barnabas. Change their level below.` }, { status: 409 });
  await addPerson(leader.churchId, leaderId, { name, email, ...(phone ? { phone } : {}), ...level }, leader.leaderId);
  await audit(leader, { action: "team.add", detail: `${leaderId} as ${describe(level)}` });
  if (inviteEmail || inviteText) {
    const sent = await sendInvite(leader.churchId, leaderId, { by: leader.name, email: inviteEmail, text: inviteText, origin: origin(request) });
    await audit(leader, { action: "team.invite", detail: `${leaderId} ${sent?.sends.map((s) => `${s.via}:${s.ok ? "sent" : "failed"}`).join(" ") ?? ""}` });
    return people(leader, { invite: sent ? { leaderId, link: sent.link, sends: sent.sends } : undefined });
  }
  return people(leader);
}

const ChangeBody = LevelInput.extend({ leaderId: z.string().regex(/^[a-f0-9]{8,64}$/) });

/** Change someone's level, finance switch or team role. */
export async function PATCH(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  const parsed = ChangeBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pick a person and a level." }, { status: 400 });
  const { leaderId, ...level } = parsed.data;
  const record = await getLeaderRecord(leader.churchId, leaderId);
  if (!record || record.removed) return NextResponse.json({ error: "That person isn't on Barnabas." }, { status: 404 });
  if (isAdminEmail(record.email)) return NextResponse.json({ error: "Admins from the server settings stay Admin. Change BARNABAS_ADMIN_EMAILS in Vercel to change that." }, { status: 400 });
  if (leaderId === leader.leaderId && level.level !== "admin") return NextResponse.json({ error: "You can't lower your own access. Ask another admin." }, { status: 400 });
  await setPersonLevel(leader.churchId, leaderId, level, leader.leaderId);
  await audit(leader, { action: "team.level", detail: `${leaderId} -> ${describe(level)}` });
  return people(leader);
}

const RemoveBody = z.object({ leaderId: z.string().regex(/^[a-f0-9]{8,64}$/) });

/** Remove someone: they're signed out on their next tap and can't sign in again until added back. */
export async function DELETE(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  const parsed = RemoveBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
  const record = await getLeaderRecord(leader.churchId, parsed.data.leaderId);
  if (!record || record.removed) return NextResponse.json({ error: "That person isn't on Barnabas." }, { status: 404 });
  if (isAdminEmail(record.email)) return NextResponse.json({ error: "Admins from the server settings can't be removed here." }, { status: 400 });
  if (record.leaderId === leader.leaderId) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  await removePerson(leader.churchId, record.leaderId, leader.leaderId);
  await audit(leader, { action: "team.remove", detail: record.leaderId });
  return people(leader);
}

const InviteBody = z.object({
  leaderId: z.string().regex(/^[a-f0-9]{8,64}$/),
  email: z.boolean().optional(),
  text: z.boolean().optional(),
  /** A mobile number to save first (for a texted invite). */
  phone: z.string().trim().max(30).optional(),
});

/**
 * Sends (or re-sends) someone's invite by email and/or text, replacing any earlier link. With neither,
 * it just makes a fresh link for the admin to copy and send themselves.
 */
export async function PUT(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  const parsed = InviteBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pick a person to invite." }, { status: 400 });
  const record = await getLeaderRecord(leader.churchId, parsed.data.leaderId);
  if (!record || record.removed) return NextResponse.json({ error: "That person isn't on Barnabas." }, { status: 404 });
  if (parsed.data.phone !== undefined) {
    const phone = normalizePhone(parsed.data.phone);
    if (parsed.data.phone && !phone) return NextResponse.json({ error: "That mobile number doesn't look right. Use a 10-digit number." }, { status: 400 });
    await setPersonPhone(leader.churchId, record.leaderId, phone ?? undefined);
  }
  const sent = await sendInvite(leader.churchId, record.leaderId, { by: leader.name, email: parsed.data.email, text: parsed.data.text, origin: origin(request) });
  if (!sent) return NextResponse.json({ error: "That person isn't on Barnabas." }, { status: 404 });
  await audit(leader, { action: "team.invite", detail: `${record.leaderId} ${sent.sends.map((s) => `${s.via}:${s.ok ? "sent" : "failed"}`).join(" ") || "link"}` });
  return people(leader, { invite: { leaderId: record.leaderId, link: sent.link, sends: sent.sends } });
}
