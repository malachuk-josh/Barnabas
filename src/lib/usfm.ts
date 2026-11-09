// Book numbers, as this app counts them, to the three-letter codes the wider
// world addresses scripture by.
//
// Communion numbers books 1–66 in canonical order, which is its own business.
// API.Bible asks for a chapter as "JHN.3", and that code is USFM's, which
// nearly every scripture API and file format has settled on. One table, kept
// where the adapter that needs it can find it and nowhere else.

const USFM = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
  "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
  "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
  "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
  "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
  "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

/** The USFM code for a book number, or "" if there is no such book. */
export function usfmCode(bookNr: number): string {
  return USFM[bookNr - 1] ?? "";
}
