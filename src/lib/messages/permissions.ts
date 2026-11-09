import { can, type Access } from "../auth/roles";
import type { Draft } from "../data/records";

/**
 * Who may send an approved draft. `messages.send` (pastors, staff) sends anything. Deacons carry the
 * church's guest follow-up rotation and care visits, so they may send `care` drafts (guest thank-yous and
 * care follow-ups) and nothing else. Treasurers and leaders can draft with Barnabas, but someone with
 * `messages.send` sends.
 */
export function canSendDraft(access: Access | null | undefined, draft: Pick<Draft, "kind">): boolean {
  if (can(access, "messages.send")) return true;
  return access?.role === "deacon" && draft.kind === "care";
}

/** Who may see the church's send log: the same people who send. Deacons see their own sends only. */
export function canSeeSendLog(access: Access | null | undefined): "all" | "own" | "none" {
  if (can(access, "messages.send")) return "all";
  if (access?.role === "deacon") return "own";
  return "none";
}
