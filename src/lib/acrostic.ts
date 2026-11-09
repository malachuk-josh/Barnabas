// The alphabetic poems, and where their letters fall.
//
// A dozen passages in the Old Testament are acrostics: each line, or each
// stanza, opens with the next letter of the Hebrew alphabet. Printed Bibles
// mark them, and without the mark the shape is invisible — Psalm 119 reads as
// one undifferentiated 176-verse block, and the reason Lamentations stops at
// twenty-two verses is a mystery.
//
// The letters themselves, not their names: "Aleph" is a transliteration of the
// mark, and it is the mark the poem is built on.
//
// Every entry here was read off the Hebrew rather than worked out by counting.
// That matters, because counting gets three things wrong. The Masoretic text
// numbers a psalm's superscription as part of verse 1 where the KJV prints it
// as a heading. Lamentations 2, 3 and 4 put pe before ayin, reversing the
// order every other passage keeps. And several of these poems are irregular in
// the text as it has come down: Psalm 145 has no nun line, Psalm 25 has no vav
// and no qoph and says resh twice, Psalm 34 and Psalm 25 both close on an extra
// pe outside the sequence. Those gaps are the poems', not ours, and they are
// left visible. scripts/check-acrostics.mjs re-reads the Hebrew and verifies
// every letter below still sits where this table says it does.

/** The alphabet, as nearly every acrostic runs it. */
const ORDER = "אבגדהוזחטיכלמנסעפצקרשת";
/** Lamentations 2, 3 and 4 put pe before ayin. Widely attested, not an error. */
const ORDER_PE_AYIN = "אבגדהוזחטיכלמנספעצקרשת";

export type AcrosticStyle =
  /** whole stanzas share a letter: it stands centred above them */
  | "stanza"
  /** a letter to a line: it sits with the verse number */
  | "verse";

interface Acrostic {
  style: AcrosticStyle;
  /** letters by verse — more than one where a verse carries more than one */
  letters: Record<number, string>;
}

/** Lay an alphabet across verses, one letter every `step` verses. */
function spread(from: number, step: number, order: string): Record<number, string> {
  const out: Record<number, string> = {};
  [...order].forEach((letter, i) => {
    out[from + i * step] = letter;
  });
  return out;
}

const ACROSTICS: Record<string, Acrostic> = {
  // Twenty-two stanzas of eight, the only acrostic of its size anywhere.
  "19:119": { style: "stanza", letters: spread(1, 8, ORDER) },

  // The centre of Lamentations, and the one true parallel to Psalm 119:
  // twenty-two stanzas of three, every line of a stanza on the same letter.
  "25:3": { style: "stanza", letters: spread(1, 3, ORDER_PE_AYIN) },

  // The other laments: a letter to a verse, twenty-two verses, which is why
  // they stop where they stop. The fifth chapter has twenty-two verses too and
  // is not an acrostic — a poem that has lost the ability to keep order.
  "25:1": { style: "verse", letters: spread(1, 1, ORDER) },
  "25:2": { style: "verse", letters: spread(1, 1, ORDER_PE_AYIN) },
  "25:4": { style: "verse", letters: spread(1, 1, ORDER_PE_AYIN) },

  // The woman of valour, an acrostic inside a chapter rather than as one.
  "20:31": { style: "verse", letters: spread(10, 1, ORDER) },

  // No vav, no qoph, resh twice, and a pe after the tav that closes it.
  "19:25": { style: "verse", letters: spread(1, 1, "אבגדהזחטיכלמנסעפצררשתפ") },

  // No vav, and the same extra pe at the end.
  "19:34": { style: "verse", letters: spread(1, 1, "אבגדהזחטיכלמנסעפצקרשתפ") },

  // The missing nun, between mem at 13 and samekh at 14. The Septuagint and a
  // Qumran manuscript both supply a line there; the Hebrew this app reads does
  // not, so nothing is marked where nothing is.
  "19:145": { style: "verse", letters: spread(1, 1, "אבגדהוזחטיכלמסעפצקרשת") },

  // Two verses to a letter, roughly — the roughness is the point. Twenty of
  // the twenty-two letters open a verse and are marked; ayin and tav fall
  // mid-verse in the received text and are left unmarked rather than guessed.
  "19:37": {
    style: "verse",
    letters: {
      1: "א", 3: "ב", 5: "ג", 7: "ד", 8: "ה", 10: "ו", 12: "ז", 14: "ח",
      16: "ט", 18: "י", 20: "כ", 21: "ל", 23: "מ", 25: "נ", 27: "ס",
      30: "פ", 32: "צ", 34: "ק", 35: "ר", 37: "ש",
    },
  },

  // Tighter than a verse: these two run a letter to each half-line, twenty-two
  // letters across ten verses, the last two verses carrying three apiece. The
  // halves are not separable in an English verse, so the verse is marked with
  // the letters it covers.
  "19:111": {
    style: "verse",
    letters: {
      1: "אב", 2: "גד", 3: "הו", 4: "זח", 5: "טי",
      6: "כל", 7: "מנ", 8: "סע", 9: "פצק", 10: "רשת",
    },
  },
  "19:112": {
    style: "verse",
    letters: {
      1: "אב", 2: "גד", 3: "הו", 4: "זח", 5: "טי",
      6: "כל", 7: "מנ", 8: "סע", 9: "פצק", 10: "רשת",
    },
  },
};

export interface AcrosticMark {
  style: AcrosticStyle;
  /** one letter, or the several a verse carries */
  letters: string[];
}

/** The letter or letters this verse opens, if it opens any. */
export function acrosticAt(
  bookNr: number,
  chapter: number,
  verse: number
): AcrosticMark | null {
  const poem = ACROSTICS[`${bookNr}:${chapter}`];
  const letters = poem?.letters[verse];
  if (!poem || !letters) return null;
  return { style: poem.style, letters: [...letters] };
}

/** Every passage marked, for the checker to walk. */
export function acrosticPassages(): {
  bookNr: number;
  chapter: number;
  style: AcrosticStyle;
  letters: Record<number, string>;
}[] {
  return Object.entries(ACROSTICS).map(([ref, poem]) => {
    const [bookNr, chapter] = ref.split(":").map(Number);
    return { bookNr, chapter, style: poem.style, letters: poem.letters };
  });
}
