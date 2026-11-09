// How Scripture is set in The Word: its size, and how heavy its letters are.
//
// Both are kept on the device, like the theme — they are about how a page
// looks on this screen, not about the reader — and both are set in two
// places: the size by pinching the text in The Word or with the slider in
// Settings, the weight in Settings alone. Read and written here so the two
// places cannot disagree about the limits or the key.

import { readLocal, writeLocal } from "@/lib/storage";

export const PT_MIN = 10;
export const PT_MAX = 30;
export const PT_DEFAULT = 14;

/** Regular, then four steps heavier. */
export const WEIGHT_MAX = 4;

/**
 * Semibold, the middle step, until a reader chooses otherwise. Anyone who has
 * moved the slider keeps where they left it, Regular included: only a device
 * with nothing saved takes the default.
 */
export const WEIGHT_DEFAULT = 2;

const PT_KEY = "barnabas.word.textPt";
const WEIGHT_KEY = "barnabas.word.textWeight";
const FACE_KEY = "barnabas.word.textFace";

/**
 * The typefaces Scripture can be set in. The first is the app's own book face
 * (--serif), drawn from the fonts the device already has, and stays the
 * default; the other five are web fonts, loaded only when somebody picks or
 * previews one. See lib/typefaces for the fonts themselves.
 */
export const FACES = [
  "default",
  "garamond",
  "literata",
  "kurale",
  "fondamento",
  "medieval",
] as const;
export type Face = (typeof FACES)[number];

/** The saved size in points, or the default. */
export function readTextPt(): number {
  const saved = Number(readLocal(PT_KEY));
  if (saved >= PT_MIN && saved <= PT_MAX) return saved;
  // carried over from when this was a multiplier: 1.0 was the default, so the
  // same reader lands on the same default point size
  const old = Number(readLocal("barnabas.word.textScale"));
  if (old > 0) {
    const migrated = Math.min(PT_MAX, Math.max(PT_MIN, Math.round(old * PT_DEFAULT)));
    writeLocal(PT_KEY, String(migrated));
    return migrated;
  }
  return PT_DEFAULT;
}

export function writeTextPt(pt: number): void {
  writeLocal(PT_KEY, String(Math.min(PT_MAX, Math.max(PT_MIN, Math.round(pt)))));
}

export function readTextWeight(): number {
  // nothing saved reads as the default, not as Number(null), which is 0
  const raw = readLocal(WEIGHT_KEY);
  const saved = raw === null || raw === "" ? NaN : Number(raw);
  return Number.isInteger(saved) && saved >= 0 && saved <= WEIGHT_MAX
    ? saved
    : WEIGHT_DEFAULT;
}

export function writeTextWeight(level: number): void {
  writeLocal(WEIGHT_KEY, String(Math.min(WEIGHT_MAX, Math.max(0, Math.round(level)))));
}

export function readTextFace(): Face {
  const saved = readLocal(FACE_KEY);
  return (FACES as readonly string[]).includes(saved ?? "") ? (saved as Face) : "default";
}

export function writeTextFace(face: Face): void {
  writeLocal(FACE_KEY, face);
}

/**
 * How much heavier each step makes the letters, as an outline drawn round
 * them in their own colour.
 *
 * Not font-weight. The serifs this app reads in — Iowan Old Style, Palatino,
 * Georgia — come in a regular and a bold and little between, so a weight
 * between the two snaps to one or the other and a slider would do nothing for
 * half its travel and then jump. An outline thickens every letter by exactly
 * as much as it is asked to, in any typeface, and since it takes the letter's
 * own colour the red letters stay red. In ems, so a heavier setting stays the
 * same heaviness whatever size the text is.
 */
export function strokeOf(level: number): string | undefined {
  return level > 0 ? `${(level * 0.011).toFixed(3)}em` : undefined;
}
