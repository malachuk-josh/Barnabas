import { newId } from "../data/ids";
import type { GuestCard, GuestTask, TeamMember } from "./types";

/**
 * Guest follow-up. A new guest card makes three kinds of task:
 *   thank_you              a thank-you text or email, drafted for review, within 24 hours
 *   call                   a welcome call within 48 hours
 *   discover_faith_invite  after the second visit, an invitation to Discover Faith within a week
 * Cards are assigned in rotation among the deacons and connections staff.
 */

export const HOUR = 3_600_000;
export const TASK_WINDOWS = { thank_you: 24 * HOUR, call: 48 * HOUR, discover_faith_invite: 7 * 24 * HOUR } as const;

/**
 * The rotation: deacons and connections staff in a stable order. Everyone takes a turn in the first
 * round; those in a busy season (lighterLoad) sit out the second, so they get about half as many.
 */
export function rotationPool(members: TeamMember[]): TeamMember[] {
  const pool = members.filter((m) => m.connections).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return [...pool, ...pool.filter((m) => !m.lighterLoad)];
}

/** The next person in the rotation, and the rotation index to store for next time. */
export function pickAssignee(members: TeamMember[], rotation: number): { member: TeamMember | null; next: number } {
  const pool = rotationPool(members);
  if (!pool.length) {
    const fallback = members.find((m) => m.role === "pastor") ?? members[0] ?? null;
    return { member: fallback, next: rotation };
  }
  const i = ((rotation % pool.length) + pool.length) % pool.length;
  return { member: pool[i], next: i + 1 };
}

export function thankYouText(card: Pick<GuestCard, "name" | "interests">, churchName: string, fromName: string) {
  const name = card.name.trim();
  // "The Delgado family" -> "Delgado family"; "Kelsey Doucette" -> "Kelsey".
  const first = /^the\s+/i.test(name) ? name.replace(/^the\s+/i, "") : name.split(/\s+/)[0] || "there";
  const church = churchName.replace(/\s*\(demo\)\s*$/i, "");
  const kids = card.interests.includes("kids") ? " We'd love to have your kids join us again too." : "";
  return `Hi ${first}, thank you for worshiping with us at ${church} on Sunday. It was good to have you.${kids} If there's anything we can pray about or help with, just reply here. ${fromName}`;
}

/** The tasks a brand-new guest card gets. A second visit recorded at the same time adds the Discover Faith invite. */
export function initialTasks(card: Pick<GuestCard, "visits">, assigneeId: string, now: number, makeId: (p: string) => string = newId): GuestTask[] {
  const tasks: GuestTask[] = [
    { id: makeId("task"), kind: "thank_you", dueAt: now + TASK_WINDOWS.thank_you, assigneeId },
    { id: makeId("task"), kind: "call", dueAt: now + TASK_WINDOWS.call, assigneeId },
  ];
  return [...tasks, ...visitTasks({ visits: card.visits, tasks }, assigneeId, now, makeId)];
}

/** After a second (or later) visit: invite them to Discover Faith, once. */
export function visitTasks(card: Pick<GuestCard, "visits" | "tasks">, assigneeId: string, now: number, makeId: (p: string) => string = newId): GuestTask[] {
  if (card.visits.length < 2) return [];
  if (card.tasks.some((t) => t.kind === "discover_faith_invite")) return [];
  return [{ id: makeId("task"), kind: "discover_faith_invite", dueAt: now + TASK_WINDOWS.discover_faith_invite, assigneeId }];
}

export function openTasks(card: GuestCard) {
  return card.tasks.filter((t) => !t.doneAt);
}

/** A guest nobody has reached yet: no thank-you or call marked done. */
export function notContacted(card: GuestCard) {
  return !card.contactedAt;
}
