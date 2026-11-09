import { readFile } from "fs/promises";
import path from "path";

/**
 * The scripture files this app ships (public/bible/<id>/<book>.json), read on the server. Shared by The
 * Word's search route and Barnabas's scripture tools, so both read and search exactly the same text.
 * Parsed books stay in module scope; a warm instance reads without touching disk again.
 */

/** A book file: chapter number → [verse, text] pairs. */
export type BookFile = Record<string, [number, string][]>;

const books = new Map<string, BookFile | null>();
const whole = new Map<string, BookFile[]>();

/** One book of a shipped translation, or null when there's no file for it. */
export async function loadBook(id: string, bookNr: number): Promise<BookFile | null> {
  if (!/^[a-z0-9]+$/.test(id) || !Number.isInteger(bookNr) || bookNr < 1 || bookNr > 66) return null;
  const key = `${id}:${bookNr}`;
  if (books.has(key)) return books.get(key) ?? null;
  let file: BookFile | null = null;
  try {
    file = JSON.parse(await readFile(path.join(process.cwd(), "public", "bible", id, `${bookNr}.json`), "utf8")) as BookFile;
  } catch {
    file = null;
  }
  books.set(key, file);
  return file;
}

/** All sixty-six books of a shipped translation (a missing book is empty). Throws when none are there. */
export async function loadTranslation(id: string): Promise<BookFile[]> {
  const hit = whole.get(id);
  if (hit) return hit;
  const all = await Promise.all(Array.from({ length: 66 }, async (_, i) => (await loadBook(id, i + 1)) ?? ({} as BookFile)));
  if (all.every((b) => Object.keys(b).length === 0)) throw new Error(`no scripture files for ${id}`);
  whole.set(id, all);
  return all;
}

/** Lowercased with accents removed, so "unigénito" matches "unigenito". */
export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export type SearchHit = { bookNr: number; chapter: number; verse: number; text: string };

/**
 * Verses whose text contains the query (case and accents ignored), in canonical order: at most `max`
 * of them, with the total count. `only` limits the books searched.
 */
export async function searchText(id: string, query: string, opts: { max?: number; only?: Set<number> | null; allWords?: boolean } = {}): Promise<{ results: SearchHit[]; total: number }> {
  const all = await loadTranslation(id);
  const needle = normalizeText(query.trim());
  const words = needle.split(/\s+/).filter(Boolean);
  const max = opts.max ?? 50;
  const results: SearchHit[] = [];
  let total = 0;
  all.forEach((book, i) => {
    const bookNr = i + 1;
    if (opts.only && !opts.only.has(bookNr)) return;
    for (const [chapter, rows] of Object.entries(book)) {
      for (const [verse, text] of rows) {
        const hay = normalizeText(text);
        const hit = opts.allWords ? words.every((w) => hay.includes(w)) : hay.includes(needle);
        if (!hit) continue;
        total++;
        if (results.length < max) results.push({ bookNr, chapter: Number(chapter), verse, text });
      }
    }
  });
  return { results, total };
}
