// The words of Christ, set in red.
//
// A printing convention from 1899 and the thing readers most often ask a Bible
// app for. The hard part was never the colour — it is knowing where a speech
// starts and stops, which is a judgement about the text and not something to
// be inferred from "Jesus said" and a comma. That judgement is made once, in
// scripts/build-redletter.mjs, against an edition of the King James that marks
// every one of Christ's speeches explicitly. What is left here is the reading
// of it.
//
// A speech is stored as a run of WORD indices — [first, last] — because the
// two editions of the King James involved agree about every word and disagree
// about the odd comma. Counting words is the one thing they cannot differ on.

import { Fragment, type ReactNode } from "react";
import { readLocal, writeLocal } from "@/lib/storage";

/** Per verse ("ch:v"), the runs of words Christ speaks. */
export type RedRuns = Record<string, [number, number][]>;

/** Where the choice is kept, and how the reader hears it has been made. */
export const RED_LETTER_KEY = "barnabas.word.redLetter";
export const RED_LETTER_CHANGED = "barnabas.word:red-letter";

export function readRedLetter(): boolean {
  try {
    return readLocal(RED_LETTER_KEY) === "1";
  } catch {
    // storage blocked — the setting simply starts off
    return false;
  }
}

export function writeRedLetter(on: boolean): void {
  try {
    writeLocal(RED_LETTER_KEY, on ? "1" : "0");
  } catch {
    // the choice just won't outlive this visit
  }
  window.dispatchEvent(new Event(RED_LETTER_CHANGED));
}

/**
 * The books that have any.
 *
 * The Gospels and Acts, and the four places outside them where an epistle
 * quotes him: the institution of the Supper, "my grace is sufficient for
 * thee", "the labourer is worthy of his reward", and the Revelation. Named
 * here rather than discovered, so that opening Leviticus does not cost a
 * request that can only ever 404.
 */
const RED_BOOKS = new Set([40, 41, 42, 43, 44, 46, 47, 54, 66]);

const books = new Map<number, Promise<RedRuns | null>>();

/** Christ's words in one book, or null where there are none to mark. */
export function fetchRedLetter(bookNr: number): Promise<RedRuns | null> {
  if (!RED_BOOKS.has(bookNr)) return Promise.resolve(null);
  let hit = books.get(bookNr);
  if (!hit) {
    hit = fetch(`/redletter/${bookNr}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<RedRuns>) : null))
      // Offline, or the file never shipped: the chapter reads in black, which
      // is what every Bible printed before 1899 did.
      .catch(() => null);
    books.set(bookNr, hit);
  }
  return hit;
}

/** The word indices Christ speaks in one verse, or null if he speaks none. */
export function redWordsOf(
  runs: RedRuns | null,
  ch: number,
  verse: number
): Set<number> | null {
  const spans = runs?.[`${ch}:${verse}`];
  if (!spans || spans.length === 0) return null;
  const out = new Set<number>();
  for (const [a, b] of spans) for (let i = a; i <= b; i++) out.add(i);
  return out;
}

/**
 * Where the reader is up to in the verse.
 *
 * Study mode hands the verse over in pieces — a phrase at a time, each one its
 * own tap target — so the count of words has to survive between calls. One of
 * these is made per verse and passed through every piece of it.
 *
 * `open` is why this is not just a number. The pieces do not fall on word
 * boundaries: study mode tags "voice" and hands the comma after it over
 * separately, and counting each piece on its own would make "voice," into two
 * words where the verse has one, putting every index after it out by one and
 * every red letter in the wrong place. So the cursor remembers whether the
 * last thing it set ended mid-word, and carries the word on if it did.
 */
export interface RedCursor {
  word: number;
  /** true when the previous piece ended on a non-space — the word runs on */
  open?: boolean;
}

/**
 * Set a piece of a verse, red where Christ is speaking.
 *
 * Returns the text unchanged when nothing in it is his, which is almost every
 * verse in the Bible and every verse at all when the setting is off. That
 * matters: this runs for every verse on screen on every render, and a string
 * costs nothing where an array of elements costs a reconciliation.
 */
export function paintRed(
  text: string,
  red: Set<number> | null,
  cursor: RedCursor
): ReactNode {
  const chunks = text.match(/\s+|\S+/g) ?? [];

  if (!red) {
    // still count the words — a later piece of the same verse may be his
    for (const chunk of chunks) {
      if (/^\s/.test(chunk)) cursor.open = false;
      else if (!cursor.open) {
        cursor.word++;
        cursor.open = true;
      }
    }
    return text;
  }

  // Each word, and the space in front of it, tagged with whose it is. Space
  // between two red words is red as well, so a speech is one unbroken colour
  // rather than a row of separately tinted words.
  const parts: { text: string; red: boolean }[] = [];
  let any = false;
  for (const chunk of chunks) {
    if (/^\s/.test(chunk)) {
      cursor.open = false;
      parts.push({ text: chunk, red: false });
      continue;
    }
    if (!cursor.open) {
      cursor.word++;
      cursor.open = true;
    }
    const mine = red.has(cursor.word - 1);
    if (mine) any = true;
    parts.push({ text: chunk, red: mine });
  }
  if (!any) return text;

  for (let i = 1; i < parts.length - 1; i++) {
    if (/^\s/.test(parts[i].text) && parts[i - 1].red && parts[i + 1].red) {
      parts[i].red = true;
    }
  }

  // merge the runs, so one speech is one element
  const runs: { text: string; red: boolean }[] = [];
  for (const part of parts) {
    const last = runs[runs.length - 1];
    if (last && last.red === part.red) last.text += part.text;
    else runs.push({ ...part });
  }

  return runs.map((run, i) =>
    run.red ? (
      <span key={i} className="wj">
        {run.text}
      </span>
    ) : (
      <Fragment key={i}>{run.text}</Fragment>
    )
  );
}
