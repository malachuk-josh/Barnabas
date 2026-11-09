import { NextResponse } from "next/server";
import { getUserId } from "@/lib/wordAuth";
import { NOTE_MAX, getBook } from "@/lib/bible";
import { BM_KEY, parseBmKey } from "@/lib/bookmarkKey";
import { db, keys } from "@/lib/wordDb";

// The outbox drains here. Every operation is a statement of intent — "this
// bookmark exists with this label", not "toggle this bookmark" — so replaying
// one that already landed is harmless. That matters: a phone that loses signal
// mid-flush will send the same batch again.

const MAX_OPS = 500;
const MAX_BOOKMARKS = 200;
const MAX_COLLECTIONS = 40;

type Op =
  | { kind: "bookmark.set"; key: string; t: number; l?: string; c?: string; o?: number }
  | { kind: "bookmark.del"; key: string }
  | { kind: "collection.set"; id: string; name: string }
  | { kind: "collection.del"; id: string }
  | { kind: "note.set"; book: number; ref: string; text: string };
// (Communion's plan.set and plan.del are not here: Barnabas has no reading
// plans, so a device that sends one has it rejected.)

const NOTE_REF = /^\d{1,3}:\d{1,3}$/;

/** A verse key only counts if the book, chapter and verses actually exist. */
function validVerseKey(key: string): boolean {
  const ref = parseBmKey(key);
  if (!ref) return false;
  const book = getBook(ref.b);
  return (
    !!book &&
    ref.c >= 1 &&
    ref.c <= book.chapters &&
    ref.v >= 1 &&
    ref.end <= 200
  );
}

/** Whose data would a sync touch? Asked before anything is sent. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ who: userId });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    ops?: Op[];
  } | null;
  if (!body || !Array.isArray(body.ops)) {
    // 200 here would tell the client its queue was accepted, and it would
    // delete every change it had been holding
    return NextResponse.json({ error: "ops required" }, { status: 400 });
  }
  if (body.ops.length > MAX_OPS) {
    // never silently truncate: the client deletes exactly what it sent
    return NextResponse.json(
      { error: "Too many operations", max: MAX_OPS },
      { status: 413 }
    );
  }
  const ops = body.ops;

  const kv = db();
  let applied = 0;
  let rejected = 0;

  // Creations first. The client queues each change as it happens, so a
  // bookmark filed into a brand-new collection can reach us before the
  // collection does; applying it then would silently unfile the bookmark.
  const ordered = [
    ...ops.filter((o) => o?.kind === "collection.set"),
    ...ops.filter((o) => o?.kind !== "collection.set"),
  ];

  // Read each hash once and keep a working copy. A 200-op batch was issuing
  // 200 round trips for the same bookmark hash.
  const marks: Record<string, string> =
    (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
  const colls: Record<string, string> =
    (await kv.hgetall(keys.userCollections(userId))) ?? {};

  for (const op of ordered) {
    try {
      switch (op?.kind) {
        case "bookmark.set": {
          if (!validVerseKey(op.key)) {
            rejected++;
            break;
          }
          const existing = marks;
          // make room the same way the toggle route does: oldest goes first
          if (!(op.key in existing) && Object.keys(existing).length >= MAX_BOOKMARKS) {
            const savedAt = (raw: string): number => {
              try {
                const parsed = JSON.parse(raw);
                return Number(parsed?.t) || 0;
              } catch {
                return Number(raw) || 0; // legacy plain-timestamp value
              }
            };
            const oldest = Object.entries(existing).sort(
              (a, b) => savedAt(a[1]) - savedAt(b[1])
            )[0];
            if (oldest) {
              await kv.hdel(keys.userBookmarks(userId), oldest[0]);
              delete marks[oldest[0]];
            }
          }
          const entry: { t: number; l?: string; c?: string; o?: number } = {
            t: Number(op.t) || Date.now(),
          };
          const label = op.l?.trim().slice(0, 120);
          if (label) entry.l = label;
          // where a hand-sorted collection puts it. Absent means "not sorted
          // by hand", which is not the same as "first" — so an undefined
          // order is dropped rather than written as zero.
          if (Number.isFinite(op.o)) entry.o = Number(op.o);
          if (op.c) {
            // a collection created in the same batch is already here; one
            // that never existed is dropped rather than dangling. hasOwnProperty
            // because "constructor" and friends are `in` every object.
            if (Object.prototype.hasOwnProperty.call(colls, op.c)) entry.c = op.c;
          }
          marks[op.key] = JSON.stringify(entry);
          await kv.hset(keys.userBookmarks(userId), {
            [op.key]: marks[op.key],
          });
          applied++;
          break;
        }
        case "bookmark.del": {
          if (!BM_KEY.test(op.key)) {
            rejected++;
            break;
          }
          await kv.hdel(keys.userBookmarks(userId), op.key);
          delete marks[op.key];
          applied++; // deleting what is already gone is still success
          break;
        }
        case "collection.set": {
          const name = op.name?.trim().slice(0, 80);
          if (!op.id || !/^[a-z0-9]{1,32}$/i.test(op.id) || !name) {
            rejected++;
            break;
          }
          const known = Object.prototype.hasOwnProperty.call(colls, op.id);
          if (!known && Object.keys(colls).length >= MAX_COLLECTIONS) {
            rejected++;
            break;
          }
          let value: Record<string, unknown> = { name };
          if (known) {
            try {
              value = { ...JSON.parse(colls[op.id]), name }; // keep the share token
            } catch {
              // corrupted entry — replace it
            }
          }
          colls[op.id] = JSON.stringify(value);
          await kv.hset(keys.userCollections(userId), {
            [op.id]: colls[op.id],
          });
          applied++;
          break;
        }
        case "collection.del": {
          if (!op.id) {
            rejected++;
            break;
          }
          await kv.hdel(keys.userCollections(userId), op.id);
          delete colls[op.id];
          // detach its bookmarks, exactly as the collection route does
          const updates: Record<string, string> = {};
          for (const [key, raw] of Object.entries(marks)) {
            try {
              const entry = JSON.parse(raw);
              if (entry?.c === op.id) {
                delete entry.c;
                updates[key] = JSON.stringify(entry);
                marks[key] = updates[key];
              }
            } catch {
              // leave unparseable entries alone
            }
          }
          if (Object.keys(updates).length > 0) {
            await kv.hset(keys.userBookmarks(userId), updates);
          }
          applied++;
          break;
        }
        case "note.set": {
          const book = getBook(Number(op.book));
          if (!book || !NOTE_REF.test(op.ref ?? "")) {
            rejected++;
            break;
          }
          const chapter = Number(op.ref.split(":")[0]);
          if (chapter < 1 || chapter > book.chapters) {
            rejected++;
            break;
          }
          const text = (op.text ?? "").trim().slice(0, NOTE_MAX);
          const key = keys.userNotes(userId, Number(op.book));
          if (text) await kv.hset(key, { [op.ref]: text });
          else await kv.hdel(key, op.ref);
          applied++;
          break;
        }
        default:
          rejected++;
      }
    } catch {
      rejected++;
    }
  }

  // hand back the authoritative state so the device can reconcile in one trip
  const [rawBookmarks, rawCollections] = await Promise.all([
    kv.hgetall(keys.userBookmarks(userId)),
    kv.hgetall(keys.userCollections(userId)),
  ]);
  const bookmarks: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(rawBookmarks ?? {})) {
    try {
      bookmarks[key] = JSON.parse(raw);
    } catch {
      bookmarks[key] = { t: Number(raw) || 0 };
    }
  }
  const collections: Record<string, unknown> = {};
  for (const [id, raw] of Object.entries(rawCollections ?? {})) {
    try {
      collections[id] = JSON.parse(raw);
    } catch {
      // corrupted entry — skip
    }
  }
  // the device stores this alongside its copy: if it ever changes, the local
  // data belonged to someone else and must not be merged into this account
  return NextResponse.json({
    who: userId,
    applied,
    rejected,
    bookmarks,
    collections,
  });
}
