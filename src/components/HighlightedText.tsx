"use client";

// Mark a phrase inside a verse without touching the verse.
//
// The concordance stores, beside each reference, the King James rendering of
// the original-language word in that verse — "of Abraham", "brethren". Shown
// against the full verse it is what the eye is looking for, so it is worth
// marking. Across all 216,153 King James rows the clip appears verbatim in
// 98.7% of verses, and a fold that leaves every character in place (curly
// quotes, the dash family, case) carries that to 99.4%. The rest render
// unmarked, which nobody notices.
//
// Length-preserving is the whole trick: it means an offset found in the
// folded string is the same offset in the real one, so the text that gets
// marked is the text that was there. Anything that changes length — ae → e,
// stripping punctuation, NFD, a locale casefold — would slide the marks off
// their words, sometimes into the middle of the next one.

import type { ReactNode } from "react";
import { matchesUsage } from "@/lib/usage";

/** Only ever used for matching. Every replacement is one character for one. */
export function foldForMatch(s: string): string {
  return (
    s
      .replace(/[‘’ʼ]/g, "'")
      // escaped, not pasted: written as literal glyphs this is a range whose
      // endpoints are invisible, and reordering it throws at parse time
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .toLowerCase()
  );
}

const WORDISH = /[0-9A-Za-z]/;

export default function HighlightedText({
  text,
  needle,
  words,
}: {
  text: string;
  /** the exact King James clip for this verse, where one is recorded */
  needle?: string;
  /** or, where none is, the English renderings this word is marked by */
  words?: string[];
}) {
  if (words && words.length > 0) return <WordMarks text={text} words={words} />;
  const wanted = (needle ?? "").trim();
  if (!wanted) return <>{text}</>;
  const hay = foldForMatch(text);
  const pin = foldForMatch(wanted);
  // a backstop, not a formality: if a fold ever stops being length-preserving
  // every offset below is wrong, and rendering the verse plain is the right
  // way to be wrong
  if (hay.length !== text.length || pin.length !== wanted.length) {
    return <>{text}</>;
  }

  // Whole words first, so the clip "man" does not light up "manner". Clips
  // like "us: it was a chance" start or end mid-token, so fall back to any
  // match rather than give up.
  const collect = (wholeWords: boolean) => {
    const hits: number[] = [];
    for (
      let i = hay.indexOf(pin);
      i !== -1;
      i = hay.indexOf(pin, i + pin.length)
    ) {
      const before = i === 0 || !WORDISH.test(hay[i - 1]);
      const after =
        i + pin.length >= hay.length || !WORDISH.test(hay[i + pin.length]);
      if (!wholeWords || (before && after)) hits.push(i);
    }
    return hits;
  };
  // one row in twenty carries the clip more than once and the data does not
  // say which one was meant, so mark them all
  const whole = collect(true);
  const hits = whole.length > 0 ? whole : collect(false);
  if (hits.length === 0) return <>{text}</>;

  const out: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((at, i) => {
    if (at < cursor) return;
    if (at > cursor) out.push(text.slice(cursor, at));
    out.push(<mark key={i}>{text.slice(at, at + pin.length)}</mark>);
    cursor = at + pin.length;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

/**
 * Mark whole words, rather than one known phrase.
 *
 * Used where there is no recorded clip to look for — the Septuagint list — and
 * the question is instead "does the King James reach for one of this word's
 * English renderings here?". Every word of the verse is tested, so more than
 * one can be marked, which is right: a verse that says "healed" and "healing"
 * is saying the word twice.
 */
function WordMarks({ text, words }: { text: string; words: string[] }) {
  const hay = foldForMatch(text);
  if (hay.length !== text.length) return <>{text}</>;

  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  // apostrophes stay inside the token so "healeth's" is one word, not two
  for (const hit of hay.matchAll(/[0-9a-z']+/g)) {
    const at = hit.index;
    if (at === undefined || !matchesUsage(hit[0], words)) continue;
    const end = at + hit[0].length;
    if (at > cursor) out.push(text.slice(cursor, at));
    out.push(<mark key={key++}>{text.slice(at, end)}</mark>);
    cursor = end;
  }
  if (cursor === 0) return <>{text}</>;
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
