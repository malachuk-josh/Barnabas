import { beforeEach, describe, expect, it } from "vitest";
import type { Leader } from "@/lib/auth/session";
import type { Access } from "@/lib/auth/roles";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";
import { executeTool, TOOL_DEFS, toolNamesFor, type ToolContext } from "@/lib/engine/tools";
import { findBook, parsePassage, passageLabel, RefError } from "@/lib/engine/word-tools";
import { createEntry, journalActor, setShared } from "@/lib/journal/service";
import { readEntry } from "@/lib/journal/store";
import { getProfile, saveProfile } from "@/lib/profile";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { wordUserId } from "@/lib/wordAuth";
import { db, keys } from "@/lib/wordDb";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "wt000001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const aaron: Leader = { churchId: "demo", leaderId: "wt000002", name: "Aaron Malachuk", email: "aaron@example.org", role: "Worship" };

let n = 0;
async function ctxFor(leader: Leader, offRecord = false) {
  const meta: ConversationMeta = { id: `conv_wt_${n++}`, title: "t", mode: "voice", offRecord, createdAt: 1, updatedAt: 1, context: "", turns: 1 };
  await createConversation(leader, meta);
  return (text: string, turns: number): ToolContext => ({ leader, meta: Object.assign(meta, { turns }), turnStartedAt: Date.now(), lastUserText: text });
}
const json = (r: { content: string }) => JSON.parse(r.content);

beforeEach(async () => {
  freshStore();
  for (const l of [pastor, aaron]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
});

describe("reference parsing", () => {
  const label = (s: string) => passageLabel(parsePassage(s));

  it("reads full names, abbreviations, ranges and whole chapters", () => {
    expect(label("John 3:16")).toBe("John 3:16");
    expect(label("John 3:16-18")).toBe("John 3:16–18");
    expect(label("Jn 3.16")).toBe("John 3:16");
    expect(label("Psalm 23")).toBe("Psalm 23");
    expect(label("Ps 23:1-3")).toBe("Psalm 23:1–3");
    expect(label("Romans 8")).toBe("Romans 8");
    expect(label("Rom 8-9")).toBe("Romans 8–9");
    expect(label("Romans 8:28–9:5")).toBe("Romans 8:28–9:5");
    expect(label("1 Thess 4:13-18")).toBe("1 Thessalonians 4:13–18");
    expect(label("1Cor 13")).toBe("1 Corinthians 13");
    expect(label("II Tim 3:16")).toBe("2 Timothy 3:16");
    expect(label("First John 1:9")).toBe("1 John 1:9");
    expect(label("1 Jn 4:8")).toBe("1 John 4:8");
    expect(label("Song of Songs 2:4")).toBe("Song of Solomon 2:4");
    expect(label("Phil 4:6-7")).toBe("Philippians 4:6–7");
    expect(label("Rev 21:4")).toBe("Revelation 21:4");
    expect(label("the Gospel of John 1:1")).toBe("John 1:1");
  });

  it("reads one-chapter books by verse", () => {
    expect(label("Jude 3")).toBe("Jude 1:3");
    expect(label("Jude 1:24-25")).toBe("Jude 1:24–25");
    expect(label("Philemon 4-6")).toBe("Philemon 1:4–6");
    expect(label("Obadiah")).toBe("Obadiah 1");
    expect(findBook("Isaiah")?.en).toBe("Isaiah");
  });

  it("explains bad references", () => {
    for (const bad of ["", "Hezekiah 3:1", "John 22", "Romans", "John 3:18-16", "John 3:16, 18", "not a reference 3:4:5", "Psalm 151"]) {
      expect(() => parsePassage(bad), bad).toThrow(RefError);
    }
    expect(() => parsePassage("Romans")).toThrow(/Which chapter of Romans/);
    expect(() => parsePassage("John 22")).toThrow(/21 chapters/);
  });
});

describe("read_scripture", () => {
  it("quotes John 3:16 exactly from the KJV, with a link into The Word", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool("read_scripture", { reference: "John 3:16" }, ctx("Read John 3:16", 1));
    expect(r.isError).toBe(false);
    const out = json(r);
    expect(out.reference).toBe("John 3:16");
    expect(out.translation).toBe("KJV");
    expect(out.text).toBe("16 For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.");
    expect(r.links).toEqual([{ label: "Open John 3:16 in The Word", href: "/word?b=43&c=3&v=16" }]);
  });

  it("reads a whole chapter with verse numbers, and links to the chapter", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool("read_scripture", { reference: "Psalm 23" }, ctx("Read Psalm 23", 1));
    const out = json(r);
    expect(out.text.split("\n")).toHaveLength(6);
    expect(out.text.split("\n")[0]).toBe("1 The Lord is my shepherd; I shall not want.");
    expect(r.links?.[0]).toEqual({ label: "Open Psalm 23 in The Word", href: "/word?b=19&c=23" });
  });

  it("caps a long passage and says where to continue", async () => {
    const ctx = await ctxFor(pastor);
    const out = json(await executeTool("read_scripture", { reference: "Psalm 119" }, ctx("Read Psalm 119", 1)));
    expect(out.text.split("\n")).toHaveLength(60);
    expect(out.reference).toBe("Psalm 119:1–60");
    expect(out.more).toMatch(/Psalm 119:61–176/);
  });

  it("spans chapters", async () => {
    const ctx = await ctxFor(pastor);
    const out = json(await executeTool("read_scripture", { reference: "Romans 8:38-9:1" }, ctx("Read it", 1)));
    expect(out.text.split("\n").map((l: string) => l.split(" ")[0])).toEqual(["8:38", "8:39", "9:1"]);
  });

  it("refuses verses that aren't there and bad references", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool("read_scripture", { reference: "John 3:99" }, ctx("Read it", 1));
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/36 verses/);
    expect((await executeTool("read_scripture", { reference: "Bob 1:1" }, ctx("Read it", 1))).isError).toBe(true);
  });

  it("falls back to the KJV, and says so, for a translation the app can't read", async () => {
    await saveProfile(pastor, { ...(await getProfile(pastor)), bibleTranslation: "csb" });
    const ctx = await ctxFor(pastor);
    const out = json(await executeTool("read_scripture", { reference: "John 11:35" }, ctx("Read it", 1)));
    expect(out.translation).toBe("KJV");
    expect(out.text).toBe("35 Jesus wept.");
    expect(out.note).toMatch(/isn't available/);
  });

  it("reads the Spanish the app ships when asked", async () => {
    const ctx = await ctxFor(pastor);
    const out = json(await executeTool("read_scripture", { reference: "John 3:16", translation: "valera" }, ctx("En español", 1)));
    expect(out.translation).toBe("RV1909");
    expect(out.text).toMatch(/^16 Porque de tal manera amó Dios al mundo/);
  });
});

describe("search_scripture", () => {
  it("finds a phrase with references and text", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool("search_scripture", { query: "only begotten son" }, ctx("Where does it say only begotten son?", 1));
    const out = json(r);
    expect(out.hits.map((h: { reference: string }) => h.reference)).toContain("John 3:16");
    expect(out.hits.length).toBeLessThanOrEqual(15);
    expect(r.links?.[0].href).toMatch(/^\/word\?b=\d+&c=\d+&v=\d+$/);
  });

  it("caps hits at 15, narrows by testament or book, and falls back to all words", async () => {
    const ctx = await ctxFor(pastor);
    const many = json(await executeTool("search_scripture", { query: "shepherd" }, ctx("shepherd", 1)));
    expect(many.hits).toHaveLength(15);
    expect(many.total).toBeGreaterThan(15);
    const ps = json(await executeTool("search_scripture", { query: "shepherd", book: "Ps" }, ctx("shepherd", 1)));
    expect(ps.hits.every((h: { reference: string }) => h.reference.startsWith("Psalm "))).toBe(true);
    const nt = json(await executeTool("search_scripture", { query: "shepherd", testament: "nt" }, ctx("shepherd", 1)));
    expect(nt.hits[0].reference).toMatch(/^Matthew/);
    const words = json(await executeTool("search_scripture", { query: "everlasting begotten" }, ctx("x", 1)));
    expect(words.matched).toMatch(/all the words/);
    expect(words.hits.map((h: { reference: string }) => h.reference)).toContain("John 3:16");
    expect((await executeTool("search_scripture", { query: "ab" }, ctx("x", 1))).isError).toBe(true);
  });
});

describe("save_verse and add_verse_note", () => {
  it("bookmarks a verse where The Word keeps it, with a link", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool("save_verse", { reference: "Phil 3:13-14", label: "Pressing on" }, ctx("Bookmark Philippians 3:13-14", 1));
    expect(r.isError).toBe(false);
    expect(r.links?.[0]).toEqual({ label: "Open Philippians 3:13 in The Word", href: "/word?b=50&c=3&v=13" });
    const saved = (await db().hgetall(keys.userBookmarks(wordUserId(pastor))))!;
    expect(Object.keys(saved)).toEqual(["50:3:13-14"]);
    expect(JSON.parse(saved["50:3:13-14"])).toMatchObject({ l: "Pressing on" });
    // saving again doesn't toggle it off
    expect(json(await executeTool("save_verse", { reference: "Philippians 3:13-14" }, ctx("Save it", 2))).already).toBe(true);
    expect(Object.keys((await db().hgetall(keys.userBookmarks(wordUserId(pastor))))!)).toHaveLength(1);
    expect((await executeTool("save_verse", { reference: "Romans 8" }, ctx("Save Romans 8", 3))).isError).toBe(true);
  });

  it("adds a note to a verse below any note already there", async () => {
    const ctx = await ctxFor(pastor);
    await executeTool("add_verse_note", { reference: "Romans 8:28", text: "All things, not some." }, ctx("Note on Romans 8:28", 1));
    const r = await executeTool("add_verse_note", { reference: "Rom 8:28", text: "Preached 11/9." }, ctx("Add another", 2));
    expect(r.links?.[0].href).toBe("/word?b=45&c=8&v=28");
    const notes = (await db().hgetall(keys.userNotes(wordUserId(pastor), 45)))!;
    expect(notes["8:28"]).toBe("All things, not some.\n\nPreached 11/9.");
  });

  it("saves nothing off the record", async () => {
    const ctx = await ctxFor(pastor, true);
    expect((await executeTool("save_verse", { reference: "John 3:16" }, ctx("Save it", 1))).isError).toBe(true);
    expect((await executeTool("add_verse_note", { reference: "John 3:16", text: "x" }, ctx("Note", 1))).isError).toBe(true);
    expect(await db().hgetall(keys.userBookmarks(wordUserId(pastor)))).toBeNull();
  });
});

describe("journal search, adding to an entry, tags and delete", () => {
  async function entries() {
    const mine = await createEntry(await journalActor(pastor), { kind: "note", title: "Advent ideas", body: "Hope in the waiting", tags: ["advent"] });
    const aaronPrivate = await createEntry(await journalActor(aaron), { kind: "note", title: "Aaron's private advent", body: "Hope, privately", tags: ["advent"] });
    const aaronShared = await createEntry(await journalActor(aaron), { kind: "setlist", title: "Advent setlist", body: "Hope songs", tags: ["advent"] });
    await setShared(await journalActor(aaron), aaronShared.id, true);
    return { mine, aaronPrivate, aaronShared };
  }

  it("finds the leader's own entries and shared ones, never another leader's private entry", async () => {
    const { mine, aaronPrivate, aaronShared } = await entries();
    const ctx = await ctxFor(pastor);
    const r = await executeTool("list_journal", { query: "hope" }, ctx("Find my notes on hope", 1));
    const ids = json(r).entries.map((e: { id: string }) => e.id);
    expect(ids).toContain(mine.id);
    expect(ids).toContain(aaronShared.id);
    expect(ids).not.toContain(aaronPrivate.id);
    expect(r.links?.map((l) => l.href)).toContain(`/journal/${mine.id}`);
    const byTag = json(await executeTool("list_journal", { tag: "#Advent" }, ctx("Advent tag", 2)));
    expect(byTag.entries.map((e: { id: string }) => e.id)).toContain(mine.id);
    expect(byTag.entries.map((e: { id: string }) => e.id)).not.toContain(aaronPrivate.id);
    // Without words or a tag: their own entries, newest first (no one else's).
    const all = json(await executeTool("list_journal", {}, ctx("My journal", 3)));
    expect(all.entries.map((e: { id: string }) => e.id)).toEqual([mine.id]);
    const sharedOnly = json(await executeTool("list_journal", { shared_with_me: true }, ctx("Shared with me", 4)));
    expect(sharedOnly.entries.map((e: { id: string }) => e.id)).toEqual([aaronShared.id]);
  });

  it("appends to the end of their own entry, and not to someone else's", async () => {
    const { mine, aaronShared } = await entries();
    const ctx = await ctxFor(pastor);
    const r = await executeTool("update_journal_entry", { id: mine.id, append_notes: "Isaiah 9 for week one." }, ctx("Add that to my advent note", 1));
    expect(r.isError).toBe(false);
    expect(r.links?.[0].href).toBe(`/journal/${mine.id}`);
    expect((await readEntry(pastor, mine.id))!.body).toBe("Hope in the waiting\n\nIsaiah 9 for week one.");
    expect((await executeTool("update_journal_entry", { id: aaronShared.id, append_notes: "x" }, ctx("Add", 2))).isError).toBe(true);
    expect((await readEntry(aaron, aaronShared.id))!.body).toBe("Hope songs");
  });

  it("sets, adds and removes tags", async () => {
    const { mine } = await entries();
    const ctx = await ctxFor(pastor);
    await executeTool("update_journal_entry", { id: mine.id, add_tags: ["#Hope", "christmas"], remove_tags: ["advent"] }, ctx("Tag it", 1));
    expect((await readEntry(pastor, mine.id))!.tags).toEqual(["hope", "christmas"]);
    await executeTool("update_journal_entry", { id: mine.id, tags: ["sermon"] }, ctx("Just sermon", 2));
    expect((await readEntry(pastor, mine.id))!.tags).toEqual(["sermon"]);
  });

  it("deletes only after a yes, and only the leader's own entry", async () => {
    const { mine, aaronShared } = await entries();
    const ctx = await ctxFor(pastor);
    const ask = await executeTool("delete_journal_entry", { id: mine.id }, ctx("Delete my advent note", 1));
    expect(ask.isError).toBe(true);
    expect(ask.content).toMatch(/Not confirmed yet/);
    expect(await readEntry(pastor, mine.id)).not.toBeNull();
    // a no doesn't delete it
    expect((await executeTool("delete_journal_entry", { id: mine.id }, ctx("No, keep it", 2))).isError).toBe(true);
    expect(await readEntry(pastor, mine.id)).not.toBeNull();
    await executeTool("delete_journal_entry", { id: mine.id }, ctx("Delete it", 3));
    const done = await executeTool("delete_journal_entry", { id: mine.id }, ctx("Yes", 4));
    expect(done.isError).toBe(false);
    expect(await readEntry(pastor, mine.id)).toBeNull();
    const theirs = await executeTool("delete_journal_entry", { id: aaronShared.id }, ctx("Delete Aaron's setlist", 5));
    expect(theirs.content).toMatch(/only they can delete it/);
    expect(await readEntry(aaron, aaronShared.id)).not.toBeNull();
  });

  it("existing journal tools hand back a link to the entry", async () => {
    const ctx = await ctxFor(pastor);
    const r = await executeTool("start_journal_entry", { kind: "sermon", title: "Romans 8" }, ctx("Start a sermon on Romans 8", 1));
    const id = json(r).id;
    expect(r.links).toEqual([{ label: 'Open "Romans 8" in Journal', href: `/journal/${id}` }]);
    expect((await executeTool("read_journal_entry", { id }, ctx("Open it", 2))).links?.[0].href).toBe(`/journal/${id}`);
    expect((await executeTool("update_journal_entry", { id, append_notes: "more" }, ctx("Add", 3))).links?.[0].href).toBe(`/journal/${id}`);
    expect((await executeTool("journal_note", { text: "Pray" }, ctx("Journal this", 4))).links?.[0].href).toMatch(/^\/journal\//);
  });
});

describe("access levels and the prompt", () => {
  const member: Access = { role: "leader", admin: false, level: "member" };
  const team: Access = { role: "leader", admin: false, level: "team", teamRole: "serving" };
  const word = ["read_scripture", "search_scripture", "save_verse", "add_verse_note"];
  const journal = ["list_journal", "update_journal_entry", "delete_journal_entry"];

  it("gives Members the Word tools but no Journal, and Team both", () => {
    const m = toolNamesFor(member)!;
    const t = toolNamesFor(team)!;
    for (const x of word) expect(m).toContain(x), expect(t).toContain(x);
    for (const x of journal) expect(m).not.toContain(x), expect(t).toContain(x);
    for (const x of [...word, ...journal]) expect(TOOL_DEFS.map((d) => d.name)).toContain(x);
  });

  it("refuses a Journal tool at the Member level", async () => {
    const ctx = await ctxFor(pastor);
    const c = { ...ctx("Find my notes", 1), toolNames: toolNamesFor(member) };
    expect((await executeTool("list_journal", { query: "hope" }, c)).content).toMatch(/isn't available/);
    expect((await executeTool("read_scripture", { reference: "John 3:16" }, c)).isError).toBe(false);
  });

  it("tells Barnabas to read scripture rather than quote from memory", () => {
    expect(BARNABAS_SYSTEM).toMatch(/The Word and the Journal/);
    expect(BARNABAS_SYSTEM).toMatch(/Always read scripture with read_scripture/);
    expect(BARNABAS_SYSTEM).not.toMatch(/If you aren't sure of the exact KJV words/);
  });
});
