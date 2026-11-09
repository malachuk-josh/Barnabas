import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshStore, leader, sessionFor } from "./helpers";

// The session cookie the Word routes read, set per test. next/headers has no
// request scope under vitest, so cookies() is stood in for.
let sessionToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "barnabas_session" && sessionToken ? { name, value: sessionToken } : undefined),
  }),
}));

import { getUserId, wordUserId } from "@/lib/wordAuth";
import { db, keys } from "@/lib/wordDb";
import { DEFAULT_DAILY_LIMIT, dailyLimit, giveBack, questionsLeft, takeQuestion } from "@/lib/ask";
import { GET as getChapter } from "@/app/api/bible/[translation]/[book]/[chapter]/route";
import { GET as getNotes, POST as postNote } from "@/app/api/notes/[book]/route";
import { GET as search } from "@/app/api/search/route";
import kjvJohn from "../public/bible/kjv/43.json";

async function signIn() {
  sessionToken = await sessionFor(leader);
}

beforeEach(() => {
  freshStore();
  sessionToken = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Word auth", () => {
  it("files a leader under church and leader id", () => {
    expect(wordUserId(leader)).toBe("demo:leader1");
  });

  it("knows nobody without a session", async () => {
    expect(await getUserId()).toBeNull();
  });

  it("knows the signed-in leader", async () => {
    await signIn();
    expect(await getUserId(new Request("http://localhost/api/sync"))).toBe("demo:leader1");
  });

  it("rejects a forged session", async () => {
    sessionToken = "not-a-real-token";
    expect(await getUserId()).toBeNull();
  });
});

describe("Word storage adapter", () => {
  it("keeps every key under word:", () => {
    expect(keys.userNotes("demo:leader1", 43)).toBe("word:user:demo:leader1:notes:43");
    expect(keys.userBookmarks("u")).toBe("word:user:u:bookmarks");
    expect(keys.userCollections("u")).toBe("word:user:u:collections");
    expect(keys.askDay("2026-11-09", "u")).toBe("word:ask:2026-11-09:u");
  });

  it("stores hashes as JSON on the Barnabas store", async () => {
    const store = freshStore();
    const kv = db();
    expect(await kv.hgetall("word:h")).toBeNull();
    await kv.hset("word:h", { "3:16": "loved", n: 2 });
    await kv.hset("word:h", { "3:17": "saved" });
    expect(await kv.hgetall("word:h")).toEqual({ "3:16": "loved", n: "2", "3:17": "saved" });
    expect(JSON.parse((await store.get("word:h"))!)).toEqual({ "3:16": "loved", n: "2", "3:17": "saved" });
    await kv.hdel("word:h", "3:16");
    await kv.hdel("word:h", "n");
    await kv.hdel("word:h", "3:17");
    // an emptied hash is gone, as in Redis
    expect(await store.get("word:h")).toBeNull();
    expect(await kv.hgetall("word:h")).toBeNull();
  });

  it("counts with hincrby", async () => {
    const kv = db();
    expect(await kv.hincrby("word:c", "q", 1)).toBe(1);
    expect(await kv.hincrby("word:c", "q", 4)).toBe(5);
    expect(await kv.hincrby("word:c", "q", -2)).toBe(3);
  });
});

describe("Ask allowance", () => {
  it("defaults to 50 a day and reads WORD_ASK_DAILY_LIMIT", () => {
    expect(dailyLimit()).toBe(DEFAULT_DAILY_LIMIT);
    expect(DEFAULT_DAILY_LIMIT).toBe(50);
    vi.stubEnv("WORD_ASK_DAILY_LIMIT", "3");
    expect(dailyLimit()).toBe(3);
    vi.stubEnv("WORD_ASK_DAILY_LIMIT", "lots");
    expect(dailyLimit()).toBe(50);
  });

  it("stops a leader at the limit and gives back unanswered questions", async () => {
    vi.stubEnv("WORD_ASK_DAILY_LIMIT", "2");
    const first = await takeQuestion("demo:leader1", "standard");
    expect(first).toMatchObject({ ok: true, left: 1 });
    expect(await takeQuestion("demo:leader1", "standard")).toMatchObject({ ok: true, left: 0 });
    expect(await takeQuestion("demo:leader1", "standard")).toEqual({ ok: false, why: "person" });
    expect(await questionsLeft("demo:leader1", "standard")).toEqual({ left: 0, limit: "person" });
    // another leader has their own day
    expect(await takeQuestion("demo:leader2", "standard")).toMatchObject({ ok: true, left: 1 });
    if (first.ok) await giveBack("demo:leader1", first);
    expect(await questionsLeft("demo:leader1", "standard")).toEqual({ left: 1, limit: null });
  });
});

describe("Word API routes", () => {
  const chapterParams = (translation: string, book: string, chapter: string) => ({
    params: Promise.resolve({ translation, book, chapter }),
  });

  it("requires a signed-in leader", async () => {
    const res = await getChapter(new Request("http://localhost/api/bible/kjv/43/3"), chapterParams("kjv", "43", "3"));
    expect(res.status).toBe(401);
    const notes = await getNotes(new Request("http://localhost/api/notes/43"), { params: Promise.resolve({ book: "43" }) });
    expect(notes.status).toBe(401);
    const found = await search(new Request("http://localhost/api/search?t=kjv&q=loved"));
    expect(found.status).toBe(401);
  });

  it("returns KJV John 3", async () => {
    await signIn();
    // the getBible API, answering from the KJV the app ships
    const upstream = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe("https://api.getbible.net/v2/kjv/43/3.json");
      const verses = (kjvJohn as unknown as Record<string, [number, string][]>)["3"].map(([verse, text]) => ({
        verse,
        text: `${text} `,
      }));
      return new Response(JSON.stringify({ verses }), { status: 200 });
    });
    vi.stubGlobal("fetch", upstream);
    const res = await getChapter(new Request("http://localhost/api/bible/kjv/43/3"), chapterParams("kjv", "43", "3"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { translation: string; bookNr: number; chapter: number; verses: { verse: number; text: string }[] };
    expect(body).toMatchObject({ translation: "kjv", bookNr: 43, chapter: 3 });
    expect(body.verses).toHaveLength(36);
    expect(body.verses[15]).toEqual({
      verse: 16,
      text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    });
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("rejects a chapter that does not exist", async () => {
    await signIn();
    const res = await getChapter(new Request("http://localhost/api/bible/kjv/43/22"), chapterParams("kjv", "43", "22"));
    expect(res.status).toBe(400);
  });

  it("saves a note under the leader's word: key", async () => {
    const store = freshStore();
    await signIn();
    const params = { params: Promise.resolve({ book: "43" }) };
    const saved = await postNote(
      new Request("http://localhost/api/notes/43", { method: "POST", body: JSON.stringify({ ref: "3:16", text: "  the gospel in one verse " }) }),
      params,
    );
    expect(saved.status).toBe(200);
    expect(JSON.parse((await store.get("word:user:demo:leader1:notes:43"))!)).toEqual({ "3:16": "the gospel in one verse" });
    const res = await getNotes(new Request("http://localhost/api/notes/43"), { params: Promise.resolve({ book: "43" }) });
    expect(await res.json()).toEqual({ notes: { "3:16": "the gospel in one verse" } });
  });

  it("searches the shipped KJV", async () => {
    await signIn();
    const res = await search(new Request("http://localhost/api/search?t=kjv&q=only%20begotten%20son"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { bookNr: number; chapter: number; verse: number }[] };
    expect(body.results).toEqual(expect.arrayContaining([expect.objectContaining({ bookNr: 43, chapter: 3, verse: 16 })]));
  });
});
