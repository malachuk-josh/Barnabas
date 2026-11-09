// The web fonts behind the typeface choice for Scripture in The Word.
//
// Five, beside the app's own book face, and each chosen to be unlike the
// others: an old-style face from the history of printed books, one drawn for
// reading books on screens, and three hand-made ones for the Parchment theme —
// brushed letters in the manner of Papyrus, a broad-nib calligraphic hand, and
// hand-carved medieval letters. All are under the SIL Open Font License.
//
// The last two were picked from screenshots of The Word on Parchment, over
// IM Fell English and Uncial Antiqua, and took the places of Merriweather and
// Atkinson Hyperlegible.
//
// Papyrus itself was asked for and is not here because it cannot be: it is a
// commercial Monotype face, and serving it from the app would need a paid web
// licence. Kurale was chosen from twenty-odd free faces as the nearest in
// spirit — flared, brushed strokes — that still reads easily for a chapter.
//
// Through next/font, so they are served from the app itself rather than from
// Google: the build fetches them once, and they come with the rest of the
// app's files — cached by the service worker, and readable offline once they
// have been seen. None is preloaded. A face's file is only fetched when text
// is set in it, which is when somebody picks it or opens the picker.
//
// Regular weight only, and upright only. Boldness in The Word is drawn as an
// outline in the letters' own colour (see strokeOf in lib/readingText), so a
// heavier setting needs no heavier file, and nothing in the text is italic.

import {
  EB_Garamond,
  Fondamento,
  Kurale,
  Literata,
  MedievalSharp,
} from "next/font/google";
import type { Face } from "@/lib/readingText";

const garamond = EB_Garamond({ weight: "400", subsets: ["latin"], display: "swap", preload: false });
const literata = Literata({ weight: "400", subsets: ["latin"], display: "swap", preload: false });
const kurale = Kurale({ weight: "400", subsets: ["latin"], display: "swap", preload: false });
const fondamento = Fondamento({ weight: "400", subsets: ["latin"], display: "swap", preload: false });
const medieval = MedievalSharp({ weight: "400", subsets: ["latin"], display: "swap", preload: false });

type WebFace = Exclude<Face, "default">;

const FAMILY: Record<WebFace, string> = {
  garamond: garamond.style.fontFamily,
  literata: literata.style.fontFamily,
  kurale: kurale.style.fontFamily,
  fondamento: fondamento.style.fontFamily,
  medieval: medieval.style.fontFamily,
};

/** What each is called on its tile: its published name, shortened where long. */
export const FACE_NAMES: Record<WebFace, string> = {
  garamond: "Garamond",
  literata: "Literata",
  kurale: "Kurale",
  fondamento: "Fondamento",
  medieval: "Medieval",
};

/**
 * The font-family for a face, or undefined for the app's own, which is what
 * the page already says. If the file cannot be had — offline, before it was
 * ever fetched — the text falls back to the app's own book face.
 */
export function faceStack(face: Face): string | undefined {
  if (face === "default") return undefined;
  return `${FAMILY[face]}, var(--serif)`;
}

/**
 * Settles once a face can be drawn with: loaded, failed, or three seconds
 * gone. The Word waits for this before switching, so the column is laid out
 * again once, with the reader's place held, rather than reflowing under them
 * whenever the file happens to arrive.
 */
export function faceReady(face: Face): Promise<void> {
  if (face === "default" || typeof document === "undefined" || !document.fonts) {
    return Promise.resolve();
  }
  return Promise.race([
    document.fonts.load(`1em ${FAMILY[face]}`).then(
      () => undefined,
      () => undefined
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
}
