// What a bookmark points at.
//
// A bookmark used to be one verse, stored as "book:chapter:verse". It can now
// be a run of them — "book:chapter:verse-last" — because the thing worth
// keeping is often a sentence rather than a verse, and Philippians 3:13 stops
// mid-thought without 14.
//
// The old form is still the form: a single verse writes no range, so every
// bookmark made before this reads back unchanged and nothing had to be
// migrated. Everything that takes a bookmark key apart goes through here, so
// there is one place that knows a key can have a tail.
//
// Runs stay inside one chapter. A range that crossed a chapter boundary would
// have to carry two chapter numbers and answer what it means to bookmark the
// end of one chapter and the start of the next, and no printed reference works
// that way either.

export interface BmRef {
  b: number;
  c: number;
  /** first verse */
  v: number;
  /** last verse — equal to `v` for the single-verse case */
  end: number;
}

/** Matches both forms. The API routes validate with this too. */
export const BM_KEY = /^(\d{1,2}):(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/;

export function parseBmKey(key: string): BmRef | null {
  const m = BM_KEY.exec(key);
  if (!m) return null;
  const [b, c, v] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const end = m[4] === undefined ? v : Number(m[4]);
  // a range that runs backwards, or one written as "13-13", is not a range
  if (end < v) return null;
  return { b, c, v, end };
}

export function bmKeyOf(b: number, c: number, v: number, end = v): string {
  return end > v ? `${b}:${c}:${v}-${end}` : `${b}:${c}:${v}`;
}

/** Whether this bookmark takes in a given verse. */
export function bmCovers(ref: BmRef, c: number, v: number): boolean {
  return ref.c === c && v >= ref.v && v <= ref.end;
}

/** Every verse the bookmark holds, in order. */
export function bmVerses(ref: BmRef): number[] {
  const out: number[] = [];
  for (let v = ref.v; v <= ref.end; v++) out.push(v);
  return out;
}

/** "Philippians 3:13–14", or "Philippians 3:13" when it is only the one. */
export function bmRefLabel(bookName: string, ref: BmRef): string {
  return `${bookName} ${ref.c}:${ref.v}${ref.end > ref.v ? `–${ref.end}` : ""}`;
}

/**
 * Which bookmark, if any, holds this verse.
 *
 * The reader asks this once per verse on screen, so it is given an index built
 * from the bookmark set rather than scanning it each time. Ranges are short and
 * the whole set is capped at 200, so the index is small enough to rebuild
 * whenever the bookmarks change.
 */
export function bmIndex(keys: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const key of keys) {
    const ref = parseBmKey(key);
    if (!ref) continue;
    for (const v of bmVerses(ref)) {
      // a verse inside two bookmarks answers to the tighter one, so that
      // removing a range does not silently unmark a verse kept on its own
      const at = `${ref.b}:${ref.c}:${v}`;
      const held = index.get(at);
      if (!held || span(key) < span(held)) index.set(at, key);
    }
  }
  return index;
}

function span(key: string): number {
  const ref = parseBmKey(key);
  return ref ? ref.end - ref.v : 0;
}
