import type { Leader } from "../auth/session";
import { DEFAULT_ROLE, isAdminEmail, isRole, type Access, type Role } from "../auth/roles";
import { getJSON, kv, setJSON } from "../store";

/** The record kept for every leader who has signed in, at `leader:{church}:{leaderId}`. */
export type LeaderRecord = {
  churchId: string;
  leaderId: string;
  name: string;
  email: string;
  /** The free-text title the leader gave themselves, e.g. "Associate pastor". */
  role: string;
  /** Their permission role, set by an admin. */
  access?: Role;
  accessSetBy?: string;
  accessSetAt?: number;
  firstSignedInAt?: number;
  signedInAt: number;
};

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
  const role: Role = isRole(record?.access) ? record.access : admin ? "pastor" : DEFAULT_ROLE;
  return { role, admin };
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
  const next: LeaderRecord = { ...record, access: role, accessSetBy: setBy, accessSetAt: Date.now() };
  await setJSON(leaderKey(churchId, leaderId), next);
  return next;
}

export async function forgetLeader(leader: Pick<Leader, "churchId" | "leaderId">) {
  await kv().srem(indexKey(leader.churchId), leader.leaderId);
}
