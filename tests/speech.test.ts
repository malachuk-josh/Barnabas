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

describe("pronunciations", () => {
  it("replaces whole words only, case-insensitively", () => {
    const list = [{ word: "Nguyen", sayAs: "Win" }];
    expect(normalizeForSpeech("Call Mrs. Nguyen today.", list)).toBe("Call Mrs. Win today.");
    expect(normalizeForSpeech("NGUYEN family", list)).toBe("Win family");
    expect(normalizeForSpeech("Nguyenville", list)).toBe("Nguyenville");
  });
});

describe("speaking the first phrase early", () => {
  it("speaks the opening clause at a comma once it has a few words", async () => {
    const { SentenceChunker } = await import("@/lib/speech/chunker");
    const c = new SentenceChunker(true);
    expect(c.push("That sounds like a full week,")).toEqual([]);
    expect(c.push(" and I'm glad you")).toEqual(["That sounds like a full week,"]);
    expect(c.push(" told me. Let's look")).toEqual(["and I'm glad you told me."]);
    expect(c.flush()).toEqual(["Let's look"]);
  });

  it("doesn't split a short greeting, a verse reference or a number", async () => {
    const { SentenceChunker } = await import("@/lib/speech/chunker");
    const c = new SentenceChunker(true);
    expect(c.push("Hi Josh, John 3:16 says 1,000 things ")).toEqual([]);
    const d = new SentenceChunker(false);
    expect(d.push("That sounds like a full week, and more ")).toEqual([]);
  });
});
