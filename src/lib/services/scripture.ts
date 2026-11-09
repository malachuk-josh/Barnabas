import { BOOKS } from "../bible";

/**
 * Scripture references for service planning, linked into The Word (`/word?b=&c=&v=`, the same deep link
 * The Word's own share button makes). Read-only use of The Word's book list; nothing in The Word changes.
 */

export type ScriptureRef = { book: number; bookName: string; chapter: number; verse?: number; endChapter?: number; endVerse?: number; label: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, string> = {
  psalm: "Psalms", ps: "Psalms", psa: "Psalms", song: "Song of Solomon", songofsongs: "Song of Solomon", canticles: "Song of Solomon",
  gen: "Genesis", ex: "Exodus", exod: "Exodus", lev: "Leviticus", num: "Numbers", deut: "Deuteronomy", josh: "Joshua", judg: "Judges",
  isa: "Isaiah", jer: "Jeremiah", lam: "Lamentations", ezek: "Ezekiel", dan: "Daniel", hos: "Hosea", obad: "Obadiah", mic: "Micah",
  nah: "Nahum", hab: "Habakkuk", zeph: "Zephaniah", hag: "Haggai", zech: "Zechariah", mal: "Malachi", matt: "Matthew", mt: "Matthew",
  mk: "Mark", lk: "Luke", jn: "John", rom: "Romans", gal: "Galatians", eph: "Ephesians", phil: "Philippians", col: "Colossians",
  heb: "Hebrews", jas: "James", rev: "Revelation", prov: "Proverbs", eccl: "Ecclesiastes", eccles: "Ecclesiastes", philem: "Philemon",
};

function findBook(name: string) {
  const n = norm(name);
  if (!n) return undefined;
  const exact = BOOKS.find((b) => norm(b.en) === n);
  if (exact) return exact;
  const alias = ALIASES[n];
  if (alias) return BOOKS.find((b) => b.en === alias);
  // "1 cor", "2tim", "1 jn": a number prefix plus the start of the name
  const m = /^(\d)(.*)$/.exec(n);
  if (m) return BOOKS.find((b) => norm(b.en).startsWith(m[1]) && norm(b.en).slice(1).startsWith(m[2]) && m[2].length >= 2);
  const starts = BOOKS.filter((b) => !/^\d/.test(b.en) && norm(b.en).startsWith(n) && n.length >= 3);
  return starts.length === 1 ? starts[0] : undefined;
}

/** Parses "John 3:16", "Philippians 2:1-11", "Psalm 23", "1 Cor 13", "Romans 8:28-9:5". Null if it isn't one. */
export function parseRef(text: string): ScriptureRef | null {
  const m = /^\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z .]*?)\s*(\d{1,3})(?::(\d{1,3}))?(?:\s*[-–]\s*(\d{1,3})(?::(\d{1,3}))?)?\s*$/.exec(text);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > book.chapters) return null;
  const verse = m[3] ? Number(m[3]) : undefined;
  let endChapter: number | undefined;
  let endVerse: number | undefined;
  if (m[4]) {
    if (m[5]) {
      endChapter = Number(m[4]);
      endVerse = Number(m[5]);
    } else if (verse !== undefined) endVerse = Number(m[4]);
    else endChapter = Number(m[4]);
  }
  if (endChapter && (endChapter < chapter || endChapter > book.chapters)) return null;
  const name = book.en === "Psalms" && !endChapter ? "Psalm" : book.en;
  const label = `${name} ${chapter}${verse ? `:${verse}` : ""}${endChapter ? `–${endChapter}${endVerse ? `:${endVerse}` : ""}` : endVerse ? `–${endVerse}` : ""}`;
  return { book: book.nr, bookName: book.en, chapter, verse, endChapter, endVerse, label };
}

/** The deep link into The Word for a reference (its first chapter and verse). */
export function wordHref(ref: ScriptureRef | string | null | undefined): string | null {
  const r = typeof ref === "string" ? parseRef(ref) : ref;
  if (!r) return null;
  const q = new URLSearchParams({ b: String(r.book), c: String(r.chapter) });
  if (r.verse) q.set("v", String(r.verse));
  return `/word?${q}`;
}
