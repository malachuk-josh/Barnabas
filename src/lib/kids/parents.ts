import type { Leader } from "../auth/session";
import { gathering } from "../ops/gatherings";
import { today } from "../dates";
import { levelOf, listLeaders, type LeaderRecord } from "../team";
import { loadKids } from "./store";
import type { Household, KidsBook } from "./types";

/**
 * Linking families to people on Barnabas, by email: a guardian whose email matches someone's sign-in is
 * that person. Used for "Message parent" at check-in and for a member's own Child care page.
 */

const norm = (email?: string) => (email ?? "").trim().toLowerCase();

/** email -> leaderId, for everyone on the list who hasn't been removed. */
export function parentDirectory(records: LeaderRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of records) if (!r.removed && norm(r.email)) out.set(norm(r.email), r.leaderId);
  return out;
}

/** The leaderIds of a family's guardians who are on Barnabas. */
export function parentsOf(h: Pick<Household, "guardians"> | undefined, dir: Map<string, string>): string[] {
  if (!h) return [];
  return [...new Set(h.guardians.map((g) => dir.get(norm(g.email))).filter((id): id is string => Boolean(id)))];
}

export async function parentLookup(churchId: string) {
  const dir = parentDirectory(await listLeaders(churchId));
  return (h: Pick<Household, "guardians"> | undefined) => parentsOf(h, dir);
}

/** Who a member's "Message the kids team" goes to: Team kids and check-in co-laborers, or else Leaders and Admins. */
export function kidsTeamIds(records: LeaderRecord[], except?: string): string[] {
  const live = records.filter((r) => !r.removed && r.leaderId !== except);
  const team = live.filter((r) => {
    const l = levelOf(r);
    return l.level === "team" && (l.teamRole === "kids" || l.teamRole === "checkin");
  });
  if (team.length) return team.map((r) => r.leaderId);
  return live.filter((r) => ["admin", "leader"].includes(levelOf(r).level)).map((r) => r.leaderId);
}

export type MyChild = {
  firstName: string;
  status: { state: "in" | "out"; room: string; gathering: string; checkedInAt: number; checkedOutAt?: number } | null;
};
export type MyFamily = { name: string; children: MyChild[] };

/**
 * A member's own families (a guardian's email is theirs) and today's status for each child. Only first
 * names, rooms and times: never another family, a pickup code, allergies or medical notes.
 */
export function familiesForEmail(book: KidsBook, email: string, date: string): MyFamily[] {
  const mine = norm(email);
  if (!mine) return [];
  return book.households
    .filter((h) => h.guardians.some((g) => norm(g.email) === mine))
    .map((h) => ({
      name: h.name,
      children: h.children.map((c) => {
        const latest = book.checkins.filter((x) => x.childId === c.id && x.householdId === h.id && x.date === date).sort((a, b) => b.checkedInAt - a.checkedInAt)[0];
        const room = latest ? book.rooms.find((r) => r.id === latest.roomId)?.name ?? "their room" : "";
        return {
          firstName: c.firstName,
          status: latest ? { state: latest.checkedOutAt ? ("out" as const) : ("in" as const), room, gathering: gathering(latest.gathering)?.label ?? "", checkedInAt: latest.checkedInAt, ...(latest.checkedOutAt ? { checkedOutAt: latest.checkedOutAt } : {}) } : null,
        };
      }),
    }));
}

/** Everything a member's Child care page shows. */
export async function myChildCare(leader: Leader) {
  const [book, records] = await Promise.all([loadKids(leader.churchId), listLeaders(leader.churchId)]);
  const date = today();
  return { date, families: familiesForEmail(book, leader.email, date), kidsTeam: kidsTeamIds(records, leader.leaderId) };
}
