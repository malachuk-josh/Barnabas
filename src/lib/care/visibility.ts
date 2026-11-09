import { can, type Access } from "../auth/roles";
import type { CareCase, PrayerRequest, TeamMember } from "./types";

/**
 * Who sees which care records. Checked on the server for every page, API call and Barnabas tool.
 *
 *   pastor            every case, including confidential ones (care.view_all)
 *   deacon            cases assigned to them, plus every non-confidential case
 *   staff, treasurer,
 *   leader            only cases assigned to them
 *   confidential      pastors only, whoever it is assigned to
 */
export type Viewer = {
  access: Access;
  /** Every team-member id that is this person: their leader id, and a placeholder that carries their name. */
  memberIds: string[];
};

export function isMine(viewer: Viewer, assigneeId: string | undefined) {
  return Boolean(assigneeId && viewer.memberIds.includes(assigneeId));
}

export function canSeeCase(viewer: Viewer, c: Pick<CareCase, "confidential" | "assigneeId">): boolean {
  if (c.confidential) return viewer.access.role === "pastor";
  if (can(viewer.access, "care.view_all")) return true;
  if (isMine(viewer, c.assigneeId)) return true;
  return viewer.access.role === "deacon";
}

/** Log contacts, change the next step: anyone who can see the case. */
export const canWorkCase = canSeeCase;

/** Assign to someone else: care.assign, on a case they can see. Taking a case yourself is the same check. */
export function canAssignCase(viewer: Viewer, c: Pick<CareCase, "confidential" | "assigneeId">) {
  return canSeeCase(viewer, c) && can(viewer.access, "care.assign");
}

/** Close: whoever it's assigned to, or someone who can assign. */
export function canCloseCase(viewer: Viewer, c: Pick<CareCase, "confidential" | "assigneeId">) {
  return canSeeCase(viewer, c) && (isMine(viewer, c.assigneeId) || can(viewer.access, "care.assign"));
}

/** A confidential case can only be held by a pastor. */
export function canHoldCase(member: Pick<TeamMember, "role">, c: Pick<CareCase, "confidential">) {
  return !c.confidential || member.role === "pastor";
}

export function visibleCases<T extends Pick<CareCase, "confidential" | "assigneeId">>(viewer: Viewer, cases: T[]): T[] {
  return cases.filter((c) => canSeeCase(viewer, c));
}

/** Shareable requests: the whole team. Private ones: pastors and whoever recorded it. */
export function canSeePrayer(viewer: Viewer, p: Pick<PrayerRequest, "shareable" | "createdById">) {
  return p.shareable || viewer.access.role === "pastor" || viewer.memberIds.includes(p.createdById);
}
