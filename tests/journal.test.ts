import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// API routes read the signed-in leader from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { checkinMayUse } from "@/lib/auth/roles";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { listAudit } from "@/lib/data/records";
import { addDays, lastSunday, today } from "@/lib/dates";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";
import { executeTool, TOOL_DEFS, type ToolContext } from "@/lib/engine/tools";
import { createEntry, getEntry, journalActor, listEntries, sendToService, updateEntry } from "@/lib/journal/service";
import { journalCount, readIndex } from "@/lib/journal/store";
import { DevotionalSchema, EntryPatchSchema, NewEntrySchema, SermonSchema, SetlistSchema, type JournalEntry } from "@/lib/journal/types";
import { kjvText } from "@/lib/journal/verses";
import { VERSES } from "@/lib/language";
import { loadServices } from "@/lib/services/store";
import { kv } from "@/lib/store";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { navItems } from "@/components/NavLinks";
import { linkRefs } from "@/components/journal/Rich";
import { GET as listRoute, POST as createRoute } from "@/app/api/journal/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute, POST as actionRoute } from "@/app/api/journal/[id]/route";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "jr000001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const member: Leader = { churchId: "demo", leaderId: "jr000002", name: "Lee Leader", email: "lee@example.org", role: "Small group leader" };
const aaron: Leader = { churchId: "demo", leaderId: "jr000003", name: "Aaron Malachuk", email: "aaron@example.org", role: "Worship" };
const kidsDesk: Leader = { churchId: "demo", leaderId: "jr000004", name: "Kit Desk", email: "kit@example.org", role: "Check-in" };

async function setup() {
  freshStore();
  for (const l of [pastor, member, aaron, kidsDesk]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", kidsDesk.leaderId, "checkin", "test");
  session.current = null;
}

const sunday = (weeks = 1) => addDays(lastSunday(today()), 7 * weeks);
const req = (method: string, body?: unknown, url = "http://x/api/journal") => new Request(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function as<T>(l: Leader, fn: () => Promise<Response>): Promise<{ status: number; json: T }> {
  session.current = l;
  const res = await fn();
  session.current = null;
  return { status: res.status, json: (await res.json()) as T };
}

let n = 0;
async function ctxFor(leader: Leader) {
  const meta: ConversationMeta = { id: `conv_jr_${n++}`, title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns: 1 };
  await createConversation(leader, meta);
  return (text: string, turns: number): ToolContext => ({ leader, meta: Object.assign(meta, { turns }), turnStartedAt: Date.now(), lastUserText: text });
}

describe("journal schemas", () => {
  it("fills a sermon's parts and checks its status", () => {
    const s = SermonSchema.parse({ passages: ["Philippians 2:1-11"], outline: [{ id: "pt_1", text: "Have this mind" }] });
    expect(s).toMatchObject({ status: "idea", bigIdea: "", application: "", outline: [{ id: "pt_1", text: "Have this mind", subpoints: [] }] });
    expect(SermonSchema.safeParse({ status: "finished" }).success).toBe(false);
    expect(SermonSchema.safeParse({ preachDate: "next week" }).success).toBe(false);
  });

  it("keeps devotional days with questions and a prayer", () => {
    const d = DevotionalSchema.parse({ days: [{ id: "day_1", title: "The Shepherd", passage: "Psalm 23", questions: ["Where do you need rest?"] }] });
    expect(d.days[0]).toMatchObject({ reflection: "", prayer: "", questions: ["Where do you need rest?"] });
    expect(DevotionalSchema.safeParse({ days: [{ title: "no id" }] }).success).toBe(false);
  });

  it("checks a setlist's songs, tempo and gathering", () => {
    const l = SetlistSchema.parse({ serviceDate: "2026-11-15", gathering: "sun-0830", songs: [{ id: "song_1", title: "Be Thou My Vision", key: "D", bpm: 72, timeSignature: "3/4", ccli: "30639" }] });
    expect(l.songs[0]).toMatchObject({ artist: "", leader: "", transition: "" });
    expect(SetlistSchema.safeParse({ songs: [{ id: "s", bpm: 900 }] }).success).toBe(false);
    expect(SetlistSchema.safeParse({ gathering: "sun-0945x" }).success).toBe(false);
  });

  it("validates new entries and patches", () => {
    expect(NewEntrySchema.safeParse({ kind: "journal" }).success).toBe(false);
    expect(NewEntrySchema.parse({ kind: "note", tags: ["#Prayer", "advent"] }).tags).toEqual(["prayer", "advent"]);
    expect(EntryPatchSchema.safeParse({ title: "x".repeat(121) }).success).toBe(false);
    expect(EntryPatchSchema.safeParse({ body: "x".repeat(20001) }).success).toBe(false);
  });
});

describe("journal privacy and CRUD", () => {
  beforeEach(setup);

  it("creates, autosaves, searches and lists only the leader's own entries", async () => {
    const created = await as<JournalEntry>(pastor, () => createRoute(req("POST", { action: "create", entry: { kind: "note", title: "Advent ideas" } })));
    expect(created.status).toBe(200);
    const id = created.json.id;
    expect((await as(pastor, () => patchRoute(req("PATCH", { body: "Hope from **Isaiah 9:6**", tags: ["advent"] }), params(id)))).status).toBe(200);
    const found = await as<{ entries: { id: string; haystack?: string }[] }>(pastor, () => listRoute(req("GET", undefined, "http://x/api/journal?q=isaiah")));
    expect(found.json.entries.map((e) => e.id)).toEqual([id]);
    expect(found.json.entries[0].haystack).toBeUndefined();
    const byTag = await as<{ entries: unknown[] }>(pastor, () => listRoute(req("GET", undefined, "http://x/api/journal?tag=advent")));
    expect(byTag.json.entries).toHaveLength(1);
    const others = await as<{ entries: unknown[] }>(member, () => listRoute(req("GET", undefined, "http://x/api/journal")));
    expect(others.json.entries).toEqual([]);
  });

  it("hides unshared entries from other leaders, shows shared ones read-only, and audits sharing", async () => {
    const e = await createEntry(await journalActor(pastor), { kind: "sermon", title: "The mind of Christ", body: "draft" });
    expect((await as(member, () => getRoute(req("GET"), params(e.id)))).status).toBe(404);
    expect((await as(member, () => patchRoute(req("PATCH", { title: "mine now" }), params(e.id)))).status).toBe(404);

    expect((await as(pastor, () => actionRoute(req("POST", { action: "share", shared: true }), params(e.id)))).status).toBe(200);
    const read = await as<{ entry: JournalEntry; mine: boolean }>(member, () => getRoute(req("GET"), params(e.id)));
    expect(read.status).toBe(200);
    expect(read.json.mine).toBe(false);
    expect(read.json.entry.title).toBe("The mind of Christ");
    expect((await as(member, () => patchRoute(req("PATCH", { title: "mine now" }), params(e.id)))).status).toBe(403);
    expect((await as(member, () => actionRoute(req("POST", { action: "share", shared: false }), params(e.id)))).status).toBe(403);
    expect((await as(member, () => deleteRoute(req("DELETE", { confirm: "DELETE" }), params(e.id)))).status).toBe(403);
    const shared = await as<{ entries: { id: string; ownerName: string }[] }>(member, () => listRoute(req("GET", undefined, "http://x/api/journal?filter=shared")));
    expect(shared.json.entries.map((x) => x.id)).toEqual([e.id]);
    expect((await getEntry(await journalActor(pastor), e.id)).entry.title).toBe("The mind of Christ");
    expect((await listAudit(pastor)).map((a) => a.action)).toContain("journal.share");

    await as(pastor, () => actionRoute(req("POST", { action: "share", shared: false }), params(e.id)));
    expect((await as(member, () => getRoute(req("GET"), params(e.id)))).status).toBe(404);
  });

  it("keeps the kids check-in role out of the journal entirely", async () => {
    const e = await createEntry(await journalActor(pastor), { kind: "note", title: "Shared note" });
    await as(pastor, () => actionRoute(req("POST", { action: "share", shared: true }), params(e.id)));
    expect((await as(kidsDesk, () => listRoute(req("GET")))).status).toBe(403);
    expect((await as(kidsDesk, () => getRoute(req("GET"), params(e.id)))).status).toBe(403);
    expect((await as(kidsDesk, () => createRoute(req("POST", { action: "create", entry: { kind: "note" } })))).status).toBe(403);
    await expect(journalActor(kidsDesk)).rejects.toThrow(/check-in/);
    for (const p of ["/journal", "/journal/jr_1", "/api/journal", "/api/journal/jr_1"]) expect(checkinMayUse(p), p).toBe(false);
    expect(checkinMayUse("/api/push")).toBe(true);
    expect(navItems({}).map((x) => x.href)).toContain("/journal");
    expect(navItems({ checkinOnly: true }).map((x) => x.href)).toEqual(["/kids", "/settings"]);
  });

  it("duplicates, pins, archives, and deletes only with a confirm (audited)", async () => {
    const e = await createEntry(await journalActor(pastor), { kind: "setlist", title: "Nov 15", setlist: { songs: [{ title: "How Firm a Foundation" }] as never } });
    expect(e.setlist!.songs[0].id).toMatch(/^song_/);
    const dup = await as<JournalEntry>(pastor, () => actionRoute(req("POST", { action: "duplicate" }), params(e.id)));
    expect(dup.json.title).toBe("Nov 15 (copy)");
    expect(dup.json.setlist!.songs[0].id).not.toBe(e.setlist!.songs[0].id);
    await as(pastor, () => actionRoute(req("POST", { action: "pin", pinned: true }), params(dup.json.id)));
    const actor = await journalActor(pastor);
    expect((await listEntries(actor))[0].id).toBe(dup.json.id);
    expect((await listEntries(actor, { filter: "pinned" })).map((x) => x.id)).toEqual([dup.json.id]);
    await as(pastor, () => actionRoute(req("POST", { action: "archive", archived: true }), params(e.id)));
    expect((await listEntries(actor)).map((x) => x.id)).toEqual([dup.json.id]);
    expect((await listEntries(actor, { filter: "archived" })).map((x) => x.id)).toEqual([e.id]);
    expect((await as(pastor, () => deleteRoute(req("DELETE", {}), params(e.id)))).status).toBe(400);
    expect((await as(pastor, () => deleteRoute(req("DELETE", { confirm: "DELETE" }), params(e.id)))).status).toBe(200);
    expect((await as(pastor, () => getRoute(req("GET"), params(e.id)))).status).toBe(404);
    expect((await listAudit(pastor)).map((a) => a.action)).toContain("journal.delete");
  });

  it("links a sermon to a preaching date and picks up the series", async () => {
    const e = await createEntry(await journalActor(pastor), { kind: "sermon", title: "Sermon" });
    const r = await as<JournalEntry>(pastor, () => actionRoute(req("POST", { action: "link-preaching", link: { date: sunday(2) } }), params(e.id)));
    expect(r.json.sermon!.preachDate).toBe(sunday(2));
    expect((await as(pastor, () => actionRoute(req("POST", { action: "link-preaching", link: { date: addDays(sunday(2), 1) } }), params(e.id)))).status).toBe(400);
  });
});

describe("send a setlist to the order of service", () => {
  beforeEach(setup);

  async function setlist(l: Leader) {
    return createEntry(await journalActor(l), {
      kind: "setlist",
      title: "Good Shepherd set",
      setlist: { songs: [{ title: "The King of Love My Shepherd Is", key: "E", bpm: 76, timeSignature: "3/4", ccli: "1234", leader: "Aaron Malachuk", scripture: "Psalm 23" }, { title: "Be Thou My Vision", key: "D" }] as never },
    });
  }

  it("needs a confirm and permission, starts from the usual order, and re-sending updates in place", async () => {
    const date = sunday(3);
    const e = await setlist(pastor);
    const target = { date, gathering: "sun-1045" };
    expect((await as(pastor, () => actionRoute(req("POST", { action: "send-to-service", target }), params(e.id)))).status).toBe(400);
    expect((await loadServices("demo")).plans).toEqual([]);

    const first = await as<{ songs: number; started: boolean }>(pastor, () => actionRoute(req("POST", { action: "send-to-service", target, confirm: true }), params(e.id)));
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ songs: 2, started: true });
    let plan = (await loadServices("demo")).plans.find((p) => p.date === date && p.gathering === "sun-1045")!;
    const songs = plan.items.filter((i) => i.kind === "song");
    expect(songs.map((s) => s.title)).toEqual(["The King of Love My Shepherd Is", "Be Thou My Vision"]);
    expect(plan.items[0].kind).toBe("welcome");
    expect(plan.items.some((i) => i.kind === "sermon")).toBe(true);
    expect(songs[0]).toMatchObject({ person: "Aaron Malachuk", passage: "Psalm 23" });
    expect(songs[0].notes).toContain("CCLI 1234");
    const total = plan.items.length;

    await updateEntry(await journalActor(pastor), e.id, { setlist: { songs: [{ ...e.setlist!.songs[0], title: "The King of Love" }, e.setlist!.songs[1]] } });
    await as(pastor, () => actionRoute(req("POST", { action: "send-to-service", target, confirm: true }), params(e.id)));
    plan = (await loadServices("demo")).plans.find((p) => p.date === date && p.gathering === "sun-1045")!;
    expect(plan.items).toHaveLength(total);
    expect(plan.items.filter((i) => i.kind === "song").map((s) => s.title)).toEqual(["The King of Love", "Be Thou My Vision"]);
    expect((await loadServices("demo")).plans).toHaveLength(1);
    expect((await listAudit(pastor)).filter((a) => a.action === "journal.setlist.send")).toHaveLength(2);

    // Sent to the other service: the songs move rather than staying in both.
    await sendToService(await journalActor(pastor), e.id, { date, gathering: "sun-0830" });
    const book = await loadServices("demo");
    expect(book.plans.find((p) => p.gathering === "sun-1045")!.items.some((i) => i.id.startsWith("jsong_"))).toBe(false);
    expect(book.plans.find((p) => p.gathering === "sun-0830")!.items.filter((i) => i.id.startsWith("jsong_"))).toHaveLength(2);
  });

  it("refuses a leader who doesn't plan services or lead worship, and allows the worship team's lead", async () => {
    const target = { date: sunday(1), gathering: "sun-0830", };
    const mine = await setlist(member);
    expect((await as(member, () => actionRoute(req("POST", { action: "send-to-service", target, confirm: true }), params(mine.id)))).status).toBe(403);
    const lead = await setlist(aaron);
    expect((await as(aaron, () => actionRoute(req("POST", { action: "send-to-service", target, confirm: true }), params(lead.id)))).status).toBe(200);
    // Not on a worship service, or not a Sunday.
    expect((await as(aaron, () => actionRoute(req("POST", { action: "send-to-service", target: { date: sunday(1), gathering: "sun-0945" }, confirm: true }), params(lead.id)))).status).toBe(400);
    expect((await as(aaron, () => actionRoute(req("POST", { action: "send-to-service", target: { date: addDays(sunday(1), 2), gathering: "sun-0830" }, confirm: true }), params(lead.id)))).status).toBe(400);
  });
});

describe("Barnabas's journal tools", () => {
  beforeEach(setup);

  it("has no tool that deletes a journal entry", () => {
    const names = TOOL_DEFS.map((t) => t.name);
    for (const t of ["journal_note", "start_journal_entry", "list_journal", "read_journal_entry", "update_journal_entry", "share_journal_entry", "send_setlist_to_service"]) expect(names).toContain(t);
    expect(names.filter((x) => /journal|setlist/.test(x) && /delete|remove|archive/.test(x))).toEqual([]);
    expect(names.slice(-7)).toContain("journal_note");
    expect(BARNABAS_SYSTEM).toMatch(/You never delete a journal entry/);
  });

  it("journals a note with no confirmation, and appends to it by title", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool("journal_note", { text: "Pray for the youth retreat", title: "Prayer list", tags: ["prayer"] }, ctx("Journal this: pray for the youth retreat", 1));
    expect(r.isError).toBe(false);
    await executeTool("journal_note", { text: "Thank God for the new deacons", title: "prayer list" }, ctx("Add to my prayer list", 2));
    const rows = await readIndex(pastor);
    expect(rows).toHaveLength(1);
    const e = (await getEntry(await journalActor(pastor), rows[0].id)).entry;
    expect(e.body).toContain("youth retreat");
    expect(e.body).toContain("new deacons");
    expect(await journalCount(pastor)).toBe(1);
  });

  it("quotes scripture word for word from the KJV, with its reference", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool(
      "start_journal_entry",
      { kind: "sermon", title: "Write the vision", sermon: { passages: ["Habakkuk 2:1-4"], outline: [{ text: "Write it plainly", scripture: "Habakkuk 2:2", quote: "Write down the revelation and make it plain" }] }, verses: [{ reference: "Psalm 45:1" }] },
      ctx("Help me outline a sermon on Habakkuk 2", 1),
    );
    expect(r.isError).toBe(false);
    const id = JSON.parse(r.content).id;
    const e = (await getEntry(await journalActor(pastor), id)).entry;
    expect(e.sermon!.outline[0].quote).toBe(`“${await kjvText("Habakkuk 2:2")}” (Habakkuk 2:2, KJV)`);
    expect(e.sermon!.outline[0].quote).toContain("Write the vision, and make it plain upon tables, that he may run that readeth it.");
    expect(e.body).toContain("My heart is inditing a good matter");
    expect(e.body).toContain("(Psalm 45:1, KJV)");
    expect(e.sermon!.status).toBe("drafting");
  });

  it("adds a song and a devotional day with update_journal_entry, and can't edit someone else's shared entry", async () => {
    const ctx = await ctxFor(pastor);
    const s = JSON.parse((await executeTool("start_journal_entry", { kind: "setlist", title: "Advent set", setlist: { songs: [{ title: "O Come, O Come Emmanuel", key: "Em" }] } }, ctx("Start a setlist", 1))).content);
    const add = await executeTool("update_journal_entry", { id: s.id, song: { title: "Come, Thou Long Expected Jesus", key: "F", bpm: 84 } }, ctx("Add Come Thou Long Expected Jesus", 2));
    expect(add.isError).toBe(false);
    const edit = await executeTool("update_journal_entry", { id: s.id, song: { at: 1, key: "Dm" } }, ctx("Make the first one D minor", 3));
    expect(edit.isError).toBe(false);
    const e = (await getEntry(await journalActor(pastor), s.id)).entry;
    expect(e.setlist!.songs.map((x) => [x.title, x.key])).toEqual([["O Come, O Come Emmanuel", "Dm"], ["Come, Thou Long Expected Jesus", "F"]]);

    const d = JSON.parse((await executeTool("start_journal_entry", { kind: "devotional", title: "Psalm 23 week", devotional: { passages: ["Psalm 23"] } }, ctx("Build a devotional", 4))).content);
    await executeTool("update_journal_entry", { id: d.id, devotional_day: { title: "My shepherd", passage: "Psalm 23:1", reflection: "He knows his sheep." } }, ctx("Add day one", 5));
    const dev = (await getEntry(await journalActor(pastor), d.id)).entry.devotional!;
    expect(dev.days[0]).toMatchObject({ title: "My shepherd", passageText: "“The Lord is my shepherd; I shall not want.” (Psalm 23:1, KJV)" });

    // Shared by the pastor: the member can read it but Barnabas can't change it for them.
    await executeTool("share_journal_entry", { id: s.id, shared: true }, ctx("Share the advent set with the team", 6));
    await executeTool("share_journal_entry", { id: s.id, shared: true }, ctx("Yes", 7));
    const mctx = await ctxFor(member);
    expect((await executeTool("read_journal_entry", { id: s.id }, mctx("Show me the advent set", 1))).isError).toBe(false);
    const refused = await executeTool("update_journal_entry", { id: s.id, title: "Mine" }, mctx("Rename it", 2));
    expect(refused.isError).toBe(true);
    expect(refused.content).toMatch(/shared this entry to read/);
  });

  it("shares and sends to the order of service only after a yes", async () => {
    const ctx = await ctxFor(pastor);
    const e = await createEntry(await journalActor(pastor), { kind: "setlist", title: "Set", setlist: { serviceDate: sunday(2), gathering: "sun-0830", songs: [{ title: "Holy, Holy, Holy" }] as never } });
    const ask = await executeTool("share_journal_entry", { id: e.id, shared: true }, ctx("Share my setlist with the team", 1));
    expect(ask.isError).toBe(true);
    expect(ask.content).toMatch(/Not confirmed/);
    expect((await getEntry(await journalActor(pastor), e.id)).entry.shared).toBe(false);
    const no = await executeTool("share_journal_entry", { id: e.id, shared: true }, ctx("No, wait", 2));
    expect(no.isError).toBe(true);
    expect((await getEntry(await journalActor(pastor), e.id)).entry.shared).toBe(false);
    await executeTool("share_journal_entry", { id: e.id, shared: true }, ctx("Share it", 3));
    expect((await executeTool("share_journal_entry", { id: e.id, shared: true }, ctx("Yes, go ahead", 4))).isError).toBe(false);
    expect((await getEntry(await journalActor(pastor), e.id)).entry.shared).toBe(true);

    const send = await executeTool("send_setlist_to_service", { id: e.id }, ctx("Put it in the order of service", 5));
    expect(send.content).toMatch(/Not confirmed/);
    expect((await loadServices("demo")).plans).toEqual([]);
    expect((await executeTool("send_setlist_to_service", { id: e.id }, ctx("Yes", 6))).isError).toBe(false);
    expect((await loadServices("demo")).plans[0].items.filter((i) => i.title === "Holy, Holy, Holy")).toHaveLength(1);
  });

  it("saves nothing off the record", async () => {
    const meta: ConversationMeta = { id: `conv_jr_off`, title: "t", mode: "voice", offRecord: true, createdAt: 1, updatedAt: 1, context: "", turns: 1 };
    const r = await executeTool("journal_note", { text: "x" }, { leader: pastor, meta, turnStartedAt: Date.now(), lastUserText: "journal this" });
    expect(r.isError).toBe(true);
    expect(await readIndex(pastor)).toEqual([]);
  });
});

describe("deleting the leader's data", () => {
  beforeEach(setup);

  it("removes their journal, including what they shared", async () => {
    const actor = await journalActor(member);
    const a = await createEntry(actor, { kind: "note", title: "One", body: "private" });
    await createEntry(actor, { kind: "sermon", title: "Two" });
    await as(member, () => actionRoute(req("POST", { action: "share", shared: true }), params(a.id)));
    const keep = await createEntry(await journalActor(pastor), { kind: "note", title: "Pastor's" });
    const res = await as<{ ok: boolean }>(member, () => deleteAccount(req("DELETE", { confirm: "DELETE" })));
    expect(res.status).toBe(200);
    expect(await kv().get(`jrnl:demo:${member.leaderId}`)).toBeNull();
    expect(await kv().get(`jrnl:demo:${member.leaderId}:e:${a.id}`)).toBeNull();
    expect(await kv().smembers("jrnl:demo:shared")).toEqual([]);
    expect((await readIndex(pastor)).map((x) => x.id)).toEqual([keep.id]);
  });
});

describe("journal words and links", () => {
  it("quotes Habakkuk 2:2 exactly for the empty state", () => {
    expect(VERSES.journal).toMatchObject({ reference: "Habakkuk 2:2", text: "And the LORD answered me, and said, Write the vision, and make it plain upon tables, that he may run that readeth it." });
  });

  it("links references in text to The Word", () => {
    const parts = linkRefs("Read 1 John 4:7-8 and Psalm 23, then Song of Solomon 2:4. Not Chapter 3.");
    const links = parts.filter((p) => typeof p !== "string") as { props: { href: string; children: string } }[];
    expect(links.map((l) => [l.props.children, l.props.href])).toEqual([
      ["1 John 4:7-8", "/word?b=62&c=4&v=7"],
      ["Psalm 23", "/word?b=19&c=23"],
      ["Song of Solomon 2:4", "/word?b=22&c=2&v=4"],
    ]);
  });
});

describe("list previews", () => {
  it("a setlist's card shows its song titles, not every field run together", async () => {
    const { summarize } = await import("@/lib/journal/store");
    const { SetlistSchema } = await import("@/lib/journal/types");
    const setlist = SetlistSchema.parse({
      serviceDate: "2026-11-22",
      theme: "The Good Shepherd",
      songs: [
        { id: "s1", title: "The King of Love My Shepherd Is", artist: "Henry W. Baker", scripture: "Psalm 23", transition: "Keys hold the last chord" },
        { id: "s2", title: "Be Thou My Vision", artist: "Irish hymn" },
        { id: "s3", title: "Great Is Thy Faithfulness", artist: "Thomas Chisholm" },
      ],
    });
    const now = Date.now();
    const s = summarize({ id: "e1", ownerId: "l1", ownerName: "Aaron", kind: "setlist", title: "The Good Shepherd set", tags: [], pinned: false, body: "", createdAt: now, updatedAt: now, shared: false, setlist } as never);
    expect(s.snippet).toBe("The King of Love My Shepherd Is · Be Thou My Vision · Great Is Thy Faithfulness");
  });
});
