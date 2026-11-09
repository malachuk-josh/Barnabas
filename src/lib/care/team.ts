import type { Leader } from "../auth/session";
import type { Role } from "../auth/roles";
import { churchData } from "../chms";
import { config } from "../config";
import { accessFor, listLeaders } from "../team";
import type { TeamMember } from "./types";
import type { Viewer } from "./visibility";

export const leaderMemberId = (leaderId: string) => `l:${leaderId}`;
const slug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const placeholderId = (name: string) => `demo:${slug(name)}`;
const sameName = (a: string, b: string) => slug(a) === slug(b);

/** The care role a published leadership title suggests, for placeholders only. */
export function roleForTitle(title: string): Role {
  const t = title.toLowerCase();
  if (t.includes("pastor")) return "pastor";
  if (t.includes("deacon")) return "deacon";
  return "staff";
}

const isConnections = (role: Role, title: string) => role === "deacon" || /connection/i.test(title);

/**
 * Everyone a case can go to: leaders who have signed in (with their real role), then the demo church's
 * published leadership as placeholders for anyone who hasn't signed in yet.
 */
export async function teamMembers(churchId: string): Promise<TeamMember[]> {
  const records = await listLeaders(churchId);
  const leadership = churchId === config.churchId ? await churchData().leadership() : [];
  const members: TeamMember[] = records.map((r) => {
    const role = (r.access ?? "leader") as Role;
    const published = leadership.find((l) => sameName(l.name, r.name));
    return { id: leaderMemberId(r.leaderId), name: r.name, title: r.role, role, placeholder: false, connections: isConnections(role, r.role || published?.title || ""), lighterLoad: published?.lighterLoad, leaderId: r.leaderId };
  });
  for (const l of leadership) {
    if (members.some((m) => sameName(m.name, l.name))) continue;
    const role = roleForTitle(l.title);
    members.push({ id: placeholderId(l.name), name: l.name, title: l.title, role, placeholder: true, connections: isConnections(role, l.title), lighterLoad: l.lighterLoad });
  }
  return members;
}

/** The ids that are this leader: their own, and a leadership placeholder with the same name (so seeded cases follow them once they sign in). */
export function memberIdsFor(leader: Pick<Leader, "leaderId" | "name">): string[] {
  const ids = [leaderMemberId(leader.leaderId)];
  if (leader.name.trim()) ids.push(placeholderId(leader.name));
  return ids;
}

export async function viewerFor(leader: Leader): Promise<{ viewer: Viewer; members: TeamMember[] }> {
  const [access, members] = await Promise.all([accessFor(leader), teamMembers(leader.churchId)]);
  return { viewer: { access, memberIds: memberIdsFor(leader) }, members };
}

/** The member record for this leader (their signed-in record). */
export function selfMember(leader: Pick<Leader, "leaderId">, members: TeamMember[]) {
  return members.find((m) => m.id === leaderMemberId(leader.leaderId));
}

/** The member an assignee id refers to, following a leadership placeholder to the leader who has since signed in. */
export function findMember(members: TeamMember[], id: string | undefined) {
  if (!id) return undefined;
  return members.find((m) => m.id === id) ?? members.find((m) => !m.placeholder && placeholderId(m.name) === id);
}

export function memberName(members: TeamMember[], id: string | undefined) {
  if (!id) return "Unassigned";
  return findMember(members, id)?.name ?? "A former team member";
}
