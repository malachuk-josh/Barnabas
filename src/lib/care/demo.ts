import { addDays, lastSunday, today } from "../dates";
import { getJSON, setJSON } from "../store";
import { careKey, listRest, saveRest } from "./store";
import { teamMembers } from "./team";
import { config } from "../config";
import type { CareBook, CareClass, TeamMember } from "./types";

/**
 * Demo care records for Mount Greylock Baptist Church, clearly labeled in the app. No one receiving care
 * is made up: there are no seeded cases, prayer requests, guests or pathways, so each list starts empty
 * with a first step to take. Only the church's classes are seeded, with the real leadership teaching in
 * their real roles and no one enrolled yet:
 *   Eric Malachuk (Care Pastor)    teaches Discover Faith
 *   Ethan Malachuk (Lead Pastor)   teaches the membership class
 * Nothing is ever said ABOUT them: no health, family, rest or wellbeing details.
 * Everything is relative to today, so it never goes stale.
 */

let n = 0;
const id = (prefix: string) => `${prefix}_demo${(n++).toString(36).padStart(4, "0")}`;
const at = (iso: string, hour = 12) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00Z`).getTime();

const LEADERSHIP_NAMES = ["Ethan Malachuk", "Eric Malachuk", "Aaron Malachuk", "Travis Willette", "Cal Najimy", "Micah Hayre"];
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const isLeadershipName = (name: string) => LEADERSHIP_NAMES.some((n) => sameName(n, name));

export async function seedDemoCare(church: string): Promise<CareBook> {
  n = 0;
  const sunday = lastSunday(today());
  const members = await teamMembers(church);
  const pastor = members.find((m) => m.role === "pastor") ?? members[0];
  const byName = (name: string): TeamMember | undefined => members.find((m) => sameName(m.name, name)) ?? pastor;
  const eric = byName("Eric Malachuk");
  const ethan = byName("Ethan Malachuk");

  const sessions = (weeks: number[], time: string, topics: string[]) => weeks.map((w, i) => ({ id: id("ses"), date: addDays(sunday, 7 * w), time, topic: topics[i] }));
  const discover: CareClass = {
    id: id("class"), kind: "discover_faith", name: "Discover Faith: winter", sessions: sessions([1, 2, 3, 4], "9:45 AM", ["Who is God?", "Who is Jesus?", "What is the Gospel?", "Following Jesus"]),
    teacherId: eric?.id, teacherName: eric?.name, enrollees: [], attendance: {}, createdAt: at(addDays(sunday, -7)), demo: true,
  };
  const membership: CareClass = {
    id: id("class"), kind: "membership", name: "Membership class: December", sessions: sessions([2, 3, 4], "12:15 PM", ["What we believe", "How MGBC works", "Serving and giving"]),
    teacherId: ethan?.id, teacherName: ethan?.name, enrollees: [], attendance: {}, createdAt: at(addDays(sunday, -7)), demo: true,
  };

  return { meta: { demo: true, createdAt: Date.now() }, cases: [], prayers: [], pathways: [], classes: [discover, membership], guests: [], links: [], rotation: 0 };
}

/**
 * Demo days off for one leader, so their private dashboard has something to show. Only on the demo
 * church, only while its care data is the demo set, only once per leader, and never for the church's
 * real leadership: nothing about their rest or wellbeing is made up. Labeled demo and cleared with the
 * demo data.
 */
export async function seedDemoRest(church: string, leader: { leaderId: string; name: string }, isDemo: boolean) {
  if (!isDemo || church !== config.churchId || isLeadershipName(leader.name)) return;
  const flag = careKey(church, `rest-seeded:${leader.leaderId}`);
  if (await getJSON<boolean>(flag)) return;
  const days = await listRest(church, leader.leaderId);
  if (!days.length) {
    const asOf = today();
    await saveRest(church, leader.leaderId, [26, 19, 12].map((ago) => ({ date: addDays(asOf, -ago), at: at(addDays(asOf, -ago)), demo: true })));
  }
  await setJSON(flag, true);
}
