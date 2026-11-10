import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// API routes read the signed-in person from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { levelMayUse } from "@/lib/auth/roles";
import { addDays, lastSunday, today } from "@/lib/dates";
import { unreadCount } from "@/lib/inbox/service";
import { familiesForEmail, kidsTeamIds } from "@/lib/kids/parents";
import { checkInChildren, kidsActor, saveHousehold } from "@/lib/kids/service";
import { loadKids } from "@/lib/kids/store";
import { directMessagePayload } from "@/lib/notifications/notify";
import { notifyLeaders } from "@/lib/notifications/send";
import { getProfile, saveProfile } from "@/lib/profile";
import { accessFor, addPerson, listLeaders, removePerson, setPersonLevel } from "@/lib/team";
import { GET as listRoute, POST as startRoute } from "@/app/api/inbox/route";
import { GET as threadRoute, POST as replyRoute } from "@/app/api/inbox/[id]/route";
import { GET as peopleRoute } from "@/app/api/inbox/people/route";
import { GET as kidsRoute } from "@/app/api/kids/route";
import { GET as mineRoute } from "@/app/api/kids/mine/route";
import { freshStore } from "./helpers";

const person = (leaderId: string, name: string, email: string): Leader => ({ churchId: "demo", leaderId, name, email, role: "" });
const pastor = person("ib000001", "Pastor Dana", "dana@example.org");
const kidsLead = person("ib000002", "Kim Kids", "kim@example.org");
const parentA = person("ib000003", "Maria Lopez", "maria@example.org");
const parentB = person("ib000004", "Sam Rivera", "sam@example.org");
const other = person("ib000005", "Lee Leader", "lee@example.org");

async function setup() {
  freshStore();
  await addPerson("demo", pastor.leaderId, { name: pastor.name, email: pastor.email, level: "leader" }, "test");
  await addPerson("demo", kidsLead.leaderId, { name: kidsLead.name, email: kidsLead.email, level: "team", teamRole: "serving" }, "test");
  await setPersonLevel("demo", kidsLead.leaderId, { level: "team", teamRole: "kids" }, "test");
  await addPerson("demo", parentA.leaderId, { name: parentA.name, email: parentA.email, level: "member" }, "test");
  await addPerson("demo", parentB.leaderId, { name: parentB.name, email: parentB.email, level: "member" }, "test");
  await addPerson("demo", other.leaderId, { name: other.name, email: other.email, level: "leader" }, "test");
  session.current = null;
}

const req = (body?: unknown) => new Request("http://x/api/inbox", { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function as<T = Record<string, unknown>>(l: Leader, fn: () => Promise<Response>): Promise<{ status: number; json: T }> {
  session.current = l;
  try {
    const res = await fn();
    return { status: res.status, json: (await res.json()) as T };
  } finally {
    session.current = null;
  }
}
type Start = { threadId: string; created: boolean; error?: string };
type List = { threads: { id: string; unread: number; about?: string; with: { leaderId: string; name: string }[]; last?: { mine: boolean; text: string } }[]; unread: number };
type Open = { thread: { id: string; about?: string }; messages: { mine: boolean; name: string; text: string }[] };

describe("who may message whom", () => {
  beforeEach(setup);

  it("lets a member message staff and teams, but not another member", async () => {
    const people = await as<{ people: { leaderId: string; label: string }[] }>(parentA, () => peopleRoute());
    expect(people.status).toBe(200);
    const ids = people.json.people.map((p) => p.leaderId);
    expect(ids).toContain(pastor.leaderId);
    expect(ids).toContain(kidsLead.leaderId);
    expect(ids).not.toContain(parentB.leaderId);
    expect(ids).not.toContain(parentA.leaderId);
    expect(people.json.people.find((p) => p.leaderId === kidsLead.leaderId)?.label).toBe("Team · Kids ministry");

    const refused = await as<Start>(parentA, () => startRoute(req({ to: [parentB.leaderId], text: "Hi Sam" })));
    expect(refused.status).toBe(403);
    const mixed = await as<Start>(parentA, () => startRoute(req({ to: [pastor.leaderId, parentB.leaderId], text: "Hi both" })));
    expect(mixed.status).toBe(403);
    const ok = await as<Start>(parentA, () => startRoute(req({ to: [kidsLead.leaderId], text: "Is Emma OK?" })));
    expect(ok.status).toBe(200);
  });

  it("lets staff and Team message anyone, including members", async () => {
    expect((await as(pastor, () => startRoute(req({ to: [parentA.leaderId, parentB.leaderId], text: "Welcome!" })))).status).toBe(200);
    expect((await as(kidsLead, () => startRoute(req({ to: [parentB.leaderId], text: "Hello" })))).status).toBe(200);
    const people = await as<{ people: { leaderId: string }[] }>(kidsLead, () => peopleRoute());
    expect(people.json.people.map((p) => p.leaderId)).toEqual(expect.arrayContaining([parentA.leaderId, parentB.leaderId, pastor.leaderId]));
  });

  it("lets a member reply in a thread they're in, even with another member in it", async () => {
    const s = await as<Start>(pastor, () => startRoute(req({ to: [parentA.leaderId, parentB.leaderId], text: "Parents' meeting Sunday" })));
    expect((await as(parentB, () => replyRoute(req({ text: "We'll be there" }), params(s.json.threadId)))).status).toBe(200);
    const open = await as<Open>(parentA, () => threadRoute(req(), params(s.json.threadId)));
    expect(open.json.messages.map((m) => m.text)).toEqual(["Parents' meeting Sunday", "We'll be there"]);
    expect(open.json.messages[1].name).toBe("Sam Rivera");
  });

  it("hides a thread from anyone not in it (404), for reading and replying", async () => {
    const s = await as<Start>(pastor, () => startRoute(req({ to: [parentA.leaderId], text: "About Emma" })));
    expect((await as(other, () => threadRoute(req(), params(s.json.threadId)))).status).toBe(404);
    expect((await as(parentB, () => replyRoute(req({ text: "hi" }), params(s.json.threadId)))).status).toBe(404);
    expect((await as(parentB, () => threadRoute(req(), params("thr_nope")))).status).toBe(404);
    const list = await as<List>(other, () => listRoute());
    expect(list.json.threads).toEqual([]);
  });

  it("won't message someone who was removed, and checks the message", async () => {
    await removePerson("demo", parentB.leaderId, "test");
    expect((await as(pastor, () => startRoute(req({ to: [parentB.leaderId], text: "Hi" })))).status).toBe(403);
    expect((await as(pastor, () => startRoute(req({ to: ["nobody"], text: "Hi" })))).status).toBe(403);
    expect((await as(pastor, () => startRoute(req({ to: [parentA.leaderId], text: "   " })))).status).toBe(400);
    expect((await as(pastor, () => startRoute(req({ to: [parentA.leaderId], text: "x".repeat(2001) })))).status).toBe(400);
    expect((await as(pastor, () => startRoute(req({ to: [], text: "Hi" })))).status).toBe(400);
  });

  it("opens Messages to every level, the check-in desk included", async () => {
    for (const level of ["member", "team"] as const) {
      await setPersonLevel("demo", parentB.leaderId, { level, teamRole: level === "team" ? "checkin" : undefined }, "test");
      const access = await accessFor(parentB);
      expect(levelMayUse(access, "/inbox")).toBe(true);
      expect(levelMayUse(access, "/api/inbox/abc")).toBe(true);
    }
  });
});

describe("threads and unread counts", () => {
  beforeEach(setup);

  it("adds to the thread with exactly the same people and child", async () => {
    const a = await as<Start>(kidsLead, () => startRoute(req({ to: [parentA.leaderId], text: "Emma is asking for you", about: "Emma" })));
    expect(a.json.created).toBe(true);
    const b = await as<Start>(kidsLead, () => startRoute(req({ to: [parentA.leaderId, kidsLead.leaderId], text: "All good now", about: "emma" })));
    expect(b.json).toMatchObject({ threadId: a.json.threadId, created: false });
    // The parent starting one with the same person and child joins it too.
    const c = await as<Start>(parentA, () => startRoute(req({ to: [kidsLead.leaderId], text: "Thank you!", about: "Emma" })));
    expect(c.json.threadId).toBe(a.json.threadId);
    // A different child, or no child, or more people, is a different conversation.
    const d = await as<Start>(kidsLead, () => startRoute(req({ to: [parentA.leaderId], text: "Leo too", about: "Leo" })));
    const e = await as<Start>(kidsLead, () => startRoute(req({ to: [parentA.leaderId], text: "General" })));
    const f = await as<Start>(kidsLead, () => startRoute(req({ to: [parentA.leaderId, pastor.leaderId], text: "Group", about: "Emma" })));
    expect(new Set([a.json.threadId, d.json.threadId, e.json.threadId, f.json.threadId]).size).toBe(4);

    const open = await as<Open>(parentA, () => threadRoute(req(), params(a.json.threadId)));
    expect(open.json.thread.about).toBe("Emma");
    expect(open.json.messages.map((m) => [m.mine, m.text])).toEqual([
      [false, "Emma is asking for you"],
      [false, "All good now"],
      [true, "Thank you!"],
    ]);
  });

  it("counts unread messages, newest thread first, and clears them when opened", async () => {
    const a = await as<Start>(pastor, () => startRoute(req({ to: [parentA.leaderId], text: "One" })));
    await as(pastor, () => replyRoute(req({ text: "Two" }), params(a.json.threadId)));
    const b = await as<Start>(kidsLead, () => startRoute(req({ to: [parentA.leaderId], text: "Three", about: "Emma" })));

    let list = await as<List>(parentA, () => listRoute());
    expect(list.json.unread).toBe(3);
    expect(list.json.threads.map((t) => [t.id, t.unread])).toEqual([
      [b.json.threadId, 1],
      [a.json.threadId, 2],
    ]);
    expect(list.json.threads[1].with).toEqual([{ leaderId: pastor.leaderId, name: "Pastor Dana" }]);
    expect(list.json.threads[1].last).toMatchObject({ mine: false, text: "Two" });
    expect(await unreadCount(parentA)).toBe(3);
    // The sender has nothing unread.
    expect((await as<List>(pastor, () => listRoute())).json.unread).toBe(0);

    await as(parentA, () => threadRoute(req(), params(a.json.threadId)));
    list = await as<List>(parentA, () => listRoute());
    expect(list.json.unread).toBe(1);
    expect(await unreadCount(parentA)).toBe(1);

    // Replying moves the thread to the top and leaves the pastor one unread.
    await as(parentA, () => replyRoute(req({ text: "Thanks" }), params(a.json.threadId)));
    list = await as<List>(parentA, () => listRoute());
    expect(list.json.threads[0]).toMatchObject({ id: a.json.threadId, unread: 0, last: { mine: true, text: "Thanks" } });
    expect((await as<List>(pastor, () => listRoute())).json.unread).toBe(1);
  });

  it("notifies with only the sender's first name, never the words", () => {
    const p = directMessagePayload({ name: "Kim Kids" }, "thr_abc");
    expect(p).toEqual({ title: "Messages", body: "Kim sent you a message.", url: "/inbox?t=thr_abc", tag: "msg-thr_abc" });
  });
});

describe("kids check-in and a member's child care", () => {
  beforeEach(setup);
  const sunday = () => addDays(lastSunday(today()), 7);

  async function families() {
    const actor = await kidsActor(pastor);
    const a = await saveHousehold(actor, { name: "Lopez", guardians: [{ name: "Maria Lopez", email: "Maria@Example.org" }, { name: "Jo Lopez" }], children: [{ firstName: "Emma", lastName: "Lopez", allergies: "Peanuts", medical: "Asthma" }, { firstName: "Leo", lastName: "Lopez" }] });
    const b = await saveHousehold(actor, { name: "Rivera", guardians: [{ name: "Sam Rivera", email: "sam@example.org" }], children: [{ firstName: "Ava", lastName: "Rivera" }] });
    const c = await saveHousehold(actor, { name: "Chen", guardians: [{ name: "Wei Chen", phone: "555-0100" }], children: [{ firstName: "Mia", lastName: "Chen" }] });
    return { actor, a, b, c };
  }

  it("shows a member only their own family, with today's status", async () => {
    const { actor, a } = await families();
    const date = sunday();
    await checkInChildren(actor, { date, gathering: "sun-0945", householdId: a.id, children: [{ childId: a.children[0].id, roomId: "preschool" }] });
    const book = await loadKids("demo");
    const mine = familiesForEmail(book, parentA.email, date);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Lopez");
    expect(mine[0].children.map((c) => c.firstName)).toEqual(["Emma", "Leo"]);
    expect(mine[0].children[0].status).toMatchObject({ state: "in", room: "Preschool" });
    expect(mine[0].children[1].status).toBeNull();
    // Nothing sensitive goes to a parent's page.
    expect(JSON.stringify(mine)).not.toMatch(/Peanuts|Asthma|pickup|code|Rivera|Chen/i);
    expect(familiesForEmail(book, "nobody@example.org", date)).toEqual([]);
    expect(familiesForEmail(book, "", date)).toEqual([]);

    const api = await as<{ families: { name: string }[]; kidsTeam: string[] }>(parentB, () => mineRoute());
    expect(api.status).toBe(200);
    expect(api.json.families.map((f) => f.name)).toEqual(["Rivera"]);
    expect(api.json.kidsTeam).toEqual([kidsLead.leaderId]);
    expect(JSON.stringify(api.json)).not.toMatch(/Lopez|Chen|Emma/);
    const none = await as<{ families: unknown[] }>(other, () => mineRoute());
    expect(none.json.families).toEqual([]);
  });

  it("sends a member's kids-team message to Leaders when there's no kids team", async () => {
    await setPersonLevel("demo", kidsLead.leaderId, { level: "team", teamRole: "serving" }, "test");
    const ids = kidsTeamIds(await listLeaders("demo"), parentA.leaderId);
    expect(ids.sort()).toEqual([other.leaderId, pastor.leaderId].sort());
  });

  it("gives the station the parents on Barnabas, never their emails, and keeps members off it", async () => {
    await families();
    const date = sunday();
    const res = await as<{ families: { name: string; parents: string[] }[] }>(kidsLead, () => kidsRoute(new Request(`http://x/api/kids?q=lo&date=${date}&gathering=sun-0945`)));
    expect(res.status).toBe(200);
    expect(res.json.families.find((f) => f.name === "Lopez")?.parents).toEqual([parentA.leaderId]);
    expect(JSON.stringify(res.json)).not.toContain("example.org");
    const chen = await as<{ families: { name: string; parents: string[] }[] }>(kidsLead, () => kidsRoute(new Request(`http://x/api/kids?q=chen&date=${date}&gathering=sun-0945`)));
    expect(chen.json.families[0].parents).toEqual([]);
    expect((await as(parentA, () => kidsRoute(new Request(`http://x/api/kids?q=lo&date=${date}`)))).status).toBe(403);
    const memberAccess = await accessFor(parentA);
    expect(levelMayUse(memberAccess, "/kids")).toBe(true);
    expect(levelMayUse(memberAccess, "/api/kids/mine")).toBe(true);
    expect(levelMayUse(memberAccess, "/kids/rooms")).toBe(false);
  });
});

describe("notifications land in Messages", () => {
  beforeEach(setup);

  it("saves each notification to the person's Notifications conversation, even without push, with its link and no replies", async () => {
    const payload = { title: "Checked in", body: "Emma is checked in to Preschool.", url: "/kids", tag: "t" };
    await notifyLeaders("demo", [parentA.leaderId], "childcare", payload);
    await notifyLeaders("demo", [parentA.leaderId], "childcare", { ...payload, title: "Picked up", body: "Emma was checked out." });
    const list = await as<List>(parentA, () => listRoute(req()));
    const feed = list.json.threads.find((t) => t.with[0]?.name === "Notifications")!;
    expect(feed).toMatchObject({ unread: 2, last: { text: "Picked up: Emma was checked out." } });
    const open = await as<{ thread: { system?: string }; messages: { name: string; text: string; href?: string }[] }>(parentA, () => threadRoute(req(), params(feed.id)));
    expect(open.json.thread.system).toBe("notifications");
    expect(open.json.messages[0]).toMatchObject({ name: "Barnabas", text: "Checked in: Emma is checked in to Preschool.", href: "/kids" });
    expect((await as(parentA, () => replyRoute(req({ text: "thanks" }), params(feed.id)))).status).toBe(400);
    // Nobody else can open it.
    expect((await as(parentB, () => threadRoute(req(), params(feed.id)))).status).toBe(404);
  });

  it("follows the person's switch for that type, and doesn't copy a message notification", async () => {
    const p = await getProfile(parentA);
    await saveProfile(parentA, { ...p, notifications: { ...p.notifications, types: { ...p.notifications.types, childcare: false } } });
    await notifyLeaders("demo", [parentA.leaderId], "childcare", { title: "Checked in", body: "x", url: "/kids", tag: "t" });
    await notifyLeaders("demo", [parentA.leaderId], "messages", { title: "Pastor", body: "Pastor sent you a message.", url: "/inbox", tag: "m" });
    expect((await as<List>(parentA, () => listRoute(req()))).json.threads).toHaveLength(0);
  });
});

