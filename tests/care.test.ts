import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// API routes read the signed-in leader from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { can, ROLES } from "@/lib/auth/roles";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { addCare, listAudit, listDrafts } from "@/lib/data/records";
import { addDays, today } from "@/lib/dates";
import { followUps } from "@/lib/engine/briefing";
import { executeTool, type ToolContext } from "@/lib/engine/tools";
import { initialTasks, pickAssignee, rotationPool, TASK_WINDOWS, visitTasks } from "@/lib/care/guests";
import { careLoad, signalFor, teamSpread } from "@/lib/care/load";
import { nextSteps, nextStepsFor } from "@/lib/care/pathway";
import { absorbLegacyCare, addPrayer, assignCase, careActor, closeCase, logContact, openCase, recordGuest, recordVisit } from "@/lib/care/service";
import { loadCare } from "@/lib/care/store";
import { leaderMemberId } from "@/lib/care/team";
import type { CareCase, Pathway, TeamMember } from "@/lib/care/types";
import { canSeeCase, canSeePrayer, type Viewer } from "@/lib/care/visibility";
import { caseRows, careFor, myCareLoad } from "@/lib/care/views";
import { createWelcomeLink, RATE_LIMITS, resolveToken, revokeWelcomeLink } from "@/lib/care/welcome";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "cccc0001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const deacon: Leader = { churchId: "demo", leaderId: "cccc0002", name: "Travis Willette", email: "travis@example.org", role: "Deacon" };
const staff: Leader = { churchId: "demo", leaderId: "cccc0003", name: "Kim Staff", email: "kim@example.org", role: "Kids director" };
const leaderRole: Leader = { churchId: "demo", leaderId: "cccc0004", name: "Lee Leader", email: "lee@example.org", role: "Small group leader" };

async function setupTeam() {
  freshStore();
  for (const l of [pastor, deacon, staff, leaderRole]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
  await setLeaderRole("demo", staff.leaderId, "staff", "test");
}

async function ctx(leader: Leader, lastUserText: string, turns: number, meta?: ConversationMeta): Promise<ToolContext> {
  const m: ConversationMeta = meta ?? { id: `conv_${leader.leaderId}_${Math.random().toString(36).slice(2)}`, title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns };
  if (!meta) await createConversation(leader, m);
  m.turns = turns;
  return { leader, meta: m, turnStartedAt: Date.now(), lastUserText };
}

const v = (role: Viewer["access"]["role"], ids: string[] = ["l:me"]): Viewer => ({ access: { role, admin: false }, memberIds: ids });

describe("care visibility", () => {
  const mine = { confidential: false, assigneeId: "l:me" };
  const others = { confidential: false, assigneeId: "l:other" };
  const unassigned = { confidential: false, assigneeId: undefined };
  const secret = { confidential: true, assigneeId: "l:pastor2" };
  const secretMine = { confidential: true, assigneeId: "l:me" };

  it("follows the matrix: pastor all, deacon own and non-confidential, others only their own", () => {
    const expected: Record<string, [boolean, boolean, boolean, boolean, boolean]> = {
      //          mine  others unassigned secret secretMine
      pastor: [true, true, true, true, true],
      deacon: [true, true, true, false, false],
      treasurer: [true, false, false, false, false],
      staff: [true, false, false, false, false],
      leader: [true, false, false, false, false],
    };
    for (const role of ROLES) {
      const viewer = v(role);
      const got = [mine, others, unassigned, secret, secretMine].map((c) => canSeeCase(viewer, c));
      expect(got, role).toEqual(expected[role]);
    }
  });

  it("adds care.view_all for pastors and care.assign for pastors, deacons and staff", () => {
    for (const role of ROLES) {
      expect(can({ role, admin: false }, "care.view_all"), role).toBe(role === "pastor");
      expect(can({ role, admin: false }, "care.assign"), role).toBe(["pastor", "deacon", "staff"].includes(role));
    }
  });

  it("keeps private prayer requests to pastors and whoever recorded them", () => {
    const privateReq = { shareable: false, createdById: "l:me" };
    expect(canSeePrayer(v("leader"), privateReq)).toBe(true);
    expect(canSeePrayer(v("deacon", ["l:other"]), privateReq)).toBe(false);
    expect(canSeePrayer(v("pastor", ["l:other"]), privateReq)).toBe(true);
    expect(canSeePrayer(v("leader", ["l:other"]), { shareable: true, createdById: "l:me" })).toBe(true);
  });

  describe("through the service and API", () => {
    beforeEach(setupTeam);
    afterEach(() => {
      session.current = null;
    });

    it("hides confidential cases from everyone but pastors, even the deacon who opened it", async () => {
      const d = await careActor(deacon);
      const p = await careActor(pastor);
      // Only a pastor can hold a confidential case.
      await expect(openCase(d, { personId: "p12", type: "crisis", confidential: true, assignee: "me" })).rejects.toThrow("Only pastors hold confidential cases");
      const c = await openCase(d, { personId: "p12", type: "crisis", confidential: true, assignee: "unassigned" });
      const open = await openCase(d, { personId: "p05", type: "hospital", assignee: leaderMemberId(staff.leaderId) });

      const rows = async (l: Leader) => caseRows((await careFor(l)).book, await careActor(l), { scope: "all" }).map((r) => r.id);
      expect(await rows(pastor)).toContain(c.id);
      expect(await rows(deacon)).not.toContain(c.id);
      expect(await rows(deacon)).toContain(open.id);
      expect(await rows(staff)).toEqual(expect.arrayContaining([open.id]));
      expect(await rows(staff)).not.toContain(c.id);
      expect(await rows(leaderRole)).not.toContain(open.id);
      await expect(assignCase(p, c.id, leaderMemberId(deacon.leaderId))).rejects.toThrow("only be assigned to a pastor");

      session.current = deacon;
      const route = await import("@/app/api/care/cases/route");
      const res = await route.GET(new Request("http://test/api/care/cases?scope=all"));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(c.id);
      expect(text).not.toContain("A hard season");
      session.current = leaderRole;
      const detail = await import("@/app/api/care/cases/route");
      const r2 = await detail.GET(new Request(`http://test/api/care/cases?id=${open.id}`));
      expect(r2.status).toBe(404);
      session.current = null;
      expect((await route.GET(new Request("http://test/api/care/cases"))).status).toBe(401);
    });

    it("lets leaders assign only to themselves, and audits every write", async () => {
      const l = await careActor(leaderRole);
      await expect(openCase(l, { personId: "p05", type: "hospital", assignee: leaderMemberId(deacon.leaderId) })).rejects.toThrow("not assign them to someone else");
      const c = await openCase(l, { personId: "p05", type: "hospital" });
      expect(c.assigneeId).toBe(leaderMemberId(leaderRole.leaderId));
      await logContact(l, c.id, { kind: "visit", date: today(), note: "In good spirits" });
      await expect(assignCase(l, c.id, leaderMemberId(deacon.leaderId))).rejects.toThrow("can't assign");
      await closeCase(l, c.id);
      const actions = (await listAudit(leaderRole)).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["care.case.open", "care.case.contact", "care.case.close"]));
    });
  });
});

describe("sensitive notes", () => {
  beforeEach(setupTeam);
  afterEach(() => vi.unstubAllEnvs());

  it("rejects diagnoses in case notes, next steps and prayer requests, but the type can say illness", async () => {
    const a = await careActor(pastor);
    await expect(openCase(a, { personId: "p17", type: "illness", summary: "Diagnosed with cancer last week" })).rejects.toThrow(/health details/);
    await expect(openCase(a, { personId: "p17", type: "illness", nextStep: "Ask about her chemo schedule" })).rejects.toThrow(/health details/);
    const c = await openCase(a, { personId: "p17", type: "illness", summary: "Recovering at home" });
    await expect(logContact(a, c.id, { kind: "call", date: today(), note: "Talked about her depression medication" })).rejects.toThrow(/health details/);
    await expect(logContact(a, c.id, { kind: "call", date: today(), note: "Door code is 4411" })).rejects.toThrow(/passwords and codes/);
    await expect(addPrayer(a, { personId: "p17", request: "Her divorce proceedings" })).rejects.toThrow(/family conflict/);
    const ok = await logContact(a, c.id, { kind: "call", date: today(), note: "In good spirits" });
    expect(ok.contacts).toHaveLength(1);
  });

  it("does the same through Barnabas's tools", async () => {
    const c = await ctx(pastor, "Log my visit with Elena", 0);
    const r = await executeTool("open_care_case", { person_id: "p17", type: "illness", summary: "Her diagnosis is bipolar disorder" }, c);
    expect(r.isError).toBe(true);
    expect(r.content).toContain("health details");
  });
});

describe("care-load signal", () => {
  const asOf = "2026-11-09";
  const crisis = (due?: string): Pick<CareCase, "type" | "status" | "nextStep"> => ({ type: "crisis", status: "active", nextStep: due ? { text: "x", due } : undefined });
  const visit: Pick<CareCase, "type" | "status" | "nextStep"> = { type: "homebound", status: "active" };

  it("is steady for a light week with recent rest", () => {
    const l = careLoad({ asOf, cases: [visit, visit], contactDates: [asOf, "2026-11-05"], restDates: ["2026-11-06"], trackingStart: "2026-01-01" });
    expect(l.signal).toBe("steady");
    expect(l.weighted).toBe(2);
    expect(l.daysWithoutDayOff).toBe(3);
    expect(l.reasons[0]).toContain("2 open cases");
  });

  it("weights crisis and grief more than routine visits, and ignores closed cases", () => {
    const l = careLoad({ asOf, cases: [crisis(), crisis(), { type: "grief", status: "active" }, { type: "prayer", status: "follow_up" }, { type: "crisis", status: "closed" }], contactDates: [], restDates: [asOf], trackingStart: asOf });
    expect(l.openCases).toBe(4);
    expect(l.weighted).toBe(3 + 3 + 2 + 0.5);
    expect(l.byType[0]).toMatchObject({ type: "crisis", count: 2, weight: 6 });
    expect(l.factors.find((f) => f.key === "weighted")!.level).toBe(1);
    expect(l.factors.find((f) => f.key === "crisis")!.level).toBe(1);
    // Two factors at "full" make "stretched".
    expect(l.signal).toBe("stretched");
  });

  it("counts days without a day off from rest events and logged days, or from when they started", () => {
    const base = { asOf, cases: [visit], contactDates: [] };
    expect(careLoad({ ...base, restDates: ["2026-10-28"], trackingStart: "2026-01-01" }).daysWithoutDayOff).toBe(12);
    expect(careLoad({ ...base, restDates: ["2026-10-28"], trackingStart: "2026-01-01" }).signal).toBe("full");
    expect(careLoad({ ...base, restDates: ["2026-10-20"], trackingStart: "2026-01-01" }).signal).toBe("stretched");
    // Future rest days don't count yet.
    expect(careLoad({ ...base, restDates: ["2026-11-12"], trackingStart: "2026-11-01" }).daysWithoutDayOff).toBe(8);
    const fresh = careLoad({ ...base, restDates: [], trackingStart: asOf });
    expect(fresh.daysWithoutDayOff).toBe(0);
    expect(fresh.countingSince).toBe(asOf);
    expect(fresh.signal).toBe("steady");
  });

  it("counts contacts in the last 7 days and overdue next steps", () => {
    const dates = Array.from({ length: 16 }, (_, i) => addDays(asOf, -(i % 7)));
    const l = careLoad({ asOf, cases: [crisis("2026-11-01"), crisis("2026-11-02"), { type: "other", status: "active", nextStep: { text: "x", due: "2026-11-03" } }], contactDates: [...dates, "2026-10-30"], restDates: [asOf], trackingStart: asOf });
    expect(l.contactsThisWeek).toBe(16);
    expect(l.overdue).toBe(3);
    expect(l.signal).toBe("stretched");
    expect(l.reasons.join(" ")).toContain("3 next steps past due");
  });

  it("combines levels gently", () => {
    expect(signalFor([0, 0, 0])).toBe("steady");
    expect(signalFor([1, 0, 0])).toBe("full");
    expect(signalFor([1, 1, 0])).toBe("stretched");
    expect(signalFor([2, 0, 0])).toBe("stretched");
  });

  it("shows the team only totals and anonymous spread", () => {
    const even = teamSpread([{ assigneeId: "a" }, { assigneeId: "b" }, { assigneeId: "a" }, { assigneeId: "b" }, { assigneeId: undefined }]);
    expect(even).toMatchObject({ totalOpen: 5, unassigned: 1, carers: 2, evenness: "even" });
    expect(even.shares).toEqual([0.5, 0.5]);
    const lumpy = teamSpread([...Array(8).fill({ assigneeId: "a" }), { assigneeId: "b" }, { assigneeId: "c" }]);
    expect(lumpy.evenness).toBe("concentrated");
    expect(JSON.stringify(lumpy)).not.toMatch(/"a"|"b"/);
  });
});

describe("discipleship next steps", () => {
  const asOf = "2026-11-09";
  const p = (steps: Pathway["steps"], visits?: number): Pathway => ({ key: "k", name: "N", steps, visits, updatedAt: 0 });

  it("finds who's ready for each step, with the reason", () => {
    expect(nextStepsFor(p({ first_visit: "2026-11-01" }, 2), asOf).map((n) => n.step)).toEqual(["discover_faith"]);
    expect(nextStepsFor(p({ first_visit: "2026-11-01" }, 1), asOf)).toEqual([]);
    expect(nextStepsFor(p({ first_visit: "2026-10-01" }), asOf).map((n) => n.step)).toEqual(["discover_faith"]);
    expect(nextStepsFor(p({ first_visit: "2026-09-01", discover_faith: "2026-09-20", salvation: "2026-10-01" }), asOf).map((n) => n.step)).toEqual(["baptism"]);
    const baptized = nextStepsFor(p({ first_visit: "2026-10-01", salvation: "2026-10-02", baptism: "2026-10-20" }), asOf);
    expect(baptized.map((n) => n.step)).toEqual(["membership_class"]);
    expect(baptized[0].reason).toContain("not a member yet");
    expect(nextStepsFor(p({ first_visit: "2026-10-01", baptism: "2026-10-02", membership_class: "2026-10-30" }), asOf).map((n) => n.step)).toEqual(["membership"]);
    const longTime = nextStepsFor(p({ first_visit: "2026-07-01", baptism: "2026-01-01", membership_class: "2026-02-01", membership: "2026-03-01" }), asOf);
    expect(longTime.map((n) => n.step)).toEqual(["group"]);
    expect(longTime[0].reason).toContain("not in a group");
    expect(nextStepsFor(p({ first_visit: "2025-01-01", baptism: "2025-02-01", membership_class: "2025-03-01", membership: "2025-04-01", group: "2025-05-01" }), asOf).map((n) => n.step)).toEqual(["serving"]);
    expect(nextStepsFor(p({ first_visit: "2025-01-01", baptism: "2025-02-01", membership_class: "2025-03-01", membership: "2025-04-01", group: "2025-05-01", serving: "2025-06-01" }), asOf)).toEqual([]);
  });

  it("answers who's ready for the membership class from the demo data", async () => {
    await setupTeam();
    const c = await ctx(pastor, "Who's ready for the membership class?", 0);
    const r = await executeTool("discipleship_next_steps", { step: "membership_class" }, c);
    expect(r.isError).toBe(false);
    const ready = JSON.parse(r.content).ready.map((x: { name: string }) => x.name);
    expect(ready).toEqual(expect.arrayContaining(["Ana López", "Sofía Ramírez", "Tom Reyes"]));
    expect(ready).not.toContain("Sarah Kim");
    const all = nextSteps((await loadCare("demo")).pathways, today());
    expect(all.every((n) => n.reason.length > 10)).toBe(true);
  });
});

describe("guest follow-up", () => {
  const members: TeamMember[] = [
    { id: "demo:travis", name: "Travis Willette", title: "Deacon", role: "deacon", placeholder: true, connections: true },
    { id: "demo:aaron", name: "Aaron Malachuk", title: "Connections & Worship Pastor", role: "pastor", placeholder: true, connections: true },
    { id: "demo:ethan", name: "Ethan Malachuk", title: "Lead Pastor", role: "pastor", placeholder: true, connections: false },
    { id: "demo:cal", name: "Cal Najimy", title: "Deacon", role: "deacon", placeholder: true, connections: true },
  ];

  it("makes a thank-you within 24 hours and a call within 48, and a Discover Faith invite after a second visit", () => {
    let i = 0;
    const tasks = initialTasks({ visits: ["2026-11-08"] }, "demo:cal", 1_000, (p) => `${p}${i++}`);
    expect(tasks.map((t) => [t.kind, t.dueAt - 1_000])).toEqual([
      ["thank_you", 24 * 3_600_000],
      ["call", 48 * 3_600_000],
    ]);
    expect(visitTasks({ visits: ["2026-11-01", "2026-11-08"], tasks }, "demo:cal", 5_000).map((t) => [t.kind, t.dueAt])).toEqual([["discover_faith_invite", 5_000 + TASK_WINDOWS.discover_faith_invite]]);
    const withInvite = [...tasks, ...visitTasks({ visits: ["2026-11-01", "2026-11-08"], tasks }, "demo:cal", 5_000)];
    expect(visitTasks({ visits: ["a", "b", "c"], tasks: withInvite }, "demo:cal", 6_000)).toEqual([]);
    expect(initialTasks({ visits: ["2026-11-01", "2026-11-08"] }, "x", 0).map((t) => t.kind)).toEqual(["thank_you", "call", "discover_faith_invite"]);
  });

  it("rotates among deacons and connections staff, with a lighter share for anyone in a busy season", () => {
    expect(rotationPool(members).map((m) => m.name)).toEqual(["Aaron Malachuk", "Cal Najimy", "Travis Willette", "Aaron Malachuk", "Cal Najimy", "Travis Willette"]);
    const busy = members.map((m) => (m.name === "Travis Willette" ? { ...m, lighterLoad: true } : m));
    let r = 0;
    const picks: string[] = [];
    for (let k = 0; k < 6; k++) {
      const { member, next } = pickAssignee(busy, r);
      picks.push(member!.name);
      r = next;
    }
    expect(picks).toEqual(["Aaron Malachuk", "Cal Najimy", "Travis Willette", "Aaron Malachuk", "Cal Najimy", "Aaron Malachuk"]);
  });

  it("uses the real leadership as the demo's actors, and only in their roles", async () => {
    await setupTeam();
    const book = await loadCare("demo");
    const members = (await careActor(pastor)).members;
    const name = (id?: string) => members.find((m) => m.id === id)?.name;
    const leaders = ["Ethan Malachuk", "Eric Malachuk", "Aaron Malachuk", "Travis Willette", "Cal Najimy", "Micah Hayre"];
    // Never the subject of a case, a prayer request, a pathway or a guest card.
    for (const n of leaders) {
      expect(book.cases.some((c) => c.subject.name === n), n).toBe(false);
      expect(book.prayers.some((p) => p.name === n), n).toBe(false);
      expect(book.pathways.some((p) => p.name === n), n).toBe(false);
      expect(book.guests.some((g) => g.name === n), n).toBe(false);
    }
    expect(book.cases.filter((c) => c.type === "crisis").map((c) => name(c.assigneeId))).toEqual(["Ethan Malachuk", "Ethan Malachuk"]);
    expect(book.cases.filter((c) => c.type === "grief").every((c) => name(c.assigneeId) === "Eric Malachuk")).toBe(true);
    expect(book.classes.find((c) => c.kind === "discover_faith")!.teacherName).toBe("Eric Malachuk");
    expect(book.classes.filter((c) => c.kind === "membership").every((c) => c.teacherName === "Ethan Malachuk")).toBe(true);
    // The deacons are the prayer team.
    expect(book.prayers.filter((p) => !p.guestId && p.shareable).every((p) => ["Travis Willette", "Cal Najimy", "Micah Hayre"].includes(p.createdByName))).toBe(true);
    // Guests go to Aaron and the deacons (Travis signed in here); Travis and Micah get fewer than Aaron.
    const guestHolders = book.guests.map((g) => name(g.assigneeId));
    expect(guestHolders.every((n) => ["Aaron Malachuk", "Travis Willette", "Cal Najimy", "Micah Hayre"].includes(n!))).toBe(true);
    const count = (n: string) => book.cases.filter((c) => c.status !== "closed" && name(c.assigneeId) === n).length;
    expect(count("Travis Willette")).toBeLessThan(count("Eric Malachuk"));
    // No demo days off are seeded for a real leader: their dashboard is computed only from their cases.
    const { actor: travisActor, book: b2 } = await careFor(deacon);
    const travisLoad = await myCareLoad(deacon, b2, travisActor);
    expect(travisLoad.logged).toHaveLength(0);
  });

  it("records a guest with a thank-you draft in the review queue, and a second visit moves them along", async () => {
    await setupTeam();
    const a = await careActor(deacon);
    const before = (await loadCare("demo")).rotation;
    const g = await recordGuest("demo", a, { name: "Robin Avery", phone: "(555) 014-1111", interests: ["kids"], prayerRequest: "For my family", visitDate: "2026-11-08" }, a.members);
    expect(g.tasks.map((t) => t.kind)).toEqual(["thank_you", "call"]);
    const thanks = g.tasks[0];
    const book = await loadCare("demo");
    expect(book.rotation).not.toBe(before);
    expect(book.pathways.find((p) => p.key === g.id)?.steps.first_visit).toBe("2026-11-08");
    const pr = book.prayers.find((p) => p.id === g.prayerRequestId)!;
    expect(pr.shareable).toBe(false);
    // The draft is in a signed-in leader's queue, not sent.
    expect(thanks.draftId).toBeTruthy();
    const owner = [pastor, deacon, staff, leaderRole].find((l) => leaderMemberId(l.leaderId) === thanks.draftOwnerId)!;
    const draft = (await listDrafts(owner)).find((d) => d.id === thanks.draftId)!;
    expect(draft.status).toBe("needs_review");
    expect(draft.channel).toBe("sms");
    expect(draft.recipients[0].text).toContain("Hi Robin");

    const after = await recordVisit(a, g.id, "2026-11-15");
    expect(after.tasks.map((t) => t.kind)).toContain("discover_faith_invite");
    const ready = nextSteps((await loadCare("demo")).pathways, "2026-11-16").filter((n) => n.key === g.id);
    expect(ready.map((n) => n.step)).toEqual(["discover_faith"]);
    expect(ready[0].reason).toContain("second visit");
  });
});

describe("public guest form", () => {
  beforeEach(setupTeam);
  afterEach(() => {
    session.current = null;
  });

  async function post(token: string, body: unknown, ip = "203.0.113.5") {
    const route = await import("@/app/api/welcome/[token]/route");
    return route.POST(new Request(`http://test/api/welcome/${token}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });
  }

  it("only accepts active, well-formed tokens", async () => {
    const a = await careActor(pastor);
    const link = await createWelcomeLink(a, "Sunday welcome table");
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await resolveToken(link.token))?.link.id).toBe(link.id);
    expect(await resolveToken("short")).toBeNull();
    expect(await resolveToken(link.token.slice(0, -1) + (link.token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect((await post("not-a-token", { name: "X" })).status).toBe(404);

    const res = await post(link.token, { name: "Casey Morgan", email: "casey@example.org", interests: ["young_adults"], prayerRequest: "For a new job" });
    expect(res.status).toBe(200);
    const book = await loadCare("demo");
    const card = book.guests.find((g) => g.name === "Casey Morgan")!;
    expect(card.source).toBe("self");
    expect(card.tasks.map((t) => t.kind)).toEqual(["thank_you", "call"]);
    // The response doesn't leak anything about the church's records.
    expect(Object.keys(await res.json())).toEqual(["ok"]);

    await revokeWelcomeLink(a, link.id);
    expect(await resolveToken(link.token)).toBeNull();
    expect((await post(link.token, { name: "Late Guest" })).status).toBe(404);

    // Staff can make links; leaders can't.
    await expect(createWelcomeLink(await careActor(leaderRole), "x")).rejects.toThrow();
  });

  it("rate-limits by address and keeps sensitive prayer details out", async () => {
    const link = await createWelcomeLink(await careActor(pastor), "Lobby");
    for (let i = 0; i < RATE_LIMITS.ip.limit; i++) expect((await post(link.token, { name: `Guest ${i}` })).status, `submission ${i}`).toBe(200);
    const limited = await post(link.token, { name: "One too many" });
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toContain("a few minutes");
    // Another address still works.
    expect((await post(link.token, { name: "Neighbor" }, "198.51.100.7")).status).toBe(200);
    const sensitive = await post(link.token, { name: "Pat", prayerRequest: "My cancer diagnosis" }, "198.51.100.8");
    expect(sensitive.status).toBe(400);
    expect((await sensitive.json()).error).toContain("protect your privacy");
    // A filled honeypot is quietly accepted and dropped.
    const bot = await post(link.token, { name: "Bot", website: "http://spam.example" }, "198.51.100.9");
    expect(bot.status).toBe(200);
    expect((await loadCare("demo")).guests.some((g) => g.name === "Bot")).toBe(false);
  });

  it("is on the middleware's public list, and nothing else in Care is", async () => {
    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");
    const status = async (path: string) => (await middleware(new NextRequest(`http://test${path}`))).status;
    expect(await status("/welcome/abc")).toBe(200);
    expect(await status("/api/welcome/abc")).toBe(200);
    expect(await status("/care")).toBe(307);
    expect(await status("/api/care/cases")).toBe(401);
  });
});

describe("Barnabas care tools", () => {
  beforeEach(setupTeam);

  it("opens a case, logs a contact and adds a prayer request directly", async () => {
    const c = await ctx(staff, "I visited Grace in the hospital today", 0);
    const opened = await executeTool("open_care_case", { person_id: "p05", type: "hospital", contact_kind: "visit", next_step: "Call Thursday", due: addDays(today(), 3) }, c);
    expect(opened.isError).toBe(false);
    const { case_id, done } = JSON.parse(opened.content);
    expect(done).toContain("Opened a hospital case for Grace Lee");
    const logged = await executeTool("log_care_contact", { case_id, kind: "call", note: "Home tomorrow" }, c);
    expect(logged.isError).toBe(false);
    const prayer = await executeTool("add_prayer_request", { person_id: "p05", request: "Rest as she recovers", shareable: true }, c);
    expect(prayer.content).toContain("shareable prayer request for Grace Lee");
    const mine = JSON.parse((await executeTool("list_care_cases", { scope: "mine" }, c)).content);
    expect(mine.cases.map((x: { case_id: string }) => x.case_id)).toContain(case_id);
    const detail = JSON.parse((await executeTool("care_case_detail", { case_id }, c)).content);
    expect(detail.contacts.map((x: { kind: string }) => x.kind)).toEqual(["Visit", "Call"]);
  });

  it("gates assigning to someone else and closing behind a later-turn yes", async () => {
    const c1 = await ctx(pastor, "Give Grace's case to Travis", 0);
    const { case_id } = JSON.parse((await executeTool("open_care_case", { person_id: "p05", type: "hospital" }, c1)).content);
    const first = await executeTool("assign_care_case", { case_id, assignee: "Travis Willette" }, c1);
    expect(first.isError).toBe(true);
    expect(first.content).toContain("Not confirmed yet");
    // Same turn "yes" doesn't count, nor does a different assignee.
    expect((await executeTool("assign_care_case", { case_id, assignee: "Travis Willette" }, await ctx(pastor, "yes", 0, c1.meta))).isError).toBe(true);
    expect((await executeTool("assign_care_case", { case_id, assignee: "Kim Staff" }, await ctx(pastor, "Yes", 1, c1.meta))).isError).toBe(true);
    const done = await executeTool("assign_care_case", { case_id, assignee: "Kim Staff" }, await ctx(pastor, "Yes, do it", 2, c1.meta));
    expect(done.isError).toBe(false);
    expect((await loadCare("demo")).cases.find((x) => x.id === case_id)!.assigneeId).toBe(leaderMemberId(staff.leaderId));

    // Taking a case yourself needs no confirmation.
    const take = await executeTool("assign_care_case", { case_id, assignee: "me" }, await ctx(pastor, "I'll take it", 3, c1.meta));
    expect(take.isError).toBe(false);

    const close1 = await executeTool("close_care_case", { case_id }, await ctx(pastor, "Close Grace's case", 4, c1.meta));
    expect(close1.content).toContain("Not confirmed yet");
    const no = await executeTool("close_care_case", { case_id }, await ctx(pastor, "No, wait", 5, c1.meta));
    expect(no.isError).toBe(true);
    const close2 = await executeTool("close_care_case", { case_id }, await ctx(pastor, "Yes", 6, c1.meta));
    expect(close2.isError).toBe(false);
    expect((await loadCare("demo")).cases.find((x) => x.id === case_id)!.status).toBe("closed");
  });

  it("keeps cases a leader can't see out of reach, and refuses assignment without care.assign", async () => {
    const c = await ctx(pastor, "x", 0);
    const { case_id } = JSON.parse((await executeTool("open_care_case", { person_id: "p12", type: "crisis", confidential: true }, c)).content);
    const d = await ctx(deacon, "Tell me about Ben's case", 0);
    expect((await executeTool("care_case_detail", { case_id }, d)).isError).toBe(true);
    expect((await executeTool("close_care_case", { case_id }, d)).isError).toBe(true);
    const all = await executeTool("list_care_cases", { scope: "all" }, d);
    expect(all.content).not.toContain(case_id);

    const lc = await ctx(leaderRole, "Open a case for Grace and give it to Travis", 0);
    const r = await executeTool("open_care_case", { person_id: "p05", type: "hospital", assignee: "Travis" }, lc);
    expect(r.isError).toBe(true);
  });

  it("reports the leader's own load and recent guests, and records a guest", async () => {
    const c = await ctx(pastor, "How am I doing?", 0);
    const load = JSON.parse((await executeTool("my_care_load", {}, c)).content);
    expect(["Steady", "Full", "Stretched"]).toContain(load.signal);
    expect(load.reasons.length).toBeGreaterThan(0);
    // A few demo cases plus a demo day off 12 days ago: full, with the reason.
    expect(load.signal).toBe("Full");
    expect(load.reasons.join(" ")).toContain("No day off in 12 days");
    const recorded = await executeTool("record_guest", { name: "Morgan Ellis", email: "morgan@example.org" }, c);
    expect(recorded.isError).toBe(false);
    const guests = JSON.parse((await executeTool("recent_guests", {}, c)).content).guests.map((g: { name: string }) => g.name);
    expect(guests).toEqual(expect.arrayContaining(["Morgan Ellis", "Kelsey Doucette"]));
    expect(guests).not.toContain("Ellie Brandt");
  });
});

describe("compatibility with log_care_event", () => {
  beforeEach(setupTeam);

  it("folds older care records into cases once, and keeps them in follow-ups", async () => {
    await addCare(staff, { personId: "p05", personName: "Grace Lee", kind: "hospital", followUp: "Check on Grace after her recovery", due: "2026-11-20" });
    await addCare(staff, { personId: "p02", personName: "Marcus Bell", kind: "call", done: true });
    expect(await absorbLegacyCare(staff)).toBe(2);
    expect(await absorbLegacyCare(staff)).toBe(0);
    const book = await loadCare("demo");
    const legacy = book.cases.filter((c) => c.source === "legacy");
    expect(legacy).toHaveLength(2);
    expect(legacy.find((c) => c.subject.personId === "p05")).toMatchObject({ type: "hospital", status: "follow_up", nextStep: { text: "Check on Grace after her recovery", due: "2026-11-20" } });
    expect(legacy.find((c) => c.subject.personId === "p02")!.status).toBe("closed");
    const f = await followUps(staff);
    expect(f.find((x) => x.personId === "p05")?.reason).toBe("Check on Grace after her recovery");
  });

  it("logs through the old tool onto the leader's open case", async () => {
    const c = await ctx(staff, "I called Grace", 0);
    const r1 = await executeTool("log_care_event", { person_id: "p05", kind: "call", follow_up: "Visit Friday" }, c);
    expect(r1.isError).toBe(false);
    const r2 = await executeTool("log_care_event", { person_id: "p05", kind: "visit" }, c);
    expect(r2.isError).toBe(false);
    const mine = (await loadCare("demo")).cases.filter((x) => x.subject.personId === "p05" && x.assigneeId === leaderMemberId(staff.leaderId));
    expect(mine).toHaveLength(1);
    expect(mine[0].contacts.map((x) => x.kind)).toEqual(["call", "visit"]);
    const bad = await executeTool("log_care_event", { person_id: "p05", kind: "call", follow_up: "Ask about the rehab program" }, c);
    expect(bad.isError).toBe(true);
  });

  it("shows the leader's own cases in their load, never someone else's", async () => {
    const { actor, book } = await careFor(deacon);
    const load = await myCareLoad(deacon, book, actor);
    const travisCases = book.cases.filter((c) => c.status !== "closed" && actor.viewer.memberIds.includes(c.assigneeId ?? ""));
    expect(load.openCases).toBe(travisCases.length);
  });
});
