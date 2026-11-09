/**
 * Barnabas's biblical vocabulary, in one place. What leaders read (labels, headings, toasts, reminders,
 * reports) and what Barnabas says uses these words, each grounded in a King James Version verse:
 *
 *   volunteer(s)        -> co-laborer(s)        1 Corinthians 3:9
 *   "check on"          -> encourage            1 Thessalonians 5:11
 *   burnout             -> weariness            Galatians 6:9
 *   Care (the area)     -> Shepherding          1 Peter 5:2
 *   case(s)             -> need(s)              1 Peter 5:2 (a need is noted, then met)
 *
 * Code identifiers, Redis keys, permission ids (care.view_all, ...), API paths and tool names keep
 * their old names; only the words people read change. Scripture is quoted word for word from the KJV.
 */

export type Verse = {
  /** The KJV text, word for word. */
  text: string;
  /** The reference, e.g. "1 Corinthians 3:9". */
  reference: string;
  /** A shorter quotation (the verse's first clause) for tight spaces, when the verse is long. */
  short?: string;
};

export const VERSES = {
  colaborers: { text: "For we are labourers together with God: ye are God's husbandry, ye are God's building.", reference: "1 Corinthians 3:9" },
  encourage: { text: "Wherefore comfort yourselves together, and edify one another, even as also ye do.", reference: "1 Thessalonians 5:11" },
  weariness: { text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", reference: "Galatians 6:9" },
  shepherding: {
    text: "Feed the flock of God which is among you, taking the oversight thereof, not by constraint, but willingly; not for filthy lucre, but of a ready mind;",
    short: "Feed the flock of God which is among you",
    reference: "1 Peter 5:2",
  },
  /** Online giving: the give form and thank-you drafts. */
  giving: {
    text: "Every man according as he purposeth in his heart, so let him give; not grudgingly, or of necessity: for God loveth a cheerful giver.",
    short: "God loveth a cheerful giver.",
    reference: "2 Corinthians 9:7",
  },
  /** The Journal: its empty state. */
  journal: {
    text: "And the LORD answered me, and said, Write the vision, and make it plain upon tables, that he may run that readeth it.",
    short: "Write the vision, and make it plain upon tables",
    reference: "Habakkuk 2:2",
  },
} as const satisfies Record<string, Verse>;

export type VerseKey = keyof typeof VERSES;

/** The terms. `one`/`many` are lowercase; `One`/`Many` start a sentence or a label. */
export const TERMS = {
  /** In place of "volunteer". */
  colaborer: { one: "co-laborer", many: "co-laborers", One: "Co-laborer", Many: "Co-laborers", verse: "colaborers" },
  /** In place of "check on" (a person). */
  encourage: { one: "encourage", many: "encourage", One: "Encourage", Many: "Encourage", verse: "encourage" },
  /** In place of "burnout". */
  weariness: { one: "weariness", many: "weariness", One: "Weariness", Many: "Weariness", verse: "weariness" },
  /** The radar that watches for weariness (once the "burnout radar"). */
  wearinessWatch: { one: "weariness watch", many: "weariness watch", One: "Weariness watch", Many: "Weariness watch", verse: "weariness" },
  /** In place of "Care" as the area's name ("Care", "care team"). */
  shepherding: { one: "shepherding", many: "shepherding", One: "Shepherding", Many: "Shepherding", verse: "shepherding" },
  /** In place of "case": one person or situation being cared for. A need is noted, then met (not opened and closed). */
  shepherdingCase: { one: "need", many: "needs", One: "Need", Many: "Needs", verse: "shepherding" },
  shepherdingTeam: { one: "shepherding team", many: "shepherding teams", One: "Shepherding team", Many: "Shepherding teams", verse: "shepherding" },
} as const satisfies Record<string, { one: string; many: string; One: string; Many: string; verse: VerseKey }>;

export type TermKey = keyof typeof TERMS;

/** "1 co-laborer", "3 co-laborers". */
export function count(n: number, term: TermKey): string {
  const t = TERMS[term];
  return `${n} ${n === 1 ? t.one : t.many}`;
}

/** The term's verse. */
export function verseFor(term: TermKey): Verse {
  return VERSES[TERMS[term].verse];
}

/** A verse as one line: “text” (Reference, KJV). */
export function quote(key: VerseKey, opts: { short?: boolean } = {}): string {
  const v: Verse = VERSES[key];
  const text = opts.short && v.short ? v.short : v.text;
  return `“${text}” (${v.reference}, KJV)`;
}

/** The Shepherding area's path (the old /care paths redirect here). */
export const SHEPHERDING_PATH = "/shepherding";

/** Words Barnabas uses, for its system prompt. */
export const LANGUAGE_NOTE = `Words: the church calls the people who serve "${TERMS.colaborer.many}" (${VERSES.colaborers.reference}), never volunteers; you "${TERMS.encourage.one}" them rather than check on them (${VERSES.encourage.reference}); you speak of "${TERMS.weariness.one}" (${VERSES.weariness.reference}), never burnout; and pastoral care is "${TERMS.shepherding.one}" (${VERSES.shepherding.reference}): the people and situations being cared for are "${TERMS.shepherdingCase.many}", never cases (you note a ${TERMS.shepherdingCase.one} and, once care is complete, mark it met), held by the ${TERMS.shepherdingTeam.one} on the Shepherding page. Tool names keep their older words (get_volunteer_load, list_care_cases, ...); don't read them out.`;
