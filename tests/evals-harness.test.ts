import { beforeEach, describe, expect, it, vi } from "vitest";
import { setClaude, type ClaudeClient } from "@/lib/engine/claude";
import { TOOL_DEFS } from "@/lib/engine/tools";
import { kjvVerse, quotesKjv, runChecks, runScenario, spokenShape, type Scenario } from "../evals/harness";
import { SCENARIOS, TOOLS } from "../evals/scenarios";
import { useFixtureChurch } from "./fixtures";
import { freshStore } from "./helpers";

/**
 * The eval suite runs against the real API only on request (npm run evals). These tests keep the
 * harness itself honest without a key: scenarios are well formed, and one plays end to end against a
 * scripted stand-in for Claude.
 */

type Block = { type: string; [k: string]: unknown };
function scripted(steps: Block[][]) {
  const client = {
    beta: {
      messages: {
        stream() {
          const content = steps.shift() ?? [{ type: "text", text: "Done." }];
          const message = { id: "msg", role: "assistant", model: "claude-opus-5-5", content, stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
          const events = content.flatMap((b) => [{ type: "content_block_start", content_block: b }, ...(b.type === "text" ? [{ type: "content_block_delta", delta: { type: "text_delta", text: b.text } }] : [])]);
          return {
            async *[Symbol.asyncIterator]() {
              yield* events;
            },
            finalMessage: async () => message,
          };
        },
        async create() {
          return { content: [], stop_reason: "end_turn" };
        },
      },
    },
  };
  setClaude(client as unknown as ClaudeClient);
}

beforeEach(() => {
  freshStore();
  useFixtureChurch();
  vi.stubEnv("BARNABAS_ADMIN_EMAILS", "eval-admin@example.org");
});

describe("eval scenarios", () => {
  it("have unique ids, turns, and something to grade", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) {
      expect(s.turns.length, s.id).toBeGreaterThan(0);
      expect((s.checks?.length ?? 0) + (s.rubric?.length ?? 0), s.id).toBeGreaterThan(0);
    }
  });

  it("name only tools Barnabas has (each group has at least one real tool)", () => {
    const real = new Set([...TOOL_DEFS.map((t) => t.name), "web_search", "web_fetch"]);
    for (const [group, names] of Object.entries(TOOLS)) {
      expect(names.some((n) => real.has(n)), `${group}: ${names.join(", ")}`).toBe(true);
    }
  });

  it("checks KJV quotations against the app's own text", async () => {
    expect(await kjvVerse("Romans 8:28")).toMatch(/^And we know that all things work together for good/);
    const t = (reply: string) => ({ turns: [{ user: "", reply, tools: [], notices: [], links: [] }] });
    const check = quotesKjv("Romans 8:28");
    const ctx = {} as never;
    expect(await check.run(t("“And we know that all things work together for good to them that love God, to them who are the called according to his purpose.” (Romans 8:28)"), ctx)).toBeNull();
    expect(await check.run(t("And we know that all things work together for the good of those who love God."), ctx)).toMatch(/misquoted/);
    expect(await check.run(t("Here's a thought."), ctx)).toMatch(/didn't quote/);
    expect(spokenShape(2).run(t("- one\n- two"), ctx)).toMatch(/list/);
  });
});

describe("running a scenario", () => {
  it("plays the turns through the real engine and records tools, replies and checks", async () => {
    scripted([
      [{ type: "tool_use", id: "tu1", name: "read_scripture", input: { reference: "Romans 8:28" } }],
      [{ type: "text", text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose. (Romans 8:28, KJV)" }],
    ]);
    const s = SCENARIOS.find((x) => x.id === "read-romans-8-28") as Scenario;
    const { transcript, ctx } = await runScenario(s);
    expect(transcript.turns[0]!.tools.map((c) => c.name)).toEqual(["read_scripture"]);
    expect(transcript.turns[0]!.tools[0]!.isError).toBe(false);
    expect(transcript.turns[0]!.links[0]?.href).toMatch(/^\/word/);
    const checks = await runChecks(s, transcript, ctx);
    expect(checks.filter((c) => !c.pass)).toEqual([]);
  });

  it("catches a change made without a yes", async () => {
    scripted([[{ type: "text", text: "Shall I add Ruth Miller?" }]]);
    const s = SCENARIOS.find((x) => x.id === "add-person-no-yes") as Scenario;
    const { transcript, ctx } = await runScenario(s);
    expect((await runChecks(s, transcript, ctx)).every((c) => c.pass)).toBe(true);
  });
});
