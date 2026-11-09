import { bmKeyOf } from "@/lib/bookmarkKey";
import { db, keys } from "@/lib/wordDb";

// Every account starts with two collections already built. (Ported from
// Communion as it was; in Barnabas the seeds are kept under word:.) "The Gospel"
// follows the four-step track from Mount Greylock Baptist Church
// (mountgreylockbaptist.com/finding-life); "Communion" is the two verses this
// app is named for and built on. Seeding happens once per collection per user
// — the marker in `word:user:<id>:seeds` means a deleted collection stays deleted,
// and a collection added here later still reaches people who signed up before
// it existed.

export const GOSPEL_COLLECTION_ID = "gospel";
export const COMMUNION_COLLECTION_ID = "communion";

interface SeedVerse {
  b: number;
  c: number;
  v: number;
  /** last verse, where the thing worth keeping is a sentence not a verse */
  end?: number;
  /** the name the verse is kept under, stored as the bookmark label */
  label: string;
  labelEs: string;
}

interface SeedCollection {
  id: string;
  name: string;
  nameEs: string;
  verses: SeedVerse[];
}

export const GOSPEL_TRACK: SeedVerse[] = [
  {
    b: 1,
    c: 1,
    v: 27,
    label: "You Were Made for More",
    labelEs: "Fuiste hecho para algo más",
  },
  {
    b: 45,
    c: 6,
    v: 23,
    label: "Something Went Wrong",
    labelEs: "Algo salió mal",
  },
  { b: 43, c: 3, v: 16, label: "The Good News", labelEs: "Las buenas nuevas" },
  { b: 43, c: 14, v: 6, label: "Your Response", labelEs: "Tu respuesta" },
];

export const COMMUNION_VERSES: SeedVerse[] = [
  {
    b: 43,
    c: 1,
    v: 1,
    label: "In the beginning was the Word",
    labelEs: "En el principio era el Verbo",
  },
  {
    // kept as the run it is: verse 14 asks and verse 15 answers, and the
    // confidence in the first is only worth anything with the second
    b: 62,
    c: 5,
    v: 14,
    end: 15,
    label: "He hears us",
    labelEs: "Él nos oye",
  },
];

const SEEDS: SeedCollection[] = [
  {
    id: GOSPEL_COLLECTION_ID,
    name: "The Gospel",
    nameEs: "El Evangelio",
    verses: GOSPEL_TRACK,
  },
  {
    id: COMMUNION_COLLECTION_ID,
    name: "Communion",
    nameEs: "Comunión",
    verses: COMMUNION_VERSES,
  },
];

export function gospelName(es: boolean): string {
  return es ? "El Evangelio" : "The Gospel";
}

interface StoredEntry {
  t: number;
  l?: string;
  c?: string;
}

/** A collection the user already keeps under this name, whichever language. */
function existingByName(
  collections: Record<string, string> | null,
  seed: SeedCollection
): string | null {
  const wanted = [seed.name, seed.nameEs].map((n) => n.trim().toLowerCase());
  for (const [id, raw] of Object.entries(collections ?? {})) {
    try {
      const name = (JSON.parse(raw) as { name?: string }).name ?? "";
      if (wanted.includes(name.trim().toLowerCase())) return id;
    } catch {
      // corrupted entry — it is not the one we are looking for
    }
  }
  return null;
}

/**
 * Give a user the default collections the first time we see them.
 *
 * Two rules keep this from walking over anything of theirs. A bookmark already
 * filed somewhere is left where they put it — only its collection is theirs to
 * choose. And a collection they have already made under the same name is used
 * rather than duplicated, so somebody who built "Communion" by hand gets the
 * verses added to it instead of a second shelf beside it.
 */
export async function seedDefaultCollections(
  userId: string,
  es = false
): Promise<boolean> {
  const kv = db();
  const seeds = await kv.hgetall(keys.userSeeds(userId));
  const due = SEEDS.filter((seed) => !seeds?.[seed.id]);
  if (due.length === 0) return false;
  // claim them before writing so two parallel loads don't both plant them
  const now = Date.now();
  await kv.hset(
    keys.userSeeds(userId),
    Object.fromEntries(due.map((seed) => [seed.id, String(now)]))
  );

  const [collections, bookmarks] = await Promise.all([
    kv.hgetall(keys.userCollections(userId)),
    kv.hgetall(keys.userBookmarks(userId)),
  ]);

  for (const seed of due) {
    let target = seed.id;
    if (!collections?.[seed.id]) {
      const mine = existingByName(collections, seed);
      if (mine) target = mine;
      else {
        await kv.hset(keys.userCollections(userId), {
          [seed.id]: JSON.stringify({ name: es ? seed.nameEs : seed.name }),
        });
      }
    }

    // newest-first is how the bookmark list sorts, so count the timestamps
    // down through the collection to keep its own order intact
    const writes: Record<string, string> = {};
    seed.verses.forEach((verse, i) => {
      const key = bmKeyOf(verse.b, verse.c, verse.v, verse.end ?? verse.v);
      const label = es ? verse.labelEs : verse.label;
      const raw = bookmarks?.[key];
      if (raw === undefined) {
        writes[key] = JSON.stringify({ t: now - i * 1000, l: label, c: target });
        return;
      }
      let entry: StoredEntry;
      try {
        entry = JSON.parse(raw) as StoredEntry;
      } catch {
        entry = { t: Number(raw) || now - i * 1000 };
      }
      if (entry.c) return; // already filed somewhere the user chose
      writes[key] = JSON.stringify({
        ...entry,
        l: entry.l || label,
        c: target,
      });
    });
    if (Object.keys(writes).length > 0) {
      await kv.hset(keys.userBookmarks(userId), writes);
    }
  }
  return true;
}
