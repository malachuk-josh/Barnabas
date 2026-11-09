// Scripture, served as static files: /bible/{translation}/{book}.json holds a
// whole book, verses as [verse, text] pairs keyed by chapter. One request per
// book, cached by the browser and the service worker — reading works offline
// once a book has been seen (or downloaded from the offline screen).

import {
  STUDY_IDS,
  isLicensed,
  isTranslation,
  type ChapterData,
  type Verse,
} from "./bible";

type BookFile = Record<string, [number, string][]>;

// per-session memory cache so chapter-to-chapter movement inside a book
// costs zero requests
const books = new Map<string, Promise<BookFile>>();

/**
 * What a licensed translation is allowed to leave behind.
 *
 * Crossway and API.Bible both cap local storage at about five hundred verses,
 * so this cache is capped at a number of chapters that cannot exceed it —
 * twelve of the longest chapters in the Bible would, so the count is low and
 * the eviction is oldest-first. It lives in memory only: nothing licensed
 * reaches IndexedDB, the service worker, or the offline download, and closing
 * the tab is the end of it.
 */
const LICENSED_CHAPTERS = 8;
/** And it does not outlive a sitting, whatever the tab does. */
const LICENSED_TTL_MS = 30 * 60 * 1000;

const licensedCache = new Map<string, { at: number; data: ChapterData }>();

function takeLicensed(key: string): ChapterData | null {
  const hit = licensedCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > LICENSED_TTL_MS) {
    licensedCache.delete(key);
    return null;
  }
  return hit.data;
}

function keepLicensed(key: string, data: ChapterData): void {
  licensedCache.set(key, { at: Date.now(), data });
  // Map iterates in insertion order, so the first key is the oldest
  while (licensedCache.size > LICENSED_CHAPTERS) {
    const oldest = licensedCache.keys().next().value;
    if (oldest === undefined) break;
    licensedCache.delete(oldest);
  }
}

function loadBook(translation: string, bookNr: number): Promise<BookFile> {
  const key = `${translation}/${bookNr}`;
  let hit = books.get(key);
  if (!hit) {
    hit = fetch(`/bible/${translation}/${bookNr}.json`).then((res) => {
      if (!res.ok) throw new Error(`no ${key}`);
      return res.json() as Promise<BookFile>;
    });
    // a failed fetch must not poison the cache for the retry
    hit.catch(() => books.delete(key));
    books.set(key, hit);
  }
  return hit;
}

/**
 * A chapter of scripture, in the shape the old /api/bible route returned.
 * Static-first; falls back to the API route for anything not shipped as a
 * static file (the study sources besides the LXX).
 */
export async function fetchChapter(
  translation: string,
  bookNr: number,
  chapter: number
): Promise<ChapterData> {
  // borrowed text: always from the route, never from a file, and only what is
  // still inside the window the licence allows this device to hold
  if (isLicensed(translation)) {
    const key = `${translation}/${bookNr}/${chapter}`;
    const held = takeLicensed(key);
    if (held) return held;
    const res = await fetch(`/api/bible/${translation}/${bookNr}/${chapter}`);
    if (!res.ok) throw new Error("chapter unavailable");
    const data = (await res.json()) as ChapterData;
    keepLicensed(key, data);
    return data;
  }
  if (isTranslation(translation) || translation === "lxx") {
    try {
      const book = await loadBook(translation, bookNr);
      const rows = book[String(chapter)];
      if (rows && rows.length > 0) {
        return {
          translation,
          bookNr,
          chapter,
          verses: rows.map(([verse, text]) => ({ verse, text })),
        };
      }
      // fall through: a chapter the static file genuinely lacks
    } catch {
      // static file unreachable — try the API below
    }
  } else if (!STUDY_IDS.includes(translation)) {
    throw new Error("unknown translation");
  }
  const res = await fetch(`/api/bible/${translation}/${bookNr}/${chapter}`);
  if (!res.ok) throw new Error("chapter unavailable");
  return res.json() as Promise<ChapterData>;
}

/** One book, every chapter, in reading order. */
export interface BookChapters {
  translation: string;
  bookNr: number;
  chapters: { chapter: number; verses: Verse[] }[];
}

/**
 * The whole book at once. The file on disk already holds every chapter — the
 * reader used to take one chapter out of it at a time and ask again on every
 * scroll, which is what made scrolling feel like it was fetching. Throws if
 * the static file is unreachable; the caller falls back to a single chapter.
 */
export async function fetchBook(
  translation: string,
  bookNr: number
): Promise<BookChapters> {
  // There is no whole book to be had for a licensed translation, and this
  // throwing is how the reader learns to ask a chapter at a time instead.
  if (isLicensed(translation)) throw new Error("licensed: chapter at a time");
  if (!isTranslation(translation) && translation !== "lxx") {
    throw new Error("unknown translation");
  }
  const book = await loadBook(translation, bookNr);
  const chapters = Object.keys(book)
    .map(Number)
    .filter((n) => Number.isFinite(n) && book[String(n)]?.length > 0)
    .sort((a, b) => a - b)
    .map((chapter) => ({
      chapter,
      verses: book[String(chapter)].map(([verse, text]) => ({ verse, text })),
    }));
  if (chapters.length === 0) throw new Error("empty book");
  return { translation, bookNr, chapters };
}

export interface VerseRef {
  bookNr: number;
  chapter: number;
  verse: number;
}

export interface VerseBatch {
  /** verse text for every reference that resolved, keyed by verseKey() */
  verses: Map<string, string>;
  /** books whose file could not be loaded at all — offline, or missing */
  missingBooks: Set<number>;
}

export const verseKey = (
  bookNr: number,
  chapter: number,
  verse: number
): string => `${bookNr}:${chapter}:${verse}`;

/**
 * Text for a scattered list of verses.
 *
 * The concordance needs this: a list of references spread across the whole
 * Bible, whose text has to be shown without asking for each one. References
 * are grouped by book because the file on disk already holds a whole book —
 * sixty verses spanning six books cost six requests, not sixty. Everything
 * goes through loadBook, so a book the reader already opened costs nothing,
 * and two callers asking at once share the one request.
 *
 * Never throws, and never falls back to /api/bible: that route is not in the
 * service worker's cache, so offline it would be a slow failure per verse
 * rather than an immediate one per book. A book that cannot be read comes
 * back in `missingBooks` for the caller to say so.
 */
export async function fetchVerses(
  translation: string,
  refs: VerseRef[]
): Promise<VerseBatch> {
  const verses = new Map<string, string>();
  const missingBooks = new Set<number>();
  if (!isTranslation(translation) && translation !== "lxx") {
    return { verses, missingBooks };
  }
  // A licensed translation has no book to group by, so the grouping is by
  // chapter — the journal's shelf of scattered verses becomes one request per
  // distinct chapter rather than one per book. Verses beyond what the cache
  // may hold simply come back empty, and the caller shows the reference.
  if (isLicensed(translation)) {
    const byChapter = new Map<string, VerseRef[]>();
    for (const ref of refs) {
      const at = `${ref.bookNr}:${ref.chapter}`;
      const list = byChapter.get(at);
      if (list) list.push(ref);
      else byChapter.set(at, [ref]);
    }
    await Promise.all(
      [...byChapter].map(async ([, list]) => {
        try {
          const data = await fetchChapter(
            translation,
            list[0].bookNr,
            list[0].chapter
          );
          for (const ref of list) {
            const row = data.verses.find((v) => v.verse === ref.verse);
            if (row) {
              verses.set(verseKey(ref.bookNr, ref.chapter, ref.verse), row.text);
            }
          }
        } catch {
          missingBooks.add(list[0].bookNr);
        }
      })
    );
    return { verses, missingBooks };
  }
  const byBook = new Map<number, VerseRef[]>();
  for (const ref of refs) {
    const list = byBook.get(ref.bookNr);
    if (list) list.push(ref);
    else byBook.set(ref.bookNr, [ref]);
  }
  await Promise.all(
    [...byBook].map(async ([bookNr, list]) => {
      let book: BookFile;
      try {
        book = await loadBook(translation, bookNr);
      } catch {
        missingBooks.add(bookNr);
        return;
      }
      for (const ref of list) {
        // a chapter the file genuinely lacks — LXX Malachi 4 is an empty
        // array, and the Greek runs past the English in a few places
        const rows = book[String(ref.chapter)];
        const row = rows?.find(([verse]) => verse === ref.verse);
        if (row) {
          verses.set(verseKey(ref.bookNr, ref.chapter, ref.verse), row[1]);
        }
      }
    })
  );
  return { verses, missingBooks };
}

export interface LocalSearchResult {
  bookNr: number;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * Search a translation by scanning its static book files — the offline path,
 * used when the search API cannot be reached. Only books already in the
 * HTTP/service-worker cache resolve offline; the rest are skipped quietly.
 */
export async function searchLocal(
  translation: string,
  query: string,
  /** the books to look in, or null for all of them */
  only: number[] | null = null,
  limit = 50
): Promise<{ results: LocalSearchResult[]; total: number; searchedIn: string }> {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const q = normalize(query);
  const results: LocalSearchResult[] = [];
  let total = 0;
  // A licensed translation has no files to scan, and asking its publisher for
  // all sixty-six books in order to scan them would be both a day's quota and
  // the very thing the licence exists to prevent. Search the King James
  // instead: the point of a search is to find the place, and the reader shows
  // the place in whatever translation is open. The caller says which text the
  // results came from.
  const from = isLicensed(translation) ? "kjv" : translation;
  for (let bookNr = 1; bookNr <= 66; bookNr++) {
    if (only && !only.includes(bookNr)) continue;
    let book: BookFile;
    try {
      book = await loadBook(from, bookNr);
    } catch {
      continue; // not cached and no network — skip
    }
    for (const [ch, rows] of Object.entries(book)) {
      for (const [verse, text] of rows) {
        if (normalize(text).includes(q)) {
          total++;
          if (results.length < limit) {
            results.push({ bookNr, chapter: Number(ch), verse, text });
          }
        }
      }
    }
  }
  return { results, total, searchedIn: from };
}
