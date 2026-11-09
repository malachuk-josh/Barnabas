import { appUrl } from "../messages/config";
import { deleteLeaderData } from "../account/delete";
import {
  activateLeader,
  bumpSessionVersion,
  createInvitedLeader,
  getLeaderRecord,
  isAdminRecord,
  listAllLeaders,
  markLeaderRemoved,
  setLeaderAdmin,
  setLeaderRole,
  type LeaderRecord,
} from "../team";
import { adminAudit, recentAdminActivity } from "./adminLog";
import { credentialState, deletePassword, setPassword } from "./credentials";
import { hasOpenInvite, issueLink, revokeLinks, type LinkKind } from "./links";
import { isLocked, unlock } from "./lockout";
import { generateTemporaryPassword } from "./password";
import { recoveryCodeIsSet } from "./recovery";
import { isAdminEmail, isOwnerEmail, type Role } from "./roles";
import { leaderIdFor, type Leader } from "./session";
import { joinPolicy, setJoinPolicy, type JoinPolicy } from "./settings";

/**
 * The owner's Admin console. Every function here is reached only through /api/admin/*, which requires the
 * `users.manage` permission (owners). Nothing here reads a leader's memory, conversations or journal, and
 * no password or hash leaves the credential store: a temporary password is returned once, to the owner who
 * made it, and links are returned once, when made.
 */

export class AdminError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

export type UserStatus = "active" | "invited" | "needs-password" | "locked" | "removed";

export type AdminUserView = {
  leaderId: string;
  name: string;
  email: string;
  access: Role;
  admin: boolean;
  /** Admin because of BARNABAS_ADMIN_EMAILS (or owner): can't be changed here. */
  adminFromEnv: boolean;
  owner: boolean;
  status: UserStatus;
  temporaryPassword: boolean;
  inviteOpen: boolean;
  lastSignedInAt: number | null;
  createdAt: number | null;
};

async function view(r: LeaderRecord): Promise<AdminUserView> {
  const [cred, locked, inviteOpen] = await Promise.all([credentialState(r.churchId, r.leaderId), isLocked(r.churchId, r.email), hasOpenInvite(r.churchId, r.leaderId)]);
  const status: UserStatus =
    r.status === "removed" ? "removed" : locked ? "locked" : r.status === "invited" && !cred.hasPassword ? "invited" : !cred.hasPassword ? "needs-password" : "active";
  const owner = isOwnerEmail(r.email);
  return {
    leaderId: r.leaderId,
    name: r.name,
    email: r.email,
    access: r.access ?? "leader",
    admin: r.status !== "removed" && isAdminRecord(r, r.email),
    adminFromEnv: isAdminEmail(r.email) || owner,
    owner,
    status,
    temporaryPassword: cred.mustChangePassword,
    inviteOpen,
    lastSignedInAt: r.signedInAt || null,
    createdAt: r.createdAt ?? r.firstSignedInAt ?? (r.signedInAt || null),
  };
}

export async function adminOverview(churchId: string) {
  const users = await Promise.all((await listAllLeaders(churchId)).map(view));
  return { users, join: await joinPolicy(churchId), activity: await recentAdminActivity(churchId), recoveryCodeSet: recoveryCodeIsSet() };
}

/** Where a link points: the app's public address when known, else the address the owner is using. */
export function linkUrl(token: string, origin: string) {
  return `${appUrl() ?? origin}/set-password/${token}`;
}

async function target(actor: Leader, leaderId: string, { allowRemoved = false } = {}) {
  const record = await getLeaderRecord(actor.churchId, leaderId);
  if (!record) throw new AdminError("That person isn't in Barnabas.", 404);
  if (record.status === "removed" && !allowRemoved) throw new AdminError(`${record.name} has been removed. Create them again to give them access.`);
  return record;
}

export async function createUser(actor: Leader, input: { name: string; email: string; access: Role; admin: boolean }, origin: string) {
  const email = input.email.trim().toLowerCase();
  const leaderId = await leaderIdFor(actor.churchId, email);
  const existing = await getLeaderRecord(actor.churchId, leaderId);
  if (existing && existing.status !== "removed") throw new AdminError(`${email} already has an account. Use Send password reset if they need a new password.`, 409);
  await createInvitedLeader({ churchId: actor.churchId, leaderId, name: input.name.trim(), email, access: input.access, admin: input.admin, createdBy: actor.leaderId });
  // A re-created leader starts over: no old password or links.
  await deletePassword(actor.churchId, leaderId);
  await revokeLinks(actor.churchId, leaderId);
  const link = await issueLink(actor.churchId, leaderId, "invite", actor.leaderId);
  await adminAudit(actor, { action: "user.create", targetId: leaderId, targetEmail: email, detail: `${input.access}${input.admin ? " admin" : ""}` });
  return { leaderId, link: linkUrl(link.token, origin), expiresAt: link.expiresAt };
}

export async function updateUser(actor: Leader, leaderId: string, change: { access?: Role; admin?: boolean }) {
  const record = await target(actor, leaderId);
  if (change.admin === false) {
    if (isAdminEmail(record.email) || isOwnerEmail(record.email)) {
      throw new AdminError(`${record.name} is an administrator through BARNABAS_ADMIN_EMAILS (or BARNABAS_OWNER_EMAILS) in Vercel. Change it there.`);
    }
    if (leaderId === actor.leaderId) throw new AdminError("You can't remove your own administrator access.");
  }
  if (change.access) await setLeaderRole(actor.churchId, leaderId, change.access, actor.leaderId);
  if (change.admin !== undefined) await setLeaderAdmin(actor.churchId, leaderId, change.admin);
  await adminAudit(actor, {
    action: "user.update",
    targetId: leaderId,
    targetEmail: record.email,
    detail: [change.access && `role ${change.access}`, change.admin !== undefined && `admin ${change.admin ? "on" : "off"}`].filter(Boolean).join(", "),
  });
}

export async function makeLink(actor: Leader, leaderId: string, kind: LinkKind, origin: string) {
  const record = await target(actor, leaderId);
  if (kind === "invite" && record.status !== "invited") throw new AdminError(`${record.name} has already set up their account. Send a password reset instead.`);
  const link = await issueLink(actor.churchId, leaderId, kind, actor.leaderId);
  await adminAudit(actor, { action: kind === "invite" ? "user.invite_link" : "user.reset_link", targetId: leaderId, targetEmail: record.email });
  return { link: linkUrl(link.token, origin), expiresAt: link.expiresAt };
}

/** A strong one-time password, shown once to the owner. The leader must choose their own at next sign-in. */
export async function setTemporaryPassword(actor: Leader, leaderId: string) {
  const record = await target(actor, leaderId);
  const password = generateTemporaryPassword();
  await setPassword(actor.churchId, leaderId, password, { temporary: true });
  await revokeLinks(actor.churchId, leaderId);
  await unlock(actor.churchId, record.email);
  await activateLeader(actor.churchId, leaderId);
  await bumpSessionVersion(actor.churchId, leaderId);
  await adminAudit(actor, { action: "user.temporary_password", targetId: leaderId, targetEmail: record.email });
  return { temporaryPassword: password };
}

export async function unlockUser(actor: Leader, leaderId: string) {
  const record = await target(actor, leaderId, { allowRemoved: true });
  await unlock(actor.churchId, record.email);
  await adminAudit(actor, { action: "user.unlock", targetId: leaderId, targetEmail: record.email });
}

/** Ends every session the leader has. Returns the new version (the caller re-signs the owner's own session). */
export async function signOutEverywhere(actor: Leader, leaderId: string) {
  const record = await target(actor, leaderId);
  const sv = await bumpSessionVersion(actor.churchId, leaderId);
  await adminAudit(actor, { action: "user.sign_out_everywhere", targetId: leaderId, targetEmail: record.email });
  return sv ?? 0;
}

/** Revokes access at once. With `deleteData`, also deletes everything Barnabas keeps for them. */
export async function removeUser(actor: Leader, leaderId: string, deleteData: boolean) {
  if (leaderId === actor.leaderId) throw new AdminError("You can't remove yourself.");
  const record = await target(actor, leaderId, { allowRemoved: deleteData });
  if (isOwnerEmail(record.email)) throw new AdminError(`${record.name} is an owner through BARNABAS_OWNER_EMAILS in Vercel. Change it there first.`);
  if (deleteData) {
    await deleteLeaderData({ churchId: record.churchId, leaderId: record.leaderId, name: record.name, email: record.email, role: record.role });
  } else {
    await deletePassword(actor.churchId, leaderId);
    await revokeLinks(actor.churchId, leaderId);
  }
  await markLeaderRemoved(record, !deleteData);
  await adminAudit(actor, { action: deleteData ? "user.remove_and_delete" : "user.remove", targetId: leaderId, targetEmail: record.email });
}

export async function changeJoinPolicy(actor: Leader, join: JoinPolicy) {
  await setJoinPolicy(actor.churchId, join, actor.leaderId);
  await adminAudit(actor, { action: "settings.join", detail: join });
}
