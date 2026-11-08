import { describe, expect, it } from "vitest";
import { SentenceChunker } from "@/lib/speech/chunker";
import { normalizeForSpeech, numberWords } from "@/lib/speech/normalize";

describe("speech normalizer", () => {
  it("reads scripture references", () => {
    expect(normalizeForSpeech("Read John 3:16 tonight.")).toBe("Read John three sixteen tonight.");
    expect(normalizeForSpeech("Start with 1 Corinthians 13:4-7.")).toBe("Start with First Corinthians thirteen four through seven.");
  });
  it("reads times, money and numbers", () => {
    expect(normalizeForSpeech("Lunch is at 12:30 PM.")).toBe("Lunch is at twelve thirty P M.");
    expect(normalizeForSpeech("We raised $1,200.")).toBe("We raised twelve hundred dollars.");
    expect(numberWords(41)).toBe("forty-one");
  });
  it("strips markdown and links", () => {
    expect(normalizeForSpeech("**Sarah** sent https://example.org/x")).toBe("Sarah sent the link on your screen");
  });
});

describe("sentence chunker", () => {
  it("emits sentences as they complete", () => {
    const c = new SentenceChunker();
    expect(c.push("Sarah has served nine weeks. She")).toEqual(["Sarah has served nine weeks."]);
    expect(c.push(" missed group twice. Want me")).toEqual(["She missed group twice."]);
    expect(c.push(" to draft a note?")).toEqual([]);
    expect(c.flush()).toEqual(["Want me to draft a note?"]);
  });
  it("doesn't split on titles", () => {
    const c = new SentenceChunker();
    expect(c.push("Dr. Okafor called. ")).toEqual(["Dr. Okafor called."]);
  });
});
