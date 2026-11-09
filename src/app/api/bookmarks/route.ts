import { NextResponse } from "next/server";
import { getUserId } from "@/lib/wordAuth";
import { getBook } from "@/lib/bible";
import { BM_KEY } from "@/lib/bookmarkKey";
import { db, keys } from "@/lib/wordDb";
import { seedDefaultCollections } from "@/lib/defaultCollections";

// Verse bookmarks with optional labels and study collections.
// Hash value per "book:chapter:verse" key: JSON {t: savedAt, l?: label,
// c?: collectionId}. Legacy plain-timestamp values are upgraded on read.

const MAX_BOOKMARKS = 200;

export interface BookmarkEntry {
  t: number;
  l?: string;
  c?: string;
  /** position within a hand-sorted collection */
  o?: number;
}

function parseEntry(raw: string): BookmarkEntry {
  try {
    const parsed = JSON.parse(raw) as BookmarkEntry;
    if (typeof parsed === "object" && parsed !== null && parsed.t) return parsed;
  } catch {
    // legacy value: plain timestamp string
  }
  return { t: Number(raw) || 0 };
}

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kv = db();
  // first visit plants the default collections (Barnabas has no reading plans)
  const lang = new URL(req.url).searchParams.get("lang");
  await seedDefaultCollections(userId, lang === "es").catch(() => {});
  const [rawBookmarks, rawCollections] = await Promise.all([
    kv.hgetall(keys.userBookmarks(userId)),
    kv.hgetall(keys.userCollections(userId)),
  ]);
  const bookmarks: Record<string, BookmarkEntry> = {};
  for (const [key, raw] of Object.entries(rawBookmarks ?? {})) {
    bookmarks[key] = parseEntry(raw);
  }
  const collections: Record<string, { name: string; share?: string }> = {};
  for (const [id, raw] of Object.entries(rawCollections ?? {})) {
    try {
      collections[id] = JSON.parse(raw);
    } catch {
      // corrupted entry — skip
    }
  }
  return NextResponse.json({ who: userId, bookmarks, collections });
}

/** Toggle one bookmark (unchanged contract with the reader). */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    b?: number;
    c?: number;
    v?: number;
  } | null;
  const book = body?.b !== undefined ? getBook(body.b) : undefined;
  if (
    !book ||
    !body?.c ||
    !body?.v ||
    body.c < 1 ||
    body.c > book.chapters ||
    body.v < 1 ||
    body.v > 200
  ) {
    return NextResponse.json({ error: "Invalid verse" }, { status: 400 });
  }

  const kv = db();
  const key = `${body.b}:${body.c}:${body.v}`;
  const existing = (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
  if (key in existing) {
    await kv.hdel(keys.userBookmarks(userId), key);
    return NextResponse.json({ bookmarked: false });
  }
  if (Object.keys(existing).length >= MAX_BOOKMARKS) {
    const oldest = Object.entries(existing).sort(
      (a, b) => parseEntry(a[1]).t - parseEntry(b[1]).t
    )[0];
    if (oldest) await kv.hdel(keys.userBookmarks(userId), oldest[0]);
  }
  await kv.hset(keys.userBookmarks(userId), {
    [key]: JSON.stringify({ t: Date.now() }),
  });
  return NextResponse.json({ bookmarked: true });
}

/** Update a bookmark's label and/or collection. */
export async function PATCH(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    key?: string;
    label?: string;
    coll?: string;
  } | null;
  if (!body?.key || !BM_KEY.test(body.key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  const kv = db();
  const existing = (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
  if (!(body.key in existing)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const entry = parseEntry(existing[body.key]);
  if (body.label !== undefined) {
    const label = body.label.trim().slice(0, 120);
    if (label) entry.l = label;
    else delete entry.l;
  }
  if (body.coll !== undefined) {
    if (body.coll) {
      const colls = (await kv.hgetall(keys.userCollections(userId))) ?? {};
      if (!(body.coll in colls)) {
        return NextResponse.json({ error: "Unknown collection" }, { status: 400 });
      }
      entry.c = body.coll;
    } else {
      delete entry.c;
    }
  }
  await kv.hset(keys.userBookmarks(userId), {
    [body.key]: JSON.stringify(entry),
  });
  return NextResponse.json({ ok: true });
}
