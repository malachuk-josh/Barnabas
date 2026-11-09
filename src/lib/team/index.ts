import type { Leader } from "../auth/session";
import { DEFAULT_ROLE, isAdminEmail, isLevel, isRole, isTeamRole, levelForRole, roleForLevel, type Access, type Level, type Role, type TeamRole } from "../auth/roles";
import { getJSON, kv, setJSON } from "../store";

/** The record kept for every leader who has signed in, at `leader:{church}:{leaderId}`. */
export type LeaderRecord = {
  churchId: string;
  leaderId: string;
  name: string;
  email: string;
  /** The free-text title the leader gave themselves, e.g. "Associate pastor". */
  role: string;
  /** Their permission role from before levels (still set, derived from the level). */
  access?: Role;
  /** Their access level, set by an admin on the Admin page. */
  level?: Level;
  /** Leaders only: an admin has turned finance on for them. */
  finance?: boolean;
  /** Team only: what they work on. */
  teamRole?: TeamRole;
  /** An admin removed them: they can't sign in, and any open session stops working. */
  removed?: boolean;
  /** Added by an admin and not signed in yet. */
  addedBy?: string;
  addedAt?: number;
  accessSetBy?: string;
  accessSetAt?: number;
  firstSignedInAt?: number;
  /** 0 until they first sign in (added by an admin). */
  signedInAt: number;
};

/** A record's level, finance switch and team role, reading older role-only records too. */
export function levelOf(record: Pick<LeaderRecord, "email" | "access" | "level" | "finance" | "teamRole"> | null | undefined): { level: Level; finance: boolean; teamRole?: TeamRole } {
  if (record && isAdminEmail(record.email)) return { level: "admin", finance: true };
  if (record && isLevel(record.level)) {
    if (record.level === "team") return { level: "team", finance: false, teamRole: isTeamRole(record.teamRole) ? record.teamRole : "serving" };
    if (record.level === "leader") return { level: "leader", finance: Boolean(record.finance) };
    return { level: record.level, finance: record.level === "admin" };
  }
  if (record && isRole(record.access)) return levelForRole(record.access);
  return levelForRole(DEFAULT_ROLE);
}

export const leaderKey = (churchId: string, leaderId: string) => `leader:${churchId}:${leaderId}`;
const indexKey = (churchId: string) => `leaders:${churchId}`;

export async function getLeaderRecord(churchId: string, leaderId: string) {
  return getJSON<LeaderRecord>(leaderKey(churchId, leaderId));
}

/**
 * Called at sign-in. Keeps the permission role an admin set; a new leader starts as `leader`,
 * except bootstrap admins (BARNABAS_ADMIN_EMAILS), who start as `pastor`.
 */
export async function recordSignIn(leader: Leader): Promise<LeaderRecord> {
  const existing = await getLeaderRecord(leader.churchId, leader.leaderId);
  const now = Date.now();
  const record: LeaderRecord = {
    ...existing,
    churchId: leader.churchId,
    leaderId: leader.leaderId,
    name: leader.name,
    email: leader.email,
    role: leader.role,
    access: isRole(existing?.access) ? existing.access : isAdminEmail(leader.email) ? "pastor" : DEFAULT_ROLE,
    // The removed flag stays: sign-in refuses them before this runs.
    firstSignedInAt: existing?.firstSignedInAt ?? existing?.signedInAt ?? now,
    signedInAt: now,
  };
  await setJSON(leaderKey(leader.churchId, leader.leaderId), record);
  await kv().sadd(indexKey(leader.churchId), leader.leaderId);
  return record;
}

/** Keep the team list's name and title in step when a leader edits their profile. */
export async function updateLeaderDisplay(leader: Leader, name: string, title: string) {
  const existing = await getLeaderRecord(leader.churchId, leader.leaderId);
  if (!existing) return;
  await setJSON(leaderKey(leader.churchId, leader.leaderId), { ...existing, name, role: title });
}

/** The current role and admin flag, read fresh on every request so a change applies right away. */
export async function accessFor(leader: Pick<Leader, "churchId" | "leaderId" | "email">): Promise<Access> {
  const record = await getLeaderRecord(leader.churchId, leader.leaderId);
  const admin = isAdminEmail(leader.email);
  const removed = Boolean(record?.removed && !admin);
  // A level chosen on the Admin page (or an admin from the server settings) decides access.
  if (admin || isLevel(record?.level)) {
    const { level, finance, teamRole } = levelOf(record ? { ...record, email: leader.email } : { email: leader.email });
    return { role: roleForLevel(level, finance, teamRole), admin: level === "admin", level, finance, teamRole, ...(removed ? { removed } : {}) };
  }
  // No level chosen yet: exactly what their role allowed before levels.
  const role: Role = isRole(record?.access) ? record.access : DEFAULT_ROLE;
  return { role, admin: false, ...(removed ? { removed } : {}) };
}

/** Whether this person may sign in: on the list (or an admin from the server settings) and not removed. */
export async function maySignIn(churchId: string, leaderId: string, email: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const record = await getLeaderRecord(churchId, leaderId);
  return Boolean(record && !record.removed);
}

/** Add someone to Barnabas (Admin page). Keeps an existing person's history; brings back someone removed. */
export async function addPerson(
  churchId: string,
  leaderId: string,
  input: { name: string; email: string; level: Level; finance?: boolean; teamRole?: TeamRole },
  by: string,
): Promise<LeaderRecord> {
  const existing = await getLeaderRecord(churchId, leaderId);
  const record: LeaderRecord = {
    ...existing,
    churchId,
    leaderId,
    name: existing?.name || input.name,
    email: input.email.toLowerCase(),
    role: existing?.role ?? "",
    signedInAt: existing?.signedInAt ?? 0,
    addedBy: existing?.addedBy ?? by,
    addedAt: existing?.addedAt ?? Date.now(),
  };
  delete record.removed;
  applyLevel(record, input, by);
  await setJSON(leaderKey(churchId, leaderId), record);
  await kv().sadd(indexKey(churchId), leaderId);
  return record;
}

function applyLevel(record: LeaderRecord, input: { level: Level; finance?: boolean; teamRole?: TeamRole }, by: string) {
  record.level = input.level;
  record.finance = input.level === "leader" ? Boolean(input.finance) : undefined;
  record.teamRole = input.level === "team" ? (input.teamRole ?? "serving") : undefined;
  record.access = roleForLevel(input.level, Boolean(input.finance), record.teamRole);
  record.accessSetBy = by;
  record.accessSetAt = Date.now();
}

/** Change someone's level, finance switch or team role. */
export async function setPersonLevel(churchId: string, leaderId: string, input: { level: Level; finance?: boolean; teamRole?: TeamRole }, by: string) {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record || record.removed) return null;
  applyLevel(record, input, by);
  await setJSON(leaderKey(churchId, leaderId), record);
  return record;
}

/** Remove someone from Barnabas: they can't sign in again until an admin adds them back. */
export async function removePerson(churchId: string, leaderId: string, by: string) {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record) return null;
  const next: LeaderRecord = { ...record, removed: true, accessSetBy: by, accessSetAt: Date.now() };
  await setJSON(leaderKey(churchId, leaderId), next);
  await kv().srem(indexKey(churchId), leaderId);
  return next;
}

export async function listLeaders(churchId: string): Promise<LeaderRecord[]> {
  const ids = await kv().smembers(indexKey(churchId));
  const records = await Promise.all(ids.map((id) => getLeaderRecord(churchId, id)));
  return records
    .filter((r): r is LeaderRecord => Boolean(r))
    .map((r) => ({ ...r, access: isRole(r.access) ? r.access : isAdminEmail(r.email) ? "pastor" : DEFAULT_ROLE }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setLeaderRole(churchId: string, leaderId: string, role: Role, setBy: string) {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record) return null;
  // The older role list: the role decides access until an admin chooses a level.
  const next: LeaderRecord = { ...record, access: role, accessSetBy: setBy, accessSetAt: Date.now() };
  delete next.level;
  delete next.finance;
  delete next.teamRole;
  await setJSON(leaderKey(churchId, leaderId), next);
  return next;
}

export async function forgetLeader(leader: Pick<Leader, "churchId" | "leaderId">) {
  await kv().srem(indexKey(leader.churchId), leader.leaderId);
}
