import type { Leader } from "../auth/session";
import { DEFAULT_ROLE, isAdminEmail, isOwnerEmail, isRole, type Access, type Role } from "../auth/roles";
import { getJSON, kv, setJSON, type KV } from "../store";

/**
 * The record kept for every leader, at `leader:{church}:{leaderId}`. Most are created at first sign-in;
 * the owner can also create one ahead of time (status "invited"). Passwords are never kept here; they live
 * hashed under `cred:{church}:{leaderId}` (src/lib/auth/credentials.ts).
 */
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
  /** Made an admin by the owner in the Admin console (BARNABAS_ADMIN_EMAILS admins are admins regardless). */
  admin?: boolean;
  /** "invited": created by the owner and hasn't set a password yet. "removed": access revoked. Missing means active. */
  status?: "active" | "invited" | "removed";
  /** Goes up whenever every session should end (password change or reset, removal, "Sign out everywhere"). */
  sessionVersion?: number;
  createdAt?: number;
  createdBy?: string;
  removedAt?: number;
  firstSignedInAt?: number;
  /** Last sign-in; 0 for an invited leader who hasn't signed in. */
  signedInAt: number;
};

export const leaderKey = (churchId: string, leaderId: string) => `leader:${churchId}:${leaderId}`;
const indexKey = (churchId: string) => `leaders:${churchId}`;

/*
 * Every signed-in request reads the leader's record (to check the session version) and usually again for
 * their access. A one-second cache per store keeps that to one Redis read per request. Every write through
 * this module clears the entry, so a change made here applies at once on this instance and within a second
 * elsewhere.
 */
const CACHE_MS = 1000;
const cache = new WeakMap<KV, Map<string, { at: number; record: LeaderRecord | null }>>();

function cacheFor(): Map<string, { at: number; record: LeaderRecord | null }> {
  const store = kv();
  let map = cache.get(store);
  if (!map) cache.set(store, (map = new Map()));
  return map;
}

export function forgetCachedLeader(churchId: string, leaderId: string) {
  cacheFor().delete(leaderKey(churchId, leaderId));
}

export async function getLeaderRecord(churchId: string, leaderId: string) {
  return getJSON<LeaderRecord>(leaderKey(churchId, leaderId));
}

/** The record, read at most once a second per instance. For session and access checks. */
export async function getLeaderRecordCached(churchId: string, leaderId: string): Promise<LeaderRecord | null> {
  const key = leaderKey(churchId, leaderId);
  const map = cacheFor();
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.record;
  const record = await getLeaderRecord(churchId, leaderId);
  map.set(key, { at: Date.now(), record });
  return record;
}

export async function writeLeaderRecord(record: LeaderRecord) {
  await setJSON(leaderKey(record.churchId, record.leaderId), record);
  forgetCachedLeader(record.churchId, record.leaderId);
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
    status: "active",
    createdAt: existing?.createdAt ?? existing?.firstSignedInAt ?? (existing?.signedInAt || now),
    firstSignedInAt: existing?.firstSignedInAt ?? (existing?.signedInAt || now),
    signedInAt: now,
  };
  await writeLeaderRecord(record);
  await kv().sadd(indexKey(leader.churchId), leader.leaderId);
  return record;
}

/** Keep the team list's name and title in step when a leader edits their profile. */
export async function updateLeaderDisplay(leader: Leader, name: string, title: string) {
  const existing = await getLeaderRecord(leader.churchId, leader.leaderId);
  if (!existing) return;
  await writeLeaderRecord({ ...existing, name, role: title });
}

/** Whether this record (or, for env admins, this email) makes someone an administrator. */
export function isAdminRecord(record: Pick<LeaderRecord, "email" | "admin"> | null | undefined, email: string) {
  return isAdminEmail(email) || isOwnerEmail(email) || record?.admin === true;
}

/** The current role, admin flag and owner flag, read fresh (within a second) so a change applies right away. */
export async function accessFor(leader: Pick<Leader, "churchId" | "leaderId" | "email">): Promise<Access> {
  const record = await getLeaderRecordCached(leader.churchId, leader.leaderId);
  const owner = isOwnerEmail(leader.email);
  const admin = isAdminRecord(record, leader.email);
  const role: Role = isRole(record?.access) ? record.access : isAdminEmail(leader.email) || owner ? "pastor" : DEFAULT_ROLE;
  return { role, admin, owner };
}

function withAccess(r: LeaderRecord): LeaderRecord {
  return { ...r, access: isRole(r.access) ? r.access : isAdminEmail(r.email) || isOwnerEmail(r.email) ? "pastor" : DEFAULT_ROLE };
}

/** Every record in the index, including invited and removed ones. For the owner's Admin console. */
export async function listAllLeaders(churchId: string): Promise<LeaderRecord[]> {
  const ids = await kv().smembers(indexKey(churchId));
  const records = await Promise.all(ids.map((id) => getLeaderRecord(churchId, id)));
  return records
    .filter((r): r is LeaderRecord => Boolean(r))
    .map(withAccess)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Leaders who have signed in and still have access: the team everywhere else in Barnabas sees. */
export async function listLeaders(churchId: string): Promise<LeaderRecord[]> {
  return (await listAllLeaders(churchId)).filter((r) => r.status !== "removed" && r.status !== "invited");
}

export async function setLeaderRole(churchId: string, leaderId: string, role: Role, setBy: string) {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record) return null;
  const next: LeaderRecord = { ...record, access: role, accessSetBy: setBy, accessSetAt: Date.now() };
  await writeLeaderRecord(next);
  return next;
}

export async function setLeaderAdmin(churchId: string, leaderId: string, admin: boolean) {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record) return null;
  const next: LeaderRecord = { ...record, admin };
  await writeLeaderRecord(next);
  return next;
}

/** A leader the owner adds ahead of time. They set their password from an invite link. */
export async function createInvitedLeader(input: { churchId: string; leaderId: string; name: string; email: string; access: Role; admin: boolean; createdBy: string }) {
  const existing = await getLeaderRecord(input.churchId, input.leaderId);
  const now = Date.now();
  const record: LeaderRecord = {
    churchId: input.churchId,
    leaderId: input.leaderId,
    name: input.name,
    email: input.email.toLowerCase(),
    role: existing?.role ?? "",
    access: input.access,
    accessSetBy: input.createdBy,
    accessSetAt: now,
    admin: input.admin,
    status: "invited",
    // A re-invited leader's old sessions stay ended.
    sessionVersion: (existing?.sessionVersion ?? 0) + (existing ? 1 : 0),
    createdAt: now,
    createdBy: input.createdBy,
    signedInAt: existing?.signedInAt ?? 0,
    firstSignedInAt: existing?.firstSignedInAt,
  };
  await writeLeaderRecord(record);
  await kv().sadd(indexKey(input.churchId), input.leaderId);
  return record;
}

/** Ends every session this leader has. Returns the new version. */
export async function bumpSessionVersion(churchId: string, leaderId: string): Promise<number | null> {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record) return null;
  const sessionVersion = (record.sessionVersion ?? 0) + 1;
  await writeLeaderRecord({ ...record, sessionVersion });
  return sessionVersion;
}

/** Mark an invited leader active once they've set their password. */
export async function activateLeader(churchId: string, leaderId: string) {
  const record = await getLeaderRecord(churchId, leaderId);
  if (!record || record.status !== "invited") return;
  await writeLeaderRecord({ ...record, status: "active" });
}

/**
 * Revoke access: the record stays as a small "removed" entry (name and email) so the owner sees it and
 * the email can't simply sign up again; every session ends at once.
 */
export async function markLeaderRemoved(record: Pick<LeaderRecord, "churchId" | "leaderId" | "name" | "email"> & Partial<LeaderRecord>, keepDetails: boolean) {
  const now = Date.now();
  const base: LeaderRecord = keepDetails
    ? ({ ...record } as LeaderRecord)
    : { churchId: record.churchId, leaderId: record.leaderId, name: record.name, email: record.email, role: "", signedInAt: record.signedInAt ?? 0, createdAt: record.createdAt };
  await writeLeaderRecord({ ...base, status: "removed", admin: false, removedAt: now, sessionVersion: (record.sessionVersion ?? 0) + 1 });
  await kv().sadd(indexKey(record.churchId), record.leaderId);
}

export async function forgetLeader(leader: Pick<Leader, "churchId" | "leaderId">) {
  await kv().srem(indexKey(leader.churchId), leader.leaderId);
  forgetCachedLeader(leader.churchId, leader.leaderId);
}
