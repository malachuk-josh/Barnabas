/**
 * Splits streamed text into speakable sentences so playback can start on the first one
 * while the rest is still arriving.
 */
export class SentenceChunker {
  private buffer = "";

  /** Add streamed text; returns any sentences that are now complete. */
  push(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    const re = /[^.!?。？！\n]+(?:[.!?。？！]+["'”’)\]]*|\n+)/g;
    let match: RegExpExecArray | null;
    let consumed = 0;
    while ((match = re.exec(this.buffer))) {
      const end = match.index + match[0].length;
      // Don't split "Dr." or "St." or a verse like "3:16." in the middle; require a space or end after the mark.
      const next = this.buffer[end];
      if (next !== undefined && !/\s/.test(next)) continue;
      if (/\b(Dr|Mr|Mrs|Ms|St|Rev|Jr|Sr|vs|e\.g|i\.e)\.$/i.test(match[0].trim())) continue;
      if (next === undefined) break; // wait to see what follows
      const sentence = this.buffer.slice(consumed, end).trim();
      if (sentence) out.push(sentence);
      consumed = end;
    }
    this.buffer = this.buffer.slice(consumed);
    return out;
  }

  /** Whatever is left at the end of the reply. */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
