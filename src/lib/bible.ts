// Scripture text is served by the getBible v2 API (public domain translations),
// proxied and cached through /api/bible to keep a single stable contract here.

export interface Translation {
  id: string; // getBible abbreviation
  name: string;
  abbrev: string;
  lang: "en" | "es";
  /**
   * A translation still in copyright, read a chapter at a time from its
   * publisher and never kept. Everything about how it is fetched, cached,
   * searched and downloaded differs from the ones that are in the public
   * domain, so the difference is named once here and asked about everywhere
   * else.
   */
  licensed?: boolean;
  /** the notice the licence requires wherever its text appears */
  notice?: string;
  /** and the link that has to sit beside it, where one is required */
  noticeHref?: string;
}

/** Ours to ship: shipped whole, as files, and readable with no signal. */
const PUBLIC_DOMAIN: Translation[] = [
  { id: "kjv", name: "King James Version", abbrev: "KJV", lang: "en" },
];

/**
 * The Spanish one, and the reason it is kept apart.
 *
 * It sits at the foot of the picker rather than second from the top. Every
 * other entry is a choice between English translations of the same passage,
 * and this is a change of language — a list that puts it among them invites
 * the reader to fall into Spanish by reaching one line too far. Its label
 * says so too, which is the other half of the same answer.
 */
const OTHER_TONGUES: Translation[] = [
  { id: "valera", name: "Reina Valera (Spanish)", abbrev: "RV1909", lang: "es" },
];

/**
 * Borrowed, on terms.
 *
 * Each appears only where its key is configured — the flags are compiled in,
 * so a build without them has no dropdown entry, no route and no way to ask
 * for text nobody is licensed to serve. Both publishers cap what may be held
 * locally at around five hundred verses, which is why neither can be shipped
 * as files or downloaded for offline reading, and why both are marked here
 * rather than simply added to the list above.
 */
/**
 * Which NASB.
 *
 * The 1995 and 2020 editions are the same translation to a reader and two
 * different copyright lines to the Lockman Foundation, and printing the wrong
 * years is a breach of the licence rather than a typo. The flag that turns the
 * translation on carries the answer: NEXT_PUBLIC_NASB=1995 says so, anything
 * else means the edition currently licensed.
 */
const nasbYears = (): string =>
  (process.env.NEXT_PUBLIC_NASB ?? "").includes("1995")
    ? "1960, 1971, 1977, 1995"
    : "1960, 1971, 1977, 1995, 2020";

const LICENSED: Translation[] = [
  {
    id: "esv",
    name: "English Standard Version",
    abbrev: "ESV",
    lang: "en",
    licensed: true,
    notice:
      "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.",
    noticeHref: "https://www.esv.org",
  },
  {
    id: "nkjv",
    name: "New King James Version",
    abbrev: "NKJV",
    lang: "en",
    licensed: true,
    notice:
      "Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.",
  },
  {
    id: "nasb",
    name: "New American Standard Bible",
    abbrev: "NASB",
    lang: "en",
    licensed: true,
    notice: `Scripture quotations taken from the New American Standard Bible® (NASB), Copyright © ${nasbYears()} by The Lockman Foundation. Used by permission. All rights reserved.`,
    noticeHref: "https://www.lockman.org",
  },
  {
    id: "niv",
    name: "New International Version",
    abbrev: "NIV",
    lang: "en",
    licensed: true,
    // Biblica's wording, which ends "worldwide" where the others end
    // "reserved" — the difference is theirs and is kept.
    notice:
      "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.",
    noticeHref: "https://www.biblica.com",
  },
];

/**
 * Whether a flag says yes.
 *
 * Anything that is not plainly a no counts: "1", "true", "yes", "on", and
 * whatever a phone's clipboard put a space on the end of. This started life
 * as a comparison against "1" and cost a deployment — the value had reached
 * Vercel with something invisible attached, the comparison failed, the build
 * folded the whole clause away as unreachable, and the translation simply did
 * not appear with nothing anywhere to say why. A setting whose only job is to
 * mean "on" should not have one spelling.
 */
const on = (value?: string): boolean => {
  const said = (value ?? "").trim().toLowerCase();
  return said !== "" && said !== "0" && said !== "false" && said !== "off";
};

/**
 * Compiled in, so an unconfigured build cannot offer what it cannot fetch.
 * The env lookups have to stay written out in full: the build substitutes the
 * text `process.env.NEXT_PUBLIC_ESV`, and anything cleverer is a name it never
 * sees and therefore never replaces.
 */
const enabled = (id: string): boolean =>
  (id === "esv" && on(process.env.NEXT_PUBLIC_ESV)) ||
  (id === "nkjv" && on(process.env.NEXT_PUBLIC_NKJV)) ||
  (id === "nasb" && on(process.env.NEXT_PUBLIC_NASB)) ||
  (id === "niv" && on(process.env.NEXT_PUBLIC_NIV));

export const TRANSLATIONS: Translation[] = [
  ...PUBLIC_DOMAIN,
  ...LICENSED.filter((t) => enabled(t.id)),
  ...OTHER_TONGUES,
];

export const DEFAULT_TRANSLATION = "kjv";

export function isTranslation(id: string): boolean {
  return TRANSLATIONS.some((t) => t.id === id);
}

export function getTranslation(id: string): Translation | undefined {
  return TRANSLATIONS.find((t) => t.id === id);
}

/** Borrowed text: one chapter at a time, nothing kept, nothing downloaded. */
export function isLicensed(id: string): boolean {
  return !!getTranslation(id)?.licensed;
}


// Study-mode sources (not shown in the translation dropdown):
// Hebrew OT, Greek NT, and Young's Literal Translation for the
// direct-English line. All share KJV-aligned book numbering.
export const STUDY_IDS = ["codex", "textusreceptus", "ylt", "lxx"];

/**
 * The Septuagint numbers the Psalms differently from the Hebrew: it joins
 * Hebrew 9–10 and 114–115, and splits 116 and 147. Between those seams the
 * LXX runs one chapter behind. Returns the LXX chapter for a Hebrew one.
 */
export function lxxPsalm(chapter: number): number {
  if (chapter <= 8) return chapter;
  if (chapter <= 10) return 9;
  if (chapter <= 113) return chapter - 1;
  if (chapter <= 115) return 113;
  if (chapter === 116) return 114;
  if (chapter <= 146) return chapter - 1;
  if (chapter === 147) return 146;
  return chapter;
}

/**
 * The Septuagint carries each psalm's superscription as verse 1. This is the
 * resulting offset (LXX verse − Hebrew verse) for the psalms whose LXX chapter
 * maps one-to-one onto a Hebrew one; the four seams above are handled
 * separately. Derived from the shipped files rather than computed at runtime,
 * because LXX Psalm 115 is missing verse 5 — an array length is not a verse
 * count.
 */
const LXX_PSALM_TITLE: Record<number, number> = {
  3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 11: 1, 17: 1, 18: 1, 19: 1,
  20: 1, 21: 1, 29: 1, 30: 1, 33: 1, 35: 1, 37: 1, 38: 1, 39: 1, 40: 1,
  41: 1, 43: 1, 44: 1, 45: 1, 46: 1, 47: 1, 48: 1, 50: 2, 51: 2, 52: 1,
  53: 2, 54: 1, 55: 1, 56: 1, 57: 1, 58: 1, 59: 2, 60: 1, 61: 1, 62: 1,
  63: 1, 64: 1, 66: 1, 67: 1, 68: 1, 69: 1, 74: 1, 75: 1, 76: 1, 79: 1,
  80: 1, 82: 1, 83: 1, 84: 1, 87: 1, 88: 1, 91: 1, 101: 1, 107: 1,
  139: 1, 141: 1,
};

export interface MappedRef {
  chapter: number;
  verse: number;
  /** true where the two numberings differ and a seam has been applied */
  mapped: boolean;
}

/**
 * The King James address for a Septuagint one.
 *
 * lxxPsalm() above is the forward map and cannot simply be inverted: the LXX
 * joins Hebrew 9+10 and 114+115 and splits 116 and 147, so four LXX chapters
 * answer to two Hebrew ones each. It is also blind to the superscription,
 * which shifts the verse as well as the chapter. This is chapter- and
 * verse-aware, and it is what a tap on a Septuagint concordance row must go
 * through before it reaches the reader — the reader reads the King James.
 *
 * `mapped: false` means the address passes through untouched. That is right
 * for most books and is the only honest answer for the few whose Greek text
 * is rearranged with no closed-form map — Jeremiah above all, where a third
 * of the chapters sit somewhere else entirely.
 */
export function kjvFromLxx(
  bookNr: number,
  chapter: number,
  verse: number
): MappedRef {
  if (bookNr === 19) {
    // LXX 9 runs Hebrew 9 (title + 20 verses) straight into Hebrew 10
    if (chapter === 9) {
      return verse <= 21
        ? { chapter: 9, verse: Math.max(1, verse - 1), mapped: true }
        : { chapter: 10, verse: verse - 21, mapped: true };
    }
    // LXX 113 runs Hebrew 114 (8 verses) into Hebrew 115
    if (chapter === 113) {
      return verse <= 8
        ? { chapter: 114, verse, mapped: true }
        : { chapter: 115, verse: verse - 8, mapped: true };
    }
    // Hebrew 116 was split in two, and Hebrew 147 likewise
    if (chapter === 114) return { chapter: 116, verse, mapped: true };
    if (chapter === 115) return { chapter: 116, verse: verse + 9, mapped: true };
    if (chapter === 116) return { chapter: 117, verse, mapped: true };
    if (chapter === 146) return { chapter: 147, verse, mapped: true };
    if (chapter === 147) return { chapter: 147, verse: verse + 11, mapped: true };
    // the LXX has a Psalm 151; the King James stops at 150
    if (chapter === 151) return { chapter: 150, verse: 1, mapped: true };
    const title = LXX_PSALM_TITLE[chapter] ?? 0;
    const heb = chapter <= 8 || chapter >= 148 ? chapter : chapter + 1;
    return {
      // a row that points at the superscription has no Hebrew verse of its
      // own; verse 1 is where it belongs
      verse: Math.max(1, verse - title),
      chapter: heb,
      mapped: heb !== chapter || title > 0,
    };
  }
  // Joel: the Greek keeps Hebrew's four chapters, the King James has three
  if (bookNr === 29) {
    if (chapter === 3) return { chapter: 2, verse: verse + 27, mapped: true };
    if (chapter === 4) return { chapter: 3, verse, mapped: true };
    return { chapter, verse, mapped: false };
  }
  // Malachi: one Greek chapter 3 covers King James 3 and 4
  if (bookNr === 39) {
    if (chapter === 3 && verse > 18) {
      return { chapter: 4, verse: verse - 18, mapped: true };
    }
    return { chapter, verse, mapped: false };
  }
  return { chapter, verse, mapped: false };
}

export function originalSourceFor(bookNr: number): string {
  return bookNr <= 39 ? "codex" : "textusreceptus";
}

export interface Book {
  nr: number; // getBible book number, 1–66
  en: string;
  es: string;
  chapters: number;
}

export const BOOKS: Book[] = [
  { nr: 1, en: "Genesis", es: "Génesis", chapters: 50 },
  { nr: 2, en: "Exodus", es: "Éxodo", chapters: 40 },
  { nr: 3, en: "Leviticus", es: "Levítico", chapters: 27 },
  { nr: 4, en: "Numbers", es: "Números", chapters: 36 },
  { nr: 5, en: "Deuteronomy", es: "Deuteronomio", chapters: 34 },
  { nr: 6, en: "Joshua", es: "Josué", chapters: 24 },
  { nr: 7, en: "Judges", es: "Jueces", chapters: 21 },
  { nr: 8, en: "Ruth", es: "Rut", chapters: 4 },
  { nr: 9, en: "1 Samuel", es: "1 Samuel", chapters: 31 },
  { nr: 10, en: "2 Samuel", es: "2 Samuel", chapters: 24 },
  { nr: 11, en: "1 Kings", es: "1 Reyes", chapters: 22 },
  { nr: 12, en: "2 Kings", es: "2 Reyes", chapters: 25 },
  { nr: 13, en: "1 Chronicles", es: "1 Crónicas", chapters: 29 },
  { nr: 14, en: "2 Chronicles", es: "2 Crónicas", chapters: 36 },
  { nr: 15, en: "Ezra", es: "Esdras", chapters: 10 },
  { nr: 16, en: "Nehemiah", es: "Nehemías", chapters: 13 },
  { nr: 17, en: "Esther", es: "Ester", chapters: 10 },
  { nr: 18, en: "Job", es: "Job", chapters: 42 },
  { nr: 19, en: "Psalms", es: "Salmos", chapters: 150 },
  { nr: 20, en: "Proverbs", es: "Proverbios", chapters: 31 },
  { nr: 21, en: "Ecclesiastes", es: "Eclesiastés", chapters: 12 },
  { nr: 22, en: "Song of Solomon", es: "Cantares", chapters: 8 },
  { nr: 23, en: "Isaiah", es: "Isaías", chapters: 66 },
  { nr: 24, en: "Jeremiah", es: "Jeremías", chapters: 52 },
  { nr: 25, en: "Lamentations", es: "Lamentaciones", chapters: 5 },
  { nr: 26, en: "Ezekiel", es: "Ezequiel", chapters: 48 },
  { nr: 27, en: "Daniel", es: "Daniel", chapters: 12 },
  { nr: 28, en: "Hosea", es: "Oseas", chapters: 14 },
  { nr: 29, en: "Joel", es: "Joel", chapters: 3 },
  { nr: 30, en: "Amos", es: "Amós", chapters: 9 },
  { nr: 31, en: "Obadiah", es: "Abdías", chapters: 1 },
  { nr: 32, en: "Jonah", es: "Jonás", chapters: 4 },
  { nr: 33, en: "Micah", es: "Miqueas", chapters: 7 },
  { nr: 34, en: "Nahum", es: "Nahúm", chapters: 3 },
  { nr: 35, en: "Habakkuk", es: "Habacuc", chapters: 3 },
  { nr: 36, en: "Zephaniah", es: "Sofonías", chapters: 3 },
  { nr: 37, en: "Haggai", es: "Hageo", chapters: 2 },
  { nr: 38, en: "Zechariah", es: "Zacarías", chapters: 14 },
  { nr: 39, en: "Malachi", es: "Malaquías", chapters: 4 },
  { nr: 40, en: "Matthew", es: "Mateo", chapters: 28 },
  { nr: 41, en: "Mark", es: "Marcos", chapters: 16 },
  { nr: 42, en: "Luke", es: "Lucas", chapters: 24 },
  { nr: 43, en: "John", es: "Juan", chapters: 21 },
  { nr: 44, en: "Acts", es: "Hechos", chapters: 28 },
  { nr: 45, en: "Romans", es: "Romanos", chapters: 16 },
  { nr: 46, en: "1 Corinthians", es: "1 Corintios", chapters: 16 },
  { nr: 47, en: "2 Corinthians", es: "2 Corintios", chapters: 13 },
  { nr: 48, en: "Galatians", es: "Gálatas", chapters: 6 },
  { nr: 49, en: "Ephesians", es: "Efesios", chapters: 6 },
  { nr: 50, en: "Philippians", es: "Filipenses", chapters: 4 },
  { nr: 51, en: "Colossians", es: "Colosenses", chapters: 4 },
  { nr: 52, en: "1 Thessalonians", es: "1 Tesalonicenses", chapters: 5 },
  { nr: 53, en: "2 Thessalonians", es: "2 Tesalonicenses", chapters: 3 },
  { nr: 54, en: "1 Timothy", es: "1 Timoteo", chapters: 6 },
  { nr: 55, en: "2 Timothy", es: "2 Timoteo", chapters: 4 },
  { nr: 56, en: "Titus", es: "Tito", chapters: 3 },
  { nr: 57, en: "Philemon", es: "Filemón", chapters: 1 },
  { nr: 58, en: "Hebrews", es: "Hebreos", chapters: 13 },
  { nr: 59, en: "James", es: "Santiago", chapters: 5 },
  { nr: 60, en: "1 Peter", es: "1 Pedro", chapters: 5 },
  { nr: 61, en: "2 Peter", es: "2 Pedro", chapters: 3 },
  { nr: 62, en: "1 John", es: "1 Juan", chapters: 5 },
  { nr: 63, en: "2 John", es: "2 Juan", chapters: 1 },
  { nr: 64, en: "3 John", es: "3 Juan", chapters: 1 },
  { nr: 65, en: "Jude", es: "Judas", chapters: 1 },
  { nr: 66, en: "Revelation", es: "Apocalipsis", chapters: 22 },
];

export function getBook(nr: number): Book | undefined {
  return BOOKS.find((b) => b.nr === nr);
}

/** The last book of the Old Testament: Malachi. */
export const LAST_OT_BOOK = 39;

/**
 * Where a word search looks: either testament, any books besides, or — with
 * nothing chosen — the whole Bible. The choices add up rather than narrow:
 * the Old Testament and Matthew is thirty-nine books and one more.
 */
export interface SearchScope {
  ot: boolean;
  nt: boolean;
  books: number[];
}

export const WHOLE_BIBLE: SearchScope = { ot: false, nt: false, books: [] };

/** The books a scope covers, in order, or null for all sixty-six. */
export function scopeBooks(scope: SearchScope): number[] | null {
  const found = new Set(scope.books);
  for (const b of BOOKS) {
    if (b.nr <= LAST_OT_BOOK ? scope.ot : scope.nt) found.add(b.nr);
  }
  if (found.size === 0 || found.size === BOOKS.length) return null;
  return [...found].sort((a, b) => a - b);
}

/** Books for a query string, runs closed up: "1-39,43". */
export function booksParam(books: number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < books.length; i++) {
    let j = i;
    while (j + 1 < books.length && books[j + 1] === books[j] + 1) j++;
    runs.push(j > i ? `${books[i]}-${books[j]}` : String(books[i]));
    i = j;
  }
  return runs.join(",");
}

/** booksParam read back: the books, or null for anything else. */
export function parseBooksParam(param: string | null): Set<number> | null {
  if (!param || !/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(param)) return null;
  const books = new Set<number>();
  for (const run of param.split(",")) {
    const [from, to = from] = run.split("-").map(Number);
    for (let n = Math.max(1, from); n <= Math.min(BOOKS.length, to); n++) books.add(n);
  }
  return books.size ? books : null;
}

/**
 * How long a note on a verse may be. Room for a saved answer from Ask under
 * whatever was written there already, which the old thousand was not.
 */
export const NOTE_MAX = 4000;

export interface Verse {
  verse: number;
  text: string;
}

export interface ChapterData {
  translation: string;
  bookNr: number;
  chapter: number;
  verses: Verse[];
}
