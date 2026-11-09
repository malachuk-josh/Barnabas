/**
 * Long prose into paragraphs a person can find their place in again.
 *
 * Henry and Spurgeon both write in unbroken blocks — Spurgeon especially, who
 * was setting type for a Victorian weekly and had no reason to break for a
 * phone. Breaks the text already has are kept; within them, it is split on
 * sentence ends and regrouped to a few hundred characters, which is close
 * enough to a paragraph to read like one.
 *
 * Shared by the commentary panel in The Word, the devotional, and the
 * commentary that goes with a plan's day, so the same writer is set the same
 * way wherever he is read.
 */
export function intoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .flatMap((block) =>
      block.split(/(?<=\.)\s+(?=[A-Z"'])/).reduce<string[]>((paras, sentence) => {
        const last = paras[paras.length - 1];
        if (last && last.length < 420) paras[paras.length - 1] = `${last} ${sentence}`;
        else paras.push(sentence);
        return paras;
      }, [])
    )
    .map((p) => p.trim())
    .filter(Boolean);
}
