import { beforeEach, describe, expect, it } from "vitest";
import type { Leader } from "@/lib/auth/session";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { addDays, today } from "@/lib/dates";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";
import { executeTool, TOOL_DEFS, toolNamesFor, type ToolContext } from "@/lib/engine/tools";
import { loadEvents } from "@/lib/events/store";
import { inboxActor, listThreads, startThread } from "@/lib/inbox/service";
import { getProfile } from "@/lib/profile";
import { accessFor, addPerson, recordSignIn } from "@/lib/team";
import { freshStore } from "./helpers";

const person = (leaderId: string, name: string, email: string): Leader => ({ churchId: "demo", leaderId, name, email, role: "" });
const pastor = person("at000001", "Pastor Dana", "dana@example.org");
const plain = person("at000002", "Lee Leader", "lee@example.org"); // signed in, role "leader": no events.manage
const kim = person("at000003", "Kim Kids", "kim@example.org");
const maria = person("at000004", "Maria Lopez", "maria@example.org");
const sam = person("at000005", "Sam Rivera", "sam@example.org");
const kimB = person("at000006", "Kim Baker", "kimb@example.org");

async function setup() {
  freshStore();
  await addPerson("demo", pastor.leaderId, { name: pastor.name, email: pastor.email, level: "leader" }, "test");
  await recordSignIn(plain);
  await addPerson("demo", kim.leaderId, { name: kim.name, email: kim.email, level: "team", teamRole: "kids" }, "test");
  await addPerson("demo", maria.leaderId, { name: maria.name, email: maria.email, level: "member" }, "test");
  await addPerson("demo", sam.leaderId, { name: sam.name, email: sam.email, level: "member" }, "test");
  await addPerson("demo", kimB.leaderId, { name: kimB.name, email: kimB.email, level: "leader" }, "test");
}

let n = 0;
async function ctxFor(leader: Leader) {
  const meta: ConversationMeta = { id: `conv_at_${n++}`, title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns: 1 };
  await createConversation(leader, meta);
  const toolNames = toolNamesFor(await accessFor(leader));
  return (text: string, turns: number): ToolContext => ({ leader, meta: Object.assign(meta, { turns }), turnStartedAt: Date.now(), lastUserText: text, toolNames });
}
const json = (r: { content: string }) => JSON.parse(r.content);

describe("app tools registration", () => {
  it("are defined, allowed to members only where meant, and in the prompt", () => {
    const names = TOOL_DEFS.map((d) => d.name);
    for (const t of ["list_events", "create_event", "update_event", "send_app_message", "list_app_messages", "read_app_message", "update_my_settings"]) expect(names).toContain(t);
    const member = toolNamesFor({ role: "leader", admin: false, level: "member" })!;
    const team = toolNamesFor({ role: "leader", admin: false, level: "team", teamRole: "serving" })!;
    for (const list of [member, team]) {
      expect(list).toEqual(expect.arrayContaining(["send_app_message", "list_app_messages", "read_app_message", "update_my_settings"]));
      expect(list).not.toContain("create_event");
      expect(list).not.toContain("list_events");
    }
    expect(BARNABAS_SYSTEM).toContain("Events, Messages and your settings");
  });
});

describe("events", () => {
  beforeEach(setup);
  const date = addDays(today(), 20);

  it("refuses leaders without events.manage, and Team/Member levels", async () => {
    const c = await ctxFor(plain);
    const r = await executeTool("create_event", { title: "Fall Picnic", date, location: "Fellowship Hall" }, c("Create a picnic", 1));
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/Pastors, deacons and staff/);
    const m = await ctxFor(maria);
    expect((await executeTool("list_events", {}, m("What events are coming?", 1))).content).toMatch(/isn't available/);
  });

  it("creates an event only after a yes, and links to it", async () => {
    const c = await ctxFor(pastor);
    const input = { title: "Fall Picnic", date, time: "5:00 PM", location: "Fellowship Hall", capacity: 80, price_dollars: 5 };
    const ask = await executeTool("create_event", input, c("Set up a fall picnic", 1));
    expect(ask.isError).toBe(true);
    expect(ask.content).toMatch(/Not confirmed yet.*Fall Picnic.*up to 80 people.*\$5 per person/);
    expect((await loadEvents("demo")).events.some((e) => e.title === "Fall Picnic")).toBe(false);
    // A yes with different details doesn't count.
    expect((await executeTool("create_event", { ...input, capacity: 90 }, c("Yes", 2))).isError).toBe(true);
    await executeTool("create_event", input, c("Set it up", 3));
    const done = await executeTool("create_event", input, c("Yes, go ahead", 4));
    expect(done.isError).toBe(false);
    const ev = (await loadEvents("demo")).events.find((e) => e.title === "Fall Picnic")!;
    expect(ev).toMatchObject({ time: "5:00 PM", capacity: 80, priceCents: 500, open: true });
    expect(done.links).toEqual([{ label: "Open Fall Picnic", href: `/events/${ev.id}` }]);

    const list = await executeTool("list_events", { search: "picnic" }, c("What events are coming up?", 5));
    expect(json(list).events[0]).toMatchObject({ event_id: ev.id, registration: "open", capacity: 80 });
    expect(list.links?.[0]?.href).toBe(`/events/${ev.id}`);
  });

  it("validates details before asking", async () => {
    const c = await ctxFor(pastor);
    const r = await executeTool("create_event", { title: "Picnic", date, time: "5pm", location: "Hall" }, c("Picnic at 5pm", 1));
    expect(r.content).toMatch(/Check the details.*6:00 PM/);
    expect((await executeTool("create_event", { title: "Picnic", date: addDays(today(), -3), location: "Hall" }, c("Picnic", 2))).content).toMatch(/already passed/);
  });

  it("updates only what changes, after a yes, keeping the registration questions", async () => {
    const c = await ctxFor(pastor);
    const input = { title: "Men's Breakfast", date, location: "Room 4" };
    await executeTool("create_event", input, c("Add a men's breakfast", 1));
    await executeTool("create_event", input, c("Yes", 2));
    const book = await loadEvents("demo");
    const ev = book.events.find((e) => e.title === "Men's Breakfast")!;
    const change = { event_id: ev.id, registration_open: false, location: "Fellowship Hall" };
    const ask = await executeTool("update_event", change, c("Close registration and move it to the hall", 3));
    expect(ask.content).toMatch(/Not confirmed yet.*location: Room 4 → Fellowship Hall; registration: open → closed/);
    expect((await loadEvents("demo")).events.find((e) => e.id === ev.id)!.open).toBe(true);
    const done = await executeTool("update_event", change, c("Yes", 4));
    expect(done.isError).toBe(false);
    expect(done.links?.[0]?.href).toBe(`/events/${ev.id}`);
    const after = (await loadEvents("demo")).events.find((e) => e.id === ev.id)!;
    expect(after).toMatchObject({ open: false, location: "Fellowship Hall", title: "Men's Breakfast", date });

    const p = await ctxFor(plain);
    expect((await executeTool("update_event", change, p("Close it", 1))).content).toMatch(/Pastors, deacons and staff/);
  });
});

describe("in-app messages", () => {
  beforeEach(setup);

  it("sends only after a yes, showing the exact words, and links to the thread", async () => {
    const c = await ctxFor(pastor);
    const input = { to: ["Maria Lopez"], text: "Emma did great in class today!", about: "Emma" };
    const ask = await executeTool("send_app_message", input, c("Tell Maria Emma did great", 1));
    expect(ask.isError).toBe(true);
    expect(ask.content).toContain('"Emma did great in class today!"');
    expect(ask.content).toContain("Maria Lopez");
    expect((await listThreads(await inboxActor(maria))).threads).toHaveLength(0);
    const done = await executeTool("send_app_message", input, c("Yes, send it", 2));
    expect(done.isError).toBe(false);
    const threads = (await listThreads(await inboxActor(maria))).threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ about: "Emma", unread: 1 });
    expect(done.links).toEqual([{ label: "Open the conversation", href: `/inbox?t=${threads[0]!.id}` }]);
  });

  it("asks which person when a name is ambiguous", async () => {
    const c = await ctxFor(pastor);
    const r = await executeTool("send_app_message", { to: ["Kim"], text: "Hi" }, c("Message Kim", 1));
    expect(r.content).toMatch(/could be Kim Baker .* or Kim Kids/);
    expect(r.content).toContain(kim.leaderId);
  });

  it("lets a member message staff and teams, not another member", async () => {
    const c = await ctxFor(maria);
    const refused = await executeTool("send_app_message", { to: ["Sam Rivera"], text: "Hi Sam" }, c("Message Sam", 1));
    expect(refused.isError).toBe(true);
    expect(refused.content).toMatch(/Members can message the church staff and teams/);
    const input = { to: ["Kim Kids"], text: "Is Emma OK?" };
    await executeTool("send_app_message", input, c("Ask Kim if Emma is OK", 2));
    expect((await executeTool("send_app_message", input, c("Yes", 3))).isError).toBe(false);
  });

  it("lists my threads with unread counts, and reading one marks it read", async () => {
    const { thread } = await startThread(await inboxActor(pastor), { to: [kim.leaderId], text: "Can you cover Sunday?" });
    const c = await ctxFor(kim);
    const list = json(await executeTool("list_app_messages", {}, c("Any messages?", 1)));
    expect(list.unread_total).toBe(1);
    expect(list.conversations[0]).toMatchObject({ thread_id: thread.id, with: "Pastor Dana", unread: 1 });
    // Listing doesn't mark read.
    expect((await listThreads(await inboxActor(kim))).unread).toBe(1);
    const read = await executeTool("read_app_message", { thread_id: thread.id }, c("Read it", 2));
    expect(json(read).messages[0]).toMatchObject({ from: "Pastor Dana", text: "Can you cover Sunday?" });
    expect(read.links?.[0]?.href).toBe(`/inbox?t=${thread.id}`);
    expect((await listThreads(await inboxActor(kim))).unread).toBe(0);

    // Someone not in the thread can't read it.
    const s = await ctxFor(sam);
    expect((await executeTool("read_app_message", { thread_id: thread.id }, s("Read it", 1))).content).toMatch(/isn't here/);

    // Replying is confirmed too.
    const reply = { thread_id: thread.id, text: "Yes, I can." };
    expect((await executeTool("send_app_message", reply, c("Tell her yes", 3))).content).toContain('"Yes, I can."');
    expect((await executeTool("send_app_message", reply, c("Yes", 4))).isError).toBe(false);
    expect((await listThreads(await inboxActor(pastor))).unread).toBe(1);
  });
});

describe("my settings", () => {
  beforeEach(setup);

  it("changes the leader's own settings without a gate, says what changed, and persists", async () => {
    const c = await ctxFor(pastor);
    const r = await executeTool("update_my_settings", { bible_translation: "esv", timezone: "America/Chicago", preferred_name: "Dana", hands_free: false, pause_ms: 900, notification_types: { briefing: false } }, c("Use the ESV and call me Dana", 1));
    expect(r.isError).toBe(false);
    const out = json(r);
    expect(out.changed).toEqual(expect.arrayContaining(["Bible translation: King James Version (KJV) → English Standard Version (ESV)", "Time zone: America/New_York → America/Chicago", "Hands-free: on → off", "Morning briefing notifications: on → off"]));
    expect(r.links).toEqual([{ label: "Open Settings", href: "/settings" }]);
    const p = await getProfile(pastor);
    expect(p).toMatchObject({ bibleTranslation: "esv", timezone: "America/Chicago", preferredName: "Dana" });
    expect(p.voice).toMatchObject({ handsFree: false, pauseMs: 900 });
    expect(p.notifications.types.briefing).toBe(false);
    expect(json(await executeTool("update_my_settings", { bible_translation: "esv" }, c("Use the ESV", 2))).unchanged).toBe(true);
  });

  it("validates like the profile API", async () => {
    const c = await ctxFor(pastor);
    expect((await executeTool("update_my_settings", { timezone: "Mars/Olympus" }, c("x", 1))).content).toMatch(/Unknown time zone/);
    expect((await executeTool("update_my_settings", { pause_ms: 5000 }, c("x", 2))).isError).toBe(true);
    expect((await executeTool("update_my_settings", { bible_translation: "msg" }, c("x", 3))).isError).toBe(true);
    expect((await executeTool("update_my_settings", { notification_types: { nope: true } }, c("x", 4))).isError).toBe(true);
    expect((await getProfile(pastor)).timezone).toBe("America/New_York");
  });

  it("keeps Team and Member typed-only and to the notifications they're offered", async () => {
    const m = await ctxFor(maria);
    expect((await executeTool("update_my_settings", { speak_replies: true }, m("Speak to me", 1))).content).toMatch(/typed-only/);
    expect((await executeTool("update_my_settings", { notification_types: { briefing: false } }, m("No briefing", 2))).content).toMatch(/don't get Morning briefing/);
    const ok = await executeTool("update_my_settings", { reply_language: "es", notification_types: { messages: false } }, m("Reply in Spanish", 3));
    expect(ok.isError).toBe(false);
    const p = await getProfile(maria);
    expect(p.replyLanguage).toBe("es");
    expect(p.notifications.types.messages).toBe(false);
    const t = await ctxFor(kim);
    expect((await executeTool("update_my_settings", { hands_free: true }, t("Hands-free on", 1))).content).toMatch(/typed-only/);
  });
});
