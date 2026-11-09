// Reading another translation word by word without pretending to know more
// than we do.
//
// Only the King James is tagged word by word in this app's own data. Nobody
// licenses a tagged ESV or NIV, so for every other translation the question is
// which original stands behind a given English word — and the honest answer is
// that for some words we can know and for others we cannot.
//
// The evidence comes from the Berean Standard Bible, which publishes a modern
// English translation tagged word by word. Two things are taken from it:
//
//   the verse    the Berean's own rendering of this verse, phrase by phrase,
//                each phrase carrying the original behind it. Another modern
//                translation of the same verse mostly chooses the same words
//                in the same order, so a match here is a match against a real
//                rendering rather than a guess at one.
//
//   the vocabulary  every English stem the Berean ever uses for a given
//                original, anywhere in the Bible. This catches the word this
//                translation chose that the Berean did not choose here but
//                does use elsewhere.
//
// What it will not do is fill the gaps. An earlier version of this file spread
// the unmatched words proportionally between the matched ones; measured
// against the Berean's own tagging that was right 41.6% of the time, which is
// to say the app was confidently wrong about nearly half the words a reader
// might tap. A word with no evidence behind it is now left alone: not
// underlined, not tappable. Silence is the only honest thing to render.

export type Nums = string[] | null;
/** A tagged phrase from the Berean: what it says, and what stands behind it. */
export type GlossEntry = [string | null, string];
/** Which English stems an original is ever rendered with. */
export type GlossVocab = Record<string, string[]>;
/** A word of the verse: its text, the original behind it, and how sure we are. */
export type AlignedToken = [string, Nums, boolean];

/**
 * Words that are never underlined.
 *
 * Closed-class words — articles, conjunctions, auxiliaries, prepositions —
 * are where two translations differ most freely: one puts "the" where another
 * puts nothing, one says "shall" where another says "will". Measured against
 * the app's own King James tagging, including them dropped the accuracy of
 * every underlined word from 92% to 78%. They are also the words nobody taps:
 * a reader pressing "the" is not hoping for a Hebrew object marker.
 */
const FUNCTION = new Set([
  "the", "and", "but", "for", "with", "from", "that", "this", "which", "who",
  "whom", "was", "were", "are", "is", "be", "been", "have", "has", "had",
  "not", "nor", "all", "any", "his", "her", "their", "its", "them", "him",
  "you", "your", "our", "out", "upon", "unto", "into", "shall", "will", "may",
  "can", "did", "doth", "when", "then", "than", "there", "here", "also",
  "yet", "even", "how", "why", "let", "one", "two", "made", "make", "say",
  "said", "saith", "come", "came", "went", "now", "own", "before", "after",
  "over", "under", "among", "because", "therefore", "behold", "thus", "these",
  "those", "what", "some", "every", "against",
]);

/**
 * Whether this word is worth claiming an original for at all.
 *
 * Three letters, not four: "God", "Son", "law", "sin", "joy" are exactly the
 * words a reader reaches for, and a length rule that drops them to be rid of
 * "the" is the wrong rule. The list above does that job by name.
 */
function worthClaiming(word: string): boolean {
  const s = stem(word);
  return s.length >= 3 && !FUNCTION.has(s);
}

/** A word reduced to something two translations might spell the same way. */
export function stem(word: string): string {
  const bare = word.toLowerCase().replace(/[^a-z]/g, "");
  if (bare.length <= 3) return bare;
  for (const suffix of ["eth", "est", "ings", "ing", "edst", "ed", "es", "s"]) {
    if (bare.endsWith(suffix) && bare.length - suffix.length >= 3) {
      return bare.slice(0, bare.length - suffix.length);
    }
  }
  return bare;
}

/**
 * Split a verse into tokens that put back together into exactly the verse.
 *
 * Each token carries whatever space ran up to its word, the same shape the
 * tagged King James is stored in, so one renderer draws both.
 */
export function tokenize(text: string): { raw: string; word: string }[] {
  const out: { raw: string; word: string }[] = [];
  let pending = "";
  for (const part of text.split(/(\s+)/)) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      pending += part;
      continue;
    }
    out.push({ raw: pending + part, word: part });
    pending = "";
  }
  if (pending && out.length > 0) out[out.length - 1].raw += pending;
  else if (pending) out.push({ raw: pending, word: "" });
  return out;
}

/** One candidate placing of a word, and how good the reason for it was. */
interface Candidate {
  /** which entry of the verse's gloss */
  to: number;
  /** 2 = the Berean used this very word here, 1 = it uses it for this original */
  weight: number;
}

/**
 * Line a verse of some translation up against the Berean's tagging of it.
 *
 * Every token of `text` comes back. Those the evidence reaches carry the
 * original behind them; the rest carry null and are meant to be rendered as
 * plain text. The boolean is true when the Berean used that very word for that
 * original in this very verse — the strongest thing we can say.
 */
export function alignVerse(
  text: string,
  gloss: GlossEntry[],
  vocab: GlossVocab
): AlignedToken[] {
  const target = tokenize(text);
  if (target.length === 0) return [];
  if (!gloss || gloss.length === 0) {
    return target.map((t) => [t.raw, null, false] as AlignedToken);
  }

  // What the Berean says here, stem by stem, and what stands behind each.
  const hereStems = gloss.map(
    (entry) =>
      new Set(
        tokenize(entry[1])
          .map((t) => stem(t.word))
          .filter((s) => s.length >= 3)
      )
  );

  // ---- candidates: every entry a word could belong to, with a reason -------
  const options: Candidate[][] = target.map((token) => {
    if (!worthClaiming(token.word)) return [];
    const want = stem(token.word);
    const found: Candidate[] = [];
    gloss.forEach((entry, k) => {
      if (!entry[0]) return;
      if (hereStems[k].has(want)) {
        found.push({ to: k, weight: 2 });
        return;
      }
      if (vocab[entry[0]]?.includes(want)) found.push({ to: k, weight: 1 });
    });
    return found;
  });

  // ---- choose: the best set that keeps the verse in order -------------------
  // Two translations of one verse run in the same direction, so a word cannot
  // belong to an original that an earlier word has already passed. This is the
  // longest — heaviest — increasing run through the candidates, by the usual
  // dynamic programme rather than by taking each word's best guess alone,
  // because a single greedy match early can cost several later ones.
  const n = target.length;
  const best: { score: number; to: number; weight: number; prev: number }[] = [];
  for (let i = 0; i < n; i++) {
    best.push({ score: 0, to: -1, weight: 0, prev: -1 });
  }
  let bestEnd = -1;
  let bestScore = 0;
  for (let i = 0; i < n; i++) {
    for (const option of options[i]) {
      let score = option.weight;
      let prev = -1;
      for (let j = 0; j < i; j++) {
        const b = best[j];
        if (b.to >= 0 && b.to <= option.to && b.score + option.weight > score) {
          score = b.score + option.weight;
          prev = j;
        }
      }
      if (score > best[i].score) {
        best[i] = { score, to: option.to, weight: option.weight, prev };
      }
    }
    if (best[i].score > bestScore) {
      bestScore = best[i].score;
      bestEnd = i;
    }
  }

  const chosen = new Map<number, { to: number; weight: number }>();
  for (let i = bestEnd; i >= 0; i = best[i].prev) {
    if (best[i].to < 0) break;
    chosen.set(i, { to: best[i].to, weight: best[i].weight });
    if (best[i].prev < 0) break;
  }

  return target.map((token, i) => {
    const pick = chosen.get(i);
    if (!pick) return [token.raw, null, false] as AlignedToken;
    const num = gloss[pick.to][0];
    if (!num) return [token.raw, null, false] as AlignedToken;
    return [token.raw, [num], pick.weight === 2] as AlignedToken;
  });
}

/** The King James is tagged already; its tokens only need the same shape. */
export function kjvTokens(tokens: [string, Nums][]): AlignedToken[] {
  return tokens.map(([text, nums]) => [text, nums, true] as AlignedToken);
}
