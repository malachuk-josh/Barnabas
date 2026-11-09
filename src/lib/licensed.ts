// Reading a chapter of somebody else's translation.
//
// Two APIs, several sets of house rules, one shape at the end of it — the same
// {verse, text} rows the static files hand over, so nothing above this file has
// to know which kind of translation it is looking at. Crossway serves the ESV
// itself; API.Bible serves the NKJV and the NASB, which share a key and an
// adapter and differ in how they punctuate a poem.
//
// The keys never leave the server. Both APIs authenticate with a bearer-style
// header and neither offers per-origin restriction, so a key in the browser is
// a key anyone can lift and spend this app's daily allowance with.
//
// A chapter at a time, and only ever a chapter. Both licences cap what may be
// held at around five hundred verses — a few chapters of anything — so there
// is deliberately no way to ask this file for a book.

import { acrosticAt } from "@/lib/acrostic";
import { usfmCode } from "@/lib/usfm";
import { getBook } from "@/lib/bible";

export interface LicensedChapter {
  verses: { verse: number; text: string }[];
  /**
   * API.Bible requires every read to be reported back to them. The token
   * comes down with the chapter and goes back up from the route; see fums().
   */
  fumsId?: string;
}

/**
 * The translations reached through API.Bible, as opposed to the ESV, which
 * Crossway serves itself. They share one key and one adapter and differ only
 * in which catalogue id they are asked for by.
 */
const API_BIBLE = ["nkjv", "nasb", "niv"];

/** The catalogue id a translation is addressed by, if one is configured. */
function apiBibleId(id: string): string | undefined {
  // written out rather than looked up: these are read on the server, but the
  // habit of naming the variable in full is what keeps them findable
  if (id === "nkjv") return process.env.API_BIBLE_NKJV_ID || undefined;
  if (id === "nasb") return process.env.API_BIBLE_NASB_ID || undefined;
  if (id === "niv") return process.env.API_BIBLE_NIV_ID || undefined;
  return undefined;
}

/** Whether a licensed translation is configured at all. */
export function licensedKey(id: string): string | undefined {
  if (id === "esv") return process.env.ESV_API_KEY || undefined;
  if (API_BIBLE.includes(id)) return process.env.API_BIBLE_KEY || undefined;
  return undefined;
}

/**
 * Pull verses out of a run of text marked up the way both of these APIs mark
 * it up: a bracketed number, then the verse, until the next bracketed number.
 *
 * Shared because they agree on it, defensive because neither promises it. A
 * chapter that arrives with no markers at all comes back as a single verse 1
 * rather than as nothing — the reader can show that, and a blank page tells
 * nobody anything.
 *
 * A marker may name a range. Where a translation renders two verses as one
 * sentence it marks them together — "[20-21]" — and the text that follows
 * belongs to both. It is filed under the first, which is where a reader looking
 * for either will start. Matching only a bare number instead left the range
 * unrecognised and silently glued a whole verse onto the end of the one before
 * it: Matthew 17:19 ran on into the mustard seed, and verse 20 simply was not
 * there. Nothing on the page said so.
 */
export function parseBracketed(body: string, firstVerse = 1): {
  verse: number;
  text: string;
}[] {
  const out: { verse: number; text: string }[] = [];
  const marker = /\[(\d{1,3})(?:\s*[-–—]\s*\d{1,3})?\]/g;
  let match = marker.exec(body);
  if (!match) {
    const whole = clean(body);
    return whole ? [{ verse: firstVerse, text: whole }] : [];
  }
  while (match) {
    const verse = Number(match[1]);
    const from = match.index + match[0].length;
    match = marker.exec(body);
    const text = clean(body.slice(from, match ? match.index : undefined));
    if (text) out.push({ verse, text });
  }
  return out;
}

const clean = (s: string): string =>
  s
    // the ESV marks paragraph breaks with newlines and indents poetry with
    // spaces; the reader sets its own lines, so this is all one run of prose
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

/**
 * Hebrew script, including the presentation forms. Written as escapes so the
 * range reads the same in every editor, whichever way it wants to lay it out.
 */
const HEBREW = "\\u0590-\\u05FF\\uFB1D-\\uFB4F";

/**
 * How each letter gets spelled out when a publisher prints its name.
 *
 * There is no standard: the NKJV says Samek, Tsadde and Tau where the NASB
 * says Samekh, Tsadhe and Tav, and both are right. Listed per letter rather
 * than as one flat set because which name is expected depends on which letter
 * is due — that is the whole safeguard below.
 */
const TRANSLITERATIONS: Record<string, string[]> = {
  "א": ["Aleph", "Alef"],
  "ב": ["Beth", "Bet"],
  "ג": ["Gimel", "Gimmel"],
  "ד": ["Daleth", "Dalet"],
  "ה": ["He"],
  "ו": ["Waw", "Vav"],
  "ז": ["Zayin"],
  "ח": ["Heth", "Cheth", "Chet"],
  "ט": ["Teth", "Tet"],
  "י": ["Yodh", "Yod"],
  "כ": ["Kaph", "Caph"],
  "ל": ["Lamedh", "Lamed"],
  "מ": ["Mem"],
  "נ": ["Nun"],
  "ס": ["Samekh", "Samech", "Samek"],
  "ע": ["Ayin"],
  "פ": ["Pe"],
  "צ": ["Tsadhe", "Tsadde", "Tsade", "Sadhe", "Zade"],
  "ק": ["Qoph", "Koph"],
  "ר": ["Resh"],
  "ש": ["Shin", "Sin"],
  "ת": ["Tav", "Taw", "Tau"],
};

/**
 * Take the acrostic heading off the end of a verse.
 *
 * The alphabetic poems are printed with each letter standing over its stanza,
 * and in USFM that is a \qa heading — which API.Bible's include-titles switch
 * does not cover, so it arrives in the text with no marker of its own. Falling
 * between two verses, it lands on the end of the one before. The two
 * publishers print it differently and both leak: the NKJV's verse 8 of Psalm
 * 119 ends "...forsake me utterly! [bet] Beth", the NASB's ends
 * "...utterly abandon me! Beth" with no Hebrew character at all.
 *
 * Which is why this cannot simply cut a trailing letter name. "He" is one of
 * the twenty-two and also an ordinary English word: Isaiah 41:4 ends "I am
 * He", and a rule that reached for the name alone would quietly edit it.
 *
 * So nothing is cut on the strength of the name. lib/acrostic.ts already knows
 * which verse opens which stanza — the same table that draws these letters
 * where they belong — and a heading is only taken off a verse when the verse
 * after it is due to open a stanza, and only when what is trailing is a
 * spelling of that particular letter. Anywhere else the words are the text.
 */
function stripAcrosticHeading(
  text: string,
  bookNr: number,
  chapter: number,
  verse: number
): string {
  let out = text;
  const next = acrosticAt(bookNr, chapter, verse + 1);
  const names = next?.letters.flatMap((l) => TRANSLITERATIONS[l] ?? []) ?? [];
  if (names.length) {
    // A heading is a run, not a word. The publishers write the same one
    // several ways: "Beth" alone, "[bet] Beth" letter-then-name, and — where a
    // letter answers to two names — "[shin] Sin and Shin". Matching a single
    // token took the last word off that third form and left the rest of the
    // heading sitting in the psalm.
    //
    // Still capitalised, and still only the letter that is due, so a sentence
    // ending in the word "he" is a sentence and not a heading.
    const token = `(?:[${HEBREW}]+|(?:${names.join("|")}))`;
    const joined = `(?:\\s+(?:and|or)\\s+|\\s*[/,&]\\s*|\\s+)`;
    out = out.replace(
      new RegExp(`\\s*${token}(?:${joined}${token})*\\.?\\s*$`),
      ""
    );
  }
  // Hebrew script is never the body of an English translation, so a stray
  // letter can go on sight wherever it turns up
  return out.replace(new RegExp(`\\s*[${HEBREW}]+\\s*$`), "").trim();
}

/**
 * The pilcrow the NASB starts a new paragraph with. It marks where a printed
 * page would break, which this reader decides for itself, and it arrives stuck
 * to the first word: "[9] ¶How can a young man keep his way pure?"
 */
const stripPilcrow = (s: string): string => s.replace(/¶\s*/g, "").trim();

/**
 * Crossway's own API. Free for non-commercial use, 5,000 queries a day, and
 * everything that would make the response prettier is turned off — headings,
 * footnotes, the reference line and the short copyright are all things this
 * app draws itself, and every one of them would otherwise land inside verse 1.
 */
/**
 * The reference to ask Crossway for.
 *
 * "Jude 1" does not mean what it looks like it means. Jude has one chapter, so
 * nobody writing about it ever says the chapter out loud — they write "Jude 3"
 * for the third VERSE, and every reference parser worth the name reads it that
 * way. Crossway's does. So asking for "Jude 1" returned Jude verse 1, and the
 * app printed one twenty-fifth of the letter with nothing on the page to say
 * the rest existed.
 *
 * The five one-chapter books are asked for by name alone, which is
 * unambiguous: Obadiah, Philemon, 2 John, 3 John, Jude.
 */
export function esvReference(bookNr: number, chapter: number): string {
  const book = getBook(bookNr);
  if (!book) throw new Error("no such book");
  return book.chapters === 1 ? book.en : `${book.en} ${chapter}`;
}

async function fetchEsv(
  key: string,
  bookNr: number,
  chapter: number
): Promise<LicensedChapter> {
  const query = new URLSearchParams({
    q: esvReference(bookNr, chapter),
    "include-passage-references": "false",
    "include-verse-numbers": "true",
    "include-first-verse-numbers": "true",
    "include-footnotes": "false",
    "include-footnote-body": "false",
    "include-headings": "false",
    "include-short-copyright": "false",
    "include-copyright": "false",
    "include-selahs": "false",
    "indent-poetry": "false",
    "indent-paragraphs": "0",
    "indent-declares": "0",
    "indent-psalm-doxology": "0",
  });
  const res = await fetch(`https://api.esv.org/v3/passage/text/?${query}`, {
    headers: { Authorization: `Token ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`esv ${res.status}`);
  const data = (await res.json()) as { passages?: string[] };
  const body = (data.passages ?? []).join("\n").trim();
  if (!body) throw new Error("esv empty");
  return { verses: parseBracketed(body) };
}

/**
 * API.Bible, which is where the NKJV is reachable. The chapter is addressed
 * by USFM code, and the reply carries a fumsId that has to be reported back —
 * the terms of using it.
 */
async function fetchApiBible(
  key: string,
  bibleId: string,
  bookNr: number,
  chapter: number
): Promise<LicensedChapter> {
  const code = usfmCode(bookNr);
  if (!code) throw new Error("no such book");
  const query = new URLSearchParams({
    "content-type": "text",
    "include-verse-numbers": "true",
    "include-chapter-numbers": "false",
    "include-notes": "false",
    "include-titles": "false",
    "include-verse-spans": "false",
  });
  const res = await fetch(
    `https://rest.api.bible/v1/bibles/${bibleId}/chapters/${code}.${chapter}?${query}`,
    { headers: { "api-key": key }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`api.bible ${res.status}`);
  const data = (await res.json()) as {
    data?: { content?: string };
    meta?: { fumsId?: string };
  };
  const body = (data.data?.content ?? "").trim();
  if (!body) throw new Error("api.bible empty");
  const verses = parseBracketed(body)
    .map((v) => ({
      ...v,
      text: stripAcrosticHeading(stripPilcrow(v.text), bookNr, chapter, v.verse),
    }))
    .filter((v) => v.text);
  return { verses, fumsId: data.meta?.fumsId };
}

/**
 * A one-chapter book that came back as one verse was misread, not short.
 *
 * The five of them run from thirteen verses to twenty-five, so a single verse
 * is never the whole of one — it is a reference parser having taken the "1" in
 * "Jude 1" for a verse. Better to tell the reader the source is unavailable
 * than to hand them a fifth of Jude with nothing to say so: a Bible that
 * quietly leaves things out is worse than one that admits it cannot reach the
 * text.
 *
 * Checked for every licensed source rather than only the one that had the
 * bug, because the mistake is in the notation and not in anybody's server.
 */
function assertWhole(bookNr: number, passage: LicensedChapter) {
  const book = getBook(bookNr);
  if (book && book.chapters === 1 && passage.verses.length < 2) {
    throw new Error(`${book.en}: one verse for a whole book`);
  }
  return passage;
}

/** One chapter of a licensed translation, or a throw. */
export function fetchLicensed(
  id: string,
  key: string,
  bookNr: number,
  chapter: number
): Promise<LicensedChapter> {
  const whole = (p: LicensedChapter) => assertWhole(bookNr, p);
  if (id === "esv") return fetchEsv(key, bookNr, chapter).then(whole);
  if (!API_BIBLE.includes(id)) {
    return Promise.reject(new Error("not a licensed translation"));
  }
  const bibleId = apiBibleId(id);
  if (!bibleId) return Promise.reject(new Error(`no ${id} bible id`));
  return fetchApiBible(key, bibleId, bookNr, chapter).then(whole);
}

/**
 * Tell API.Bible the chapter was read.
 *
 * Their fair-use system expects this, and their own answer is a script that
 * runs in the browser and reports a device id with it. Reporting from here
 * instead keeps a third-party script off the page and the reader's device out
 * of it: what goes back is that a chapter was served, which is what the terms
 * are actually about. Failures are swallowed — a reader who has already been
 * shown the text should not see an error because a tally did not send.
 */
export async function reportFums(fumsId: string): Promise<void> {
  try {
    await fetch(
      `https://fums.api.bible/f3/${encodeURIComponent(fumsId)}?dur=0&t=${Date.now()}`,
      { method: "GET", cache: "no-store" }
    );
  } catch {
    // counted or not, the chapter has been read
  }
}
