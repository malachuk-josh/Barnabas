import { beforeEach, describe, expect, it } from "vitest";
import type { ConversationMeta } from "@/lib/data/conversations";
import { createConversation } from "@/lib/data/conversations";
import {
  answeredIds,
  askRefusal,
  KNOW_PATH,
  KNOW_QUESTIONS,
  KNOW_TOOLS,
  knowContext,
  KNOW_RULES,
  readAnswers,
  resolvePermission,
} from "@/lib/engine/know";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";
import { TOOL_DEFS } from "@/lib/engine/tools";
import { freshStore, leader } from "./helpers";

const WHY = "They just said Sunday's sermon prep keeps getting squeezed out";

function meta(over: Partial<ConversationMeta> = {}): ConversationMeta {
  return { id: "c1", title: "t", mode: "voice", offRecord: false, createdAt: 0, updatedAt: 0, context: "", turns: 3, ...over };
}

const refusal = (m: ConversationMeta, over: Partial<Parameters<typeof askRefusal>[0]> = {}) =>
  askRefusal({ meta: m, questionId: "k02", whyNow: WHY, leaderText: "Planning is hard this week.", answered: new Set(), log: {}, now: Date.now(), ...over });

describe("the twenty questions", () => {
  it("has twenty, ranked 1 to 20, calling first, unique ids", () => {
    expect(KNOW_QUESTIONS).toHaveLength(20);
    expect(KNOW_QUESTIONS.map((q) => q.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(KNOW_QUESTIONS[0]!.topic).toBe("Calling");
    expect(new Set(KNOW_QUESTIONS.map((q) => q.id)).size).toBe(20);
  });

  it("registers the tools and the rules in Barnabas's instructions", () => {
    const names = TOOL_DEFS.map((t) => t.name);
    for (const t of KNOW_TOOLS) expect(names).toContain(t.def.name);
    expect(KNOW_RULES).toMatch(/Never in your first reply of a conversation\. At most two in a conversation, unless it has gone past 15 exchanges/);
  });

  it("carries the asking rules only while questions are open and the conversation is on the record", async () => {
    freshStore();
    expect(await knowContext(leader, false, 1)).toContain(KNOW_RULES);
    expect(await knowContext(leader, true, 1)).not.toContain(KNOW_RULES);
    // Not on every message for everyone: they're out of the shared instructions.
    expect(BARNABAS_SYSTEM).not.toContain("Bridge from the help you just gave");
  });

  it("reads answered ids from the memory file", () => {
    expect([...answeredIds("# x\n- [k01] Calling: youth camp at 16\n- [k20] Family: x\n- [k99] nope\nnot a line")]).toEqual(["k01", "k20"]);
  });
});

describe("when Barnabas may ask", () => {
  it("allows a fitting question mid-conversation", () => {
    expect(refusal(meta())).toBeNull();
  });

  it("never in the first reply of a conversation", () => {
    expect(refusal(meta({ turns: 0 }))).toMatch(/first reply/);
  });

  it("never off the record or in a crisis moment", () => {
    expect(refusal(meta({ offRecord: true }))).toMatch(/off the record/);
    expect(refusal(meta(), { leaderText: "I don't want to live anymore" })).toMatch(/hard moment/);
  });

  it("not if already answered, asked recently, or asked this conversation", () => {
    expect(refusal(meta(), { answered: new Set(["k02"]) })).toMatch(/already answered/);
    expect(refusal(meta(), { log: { k02: { at: Date.now() - 86_400_000, conversationId: "old" } } })).toMatch(/recently/);
    expect(refusal(meta(), { log: { k02: { at: Date.now() - 30 * 86_400_000, conversationId: "old" } } })).toBeNull();
    expect(refusal(meta({ know: { asked: ["k02"] } }))).toMatch(/already asked that/);
  });

  it("one per reply", () => {
    expect(refusal(meta({ know: { asked: ["k01"], lastAskTurn: 3 } }))).toMatch(/one getting-to-know-you question per reply/);
  });

  it("at most two per conversation until past 15 exchanges", () => {
    const two = { asked: ["k01", "k03"], lastAskTurn: 2 };
    expect(refusal(meta({ know: two }))).toMatch(/limit before 15 exchanges/);
    expect(refusal(meta({ turns: 14, know: two }))).toMatch(/limit/);
    expect(refusal(meta({ turns: 15, know: two }))).toBeNull();
  });

  it("a yes to 'may I ask a few more?' raises the limit; a no ends it", () => {
    const granted = meta({ know: { asked: ["k01", "k03"], lastAskTurn: 1, permission: { status: "granted", turn: 2 } } });
    expect(refusal(granted)).toBeNull();
    const declined = meta({ know: { asked: ["k01", "k03"], lastAskTurn: 1, permission: { status: "declined", turn: 2 } } });
    expect(refusal(declined)).toMatch(/rather not/);
  });

  it("needs a specific reason it fits now", () => {
    expect(refusal(meta(), { whyNow: "to get to know you better" })).toMatch(/specific reason/);
    expect(refusal(meta(), { whyNow: "relevant" })).toMatch(/specific reason/);
  });

  it("the leader's next words answer the permission question; only a clear yes counts", () => {
    const m = meta({ turns: 6, know: { asked: ["k01", "k02"], permission: { status: "asked", turn: 5 } } });
    resolvePermission(m, "Sure, go ahead");
    expect(m.know?.permission?.status).toBe("granted");
    const n = meta({ turns: 6, know: { asked: ["k01", "k02"], permission: { status: "asked", turn: 5 } } });
    resolvePermission(n, "Maybe later, I need to run");
    expect(n.know?.permission?.status).toBe("declined");
  });
});

describe("the tools", () => {
  beforeEach(() => freshStore());

  const [ask, permission, record] = KNOW_TOOLS;

  async function conv(turns: number, offRecord = false) {
    const m = meta({ id: `c${Math.random().toString(36).slice(2, 8)}`, turns, offRecord });
    await createConversation(leader, m);
    return m;
  }
  const ctx = (m: ConversationMeta, lastUserText = "Sermon prep keeps slipping") => ({ leader, meta: m, turnStartedAt: Date.now(), lastUserText });

  it("asks, records the answer in the memory file, and then treats it as answered", async () => {
    const m = await conv(2);
    const r1 = await ask!.run({ question_id: "k09", why_now: WHY } as never, ctx(m));
    expect(r1.isError).toBe(false);
    expect(m.know?.asked).toEqual(["k09"]);
    const r2 = await record!.run({ question_id: "k09", answer: "Tuesday and Thursday mornings, before the office opens" } as never, ctx(m));
    expect(r2.isError).toBe(false);
    const file = await readAnswers(leader);
    expect(file).toContain("- [k09] Focused work time: Tuesday and Thursday mornings");
    // Recording again replaces the line rather than adding a second.
    await record!.run({ question_id: "k09", answer: "Mornings, Tuesday to Thursday" } as never, ctx(m));
    expect((await readAnswers(leader))!.match(/\[k09\]/g)).toHaveLength(1);
    const context = await knowContext(leader, false);
    expect(context).toContain("Focused work time: Mornings, Tuesday to Thursday");
    expect(context).toContain("Still open (19 of 20)");
    expect(context).not.toMatch(/k09 \(/);
  });

  it("refuses the first reply, and asking for permission twice", async () => {
    expect((await ask!.run({ question_id: "k01", why_now: WHY } as never, ctx(await conv(0)))).isError).toBe(true);
    const m = await conv(4);
    expect((await permission!.run({ why_now: "relaxed conversation, they enjoy this" } as never, ctx(m))).isError).toBe(false);
    m.turns = 6;
    expect((await permission!.run({ why_now: "relaxed conversation, they enjoy this" } as never, ctx(m))).isError).toBe(true);
  });

  it("doesn't save off the record or sensitive details", async () => {
    const off = await conv(3, true);
    expect((await record!.run({ question_id: "k18", answer: "Fly fishing" } as never, ctx(off))).isError).toBe(true);
    expect(await readAnswers(leader)).toBeNull();
    expect(KNOW_PATH).toBe("/memories/getting-to-know-you.md");
  });
});

describe("eagerness, within the rules", () => {
  beforeEach(() => freshStore());

  it("counts on-the-record conversations and marks the early-relationship season", async () => {
    const { noteConversationStarted, isEarlySeason } = await import("@/lib/engine/know");
    expect((await noteConversationStarted(leader, false)).conversations).toBe(1);
    expect((await noteConversationStarted(leader, true)).conversations).toBe(1); // off the record doesn't count
    expect((await noteConversationStarted(leader, false)).conversations).toBe(2);
    expect(isEarlySeason(3, 2)).toBe(true);
    expect(isEarlySeason(25, 5)).toBe(true); // still fewer than 8 answers
    expect(isEarlySeason(25, 12)).toBe(false);
  });

  it("tells Barnabas to look for openings early on, and not later", async () => {
    expect(await knowContext(leader, false, 2)).toMatch(/early in getting to know this leader \(conversation 2, 0 of 20 answered\)/);
    expect(await knowContext(leader, true, 2)).not.toMatch(/early in getting to know/); // off the record
  });

  it("an invited conversation welcomes questions but still never in the first reply", () => {
    const invited = { asked: [] as string[], invited: true, permission: { status: "granted" as const, turn: -1 } };
    expect(refusal(meta({ turns: 0, know: invited }))).toMatch(/first reply/);
    expect(refusal(meta({ turns: 1, know: invited }), { whyNow: "" })).toBeNull(); // no "fits now" reason needed
    const four = { ...invited, asked: ["k01", "k02", "k03", "k04"], lastAskTurn: 4 };
    expect(refusal(meta({ turns: 5, know: four }), { questionId: "k05" })).toBeNull(); // up to five with permission
    const five = { ...four, asked: [...four.asked, "k05"] };
    expect(refusal(meta({ turns: 6, know: five }), { questionId: "k06" })).toMatch(/limit/);
  });

  it("Barnabas's instructions teach bridging and catching answers given in passing", () => {
    expect(KNOW_RULES).toMatch(/Bridge from the help you just gave/);
    expect(KNOW_RULES).toMatch(/"Mondays are my day off" answers k12/);
  });
});
