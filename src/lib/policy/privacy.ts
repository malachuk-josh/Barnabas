/**
 * Memory policy enforced in code, before anything is written to a leader's memory
 * or to a care record. The model is told the same rules; this is the backstop.
 */

export type PolicyOptions = { allowSensitive: boolean };

const SECRET_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(password|passcode|passwd|pin(?: number| code)?|door code|gate code|alarm code|lock ?box code|combination)\b\s*(is|:|=)?\s*\S+/i, label: "passwords and codes" },
  { re: /\b\d{3}-\d{2}-\d{4}\b/, label: "Social Security numbers" },
  { re: /\b(?:\d[ -]?){13,19}\b/, label: "card or account numbers" },
  { re: /\b(routing|account) (number|no\.?|#)\s*[:=]?\s*\d{4,}/i, label: "bank account details" },
  { re: /\bsk-[A-Za-z0-9_-]{16,}/, label: "API keys" },
  { re: /\b(pick-?up|check-?in|security|claim) (code|tag|number)\b/i, label: "children's pickup codes" },
];

/**
 * Children's check-in records stay in Kids check-in, never in memory, whatever the church's policy:
 * a child together with allergies, medical or custody details, who may pick them up, or which room
 * they were checked into.
 */
const CHILD = "(kid|kids|child|children|son|daughter|toddler|infant|baby|boy|girl|grandson|granddaughter|niece|nephew|preschooler|kindergartner|\\d{1,2}[- ]?(year|yr)[- ]?old|age \\d{1,2})s?";
const CHILD_DETAIL = "(allerg\\w*|epi-?pen|inhaler|asthma|seizure\\w*|diabet\\w*|medical|medication|meds|diagnos\\w*|custody|authori[sz]ed pick-?ups?|picks? (him|her|them) up|pick-?up list|not allowed to pick|checked (into|out)|check-?in room|nursery room)";
const CHILD_PATTERNS: RegExp[] = [new RegExp(`\\b${CHILD}\\b[^.]{0,80}\\b${CHILD_DETAIL}`, "i"), new RegExp(`\\b${CHILD_DETAIL}\\b[^.]{0,80}\\b${CHILD}\\b`, "i")];

const HEALTH =
  /\b(allerg\w*|epi-?pen|diagnos\w*|cancer|chemo\w*|dementia|alzheimer\w*|hiv|std|pregnan\w*|miscarr\w*|mental illness|bipolar|schizophren\w*|depress\w*|anxiety disorder|ptsd|medication|prescription|rehab|overdos\w*|chronic|arthritis|lupus|fibromyalgia|migraines?|diabet\w*|multiple sclerosis|parkinson\w*|crohn'?s|colitis|epilep\w*|seizures?|heart condition|surgery|long covid|chronic pain|insomnia|tinnitus|hearing loss|vision loss)\b/i;

/** Whether a note mentions health. The leader's own health is remembered only with their spoken permission (engine/thorn.ts). */
export function mentionsHealth(text: string): boolean {
  return HEALTH.test(text);
}

/** Topics that need the church's written opt-in before Barnabas may remember them. */
const SENSITIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: HEALTH, label: "health details" },
  { re: /\b(counsel(?:ing|ed|or)?|therapy|therapist|confess\w*|confided)\b/i, label: "counseling content" },
  { re: /\b(divorc\w*|separat(?:ed|ion)|affair|infidelity|cheat(?:ed|ing) on|custody|restraining order|domestic (?:violence|abuse)|abus\w*)\b/i, label: "family conflict or abuse" },
  { re: /\b(addict\w*|alcoholi\w*|drunk|relapse\w*|porn\w*)\b/i, label: "addiction details" },
  { re: /\b(arrest\w*|jail|prison|probation|lawsuit|deport\w*|immigration status|undocumented)\b/i, label: "legal or immigration status" },
  { re: /\b(debt|bankrupt\w*|foreclos\w*|evict\w*|salary|income)\b/i, label: "personal finances" },
];

export function checkMemoryText(text: string, options: PolicyOptions): string | null {
  for (const { re, label } of SECRET_PATTERNS) {
    if (re.test(text)) {
      return `Not saved: Barnabas never stores ${label}. Leave that detail out.`;
    }
  }
  if (CHILD_PATTERNS.some((re) => re.test(text))) {
    return "Not saved: children's check-in, pickup and medical details stay in Kids check-in and are never kept in memory. Leave them out.";
  }
  if (!options.allowSensitive) {
    for (const { re, label } of SENSITIVE_PATTERNS) {
      if (re.test(text)) {
        return `Not saved: this church's policy doesn't allow remembering ${label}. Save only a minimal follow-up, for example "check in with them after Sunday", without the details.`;
      }
    }
  }
  return null;
}
