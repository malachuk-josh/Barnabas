import { VERSES, type VerseKey } from "@/lib/language";

/**
 * A KJV verse in small italics under a heading, the first time a biblical term (co-laborers, encourage,
 * weariness, shepherding) appears on a page. Words from src/lib/language.ts.
 */
export function VerseNote({ verse, short = false, className }: { verse: VerseKey; short?: boolean; className?: string }) {
  const v: { text: string; reference: string; short?: string } = VERSES[verse];
  const text = short && v.short ? v.short : v.text;
  return (
    <p className={`term-verse${className ? ` ${className}` : ""}`}>
      &ldquo;{text}&rdquo; <cite>{v.reference}</cite>
    </p>
  );
}
