import { z } from "zod";
import { BOOKS, DEFAULT_TRANSLATION, getTranslation, isLicensed, isTranslation, LAST_OT_BOOK, NOTE_MAX, type Book } from "../bible";
import { loadBook, normalizeText, searchText } from "../bibleText";
import { bmKeyOf, parseBmKey } from "../bookmarkKey";
import { fetchLicensed, licensedKey, reportFums } from "../licensed";
import { isCheckinOnly } from "../auth/roles";
import { getProfile } from "../profile";
import { BIBLE_TRANSLATION_IDS, BIBLE_TRANSLATIONS, DEFAULT_BIBLE_TRANSLATION } from "../profile/translations";
import { accessFor } from "../team";
import { wordUserId } from "../wordAuth";
import { db, keys } from "../wordDb";
import { JOURNAL_MORE_TOOLS } from "./journal-tools";
import type { ActionLink } from "./links";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * The Word, for Barnabas: read a passage word for word from the Bible the app ships (or the licensed
 * translation the leader reads, a chapter at a time from its publisher, never kept), search it, and save a
 * verse or a note into the leader's own Word data (the same storage The Word's bookmarks and notes routes
 * use). Saving to their own Word needs no confirmation.
 */

const ok = (content: unknown, links?: ActionLink[]): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false, ...(links?.length ? { links } : {}) });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;
const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });

/* ---------- References ---------- */

export type Passage = {
  book: Book;
  chapter: number;
  /** Absent for a whole chapter (or chapters). */
  verse?: number;
  endChapter: number;
  /** Absent: to the end of endChapter. */
  endVerse?: number;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Common abbreviations and other names, to the book's English name in BOOKS. Numbered books: the part after the number. */
const ALIASES: Record<string, string> = {
  gen: "Genesis", ge: "Genesis", gn: "Genesis",
  ex: "Exodus", exo: "Exodus", exod: "Exodus",
  lev: "Leviticus", le: "Leviticus", lv: "Leviticus",
  num: "Numbers", nu: "Numbers", nm: "Numbers", numb: "Numbers",
  deut: "Deuteronomy", deu: "Deuteronomy", dt: "Deuteronomy",
  josh: "Joshua", jos: "Joshua",
  judg: "Judges", jdg: "Judges", jg: "Judges",
  ru: "Ruth", rth: "Ruth",
  sam: "Samuel", sa: "Samuel", sm: "Samuel",
  kgs: "Kings", ki: "Kings", kin: "Kings", kings: "Kings",
  chr: "Chronicles", chron: "Chronicles", ch: "Chronicles",
  ezr: "Ezra",
  neh: "Nehemiah", ne: "Nehemiah",
  est: "Esther", esth: "Esther",
  jb: "Job",
  ps: "Psalms", psa: "Psalms", psalm: "Psalms", pss: "Psalms", psm: "Psalms",
  prov: "Proverbs", pr: "Proverbs", prv: "Proverbs", pro: "Proverbs",
  eccl: "Ecclesiastes", eccles: "Ecclesiastes", ecc: "Ecclesiastes", ec: "Ecclesiastes", qoh: "Ecclesiastes",
  song: "Song of Solomon", songs: "Song of Solomon", songofsongs: "Song of Solomon", sos: "Song of Solomon", canticles: "Song of Solomon", sng: "Song of Solomon",
  isa: "Isaiah", is: "Isaiah",
  jer: "Jeremiah", je: "Jeremiah",
  lam: "Lamentations", la: "Lamentations",
  ezek: "Ezekiel", eze: "Ezekiel", ezk: "Ezekiel",
  dan: "Daniel", da: "Daniel", dn: "Daniel",
  hos: "Hosea", ho: "Hosea",
  joe: "Joel", jl: "Joel",
  am: "Amos",
  obad: "Obadiah", ob: "Obadiah", oba: "Obadiah",
  jon: "Jonah", jnh: "Jonah",
  mic: "Micah", mi: "Micah",
  nah: "Nahum", na: "Nahum",
  hab: "Habakkuk", hb: "Habakkuk",
  zeph: "Zephaniah", zep: "Zephaniah", zp: "Zephaniah",
  hag: "Haggai", hg: "Haggai",
  zech: "Zechariah", zec: "Zechariah", zc: "Zechariah",
  mal: "Malachi", ml: "Malachi",
  matt: "Matthew", mt: "Matthew", mat: "Matthew",
  mk: "Mark", mrk: "Mark", mar: "Mark", mr: "Mark",
  lk: "Luke", luk: "Luke", lu: "Luke",
  jn: "John", jhn: "John", joh: "John",
  ac: "Acts", act: "Acts",
  rom: "Romans", ro: "Romans", rm: "Romans",
  cor: "Corinthians", co: "Corinthians",
  gal: "Galatians", ga: "Galatians",
  eph: "Ephesians", ephes: "Ephesians",
  phil: "Philippians", php: "Philippians", pp: "Philippians",
  col: "Colossians",
  thess: "Thessalonians", thes: "Thessalonians", th: "Thessalonians", ths: "Thessalonians",
  tim: "Timothy", ti: "Timothy", tm: "Timothy",
  tit: "Titus",
  philem: "Philemon", phm: "Philemon", phlm: "Philemon",
  heb: "Hebrews",
  jas: "James", jam: "James", jm: "James",
  pet: "Peter", pe: "Peter", pt: "Peter",
  jo: "John", jno: "John",
  jud: "Jude", jd: "Jude",
  rev: "Revelation", re: "Revelation", revelations: "Revelation", rv: "Revelation", apocalypse: "Revelation",
};

/** "1 Thess", "II Timothy", "First John", "Ps", "Song of Songs": the book, or undefined. */
export function findBook(raw: string): Book | undefined {
  const name = raw
    .trim()
    .replace(/\.$/, "")
    .replace(/^(first|1st|iii(?=\s)|ii(?=\s)|i(?=\s))\s*/i, (m) => {
      const w = m.trim().toLowerCase();
      return w === "iii" ? "3 " : w === "ii" ? "2 " : "1 ";
    })
    .replace(/^(second|2nd)\s*/i, "2 ")
    .replace(/^(third|3rd)\s*/i, "3 ")
    .replace(/^(the\s+)?(book of|gospel (according )?to|gospel of|epistle to( the)?|letter to( the)?)\s+/i, "")
    .replace(/^(the\s+)/i, "");
  const n = norm(name);
  if (!n) return undefined;
  const byName = (en: string) => BOOKS.find((b) => b.en === en);
  const exact = BOOKS.find((b) => norm(b.en) === n);
  if (exact) return exact;
  const num = /^([1-3])(.+)$/.exec(n);
  if (num) {
    const rest = ALIASES[num[2]] ? norm(ALIASES[num[2]]) : num[2];
    const numbered = BOOKS.filter((b) => b.en.startsWith(`${num[1]} `) && norm(b.en).slice(1).startsWith(rest));
    if (numbered.length === 1 && rest.length >= 2) return numbered[0];
    // "1 Jo", "1 Jn": the alias's own book among the numbered ones
    return numbered.find((b) => norm(b.en).slice(1) === rest);
  }
  if (ALIASES[n]) {
    const b = byName(ALIASES[n]);
    if (b) return b;
  }
  const starts = BOOKS.filter((b) => !/^\d/.test(b.en) && norm(b.en).startsWith(n));
  return n.length >= 3 && starts.length === 1 ? starts[0] : undefined;
}

export class RefError extends Error {}

/**
 * Parses "John 3:16", "John 3:16-18", "Psalm 23", "Ps 23:1-3", "Romans 8", "Romans 8-9", "1 Thess 4:13-18",
 * "Romans 8:28-9:5", "Jude 3", "Philemon 4-6" and "Obadiah". Throws a RefError that says what's wrong.
 */
export function parsePassage(text: string): Passage {
  const t = text
    .trim()
    .replace(/[–—‒]/g, "-")
    .replace(/\s*\((kjv|esv|nkjv|nasb|niv|csb|nlt|rv1909)\)\s*$/i, "")
    .replace(/(\d)\s*\.\s*(\d)/g, "$1:$2")
    .replace(/\s+/g, " ");
  if (!t) throw new RefError("Give a reference, like John 3:16 or Psalm 23.");
  if (/[,;&]/.test(t) || /\band\b/i.test(t)) throw new RefError(`"${text}" names more than one passage. Read them one at a time, e.g. "${t.split(/[,;&]|\band\b/i)[0].trim()}".`);
  const m = /^((?:[1-3]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-z][a-z .]*?)\s*(?:(\d{1,3})(?::(\d{1,3}))?(?:\s*-\s*(\d{1,3})(?::(\d{1,3}))?)?)?$/i.exec(t);
  if (!m) throw new RefError(`"${text}" isn't a reference I can read. Try the form John 3:16-18, Psalm 23 or Romans 8.`);
  const book = findBook(m[1]);
  if (!book) throw new RefError(`I don't know a book called "${m[1].trim()}". Try the full name, e.g. 1 Thessalonians or Psalms.`);
  const nums = [m[2], m[3], m[4], m[5]].map((x) => (x === undefined ? undefined : Number(x)));
  let [chapter, verse, endA, endB] = nums;
  if (chapter === undefined) {
    if (book.chapters === 1) return { book, chapter: 1, endChapter: 1 };
    throw new RefError(`Which chapter of ${book.en}? It has ${book.chapters}.`);
  }
  // One-chapter books: "Jude 3" and "Philemon 4-6" are verses (unless written "Jude 1:3").
  if (book.chapters === 1 && verse === undefined && !(chapter === 1 && endA === undefined)) {
    if (endB !== undefined) throw new RefError(`${book.en} has only one chapter.`);
    return checked({ book, chapter: 1, verse: chapter, endChapter: 1, endVerse: endA });
  }
  if (book.chapters === 1 && verse === undefined) return { book, chapter: 1, endChapter: 1 };
  let endChapter = chapter;
  let endVerse: number | undefined;
  if (endA !== undefined) {
    if (endB !== undefined) {
      endChapter = endA;
      endVerse = endB;
      if (verse === undefined) verse = 1; // "Romans 8-9:5"
    } else if (verse !== undefined) endVerse = endA;
    else endChapter = endA;
  } else if (verse !== undefined) endVerse = verse;
  return checked({ book, chapter: chapter!, verse, endChapter, endVerse });
}

function checked(p: Passage): Passage {
  const { book } = p;
  if (p.chapter < 1 || p.chapter > book.chapters) throw new RefError(`${book.en} has ${book.chapters} chapter${book.chapters === 1 ? "" : "s"}, so there's no chapter ${p.chapter}.`);
  if (p.endChapter < p.chapter || p.endChapter > book.chapters) throw new RefError(`That range doesn't fit ${book.en}, which has ${book.chapters} chapters.`);
  if (p.verse !== undefined && p.verse < 1) throw new RefError("Verses start at 1.");
  if (p.endVerse !== undefined && p.endChapter === p.chapter && p.verse !== undefined && p.endVerse < p.verse) throw new RefError("That range runs backwards.");
  return p;
}

const bookLabel = (b: Book, chapters: boolean) => (b.en === "Psalms" && !chapters ? "Psalm" : b.en);

/** "John 3:16–18", "Psalm 23", "Romans 8–9", "Romans 8:28–9:5". */
export function passageLabel(p: Passage): string {
  const name = bookLabel(p.book, p.endChapter !== p.chapter);
  if (p.verse === undefined) return p.endChapter !== p.chapter ? `${name} ${p.chapter}–${p.endChapter}` : `${name} ${p.chapter}`;
  if (p.endChapter !== p.chapter) return `${name} ${p.chapter}:${p.verse}–${p.endChapter}:${p.endVerse ?? "end"}`;
  return `${name} ${p.chapter}:${p.verse}${p.endVerse !== undefined && p.endVerse !== p.verse ? `–${p.endVerse}` : ""}`;
}

/** The Word's deep link (`/word?b=&c=&v=`, as its share button makes) and a button for it. */
export function wordLink(book: Book, chapter: number, verse?: number): ActionLink {
  const q = new URLSearchParams({ b: String(book.nr), c: String(chapter) });
  if (verse) q.set("v", String(verse));
  const where = `${bookLabel(book, false)} ${chapter}${verse ? `:${verse}` : ""}`;
  return { label: `Open ${where} in The Word`, href: `/word?${q}` };
}

/* ---------- Text ---------- */

/** Translations Barnabas can name: the ones in Settings, plus the Reina-Valera The Word ships. */
const TRANSLATION_CHOICES = [...BIBLE_TRANSLATION_IDS, "valera"] as const;
type Choice = (typeof TRANSLATION_CHOICES)[number];
const choiceName = (c: Choice) => (c === "valera" ? "Reina Valera 1909 (Spanish, RV1909)" : BIBLE_TRANSLATIONS[c]);

type Source = { id: string; name: string; abbrev: string; licensed: boolean; notice?: string; note?: string };

/** Where a translation's words come from here: the shipped files, its publisher (licensed, configured), or the KJV instead. */
function sourceFor(choice: Choice): Source {
  const kjv: Source = { id: DEFAULT_TRANSLATION, name: "King James Version", abbrev: "KJV", licensed: false };
  if (choice === "kjv") return kjv;
  if (choice === "valera") return { id: "valera", name: "Reina Valera 1909", abbrev: "RV1909", licensed: false };
  if (isTranslation(choice) && isLicensed(choice) && licensedKey(choice)) {
    const t = getTranslation(choice)!;
    return { id: t.id, name: t.name, abbrev: t.abbrev, licensed: true, notice: t.notice };
  }
  return { ...kjv, note: `${choiceName(choice)} isn't available in this app, so this is the King James Version. Say so, and don't quote ${choice.toUpperCase()} from memory.` };
}

type Rows = { verse: number; text: string }[];
const licensedCache = new Map<string, { at: number; rows: Rows }>();

async function chapterRows(src: Source, bookNr: number, chapter: number): Promise<Rows | null> {
  if (!src.licensed) {
    const file = await loadBook(src.id, bookNr);
    const rows = file?.[String(chapter)];
    return rows ? rows.map(([verse, text]) => ({ verse, text: text.trim() })) : null;
  }
  // Borrowed text: one chapter at a time from the publisher, held a few minutes at most (as The Word's route).
  const key = `${src.id}:${bookNr}:${chapter}`;
  const hit = licensedCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.rows;
  const passage = await fetchLicensed(src.id, licensedKey(src.id)!, bookNr, chapter);
  if (passage.fumsId) void reportFums(passage.fumsId);
  licensedCache.set(key, { at: Date.now(), rows: passage.verses });
  if (licensedCache.size > 20) licensedCache.delete(licensedCache.keys().next().value!);
  return passage.verses;
}

export const MAX_VERSES = 60;

export type ReadOut = { reference: string; translation: string; verses: { chapter: number; verse: number; text: string }[]; more?: string; source: Source };

/** The verses of a passage in a translation, at most MAX_VERSES. Throws a RefError for verses that aren't there. */
export async function readPassage(p: Passage, src: Source): Promise<ReadOut> {
  const out: ReadOut["verses"] = [];
  let more: string | undefined;
  for (let c = p.chapter; c <= p.endChapter; c++) {
    const rows = await chapterRows(src, p.book.nr, c);
    if (!rows?.length) throw new Error(`no text for ${p.book.en} ${c}`);
    const last = rows[rows.length - 1].verse;
    const from = c === p.chapter ? p.verse ?? 1 : 1;
    const to = c === p.endChapter ? p.endVerse ?? last : last;
    if (from > last) throw new RefError(`${bookLabel(p.book, false)} ${c} has ${last} verses, so there's no verse ${from}.`);
    if (to > last && c === p.endChapter) throw new RefError(`${bookLabel(p.book, false)} ${c} has ${last} verses, so it stops at ${c}:${last}.`);
    for (const r of rows) {
      if (r.verse < from || r.verse > to) continue;
      if (out.length >= MAX_VERSES) {
        const name = bookLabel(p.book, false);
        more = `${name} ${c}:${r.verse}–${to}`;
        if (c < p.endChapter) more += p.endVerse === undefined ? `, then ${bookLabel(p.book, c + 1 < p.endChapter)} ${c + 1}${c + 1 < p.endChapter ? `–${p.endChapter}` : ""}` : `, then ${name} ${c + 1}:1–${p.endChapter}:${p.endVerse}`;
        break;
      }
      out.push({ chapter: c, verse: r.verse, text: r.text });
    }
    if (more) break;
  }
  const shown = more && out.length ? passageLabel({ book: p.book, chapter: p.chapter, verse: out[0].verse, endChapter: out[out.length - 1].chapter, endVerse: out[out.length - 1].verse }) : passageLabel(p);
  return { reference: shown, translation: src.abbrev, verses: out, more, source: src };
}

async function translationFor(ctx: ToolContext, override?: Choice): Promise<Choice> {
  if (override) return override;
  return (await getProfile(ctx.leader)).bibleTranslation ?? DEFAULT_BIBLE_TRANSLATION;
}

const TRANSLATION_JSON = { type: "string", enum: [...TRANSLATION_CHOICES], description: "Only when the leader asks for a different translation; defaults to theirs (in their profile)" };

/* ---------- read_scripture ---------- */

const readScripture = tool({
  phrase: "Let me read it.",
  def: {
    name: "read_scripture",
    description:
      "Read a Bible passage word for word, in the leader's translation (from their profile) unless they ask for another. Use it every time you quote scripture, unless the same passage was already read in this conversation. " +
      "Takes a reference like 'John 3:16-18', 'Psalm 23', 'Romans 8', '1 Thess 4:13-18' or 'Romans 8:28-9:5' (one passage per call; up to 60 verses). Returns numbered verses and a link to open it in The Word.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { reference: str("One passage, e.g. 'John 3:16-18'"), translation: TRANSLATION_JSON }, required: ["reference"] },
  },
  schema: z.object({ reference: z.string().trim().min(1).max(80), translation: z.enum(TRANSLATION_CHOICES).optional() }),
  async run(input, ctx) {
    let p: Passage;
    try {
      p = parsePassage(input.reference);
    } catch (err) {
      if (err instanceof RefError) return fail(`${err.message} Ask the leader which passage they mean if it's unclear; don't quote it from memory.`);
      throw err;
    }
    const choice = await translationFor(ctx, input.translation);
    let src = sourceFor(choice);
    let out: ReadOut;
    try {
      out = await readPassage(p, src);
    } catch (err) {
      if (err instanceof RefError) return fail(err.message);
      if (!src.licensed) throw err;
      // The publisher didn't answer: the shipped KJV instead, and say so.
      src = { ...sourceFor("kjv"), note: `${src.name} couldn't be reached just now, so this is the King James Version. Say so; don't quote ${src.abbrev} from memory.` };
      try {
        out = await readPassage(p, src);
      } catch (e2) {
        if (e2 instanceof RefError) return fail(e2.message);
        throw e2;
      }
    }
    const multi = out.verses.some((v) => v.chapter !== out.verses[0].chapter);
    const text = out.verses.map((v) => `${multi ? `${v.chapter}:` : ""}${v.verse} ${v.text}`).join("\n");
    const first = out.verses[0];
    const link = wordLink(p.book, first.chapter, p.verse === undefined ? undefined : first.verse);
    return ok(
      {
        reference: out.reference,
        translation: out.translation,
        text,
        more: out.more ? `Only the first ${MAX_VERSES} verses are here. Read ${out.more} next if they want the rest.` : undefined,
        note: src.note,
        notice: src.notice ? `Licensed text: when you quote it, keep it short and include "(${src.abbrev})". ${src.notice}` : undefined,
        say: "Quote these words exactly (with the reference), or summarize them in your own words without quotation marks. Offer to open it in The Word.",
      },
      [link],
    );
  },
});

/* ---------- search_scripture ---------- */

const SEARCH_MAX = 15;

const searchScripture = tool({
  phrase: "Let me search the Scriptures.",
  def: {
    name: "search_scripture",
    description:
      "Find verses containing a word or phrase (e.g. 'living water', 'be still'), in the leader's translation where the app has its full text (otherwise the KJV, which the result says). Up to 15 hits with references and verse text, in Bible order. Optionally only the Old or New Testament, or one book.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        query: str("A word or phrase, at least 3 letters"),
        translation: TRANSLATION_JSON,
        testament: { type: "string", enum: ["ot", "nt"] },
        book: str("Only this book, e.g. 'Psalms'"),
      },
      required: ["query"],
    },
  },
  schema: z.object({ query: z.string().trim().min(1).max(100), translation: z.enum(TRANSLATION_CHOICES).optional(), testament: z.enum(["ot", "nt"]).optional(), book: z.string().trim().max(40).optional() }),
  async run(input, ctx) {
    if (normalizeText(input.query).replace(/[^a-z0-9]/g, "").length < 3) return fail("Search for a word or phrase of at least 3 letters.");
    const choice = await translationFor(ctx, input.translation);
    // A licensed translation has no text here to scan (its terms forbid fetching whole books), so the KJV answers, as in The Word.
    const src = sourceFor(choice);
    const searchedIn = src.licensed ? { ...sourceFor("kjv"), note: `Searched in the King James Version: ${src.name} can only be read a chapter at a time, not searched. read_scripture gives the passage in ${src.abbrev}.` } : src;
    let only: Set<number> | null = null;
    if (input.book) {
      const b = findBook(input.book);
      if (!b) return fail(`I don't know a book called "${input.book}".`);
      only = new Set([b.nr]);
    } else if (input.testament) only = new Set(BOOKS.filter((b) => (input.testament === "ot" ? b.nr <= LAST_OT_BOOK : b.nr > LAST_OT_BOOK)).map((b) => b.nr));
    let found = await searchText(searchedIn.id, input.query, { max: SEARCH_MAX, only });
    let match = "phrase";
    if (!found.total && /\s/.test(input.query.trim())) {
      found = await searchText(searchedIn.id, input.query, { max: SEARCH_MAX, only, allWords: true });
      match = "all the words, not the exact phrase";
    }
    if (!found.total) return ok({ hits: [], translation: searchedIn.abbrev, note: [searchedIn.note, "No verses match. Offer a different word, or a passage you know is near it."].filter(Boolean).join(" ") });
    const hits = found.results.map((r) => {
      const b = BOOKS[r.bookNr - 1];
      return { reference: `${bookLabel(b, false)} ${r.chapter}:${r.verse}`, text: r.text.trim() };
    });
    const top = found.results[0];
    return ok(
      {
        translation: searchedIn.abbrev,
        matched: match,
        total: found.total,
        hits,
        more: found.total > hits.length ? `${found.total - hits.length} more; narrow it with a testament or book, or a longer phrase.` : undefined,
        note: searchedIn.note,
        say: "Mention a few that fit; read_scripture gives any of them with context. The Word has its own search too.",
      },
      [wordLink(BOOKS[top.bookNr - 1], top.chapter, top.verse)],
    );
  },
});

/* ---------- save_verse / add_verse_note (the leader's own Word data) ---------- */

async function wordUser(ctx: ToolContext): Promise<string | ToolResult> {
  if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing is saved, not even in The Word. Say so; they can save it in The Word themselves.");
  if (isCheckinOnly(await accessFor(ctx.leader))) return fail("The Word isn't part of the kids check-in role.");
  return wordUserId(ctx.leader);
}

/** A verse or a run of verses in one chapter, checked against the KJV text (The Word's numbering). */
async function versesIn(reference: string): Promise<{ p: Passage; verse: number; end: number } | ToolResult> {
  let p: Passage;
  try {
    p = parsePassage(reference);
  } catch (err) {
    if (err instanceof RefError) return fail(err.message);
    throw err;
  }
  if (p.verse === undefined) return fail("Which verse? A bookmark or note is on a verse (or a few verses in one chapter), e.g. John 3:16.");
  if (p.endChapter !== p.chapter) return fail("A bookmark stays inside one chapter. Pick the verses in one chapter.");
  const rows = await chapterRows(sourceFor("kjv"), p.book.nr, p.chapter);
  const last = rows?.[rows.length - 1]?.verse ?? 0;
  const end = p.endVerse ?? p.verse;
  if (p.verse > last || end > last) return fail(`${bookLabel(p.book, false)} ${p.chapter} has ${last} verses.`);
  return { p, verse: p.verse, end };
}

const MAX_BOOKMARKS = 200;

const saveVerse = tool({
  phrase: "Saving that verse.",
  def: {
    name: "save_verse",
    description:
      "Bookmark a verse (or a few verses in one chapter) in the leader's own The Word, with an optional label, when they ask to save or bookmark it. Their own bookmark: no confirmation needed. Returns a link to the verse.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { reference: str("e.g. 'Philippians 3:13-14'"), label: str("A short label, only if they give one") }, required: ["reference"] },
  },
  schema: z.object({ reference: z.string().trim().min(1).max(80), label: z.string().trim().max(120).optional() }),
  async run(input, ctx) {
    const user = await wordUser(ctx);
    if (typeof user !== "string") return user;
    const v = await versesIn(input.reference);
    if ("isError" in v) return v;
    const { p, verse, end } = v;
    const key = bmKeyOf(p.book.nr, p.chapter, verse, end);
    const ref = passageLabel({ ...p, endVerse: end });
    const link = wordLink(p.book, p.chapter, verse);
    const kv = db();
    const existing = (await kv.hgetall(keys.userBookmarks(user))) ?? {};
    if (key in existing) {
      if (!input.label) return ok({ saved: ref, already: true, say: "It's already in their bookmarks." }, [link]);
      let entry: { t: number; l?: string; c?: string; o?: number } = { t: Date.now() };
      try {
        entry = { ...entry, ...JSON.parse(existing[key]) };
      } catch {
        entry = { t: Number(existing[key]) || Date.now() };
      }
      entry.l = input.label;
      await kv.hset(keys.userBookmarks(user), { [key]: JSON.stringify(entry) });
      return ok({ saved: ref, label: input.label, say: "Tell them the bookmark's label is updated." }, [link]);
    }
    let dropped: string | undefined;
    if (Object.keys(existing).length >= MAX_BOOKMARKS) {
      const t = (raw: string) => {
        try {
          return (JSON.parse(raw) as { t?: number }).t ?? 0;
        } catch {
          return Number(raw) || 0;
        }
      };
      const oldest = Object.entries(existing).sort((a, b) => t(a[1]) - t(b[1]))[0];
      if (oldest) {
        await kv.hdel(keys.userBookmarks(user), oldest[0]);
        const o = parseBmKey(oldest[0]);
        if (o) dropped = `${bookLabel(BOOKS[o.b - 1], false)} ${o.c}:${o.v}${o.end > o.v ? `–${o.end}` : ""}`;
      }
    }
    await kv.hset(keys.userBookmarks(user), { [key]: JSON.stringify(input.label ? { t: Date.now(), l: input.label } : { t: Date.now() }) });
    return ok(
      { saved: ref, label: input.label, dropped_oldest: dropped && `They had ${MAX_BOOKMARKS} bookmarks, the most The Word keeps, so the oldest (${dropped}) was removed. Mention it.`, say: "Tell them in a few words it's in their bookmarks in The Word." },
      [link],
    );
  },
});

const addVerseNote = tool({
  phrase: "Adding your note.",
  def: {
    name: "add_verse_note",
    description:
      "Add a note to a verse in the leader's own The Word (the study note shown beside that verse), in their words, when they ask. Added below any note already there, never replacing it. Their own note: no confirmation needed. Returns a link to the verse.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { reference: str("One verse, e.g. 'Romans 8:28'"), text: str("The note") }, required: ["reference", "text"] },
  },
  schema: z.object({ reference: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(NOTE_MAX) }),
  async run(input, ctx) {
    const user = await wordUser(ctx);
    if (typeof user !== "string") return user;
    const v = await versesIn(input.reference);
    if ("isError" in v) return v;
    const { p, verse, end } = v;
    const field = `${p.chapter}:${verse}`;
    const key = keys.userNotes(user, p.book.nr);
    const before = ((await db().hgetall(key)) ?? {})[field]?.trim() ?? "";
    const next = before ? `${before}\n\n${input.text}` : input.text;
    if (next.length > NOTE_MAX) return fail(`The note on that verse would be over ${NOTE_MAX} characters. Offer to put it in their Journal instead.`);
    await db().hset(key, { [field]: next });
    const ref = `${bookLabel(p.book, false)} ${p.chapter}:${verse}`;
    return ok(
      { noted: ref, added_to_existing: Boolean(before) || undefined, note: end > verse ? `Notes are on one verse, so it's on ${ref}, the first of the range.` : undefined, say: "Tell them in a few words it's on that verse in The Word." },
      [wordLink(p.book, p.chapter, verse)],
    );
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WORD_TOOLS: ToolSpec<any>[] = [readScripture, searchScripture, saveVerse, addVerseNote, ...JOURNAL_MORE_TOOLS];
