/** Safe to import from the browser: no server dependencies. */

/** Translations Barnabas can quote from. The King James Version is the default for everyone. */
export const BIBLE_TRANSLATIONS = {
  kjv: "King James Version (KJV)",
  nkjv: "New King James Version (NKJV)",
  esv: "English Standard Version (ESV)",
  nasb: "New American Standard Bible (NASB)",
  csb: "Christian Standard Bible (CSB)",
  niv: "New International Version (NIV)",
  nlt: "New Living Translation (NLT)",
} as const;
export type BibleTranslation = keyof typeof BIBLE_TRANSLATIONS;
export const BIBLE_TRANSLATION_IDS = Object.keys(BIBLE_TRANSLATIONS) as [BibleTranslation, ...BibleTranslation[]];
export const DEFAULT_BIBLE_TRANSLATION: BibleTranslation = "kjv";
