// The English a Strong's number is rendered by, as a set of words to mark.
//
// The King James concordance stores, beside every New Testament reference, the
// exact words that verse used — so those verses can be marked precisely. The
// Septuagint list has no such thing: it says only that the Greek lemma occurs
// there, and the verse a reader is shown is the King James Old Testament,
// translated from the Hebrew rather than from the Greek.
//
// So the marking falls back to the lexicon's own usage line — "cure,
// heal(-ing)" — and marks a word where the King James happens to reach for one
// of the same ones. It agrees often enough to be worth having and misses
// quietly when the two translations parted ways, which is honest: nothing is
// marked that is not one of this word's English renderings.

/**
 * Words too syntactic to mark. Some are real renderings of real lemmas — οὐ
 * is "not" and nothing else — but marking them lights up half a verse and
 * points at grammar rather than at the word being studied. The list also
 * catches the fragments Strong's parenthetical shorthand leaves behind:
 * "like(-wise)" and "where(-soever)" break into "wise" and "soever".
 */
const TOO_COMMON = new Set([
  "the", "and", "that", "this", "these", "those", "with", "for", "from",
  "unto", "into", "upon", "but", "not", "nor", "yet", "also", "even", "then",
  "than", "when", "where", "which", "what", "who", "whom", "whose", "there",
  "here", "shall", "will", "would", "should", "have", "hath", "had", "has",
  "was", "were", "are", "been", "being", "his", "her", "him", "she", "they",
  "them", "their", "thou", "thee", "thy", "thine", "you", "your", "our",
  "out", "all", "any", "some", "such", "one", "own", "more", "most", "very",
  "ever", "never", "every", "wise", "soever", "ing", "self", "selves",
]);

/** Below this a word is only ever matched whole. See `matchesUsage`. */
export const STEM_MIN = 4;

/**
 * The distinct English words in a Strong's usage line.
 *
 * The line is shorthand — "hide (self), keep secret, secret(-ly)", where a
 * leading + or X marks a word supplied rather than translated — and it is not
 * parsed so much as mined: everything is reduced to a set of words, because a
 * set of words is all the marking needs. The suffix in "heal(-ing)" is thrown
 * away with the rest of the punctuation and recovered by the stem rule, which
 * has to exist anyway for "healed" and "healeth".
 */
export function usageWords(usage: string): string[] {
  const seen = new Set<string>();
  for (const raw of usage.split(/[^A-Za-z]+/)) {
    const word = raw.toLowerCase();
    if (word.length < 3 || TOO_COMMON.has(word)) continue;
    seen.add(word);
  }
  return [...seen];
}

/**
 * Whether a word from a verse is one of these renderings.
 *
 * Whole words always. Longer ones also match as stems, which is what carries
 * "heal" to "healing", "healed" and "health" — the last of these being how the
 * King James renders ἴασις in Proverbs, and the reason the rule is worth its
 * risk. Short words are held to an exact match: "sin" as a stem would take
 * "since", and "son" would take "song".
 */
export function matchesUsage(word: string, words: string[]): boolean {
  return words.some(
    (w) => word === w || (w.length >= STEM_MIN && word.startsWith(w))
  );
}
