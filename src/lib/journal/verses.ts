import { readFile } from "node:fs/promises";
import path from "node:path";
import { BIBLE_TRANSLATIONS, DEFAULT_BIBLE_TRANSLATION, type BibleTranslation } from "../profile/translations";
import { parseRef } from "../services/scripture";

/**
 * Scripture Barnabas writes into a journal entry is quoted word for word in the leader's translation, with
 * its reference. For the King James Version (the default) the words come from the KJV text The Word ships
 * (public/bible/kjv), read-only, so a quotation can't drift from the text. Other translations are quoted
 * as Barnabas gives them and labeled with the translation.
 */

type BookFile = Record<string, [number, string][]>;
const cache = new Map<number, BookFile>();

async function kjvBook(nr: number): Promise<BookFile | null> {
  const hit = cache.get(nr);
  if (hit) return hit;
  try {
    const file = JSON.parse(await readFile(path.join(process.cwd(), "public", "bible", "kjv", `${nr}.json`), "utf8")) as BookFile;
    cache.set(nr, file);
    return file;
  } catch {
    return null;
  }
}

const MAX_VERSES = 12;

/** The KJV words of a reference within one chapter (up to twelve verses), or null, exactly as The Word shows it. */
export async function kjvText(reference: string): Promise<string | null> {
  const r = parseRef(reference);
  if (!r || !r.verse || (r.endChapter && r.endChapter !== r.chapter)) return null;
  const book = await kjvBook(r.book);
  const rows = book?.[String(r.chapter)];
  if (!rows) return null;
  const last = r.endVerse ?? r.verse;
  if (last < r.verse || last - r.verse + 1 > MAX_VERSES) return null;
  const picked = rows.filter(([v]) => v >= r.verse! && v <= last).map(([, t]) => t.trim());
  return picked.length === last - r.verse + 1 ? picked.join(" ") : null;
}

export const translationAbbrev = (t: BibleTranslation) => /\(([^)]+)\)/.exec(BIBLE_TRANSLATIONS[t])?.[1] ?? t.toUpperCase();

export type Quoted = { reference: string; text: string; translation: string; verified: boolean };

/**
 * A verse as Barnabas will write it. KJV: the shipped text replaces whatever was given (when the reference
 * is one Barnabas can look up). Otherwise the given words, labeled with the leader's translation.
 */
export async function quoteVerse(reference: string, given: string | undefined, translation: BibleTranslation = DEFAULT_BIBLE_TRANSLATION): Promise<Quoted | null> {
  const r = parseRef(reference);
  if (!r) return null;
  const abbrev = translationAbbrev(translation);
  if (translation === "kjv") {
    const text = await kjvText(r.label);
    if (text) return { reference: r.label, text, translation: abbrev, verified: true };
  }
  const text = (given ?? "").replace(/^[\s"“”]+|[\s"“”]+$/g, "").trim();
  if (!text) return null;
  return { reference: r.label, text, translation: abbrev, verified: false };
}

/** “text” (Reference, KJV) */
export const quoteLine = (q: Quoted) => `“${q.text}” (${q.reference}, ${q.translation})`;
