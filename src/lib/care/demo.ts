import { churchData, type Person } from "../chms";
import { addDays, lastSunday, today } from "../dates";
import { getJSON, setJSON } from "../store";
import { pickAssignee, thankYouText, TASK_WINDOWS } from "./guests";
import { careKey, listRest, saveRest } from "./store";
import { teamMembers } from "./team";
import { config } from "../config";
import type { CareBook, CareCase, CareClass, CaseType, ContactKind, GuestCard, GuestInterest, Pathway, PathwayStep, PrayerRequest, TeamMember } from "./types";

/**
 * Demo care records for Mount Greylock Baptist Church, clearly labeled in the app. Every person cared
 * for is from the fictional demo congregation (churchData().listPeople()) or a fictional guest.
 * The church's real leadership do the ministry, in their real roles:
 *   Eric Malachuk (Care Pastor)          discipleship and pastoral care cases; teaches Discover Faith
 *   Ethan Malachuk (Lead Pastor)         crisis escalation; teaches the membership class
 *   Aaron Malachuk (Connections)         guest and connections follow-up, with the deacons in rotation
 *   Travis Willette, Cal Najimy,
 *   Micah Hayre (Deacons)                visits, meals and cards; the prayer team. Travis and Micah are in
 *                                        a busy season (the church's note), so they hold fewer cases and
 *                                        take half as many guests in the rotation.
 * Nothing is ever said ABOUT them: no health, family, rest or wellbeing details, and no seeded load
 * labels. A load signal on their own dashboard is computed from the cases assigned to them.
 * A signed-in leader who isn't one of them (for example the pastor trying the demo) holds a few cases
 * too, so their dashboard has something in it. Everything is relative to today, so it never goes stale.
 */

let n = 0;
const id = (prefix: string) => `${prefix}_demo${(n++).toString(36).padStart(4, "0")}`;
const at = (iso: string, hour = 12) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00Z`).getTime();

type Pools = {
  ethan: TeamMember;
  eric: TeamMember;
  aaron: TeamMember;
  deacons: TeamMember[];
  /** A signed-in leader who isn't one of the published leadership, if any. */
  self: TeamMember | null;
};

const LEADERSHIP_NAMES = ["Ethan Malachuk", "Eric Malachuk", "Aaron Malachuk", "Travis Willette", "Cal Najimy", "Micah Hayre"];
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const isLeadershipName = (name: string) => LEADERSHIP_NAMES.some((n) => sameName(n, name));

function pools(members: TeamMember[]): Pools {
  const byName = (name: string, fallback: TeamMember) => members.find((m) => sameName(m.name, name)) ?? fallback;
  const pastor = members.find((m) => m.role === "pastor") ?? members[0];
  const eric = byName("Eric Malachuk", pastor);
  const deacons = ["Travis Willette", "Cal Najimy", "Micah Hayre"].map((n) => byName(n, eric));
  const self = members.find((m) => !m.placeholder && !isLeadershipName(m.name) && m.role === "pastor") ?? members.find((m) => !m.placeholder && !isLeadershipName(m.name)) ?? null;
  return { ethan: byName("Ethan Malachuk", pastor), eric, aaron: byName("Aaron Malachuk", eric), deacons, self };
}

export async function seedDemoCare(church: string): Promise<CareBook> {
  n = 0;
  const asOf = today();
  const sunday = lastSunday(asOf);
  const d = (days: number) => addDays(asOf, days);
  const members = await teamMembers(church);
  const P = pools(members);
  const people = new Map((await churchData().listPeople()).map((p) => [p.id, p]));
  const person = (pid: string) => people.get(pid) as Person;
  const [travis, cal, micah] = P.deacons;
  const self = P.self;

  const cases: CareCase[] = [];
  function addCase(spec: {
    pid: string;
    household?: boolean;
    type: CaseType;
    holder?: TeamMember;
    confidential?: boolean;
    status: CareCase["status"];
    summary?: string;
    next?: [string, number];
    contacts?: [ContactKind, number, TeamMember | null, string?][];
    openedDaysAgo: number;
    closedDaysAgo?: number;
  }) {
    const p = person(spec.pid);
    const holder = spec.holder;
    const opener = holder ?? P.eric;
    const contacts = (spec.contacts ?? []).map(([kind, days, by, note]) => {
      const who = by ?? opener;
      return { id: id("ct"), kind, date: d(days), byId: who.id, byName: who.name, note, at: at(d(days), 15) };
    });
    cases.push({
      id: id("case"),
      subject: { kind: spec.household ? "household" : "person", personId: p.id, name: spec.household && p.household ? p.household : p.name },
      type: spec.type,
      status: spec.status,
      confidential: Boolean(spec.confidential),
      assigneeId: holder?.id,
      summary: spec.summary,
      nextStep: spec.next ? { text: spec.next[0], due: d(spec.next[1]) } : undefined,
      contacts,
      openedById: opener.id,
      openedByName: opener.name,
      openedAt: at(d(-spec.openedDaysAgo), 10),
      updatedAt: at(d(spec.contacts?.length ? Math.max(...spec.contacts.map((c) => c[1])) : -spec.openedDaysAgo), 16),
      closedAt: spec.closedDaysAgo !== undefined ? at(d(-spec.closedDaysAgo), 17) : undefined,
      source: "app",
      demo: true,
    });
  }

  // Eric Malachuk, Care Pastor: discipleship and pastoral care. The deacons make visits and bring meals.
  addCase({ pid: "p05", type: "hospital", holder: P.eric, status: "follow_up", summary: "At Berkshire Medical Center this week; home soon", openedDaysAgo: 6,
    next: ["Call to see how the first days home are going", 1],
    contacts: [["visit", -5, travis, "In good spirits; asked for prayer for her family"], ["call", -2, null], ["card", -1, micah]] });
  addCase({ pid: "p08", household: true, type: "grief", holder: P.eric, status: "active", summary: "Carmen's father died last week", openedDaysAgo: 8,
    next: ["Visit after the funeral with the church's card", 3],
    contacts: [["visit", -7, null], ["meal", -5, micah, "Dinner from the deacons"], ["card", -3, cal], ["call", -1, null]] });
  addCase({ pid: "p02", type: "counseling_referral", holder: P.eric, status: "follow_up", summary: "Referred out; pastor checking in monthly", openedDaysAgo: 30,
    next: ["Monthly check-in", 9], contacts: [["visit", -30, null], ["call", -14, null]] });
  addCase({ pid: "p18", type: "grief", holder: P.eric, status: "active", summary: "His grandmother died", openedDaysAgo: 5,
    contacts: [["call", -5, null], ["card", -4, travis]] });

  // Ethan Malachuk, Lead Pastor: crisis cases come to him.
  addCase({ pid: "p12", type: "crisis", holder: P.ethan, confidential: true, status: "active", summary: "A hard season; pastors only", openedDaysAgo: 4,
    next: ["Check in by phone", 2], contacts: [["call", -4, null], ["visit", -2, null]] });
  addCase({ pid: "p15", type: "crisis", holder: P.ethan, status: "follow_up", summary: "Apartment fire; staying with relatives", openedDaysAgo: 3,
    next: ["Connect them with the benevolence team", -1], contacts: [["visit", -3, travis], ["meal", -2, cal], ["call", 0, null]] });

  // The deacons: visits, meals and the homebound.
  addCase({ pid: "p11", type: "new_baby", holder: travis, status: "follow_up", summary: "Second child, a boy", openedDaysAgo: 9,
    next: ["Bring a meal Friday", 4], contacts: [["card", -8, null], ["meal", -3, null]] });
  addCase({ pid: "p17", type: "illness", holder: cal, status: "follow_up", summary: "Recovering at home; meals for two weeks", openedDaysAgo: 12,
    next: ["Call to check in", -2], contacts: [["call", -11, null], ["meal", -6, null]] });
  addCase({ pid: "p13", type: "homebound", holder: micah, status: "active", summary: "Can't get out to church this winter", openedDaysAgo: 60,
    next: ["Bring communion on the first Sunday", 20], contacts: [["visit", -35, null], ["visit", -7, null]] });
  addCase({ pid: "p09", type: "homebound", holder: cal, status: "assigned", summary: "Her mother is staying with them and can't get out", openedDaysAgo: 2,
    next: ["First visit to meet her mother", 3] });

  // Aaron Malachuk, Connections: helping people get connected.
  addCase({ pid: "p16", type: "other", holder: P.aaron, status: "follow_up", summary: "Looking for a Growth Group that fits his schedule", openedDaysAgo: 6,
    next: ["Introduce him to the Wednesday adult group leader", 2], contacts: [["text", -5, null]] });

  // A signed-in leader trying the demo holds a few of their own (otherwise the deacons do).
  addCase({ pid: "p14", type: "other", holder: self ?? cal, status: "follow_up", summary: "Moving to a new apartment", openedDaysAgo: 10,
    next: ["Line up two helpers for Saturday's move", 4], contacts: [["text", -6, null]] });
  addCase({ pid: "p06", household: true, type: "new_baby", holder: self ?? P.eric, status: "active", summary: "Baby girl born last week", openedDaysAgo: 7,
    next: ["Deliver this week's meal-train dinner", 0], contacts: [["card", -6, null], ["meal", -4, micah]] });
  addCase({ pid: "p10", type: "hospital", holder: self ?? cal, status: "closed", summary: "Short hospital stay; home and doing well", openedDaysAgo: 24, closedDaysAgo: 10,
    contacts: [["visit", -22, null], ["call", -15, null]] });

  // Waiting in the pastors' queue.
  addCase({ pid: "p04", type: "prayer", status: "new", summary: "Asked for prayer about a job change", openedDaysAgo: 1 });

  /* ---------- Prayer requests (the deacons are the prayer team) ---------- */
  const prayerTeam = P.deacons.map((m) => m.id);
  const prayer = (pid: string, request: string, shareable: boolean, prayedCount: number, daysAgo: number, by: TeamMember, answered?: number): PrayerRequest => ({
    id: id("pr"), personId: pid, name: person(pid).name, request, shareable, prayedCount,
    // Private requests are prayed over by the pastors; shareable ones by the deacons too.
    prayedBy: shareable ? [...new Set(prayerTeam)] : [by.id], createdById: by.id, createdByName: by.name,
    createdAt: at(d(-daysAgo), 11), answered: answered !== undefined ? { date: d(-answered) } : undefined, demo: true,
  });
  const prayers: PrayerRequest[] = [
    prayer("p05", "Rest and healing as she recovers at home", true, 7, 6, travis),
    prayer("p08", "Comfort for Carmen and the whole Hernández family", true, 12, 8, micah),
    prayer("p04", "Wisdom about a job change", false, 2, 1, P.eric),
    prayer("p03", "Her nephew starting college far from home", true, 4, 14, cal),
    prayer("p13", "Her granddaughter's travel home for Thanksgiving", true, 5, 10, micah),
    prayer("p12", "Strength for a hard season", false, 3, 4, P.ethan),
    prayer("p06", "A safe delivery and sleep for the new parents", true, 15, 20, travis, 7),
    prayer("p10", "Home from the hospital soon", true, 9, 24, cal, 12),
  ];

  /* ---------- Pathways (directory people) ---------- */
  const ago = (days: number) => d(-days);
  const steps = (s: Partial<Record<PathwayStep, number>>) =>
    Object.fromEntries(Object.entries(s).map(([k, v]) => [k, ago(v as number)])) as Partial<Record<PathwayStep, string>>;
  const member = { first_visit: 3000, salvation: 2950, baptism: 2900, membership_class: 2850, membership: 2800, group: 2700, serving: 2500, giving: 2800 };
  const path = (pid: string, s: Partial<Record<PathwayStep, number>>): Pathway => ({ key: pid, personId: pid, name: person(pid).name, steps: steps(s), updatedAt: at(asOf), demo: true });
  const pathways: Pathway[] = [
    path("p01", member),
    path("p02", { ...member, first_visit: 4000 }),
    path("p03", { first_visit: 420, discover_faith: 380, salvation: 360, baptism: 150, group: 300, serving: 200, giving: 300 }),
    path("p04", { first_visit: 240, discover_faith: 200, salvation: 120, serving: 90 }),
    path("p05", member),
    path("p06", { first_visit: 700, salvation: 690, baptism: 365, membership_class: 30, giving: 600, serving: 300 }),
    path("p07", { first_visit: 700, salvation: 690, baptism: 365, membership_class: 30, membership: 14, giving: 600, serving: 300 }),
    path("p08", { first_visit: 2200, salvation: 2100, baptism: 2000, membership_class: 1990, membership: 1980, serving: 1500, giving: 1900 }),
    path("p09", { first_visit: 2200, salvation: 2100, baptism: 2000, membership_class: 1990, membership: 1980, group: 1200, serving: 1500, giving: 1900 }),
    path("p10", { first_visit: 125, salvation: 4000, baptism: 3900, serving: 60 }),
    path("p11", { ...member, first_visit: 1200, salvation: 1150, baptism: 1100, membership_class: 1000, membership: 990, group: 900, serving: 800, giving: 950 }),
    path("p12", member),
    path("p13", { ...member, first_visit: 9000 }),
    path("p14", { first_visit: 150, discover_faith: 120, salvation: 100, baptism: 60, serving: 40 }),
    path("p15", member),
    path("p16", { first_visit: 210, salvation: 5000, baptism: 4900, serving: 120, giving: 100 }),
    path("p17", { first_visit: 105, serving: 50 }),
    // A long-time member who has never joined a group.
    path("p18", { first_visit: 1500, salvation: 1400, baptism: 1300, membership_class: 1250, membership: 1200, serving: 1000, giving: 1100 }),
  ];

  /* ---------- Guests ---------- */
  let rotation = 0;
  const guests: GuestCard[] = [];
  function guest(spec: {
    name: string; email?: string; phone?: string; howHeard?: string; kidsAges?: string; interests: GuestInterest[];
    visitsWeeksAgo: number[]; contacted?: boolean; invited?: boolean; prayer?: [string, boolean];
  }) {
    const { member: holder, next } = pickAssignee(members, rotation);
    rotation = next;
    const visits = spec.visitsWeeksAgo.map((w) => addDays(sunday, -7 * w)).sort();
    const firstAt = at(visits[0], 14);
    const lastAt = at(visits[visits.length - 1], 14);
    const g: GuestCard = {
      id: id("guest"), name: spec.name, email: spec.email, phone: spec.phone, howHeard: spec.howHeard, kidsAges: spec.kidsAges, interests: spec.interests,
      visits, assigneeId: holder!.id, tasks: [], source: "leader", createdById: P.aaron.id, createdAt: firstAt, demo: true,
    };
    const done = spec.contacted ? { doneAt: firstAt + 20 * 3_600_000, doneById: holder!.id } : {};
    g.tasks.push({ id: id("task"), kind: "thank_you", dueAt: firstAt + TASK_WINDOWS.thank_you, assigneeId: holder!.id, draftText: thankYouText(g, config.churchName, holder!.name), ...done });
    g.tasks.push({ id: id("task"), kind: "call", dueAt: firstAt + TASK_WINDOWS.call, assigneeId: holder!.id, ...(spec.contacted ? { doneAt: firstAt + 40 * 3_600_000, doneById: holder!.id } : {}) });
    if (visits.length >= 2) {
      const second = at(visits[1], 14);
      g.tasks.push({ id: id("task"), kind: "discover_faith_invite", dueAt: second + TASK_WINDOWS.discover_faith_invite, assigneeId: holder!.id, ...(spec.invited ? { doneAt: second + 50 * 3_600_000, doneById: holder!.id } : {}) });
    }
    if (spec.contacted) g.contactedAt = firstAt + 20 * 3_600_000;
    if (spec.prayer) {
      const pr: PrayerRequest = { id: id("pr"), name: spec.name, request: spec.prayer[0], shareable: spec.prayer[1], prayedCount: 1, prayedBy: [], createdById: holder!.id,
        createdByName: `${spec.name} (guest card)`, createdAt: firstAt, guestId: g.id, demo: true };
      prayers.push(pr);
      g.prayerRequestId = pr.id;
    }
    guests.push(g);
    pathways.push({ key: g.id, guestId: g.id, name: g.name, steps: { first_visit: visits[0] }, visits: visits.length, updatedAt: lastAt, demo: true });
    return g;
  }
  guest({ name: "Kelsey Doucette", email: "kelsey.doucette@example.org", phone: "(555) 014-2290", howHeard: "Drove past the sign on Notch Road", kidsAges: "4 and 7", interests: ["kids", "growth_groups"], visitsWeeksAgo: [0], prayer: ["Settling into a new town", true] });
  guest({ name: "Jordan Whitaker", phone: "(555) 014-7731", howHeard: "Instagram", interests: ["young_adults"], visitsWeeksAgo: [0] });
  guest({ name: "Ellie Brandt", email: "ellie.brandt@example.org", howHeard: "Invited by Priya Shah", interests: ["growth_groups", "serving"], visitsWeeksAgo: [1, 0], contacted: true });
  guest({ name: "Sam Okonkwo-Reid", email: "sam.or@example.org", phone: "(555) 014-5502", howHeard: "Thanksgiving Communion Service flyer", interests: ["discover_faith", "talk_to_pastor"], visitsWeeksAgo: [3, 1], contacted: true, invited: true });
  const delgado = guest({ name: "The Delgado family", email: "delgados@example.org", phone: "(555) 014-8810", howHeard: "Kids Club on Wednesday nights", kidsAges: "9, 12 and 14", interests: ["kids", "teens", "discover_faith"], visitsWeeksAgo: [5, 3, 1], contacted: true, invited: true, prayer: ["A job for Marco", false] });
  const sam = guests[3];

  /* ---------- Classes ---------- */
  const sessions = (weeks: number[], time: string, topics: string[]) => weeks.map((w, i) => ({ id: id("ses"), date: addDays(sunday, 7 * w), time, topic: topics[i] }));
  const df = sessions([-3, -2, -1, 0], "9:45 AM", ["Who is God?", "Who is Jesus?", "What is the Gospel?", "Following Jesus"]);
  const discover: CareClass = {
    id: id("class"), kind: "discover_faith", name: "Discover Faith: fall", sessions: df, teacherId: P.eric.id, teacherName: P.eric.name,
    enrollees: [
      { key: delgado.id, name: delgado.name, enrolledAt: addDays(sunday, -24) },
      { key: sam.id, name: sam.name, enrolledAt: addDays(sunday, -10) },
      { key: "p17", name: person("p17").name, enrolledAt: addDays(sunday, -3) },
    ],
    attendance: { [df[0].id]: [delgado.id], [df[1].id]: [delgado.id, sam.id], [df[2].id]: [delgado.id, sam.id], [df[3].id]: [] },
    createdAt: at(addDays(sunday, -30)), demo: true,
  };
  const pastMembership = sessions([-6, -5, -4], "12:15 PM", ["What we believe", "How MGBC works", "Serving and giving"]);
  const october: CareClass = {
    id: id("class"), kind: "membership", name: "Membership class: October", sessions: pastMembership, teacherId: P.ethan.id, teacherName: P.ethan.name,
    enrollees: [
      { key: "p06", name: person("p06").name, enrolledAt: addDays(sunday, -50), completedAt: pathways.find((p) => p.key === "p06")!.steps.membership_class },
      { key: "p07", name: person("p07").name, enrolledAt: addDays(sunday, -50), completedAt: pathways.find((p) => p.key === "p07")!.steps.membership_class },
    ],
    attendance: Object.fromEntries(pastMembership.map((s) => [s.id, ["p06", "p07"]])),
    createdAt: at(addDays(sunday, -60)), demo: true,
  };
  const upcoming = sessions([2, 3, 4], "12:15 PM", ["What we believe", "How MGBC works", "Serving and giving"]);
  const december: CareClass = {
    id: id("class"), kind: "membership", name: "Membership class: December", sessions: upcoming, teacherId: P.ethan.id, teacherName: P.ethan.name,
    enrollees: [{ key: "p10", name: person("p10").name, enrolledAt: d(-2) }],
    attendance: {},
    createdAt: at(d(-7)), demo: true,
  };

  return {
    meta: { demo: true, createdAt: Date.now() },
    cases,
    prayers,
    pathways,
    classes: [discover, october, december],
    guests,
    links: [],
    rotation,
  };
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
