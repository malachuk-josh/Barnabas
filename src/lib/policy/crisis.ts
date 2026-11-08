/**
 * Detects when a leader may be describing someone at risk of harming themselves or others.
 * When it fires, the engine adds an operator reminder of the crisis protocol to that turn.
 */

const CRISIS = [
  /\b(kill|hurt|harm|cut)(?:ing)? (him|her|them|my|him|her)sel(f|ves)\b/i,
  /\b(kill|hurt|harm)(?:ing)? (myself|himself|herself|themselves|themself)\b/i,
  /\bsuicid\w*/i,
  /\b(end|take) (his|her|their|my) (own )?life\b/i,
  /\bwants? to die\b/i,
  /\b(overdos\w*)\b/i,
  /\b(going to|gonna|threaten\w*( to)?) (kill|shoot|hurt) (someone|somebody|people|him|her|them)\b/i,
  /\bgun\b.*\b(threat\w*|kill|shoot)\b/i,
  /\b(being|been) (abused|hit|beaten)\b/i,
  /\bsuicidio\b|\bmatarse\b|\bquitarse la vida\b/i,
  /자살/,
];

export function detectCrisis(text: string): boolean {
  return CRISIS.some((re) => re.test(text));
}

export const CRISIS_REMINDER =
  "Crisis protocol: the leader may be describing someone at risk. Do not counsel or diagnose. " +
  "Say plainly that if anyone is in immediate danger they should call 911 now. Give the 988 Suicide & Crisis Lifeline " +
  "(call or text 988 in the US). Encourage the leader to stay with or reach the person now and to involve their senior pastor " +
  "per church policy. Do not save any details of this to memory. Keep it short and calm.";
