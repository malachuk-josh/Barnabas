/** Spoken or typed confirmation detection for gated actions (send, schedule changes). */

// Word ends are written as lookarounds because \b doesn't treat accented or Korean letters as letters.
const END = "(?=$|[\\s,.!?;:])";
const NEGATIVE = new RegExp(`(^|[\\s,.!?])(no|nope|don'?t|do not|not yet|wait|hold on|hold off|cancel|stop|never ?mind|later|espera|todav[ií]a no|아니)${END}`, "i");

const AFFIRMATIVE = [
  new RegExp(`^\\s*(yes|yeah|yep|yup|ya|sure|ok|okay|alright|all right|absolutely|definitely|please|correct|right|perfect|great|good|s[ií]|claro|dale|네|예|좋아요)${END}`, "i"),
  /\b(send it|send that|send them|go ahead|do it|please do|sounds good|looks good|that'?s (good|fine|great|right)|book it|block it|lock it in|make it so|confirm(ed)?)\b/i,
];

export function isAffirmative(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length > 160) return false; // long turns are new requests, not confirmations
  if (NEGATIVE.test(t)) return false;
  return AFFIRMATIVE.some((re) => re.test(t));
}
