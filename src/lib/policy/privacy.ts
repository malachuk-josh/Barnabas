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
];

/** Topics that need the church's written opt-in before Barnabas may remember them. */
const SENSITIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(diagnos\w*|cancer|chemo\w*|dementia|alzheimer\w*|hiv|std|pregnan\w*|miscarr\w*|mental illness|bipolar|schizophren\w*|depress\w*|anxiety disorder|ptsd|medication|prescription|rehab|overdos\w*)\b/i, label: "health details" },
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
  if (!options.allowSensitive) {
    for (const { re, label } of SENSITIVE_PATTERNS) {
      if (re.test(text)) {
        return `Not saved: this church's policy doesn't allow remembering ${label}. Save only a minimal follow-up, for example "check in with them after Sunday", without the details.`;
      }
    }
  }
  return null;
}
