/**
 * The people scrubber: everything shared with another church goes through here, in code. It removes
 * email addresses, phone numbers, street addresses, @handles, links' query strings, and every name the
 * church knows (its directory, leaders, volunteers, guests, care subjects, children and their guardians,
 * event registrants). First names alone are removed too, except words that are also scripture, virtues or
 * common words ("James", "Grace", "Hope"), so "a series on James" survives; those are still removed in the
 * possessive ("Sarah's group"), where they almost always mean a person. The share screen shows the result.
 */

export type Removed = { kind: "email" | "phone" | "address" | "handle" | "name" | "link"; count: number };
export type ScrubResult = { text: string; removed: Removed[]; total: number };

/** Words that are names of people but also books, figures or virtues the church talks about. */
export const KEEP_WORDS = new Set(
  [
    "james", "john", "mark", "luke", "matthew", "paul", "peter", "timothy", "titus", "jude", "ruth", "esther", "job", "daniel", "joel", "amos", "jonah", "micah", "nahum",
    "isaiah", "jeremiah", "ezekiel", "hosea", "obadiah", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi", "samuel", "joshua", "moses", "david", "abraham",
    "sarah", "mary", "martha", "joseph", "noah", "adam", "eve", "jesus", "christ", "stephen", "philip", "andrew", "thomas", "barnabas", "silas", "lydia", "priscilla",
    "aquila", "nehemiah", "ezra", "solomon", "elijah", "elisha", "deborah", "hannah", "naomi", "rebekah", "rachel", "leah", "isaac", "jacob", "aaron", "miriam", "gideon",
    "grace", "hope", "faith", "joy", "mercy", "charity", "patience", "glory", "trinity", "christian", "angel", "dawn", "summer", "autumn", "april", "may", "june", "august",
    "will", "bill", "rose", "lily", "ivy", "holly", "eden", "zion", "jordan", "sharon", "carmel", "bethany", "chase", "hunter", "faith", "page", "wade", "art", "ray", "pat",
  ],
);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const ADDRESS = /\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct|Way|Boulevard|Blvd|Place|Pl|Circle|Cir|Terrace|Ter)\b\.?/g;
const HANDLE = /(^|\s)@[A-Za-z0-9_]{2,30}\b/g;
const QUERY = /(https?:\/\/[^\s?#]+)[?#][^\s]*/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Full names and distinctive first and last names, longest first so "Ana López" goes before "Ana". */
export function nameTerms(names: string[]): string[] {
  const terms = new Set<string>();
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (name.length < 3) continue;
    terms.add(name);
    for (const part of name.split(" ")) {
      const p = part.replace(/[^\p{L}'-]/gu, "");
      if (p.length >= 3 && !KEEP_WORDS.has(p.toLowerCase())) terms.add(p);
    }
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

export function scrubText(input: string, names: string[]): ScrubResult {
  const counts: Record<Removed["kind"], number> = { email: 0, phone: 0, address: 0, handle: 0, name: 0, link: 0 };
  let text = input;
  text = text.replace(EMAIL, () => (counts.email++, "[email removed]"));
  text = text.replace(PHONE, () => (counts.phone++, "[phone removed]"));
  text = text.replace(ADDRESS, () => (counts.address++, "[address removed]"));
  text = text.replace(HANDLE, (_m, pre) => (counts.handle++, `${pre}[handle removed]`));
  text = text.replace(QUERY, (_m, base) => (counts.link++, base));
  const terms = nameTerms(names);
  const keepFirst = new Set(names.map((n) => n.trim().split(/\s+/)[0]).filter((f) => KEEP_WORDS.has(f.toLowerCase())));
  for (const f of keepFirst) {
    text = text.replace(new RegExp(`(?<![\\p{L}])${escape(f)}'s(?![\\p{L}])`, "gu"), () => (counts.name++, "[name removed]'s"));
  }
  if (terms.length) {
    // Names match whole words, case-insensitively for full names and capitalized for single words.
    for (const t of terms) {
      const multi = t.includes(" ");
      const re = new RegExp(`(?<![\\p{L}])${escape(t)}(?:'s)?(?![\\p{L}])`, multi ? "giu" : "gu");
      text = text.replace(re, (m) => {
        if (!multi && m[0] !== m[0].toUpperCase()) return m;
        counts.name++;
        return "[name removed]";
      });
    }
  }
  text = text.replace(/(\[name removed\]\s*){2,}/g, "[name removed] ");
  const removed = (Object.entries(counts) as [Removed["kind"], number][]).filter(([, n]) => n > 0).map(([kind, count]) => ({ kind, count }));
  return { text, removed, total: removed.reduce((a, r) => a + r.count, 0) };
}
