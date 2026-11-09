import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// API routes read the signed-in leader from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { can, ROLES } from "@/lib/auth/roles";
import { outsideEvents } from "@/lib/calendar/service";
import { DemoChurch } from "@/lib/chms/demo";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { getJSON } from "@/lib/store";
import { listAudit, listDrafts } from "@/lib/data/records";
import { addDays, lastSunday, today } from "@/lib/dates";
import { briefing, radarNow } from "@/lib/engine/briefing";
import { executeTool, type ToolContext } from "@/lib/engine/tools";
import { cancelRegistration, checkIn, counts, createEvent, csvCell, eventsActor, register, registrationsCsv, resolveEventToken } from "@/lib/events/service";
import { loadEvents } from "@/lib/events/store";
import { checkInChildren, checkOutChildren, kidsActor, kidsCounts, ratioWarning, saveHousehold, searchFamilies, setStaffing } from "@/lib/kids/service";
import { loadKids } from "@/lib/kids/store";
import { labelsFor } from "@/lib/kids/service";
import { nextMeeting } from "@/lib/ops/gatherings";
import { checkMemoryText } from "@/lib/policy/privacy";
import { addBlackout, addVolunteer, assign, autoFill, coverageFor, draftReminders, requestSwap, respondSwap, serveActor, setPositions, signUp, unavailable, updateVolunteer } from "@/lib/serve/service";
import { loadServe } from "@/lib/serve/store";
import { rosterFor } from "@/lib/serve/views";
import { parseRef, wordHref } from "@/lib/services/scripture";
import { savePlan, servicesActor, setPreacher, startPlan } from "@/lib/services/service";
import { loadServices } from "@/lib/services/store";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "op000001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const staff: Leader = { churchId: "demo", leaderId: "op000002", name: "Kim Staff", email: "kim@example.org", role: "Kids director" };
const travis: Leader = { churchId: "demo", leaderId: "op000003", name: "Travis Willette", email: "travis@example.org", role: "Deacon" };
const member: Leader = { churchId: "demo", leaderId: "op000004", name: "Lee Leader", email: "lee@example.org", role: "Small group leader" };
const aaron: Leader = { churchId: "demo", leaderId: "op000005", name: "Aaron Malachuk", email: "aaron@example.org", role: "Worship pastor" };

async function setupTeam() {
  freshStore();
  for (const l of [pastor, staff, travis, member, aaron]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", staff.leaderId, "staff", "test");
  await setLeaderRole("demo", travis.leaderId, "deacon", "test");
  await setLeaderRole("demo", aaron.leaderId, "pastor", "test");
}

async function ctx(leader: Leader, lastUserText: string, turns: number, meta?: ConversationMeta): Promise<ToolContext> {
  const m: ConversationMeta = meta ?? { id: `conv_${leader.leaderId}_${Math.random().toString(36).slice(2)}`, title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns };
  if (!meta) await createConversation(leader, m);
  m.turns = turns;
  return { leader, meta: m, turnStartedAt: Date.now(), lastUserText };
}

const upcomingSunday = (weeks = 1) => addDays(lastSunday(today()), 7 * weeks);
const LEADERS = ["Ethan Malachuk", "Eric Malachuk", "Aaron Malachuk", "Travis Willette", "Cal Najimy", "Micah Hayre"];

describe("operations permissions", () => {
  it("maps the new permissions to roles", () => {
    const expected: Record<string, string[]> = {
      "ops.schedule": ["pastor", "staff"],
      "services.plan": ["pastor", "staff"],
      "events.manage": ["pastor", "deacon", "staff"],
      "kids.checkin": ["pastor", "staff"],
      "kids.admin": ["pastor", "staff"],
    };
    for (const role of ROLES) for (const [perm, roles] of Object.entries(expected)) expect(can({ role, admin: false }, perm as never), `${role} ${perm}`).toBe(roles.includes(role));
  });
});

describe("demo seeds: real leaders only, no made-up people", () => {
  beforeEach(setupTeam);

  it("seeds rosters with Aaron, Travis and Micah only, and Travis and Micah never more than twice a month", async () => {
    const book = await loadServe("demo");
    expect(book.meta.demo).toBe(true);
    expect(book.volunteers.map((v) => v.name).sort()).toEqual(["Aaron Malachuk", "Micah Hayre", "Travis Willette"]);
    expect(book.volunteers.every((v) => !v.email && !v.phone)).toBe(true);
    const aaronVol = book.volunteers.find((v) => v.name === "Aaron Malachuk")!;
    // Aaron leads worship at both services every Sunday.
    for (let i = 0; i < 12; i++) {
      const d = addDays(lastSunday(today()), -7 * i);
      expect(book.assignments.filter((a) => a.volunteerId === aaronVol.id && a.date === d).map((a) => a.gathering).sort(), d).toEqual(["sun-0830", "sun-1045"]);
    }
    for (const name of ["Travis Willette", "Micah Hayre"]) {
      const v = book.volunteers.find((x) => x.name === name)!;
      expect(v.maxPerMonth).toBe(2);
      const perMonth = new Map<string, Set<string>>();
      for (const a of book.assignments.filter((x) => x.volunteerId === v.id)) perMonth.set(a.date.slice(0, 7), (perMonth.get(a.date.slice(0, 7)) ?? new Set()).add(a.date));
      for (const [m, dates] of perMonth) expect(dates.size, `${name} ${m}`).toBeLessThanOrEqual(2);
    }
  });

  it("seeds Ethan most Sundays and Eric occasionally, events with no registrations, and no families", async () => {
    const svc = await loadServices("demo");
    const names = svc.rotation.map((r) => r.preacher);
    expect(new Set(names)).toEqual(new Set(["Ethan Malachuk", "Eric Malachuk"]));
    expect(names.filter((n) => n === "Ethan Malachuk").length).toBeGreaterThan(names.filter((n) => n === "Eric Malachuk").length * 2);
    expect(svc.series).toEqual([]);
    expect(svc.plans).toEqual([]);

    const ev = await loadEvents("demo");
    expect(ev.events.map((e) => e.churchEventId).sort()).toEqual(["mgbc-reverb", "mgbc-teens-christmas", "mgbc-thanksgiving"]);
    expect(ev.events.find((e) => e.churchEventId === "mgbc-reverb")).toMatchObject({ date: "2026-11-13", priceCents: 6700 });
    expect(ev.registrations).toEqual([]);

    const kids = await loadKids("demo");
    expect(kids.households).toEqual([]);
    expect(kids.rooms.length).toBeGreaterThan(3);
  });
});

describe("volunteer scheduling", () => {
  beforeEach(setupTeam);

  it("refuses double-booking at one gathering, blackout dates and going over a monthly cap", async () => {
    const p = await serveActor(pastor);
    const sun = upcomingSunday(2);
    const v = await addVolunteer(p, { name: "Jordan Test", teamIds: ["greeters", "parking"] });
    await assign(p, { date: sun, gathering: "sun-0830", teamId: "greeters", positionId: "door-greeter", volunteerId: v.id });
    // Same gathering, another team: a conflict.
    await expect(assign(p, { date: sun, gathering: "sun-0830", teamId: "parking", positionId: "parking-lot", volunteerId: v.id })).rejects.toThrow("already serving");
    // The other service that morning is fine.
    await assign(p, { date: sun, gathering: "sun-1045", teamId: "parking", positionId: "parking-lot", volunteerId: v.id });
    // Away dates.
    const away = upcomingSunday(3);
    const r = await addBlackout(p, { volunteerId: v.id, from: addDays(away, -1), to: addDays(away, 1), note: "Away" });
    expect(r.clashes).toHaveLength(0);
    await expect(assign(p, { date: away, gathering: "sun-0830", teamId: "greeters", positionId: "door-greeter", volunteerId: v.id })).rejects.toThrow(/is away/);
    // A monthly cap counts distinct Sundays.
    await updateVolunteer(p, v.id, { maxPerMonth: 1 });
    const book = await loadServe("demo");
    const sameMonth = [upcomingSunday(1), upcomingSunday(2), upcomingSunday(3), upcomingSunday(4)].find((d) => d !== sun && d.slice(0, 7) === sun.slice(0, 7) && d !== away);
    if (sameMonth) expect(unavailable(book, book.volunteers.find((x) => x.id === v.id)!, { date: sameMonth, gathering: "sun-0830" })).toMatch(/keeps them to 1/);
    // Filled positions can't take another.
    const v2 = await addVolunteer(p, { name: "Sam Test", teamIds: ["parking"] });
    const v3 = await addVolunteer(p, { name: "Alex Test", teamIds: ["parking"] });
    await assign(p, { date: sun, gathering: "sun-1045", teamId: "parking", positionId: "parking-lot", volunteerId: v2.id });
    await expect(assign(p, { date: sun, gathering: "sun-1045", teamId: "parking", positionId: "parking-lot", volunteerId: v3.id })).rejects.toThrow("already filled");
    // Gatherings must be on their day.
    await expect(assign(p, { date: addDays(sun, 1), gathering: "sun-0830", teamId: "greeters", positionId: "door-greeter", volunteerId: v3.id })).rejects.toThrow(/isn't on/);
  });

  it("never schedules Travis or Micah more than twice a month, by hand or by auto-fill, and keeps their cap", async () => {
    const p = await serveActor(pastor);
    const book = await loadServe("demo");
    const travisVol = book.volunteers.find((v) => v.name === "Travis Willette")!;
    // Find an upcoming Sunday in a month where Travis already has two.
    const months = new Map<string, Set<string>>();
    for (const a of book.assignments.filter((x) => x.volunteerId === travisVol.id && x.date >= today())) months.set(a.date.slice(0, 7), (months.get(a.date.slice(0, 7)) ?? new Set()).add(a.date));
    const full = [...months.entries()].find(([, d]) => d.size >= 2)!;
    expect(full).toBeTruthy();
    const freeSunday = Array.from({ length: 6 }, (_, i) => addDays(`${full[0]}-01`, i * 7)).map((d) => nextMeeting(d, [0])).find((d) => d.startsWith(full[0]) && !full[1].has(d) && d >= today());
    if (freeSunday) {
      await expect(assign(p, { date: freeSunday, gathering: "sun-0830", teamId: "greeters", positionId: "door-greeter", volunteerId: travisVol.id })).rejects.toThrow(/keeps them to 2/);
      const added = await autoFill(p, { date: freeSunday, gathering: "sun-0830", teamId: "greeters" });
      const after = await loadServe("demo");
      expect(after.assignments.filter((a) => added.some((x) => x.id === a.id)).some((a) => a.volunteerId === travisVol.id)).toBe(false);
    }
    await expect(updateVolunteer(p, travisVol.id, { maxPerMonth: 4 })).rejects.toThrow("at the church's request");
    await expect(updateVolunteer(p, travisVol.id, { maxPerMonth: null })).rejects.toThrow("at the church's request");
  });

  it("lets team leads edit only their own team, and anyone sign up for an open slot", async () => {
    const t = await serveActor(travis);
    const m = await serveActor(member);
    const sun = upcomingSunday(2);
    const v = await addVolunteer(t, { name: "Riley Test", teamIds: ["greeters"] });
    await assign(t, { date: sun, gathering: "sun-0830", teamId: "greeters", positionId: "welcome-table", volunteerId: v.id });
    await expect(addVolunteer(t, { name: "Nope Test", teamIds: ["worship"] })).rejects.toThrow("Worship team lead");
    await expect(assign(m, { date: sun, gathering: "sun-0830", teamId: "greeters", positionId: "door-greeter", volunteerId: v.id })).rejects.toThrow(/scheduler or the Greeters lead/);
    await expect(setPositions(m, { teamId: "tech", positions: [{ name: "Sound", needed: 1 }] })).rejects.toThrow();
    // A leader with no scheduling role signs themselves up.
    const s = await signUp(m, { date: sun, gathering: "sun-1045", teamId: "tech", positionId: "sound" });
    expect(s.assignment.status).toBe("confirmed");
    const book = await loadServe("demo");
    expect(book.volunteers.find((x) => x.leaderId === member.leaderId)?.teamIds).toContain("tech");
    await expect(signUp(m, { date: sun, gathering: "sun-1045", teamId: "tech", positionId: "livestream" })).rejects.toThrow(/You're already serving/);
    const actions = (await listAudit(member)).map((a) => a.action);
    expect(actions).toContain("serve.signup");
  });

  it("swaps: ask a teammate to cover, they accept, and the roster updates", async () => {
    const p = await serveActor(pastor);
    const sun = upcomingSunday(2);
    const a = await addVolunteer(p, { name: "Casey Test", teamIds: ["tech"] });
    await recordSignIn({ ...member });
    // The member signs up as themselves, then asks Casey to cover.
    const m = await serveActor(member);
    const mine = await signUp(m, { date: sun, gathering: "sun-0830", teamId: "tech", positionId: "slides" });
    const outsider = await addVolunteer(p, { name: "Morgan Test", teamIds: ["parking"] });
    await expect(requestSwap(m, { assignmentId: mine.assignment.id, toVolunteerId: outsider.id })).rejects.toThrow("isn't on Tech");
    const swap = await requestSwap(m, { assignmentId: mine.assignment.id, toVolunteerId: a.id, note: "Traveling" });
    expect(swap.status).toBe("pending");
    await expect(requestSwap(m, { assignmentId: mine.assignment.id, toVolunteerId: a.id })).rejects.toThrow("already a swap");
    // Someone else can't answer for Casey; the scheduler can.
    await expect(respondSwap(await serveActor(travis), swap.id, true)).rejects.toThrow("Only the person asked");
    const { assignment } = await respondSwap(p, swap.id, true);
    expect(assignment.volunteerId).toBe(a.id);
    expect(assignment.source).toBe("swap");
    const roster = rosterFor(await loadServe("demo"), p, sun);
    const slides = roster.find((g) => g.key === "sun-0830")!.teams.find((t) => t.teamId === "tech")!.positions.find((x) => x.id === "slides")!;
    expect(slides.slots.map((s) => s.name)).toEqual(["Casey Test"]);
    await expect(respondSwap(p, swap.id, true)).rejects.toThrow("already accepted");
  });

  it("re-checks availability when the swap is accepted", async () => {
    const p = await serveActor(pastor);
    const sun = upcomingSunday(2);
    const a = await addVolunteer(p, { name: "Drew Test", teamIds: ["tech"] });
    const b = await addVolunteer(p, { name: "Quinn Test", teamIds: ["tech"] });
    const asg = await assign(p, { date: sun, gathering: "sun-0830", teamId: "tech", positionId: "sound", volunteerId: a.id });
    const swap = await requestSwap(p, { assignmentId: asg.assignment.id, toVolunteerId: b.id });
    await addBlackout(p, { volunteerId: b.id, from: sun, to: sun });
    await expect(respondSwap(p, swap.id, true)).rejects.toThrow(/is away/);
    expect(coverageFor(await loadServe("demo"), { date: sun, gathering: "sun-0830", teamId: "tech" }).unavailable.map((c) => c.volunteer.name)).toContain("Quinn Test");
  });

  it("drafts reminders into the review queue and sends nothing", async () => {
    const p = await serveActor(pastor);
    const sun = upcomingSunday(1);
    const draft = (await draftReminders(p, sun))!;
    expect(draft.status).toBe("needs_review");
    expect(draft.recipients.map((r) => r.name)).toContain("Aaron Malachuk");
    const aaronText = draft.recipients.find((r) => r.name === "Aaron Malachuk")!.text;
    expect(aaronText).toContain("Worship leader with Worship team at the 8:30 worship");
    expect(aaronText).toContain("10:45 worship");
    expect((await listDrafts(pastor)).map((d) => d.id)).toContain(draft.id);
    expect(await getJSON("outbox:demo")).toBeNull();
    // Leaders without a team to schedule can't draft them.
    await expect(draftReminders(await serveActor(member), sun)).rejects.toThrow();
  });
});

describe("the radar with real roster data", () => {
  beforeEach(setupTeam);

  it("uses roster data where it exists and the ChMS elsewhere, and puts Aaron on watch with a thank-you and a Sunday off", async () => {
    const { radar, serving } = await radarNow(today(), "demo");
    // Worship comes from the roster: two services a Sunday, so two records a week for Aaron.
    const lastSun = lastSunday(today());
    expect(serving.filter((s) => s.personId === "p19" && s.teamId === "worship" && s.date === lastSun)).toHaveLength(2);
    const aaronEntry = radar.find((r) => r.name === "Aaron Malachuk")!;
    expect(aaronEntry.band).toBe("watch");
    expect(aaronEntry.consecutiveWeeks).toBeGreaterThanOrEqual(12);
    expect(aaronEntry.suggestion).toBe("Thank Aaron for serving so faithfully, and offer a Sunday off.");
    expect(JSON.stringify(aaronEntry)).not.toMatch(/burn/i);
    for (const name of ["Travis Willette", "Micah Hayre"]) expect(radar.find((r) => r.name === name)?.band ?? "ok", name).toBe("ok");
    // No one outside the leadership appears.
    for (const r of radar) expect(LEADERS).toContain(r.name);
    expect((await briefing(pastor)).radar.map((r) => r.name)).toEqual(["Aaron Malachuk"]);
  });

  it("flags a volunteer added through the roster who serves too much, with reasons", async () => {
    const p = await serveActor(pastor);
    const v = await addVolunteer(p, { name: "Pat Volunteer", teamIds: ["tech", "greeters", "parking"] });
    // Backfill eight straight Sundays on three teams directly (scheduling refuses past dates for sign-ups only).
    for (let i = 0; i < 8; i++) {
      const d = addDays(lastSunday(today()), -7 * i);
      await assign(p, { date: d, gathering: "sun-0830", teamId: "tech", positionId: "sound", volunteerId: v.id });
      await assign(p, { date: d, gathering: "sun-1045", teamId: i % 2 ? "greeters" : "parking", positionId: i % 2 ? "welcome-table" : "parking-lot", volunteerId: v.id }).catch(() => undefined);
    }
    const entry = (await radarNow(today(), "demo")).radar.find((r) => r.name === "Pat Volunteer")!;
    expect(entry.band).not.toBe("ok");
    expect(entry.drivers.join(" ")).toMatch(/Sundays in a row/);
    expect(entry.suggestion).toMatch(/Pat/);
  });
});

describe("sermon and service planning", () => {
  beforeEach(setupTeam);

  it("parses scripture references and links them into The Word", () => {
    expect(parseRef("Philippians 2:1-11")?.label).toBe("Philippians 2:1–11");
    expect(wordHref("Philippians 2:1-11")).toBe("/word?b=50&c=2&v=1");
    expect(wordHref("Psalm 23")).toBe("/word?b=19&c=23");
    expect(wordHref("1 Cor 13")).toBe("/word?b=46&c=13");
    expect(wordHref("Romans 8:28-9:5")).toBe("/word?b=45&c=8&v=28");
    expect(wordHref("John 99")).toBeNull();
    expect(wordHref("Hezekiah 1")).toBeNull();
  });

  it("outlines a service from the usual order, with the preacher and who leads worship, and needs services.plan", async () => {
    const p = await servicesActor(pastor);
    const sun = upcomingSunday(1);
    await setPreacher(p, { date: sun, preacher: "Ethan Malachuk", passage: "Philippians 2:1-11", title: "The mind of Christ" });
    const plan = await startPlan(p, sun, "sun-0830");
    const sermon = plan.items.find((i) => i.kind === "sermon")!;
    expect(sermon).toMatchObject({ person: "Ethan Malachuk", passage: "Philippians 2:1-11", title: "The mind of Christ" });
    expect(plan.items.filter((i) => i.kind === "song").every((i) => i.person === "Aaron Malachuk")).toBe(true);
    expect(plan.items[plan.items.length - 1].kind).toBe("benediction");
    await expect(startPlan(p, sun, "sun-0830")).rejects.toThrow("already has an order");
    // Reorder: move the sermon first and save.
    const reordered = [sermon, ...plan.items.filter((i) => i.id !== sermon.id)];
    const saved = await savePlan(p, { date: sun, gathering: "sun-0830", items: reordered });
    expect(saved.items[0].kind).toBe("sermon");
    await expect(savePlan(p, { date: sun, gathering: "sun-0830", items: [{ kind: "scripture", title: "Reading", minutes: 3, passage: "Hezekiah 4" }] })).rejects.toThrow("reference like");
    await expect(setPreacher(p, { date: addDays(sun, 1), preacher: "Eric Malachuk" })).rejects.toThrow("isn't a Sunday");
    await expect(startPlan(await servicesActor(member), upcomingSunday(2), "sun-1045")).rejects.toThrow("Pastors and staff");
    expect((await listAudit(pastor)).map((a) => a.action)).toEqual(expect.arrayContaining(["services.rotation.set", "services.plan.save"]));
  });
});

describe("events and registrations", () => {
  beforeEach(setupTeam);

  async function smallEvent(capacity = 3, waitlist = true) {
    return createEvent(await eventsActor(pastor), {
      title: "Test picnic",
      date: addDays(today(), 10),
      time: "5:00 PM",
      location: "Church lawn",
      capacity,
      waitlist,
      maxParty: 4,
      fields: [
        { label: "T-shirt size", kind: "choice", required: true, options: ["S", "M", "L"] },
        { label: "Bringing a dish?", kind: "yesno", required: false },
        { label: "Age", kind: "number", required: false, min: 0, max: 120 },
      ],
    });
  }

  it("fills to capacity, then waitlists, and moves the waitlist up when someone cancels", async () => {
    const ev = await smallEvent(3);
    const a = await register("demo", ev.id, { name: "Avery Test", email: "a@example.org", partySize: 2, answers: { t_shirt_size: "M" } }, null);
    expect(a.status).toBe("registered");
    const b = await register("demo", ev.id, { name: "Blake Test", email: "b@example.org", partySize: 2, answers: { t_shirt_size: "S" } }, null);
    expect(b.status).toBe("waitlisted");
    const c = await register("demo", ev.id, { name: "Cam Test", email: "c@example.org", partySize: 1, answers: { t_shirt_size: "L" } }, null);
    // Someone smaller can't jump the waitlist.
    expect(c.status).toBe("waitlisted");
    let book = await loadEvents("demo");
    expect(counts(book, ev.id)).toMatchObject({ registered: 2, waitlisted: 3, spotsLeft: 1 });
    const { promoted } = await cancelRegistration(await eventsActor(pastor), a.id);
    expect(promoted.map((r) => r.name)).toEqual(["Blake Test", "Cam Test"]);
    book = await loadEvents("demo");
    expect(counts(book, ev.id)).toMatchObject({ registered: 3, waitlisted: 0, spotsLeft: 0 });
    // Check in; a waitlisted or cancelled registration can't be.
    await checkIn(await eventsActor(pastor), b.id, true);
    expect(counts(await loadEvents("demo"), ev.id).checkedIn).toBe(2);
    await expect(checkIn(await eventsActor(pastor), a.id, true)).rejects.toThrow("cancelled");

    const full = await smallEvent(1, false);
    await register("demo", full.id, { name: "Dee Test", phone: "555-0100", answers: { t_shirt_size: "S" } }, null);
    await expect(register("demo", full.id, { name: "Eli Test", phone: "555-0101", answers: { t_shirt_size: "S" } }, null)).rejects.toThrow("full");
  });

  it("exports a CSV that a spreadsheet can't run as formulas", async () => {
    const ev = await smallEvent(10);
    await register("demo", ev.id, { name: "=HYPERLINK(\"x\")", email: "f@example.org", answers: { t_shirt_size: "M", bringing_a_dish: true } }, null);
    const book = await loadEvents("demo");
    const csv = registrationsCsv(book.events.find((e) => e.id === ev.id)!, book.registrations);
    expect(csv.split("\r\n")[0]).toBe("Name,Email,Phone,Party size,Status,Checked in,Payment,Registered,T-shirt size,Bringing a dish?,Age");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",Yes,");
    expect(csvCell("a,b")).toBe('"a,b"');
    session.current = member;
    const route = await import("@/app/api/events/[id]/route");
    expect((await route.GET(new Request(`http://test/api/events/${ev.id}?format=csv`), { params: Promise.resolve({ id: ev.id }) })).status).toBe(403);
    session.current = pastor;
    const res = await route.GET(new Request(`http://test/api/events/${ev.id}?format=csv`), { params: Promise.resolve({ id: ev.id }) });
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect((await listAudit(pastor)).some((a) => a.action === "events.export")).toBe(true);
    session.current = null;
  });

  it("marks paid events due (the Stripe seam) and shows on the calendar with its status", async () => {
    const book = await loadEvents("demo");
    const reverb = book.events.find((e) => e.churchEventId === "mgbc-reverb")!;
    const r = await register("demo", reverb.id, { name: "Teen Test", email: "t@example.org", answers: { grade: "9th", guardian: "Parent Test", guardian_phone: "555-0102" } }, null);
    expect(r.payment).toEqual({ status: "due", amountCents: 6700 });
    const { events } = await outsideEvents(pastor, "2026-11-01", "2026-12-31");
    const cal = events.find((e) => e.id === "church:mgbc-reverb")!;
    expect(cal.registration?.status).toContain("Registration open");
    expect(cal.registration?.status).toContain("1 of 40 registered");
    expect(cal.registration?.href).toBe(`/events/${reverb.id}`);
    expect(events.filter((e) => e.title === reverb.title)).toHaveLength(1);
  });
});

describe("public registration page", () => {
  beforeEach(setupTeam);
  afterEach(() => {
    session.current = null;
  });

  async function post(token: string, body: unknown, ip = "203.0.113.20") {
    const route = await import("@/app/api/register/[token]/route");
    return route.POST(new Request(`http://test/api/register/${token}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });
  }

  it("validates the form, rate-limits, keeps quiet about registrants, and is public in middleware", async () => {
    const book = await loadEvents("demo");
    const xmas = book.events.find((e) => e.churchEventId === "mgbc-teens-christmas")!;
    expect((await resolveEventToken(xmas.token))?.event.id).toBe(xmas.id);
    expect((await post("not-a-token", { name: "X" })).status).toBe(404);
    // Missing a required answer, a bad choice, and no way to reach them.
    const missing = await post(xmas.token, { name: "Jo Test", email: "jo@example.org", answers: {} });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toMatch(/Grade/);
    expect((await post(xmas.token, { name: "Jo Test", email: "jo@example.org", answers: { grade: "College" } })).status).toBe(400);
    expect((await post(xmas.token, { name: "Jo Test", answers: { grade: "8th" } })).status).toBe(400);
    expect((await post(xmas.token, { name: "Jo Test", email: "jo@example.org", partySize: 3, answers: { grade: "8th" } })).status).toBe(400);
    const okRes = await post(xmas.token, { name: "Jo Test", email: "jo@example.org", answers: { grade: "8th", gift: true } }, "198.51.100.30");
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ ok: true, status: "registered" });
    // Honeypot: accepted and dropped.
    expect((await post(xmas.token, { name: "Bot", email: "bot@example.org", website: "http://spam", answers: { grade: "8th" } }, "198.51.100.31")).status).toBe(200);
    expect((await loadEvents("demo")).registrations.some((r) => r.name === "Bot")).toBe(false);
    // Rate limit per address.
    for (let i = 0; i < 6; i++) await post(xmas.token, { name: `Rate ${i}`, email: `r${i}@example.org`, answers: { grade: "8th" } }, "198.51.100.40");
    expect((await post(xmas.token, { name: "Rate 9", email: "r9@example.org", answers: { grade: "8th" } }, "198.51.100.40")).status).toBe(429);

    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");
    const status = async (path: string) => (await middleware(new NextRequest(`http://test${path}`))).status;
    expect(await status("/register/abc")).toBe(200);
    expect(await status("/api/register/abc")).toBe(200);
    for (const path of ["/serve", "/services", "/events", "/kids"]) expect(await status(path), path).toBe(307);
    for (const path of ["/api/serve", "/api/services", "/api/events", "/api/kids"]) expect(await status(path), path).toBe(401);
  });
});

describe("kids check-in", () => {
  beforeEach(setupTeam);
  afterEach(() => {
    session.current = null;
  });

  async function family() {
    return saveHousehold(await kidsActor(staff), {
      name: "Testerson",
      guardians: [{ name: "Robin Testerson", phone: "(555) 010-4321", relationship: "Parent" }],
      children: [
        { firstName: "Milo", lastName: "Testerson", grade: "2nd", allergies: "Peanuts", medical: "Inhaler in the bag", roomId: "elementary" },
        { firstName: "Ivy", lastName: "Testerson", roomId: "preschool" },
      ],
      pickups: [{ name: "Grandpa Testerson", relationship: "Grandparent" }],
    });
  }

  it("finds families by last name or phone last four", async () => {
    await family();
    const book = await loadKids("demo");
    expect(searchFamilies(book, "test").map((h) => h.name)).toEqual(["Testerson"]);
    expect(searchFamilies(book, "4321").map((h) => h.name)).toEqual(["Testerson"]);
    expect(searchFamilies(book, "9999")).toEqual([]);
    expect(searchFamilies(book, "t")).toEqual([]);
  });

  it("checks siblings in with one pickup code, prints matching labels, and checks out only with the right code", async () => {
    const h = await family();
    const k = await kidsActor(staff);
    const sun = upcomingSunday(1);
    const [milo, ivy] = h.children;
    const r = await checkInChildren(k, { date: sun, gathering: "sun-0945", householdId: h.id, children: [{ childId: milo.id, roomId: "elementary" }, { childId: ivy.id, roomId: "preschool" }] });
    expect(r.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(new Set(r.checkins.map((c) => c.pickupCode))).toEqual(new Set([r.code]));
    await expect(checkInChildren(k, { date: sun, gathering: "sun-0945", householdId: h.id, children: [{ childId: milo.id, roomId: "elementary" }] })).rejects.toThrow("already checked in");
    await expect(checkInChildren(k, { date: sun, gathering: "sun-0945", householdId: h.id, children: [{ childId: ivy.id, roomId: "kids-club" }] })).rejects.toThrow();

    const labels = labelsFor(await loadKids("demo"), r.checkins.map((c) => c.id))!;
    expect(labels.code).toBe(r.code);
    expect(labels.children.map((c) => [c.firstName, c.code])).toEqual([["Milo", r.code], ["Ivy", r.code]]);
    expect(labels.children[0].allergies).toBe("Peanuts");
    expect(JSON.stringify(labels)).not.toContain("Inhaler");

    const ids = r.checkins.map((c) => c.id);
    const wrong = r.code === "AAAA" ? "CCCC" : "AAAA";
    await expect(checkOutChildren(k, { checkinIds: ids, code: wrong })).rejects.toThrow("doesn't match");
    await expect(checkOutChildren(k, { checkinIds: ids, code: r.code, pickedUpBy: "A Stranger" })).rejects.toThrow("pickup list");
    let book = await loadKids("demo");
    expect(book.checkins.filter((c) => ids.includes(c.id)).every((c) => !c.checkedOutAt)).toBe(true);
    expect(book.log.filter((l) => l.action === "checkout_refused")).toHaveLength(2);
    const out = await checkOutChildren(k, { checkinIds: ids, code: r.code.toLowerCase(), pickedUpBy: "Grandpa Testerson" });
    expect(out.every((c) => c.checkedOutAt && c.pickedUpBy === "Grandpa Testerson")).toBe(true);
    book = await loadKids("demo");
    expect(book.log.map((l) => l.action)).toEqual(expect.arrayContaining(["family", "checkin", "checkin", "checkout_refused", "checkout", "checkout"]));
    expect((await listAudit(staff)).map((a) => a.action)).toEqual(expect.arrayContaining(["kids.checkin", "kids.checkout.refused", "kids.checkout"]));
  });

  it("warns on ratios and keeps the station and family records behind their permissions", async () => {
    expect(ratioWarning(0, 0, 5)).toBeNull();
    expect(ratioWarning(3, 0, 5)).toMatch(/No adults/);
    expect(ratioWarning(3, 1, 5)).toMatch(/two are needed/);
    expect(ratioWarning(11, 2, 5)).toMatch(/Over ratio: 11 children for 2 adults/);
    expect(ratioWarning(8, 2, 5)).toBeNull();
    const h = await family();
    const k = await kidsActor(staff);
    const sun = upcomingSunday(1);
    await checkInChildren(k, { date: sun, gathering: "sun-1045", householdId: h.id, children: [{ childId: h.children[1].id, roomId: "preschool" }] });
    await setStaffing(k, { date: sun, gathering: "sun-1045", roomId: "preschool", adults: 1 });
    const counted = kidsCounts(await loadKids("demo"), sun, "sun-1045", true);
    const pre = counted[0].rooms.find((r) => r.room === "Preschool")!;
    expect(pre).toMatchObject({ children: 1, adults: 1, first_names: ["Ivy"] });
    expect(pre.warning).toMatch(/two are needed/);

    // A deacon or leader can't use the station or edit families.
    await expect(saveHousehold(await kidsActor(travis), { name: "X", guardians: [{ name: "Y" }] })).rejects.toThrow("Only kids ministry admins");
    await expect(checkInChildren(await kidsActor(member), { date: sun, gathering: "sun-1045", householdId: h.id, children: [{ childId: h.children[0].id, roomId: "kids-church" }] })).rejects.toThrow("limited to");
    for (const who of [travis, member]) {
      session.current = who;
      const route = await import("@/app/api/kids/route");
      expect((await route.GET(new Request("http://test/api/kids?q=test"))).status, who.name).toBe(403);
    }
    // The station search never returns medical notes, full phone numbers or pickup codes.
    session.current = staff;
    const route = await import("@/app/api/kids/route");
    const text = await (await route.GET(new Request(`http://test/api/kids?q=test&date=${sun}&gathering=sun-1045`))).text();
    expect(text).toContain("Testerson");
    expect(text).toContain("4321");
    expect(text).not.toContain("Inhaler");
    expect(text).not.toContain("010-4321");
    const book = await loadKids("demo");
    expect(text).not.toContain(book.checkins[0].pickupCode);
  });

  it("keeps child data out of memory and gives Barnabas only counts and first names", async () => {
    for (const note of [
      "Milo's pickup code is K7QA",
      "Her son has a peanut allergy and an EpiPen",
      "Remember the Testerson kids' grandfather isn't allowed to pick them up",
      "Ivy (age 4) was checked into the nursery room",
      "Daughter's custody arrangement means only mom picks her up",
    ]) {
      expect(checkMemoryText(note, { allowSensitive: false }), note).not.toBeNull();
      // Even a church that opts into sensitive memory never keeps children's check-in details.
      expect(checkMemoryText(note, { allowSensitive: true }), note).not.toBeNull();
    }
    expect(checkMemoryText("Kids Club had 40 children on Wednesday", { allowSensitive: false })).toBeNull();
    const c = await ctx(staff, "Remember Milo's allergy", 0);
    const saved = await executeTool("save_memory", { note: "Milo Testerson, my son's friend, has a peanut allergy" }, c);
    expect(saved.isError).toBe(true);

    const h = await family();
    const sun = today();
    const g = (await import("@/lib/ops/gatherings")).gatheringsOn(sun)[0]?.key;
    if (g) {
      const room = (await loadKids("demo")).rooms.find((r) => r.gatherings.includes(g))!;
      await checkInChildren(await kidsActor(staff), { date: sun, gathering: g, householdId: h.id, children: [{ childId: h.children[0].id, roomId: room.id }] });
    }
    const res = await executeTool("kids_checkin_counts", { first_names: true }, c);
    expect(res.isError).toBe(false);
    for (const secret of ["Testerson", "Peanut", "Inhaler", "Robin", "4321", "Grandpa"]) expect(res.content, secret).not.toContain(secret);
    const refused = await executeTool("kids_checkin_counts", {}, await ctx(member, "How many kids today?", 0));
    expect(refused.isError).toBe(true);
    expect(refused.content).toContain("limited to");
  });
});

describe("Barnabas operations tools", () => {
  beforeEach(setupTeam);

  it("says who's serving Sunday with open slots, and gates scheduling behind a later-turn yes", async () => {
    const c1 = await ctx(pastor, "Who's serving Sunday?", 0);
    const roster = JSON.parse((await executeTool("whos_serving", {}, c1)).content);
    const worship = roster.roster.find((g: { gathering_key: string }) => g.gathering_key === "sun-0830").teams.find((t: { team: string }) => t.team === "Worship team");
    expect(worship.positions[0]).toMatchObject({ position: "Worship leader", serving: ["Aaron Malachuk"] });
    expect(worship.open_slots).toBeGreaterThan(0);

    const p = await serveActor(pastor);
    const v = await addVolunteer(p, { name: "Hayden Test", teamIds: ["tech"] });
    const sun = upcomingSunday(2);
    const cover = JSON.parse((await executeTool("find_coverage", { date: sun, gathering: "sun-0830", team: "tech" }, c1)).content);
    expect(cover.by_gathering[0].could_cover.map((x: { name: string }) => x.name)).toEqual(["Hayden Test"]);
    const input = { date: sun, gathering: "sun-0830", team: "Tech", position: "Sound", volunteer: "Hayden Test" };
    const first = await executeTool("schedule_volunteer", input, c1);
    expect(first.isError).toBe(true);
    expect(first.content).toContain("Not confirmed yet");
    const same = await executeTool("schedule_volunteer", input, await ctx(pastor, "yes", 0, c1.meta));
    expect(same.isError).toBe(true);
    const done = await executeTool("schedule_volunteer", input, await ctx(pastor, "Yes, do it", 1, c1.meta));
    expect(done.isError).toBe(false);
    expect((await loadServe("demo")).assignments.some((a) => a.volunteerId === v.id && a.date === sun)).toBe(true);
    // Someone not on any team: no guessing.
    const ghost = await executeTool("schedule_volunteer", { ...input, volunteer: "Nobody Real" }, c1);
    expect(ghost.content).toContain("Don't guess");

    const reminders = JSON.parse((await executeTool("draft_serving_reminders", { date: sun, team: "tech" }, c1)).content);
    expect(reminders.recipients).toEqual(["Hayden Test"]);
    expect(reminders.status).toContain("Nothing was sent");
  });

  it("answers the preaching rotation, outlines a service, and gives registration counts without names", async () => {
    const c = await ctx(pastor, "Who's preaching?", 0);
    const rot = JSON.parse((await executeTool("preaching_rotation", {}, c)).content);
    expect(rot.rotation.length).toBeGreaterThan(3);
    expect(new Set(rot.rotation.map((r: { preacher: string }) => r.preacher))).toEqual(new Set(["Ethan Malachuk", "Eric Malachuk"]));
    const sun = upcomingSunday(1);
    const outlined = await executeTool("outline_service", { date: sun, gathering: "sun-1045" }, c);
    expect(outlined.isError).toBe(false);
    const plan = JSON.parse((await executeTool("plan_service", { date: sun, gathering: "sun-1045" }, c)).content);
    expect(plan.services[0].order.length).toBeGreaterThan(5);
    const denied = await executeTool("outline_service", { date: sun, gathering: "sun-0830" }, await ctx(member, "Outline it", 0));
    expect(denied.content).toContain("Only pastors and staff");

    const book = await loadEvents("demo");
    const thanksgiving = book.events.find((e) => e.churchEventId === "mgbc-thanksgiving")!;
    await register("demo", thanksgiving.id, { name: "Quiet Registrant", email: "q@example.org", partySize: 4 }, null);
    const regs = await executeTool("event_registrations", { event: "Thanksgiving" }, c);
    expect(JSON.parse(regs.content).events[0]).toMatchObject({ registered: 4, capacity: 150, spots_left: 146 });
    expect(regs.content).not.toContain("Quiet Registrant");
  });

  it("handles empty data without inventing people", async () => {
    const c = await ctx(pastor, "Who's serving Wednesday?", 0);
    const wed = nextMeeting(today(), [3]);
    const r = JSON.parse((await executeTool("whos_serving", { date: wed }, c)).content);
    expect(r.note).toContain("No one is scheduled yet");
    const cover = JSON.parse((await executeTool("find_coverage", { date: wed, team: "kids" }, c)).content);
    expect(cover.by_gathering[0].could_cover).toEqual([]);
    const people = new DemoChurch();
    expect((await people.listPeople()).every((p) => LEADERS.includes(p.name))).toBe(true);
  });
});
