"use client";
import { readLocal, writeLocal } from "@/lib/storage";

// Where the reader has been sent, as opposed to where they have scrolled.
//
// Only deliberate jumps are recorded — picking a verse in the navigator, or
// following a cross-reference. Scrolling is not a place you went, it is
// reading, and a history that filled up with it would be no use for getting
// back to the passage a cross-reference took you away from.

const KEY = "barnabas.word.history";
/** Ten is what fits under a heading without the navigator becoming a list. */
export const HISTORY_MAX = 10;

export interface Visit {
  b: number;
  c: number;
  v: number;
  /** when it was visited, so the list can be ordered without trusting order */
  ts: number;
}

export function readHistory(): Visit[] {
  try {
    const raw = JSON.parse(readLocal(KEY) ?? "[]") as Visit[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x) => x && x.b > 0 && x.c > 0 && x.v > 0)
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

/**
 * Record a jump. The same address twice running is one visit, moved back to
 * the front rather than repeated — a history of the same verse ten times
 * tells you nothing, and following a cross-reference back and forth is a
 * normal way to read.
 */
export function pushVisit(b: number, c: number, v: number): void {
  if (!(b > 0 && c > 0 && v > 0)) return;
  try {
    const next = [
      { b, c, v, ts: Date.now() },
      ...readHistory().filter((x) => !(x.b === b && x.c === c && x.v === v)),
    ].slice(0, HISTORY_MAX);
    writeLocal(KEY, JSON.stringify(next));
  } catch {
    // storage full, or blocked — a lost history is not worth an error
  }
}
