import { beforeEach, describe, expect, it } from "vitest";
import { createConversation, getMessages, type ConversationMeta } from "@/lib/data/conversations";
import { getDraft } from "@/lib/data/records";
import { historyContent, setClaude, turnParams, type ClaudeClient } from "@/lib/engine/claude";
import { runTurn, type TurnEvent } from "@/lib/engine/turn";
import { useFixtureChurch } from "./fixtures";
import { freshStore, leader } from "./helpers";

type Step = (params: { messages: unknown[] }) => { content: unknown[]; stop_reason: string };

/** A stand-in for the Claude API that plays scripted responses as stream events. */
function scripted(steps: Step[]) {
  const calls: { messages: unknown[]; system: unknown; tools: unknown[] }[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: { messages: unknown[]; system: unknown; tools: unknown[] }) {
          calls.push(JSON.parse(JSON.stringify(params)));
          const step = steps.shift();
          if (!step) throw new Error("no more scripted steps");
          const message = { id: "msg", role: "assistant", model: "test", ...step(params) };
          const events: unknown[] = [];
          for (const block of message.content as { type: string; text?: string; name?: string }[]) {
            events.push({ type: "content_block_start", content_block: block });
            if (block.type === "text") events.push({ type: "content_block_delta", delta: { type: "text_delta", text: block.text } });
          }
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
  return calls;
}

async function collect(gen: AsyncGenerator<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function lastToolResult(params: { messages: unknown[] }) {
  const last = params.messages[params.messages.length - 1] as { content: { type: string; content: string }[] };
  return last.content.find((b) => b.type === "tool_result")!.content;
}

async function newMeta(): Promise<ConversationMeta> {
  const meta: ConversationMeta = {
    id: `conv_${Math.random().toString(36).slice(2)}`,
    title: "New conversation",
    mode: "voice",
    offRecord: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    context: "# Conversation\nMode: voice",
    turns: 0,
  };
  await createConversation(leader, meta);
  return meta;
}

describe("turn loop", () => {
  beforeEach(() => {
    freshStore();
    // Volunteers and recipients come from the test-only fixture congregation.
    useFixtureChurch();
  });

  it("streams text, runs tools, and keeps history append-only", async () => {
    const meta = await newMeta();
    const calls = scripted([
      () => ({
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tu1", name: "get_volunteer_load", input: {} },
        ],
        stop_reason: "tool_use",
      }),
      (params) => {
        expect(lastToolResult(params)).toContain("Sarah Kim");
        return { content: [{ type: "text", text: "Sarah could use a call this week." }], stop_reason: "end_turn" };
      },
    ]);

    const events = await collect(runTurn({ leader, meta, text: "Who should I check on?", localTime: "Sunday 9:42 AM" }));
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join(" ")).toContain("Sarah could use a call");
    expect(events.find((e) => e.type === "tool")).toMatchObject({ name: "get_volunteer_load", phrase: "Let me check how the teams are doing." });
    expect(events[events.length - 1]).toMatchObject({ type: "done", stopReason: "end_turn" });

    const history = await getMessages(leader, meta.id);
    expect(history.map((m) => m.role)).toEqual(["user", "system", "assistant", "user", "assistant"]);
    expect((history[1] as { content: string }).content).toContain("Sunday 9:42 AM");

    // The second request's history starts with the first request's history, unchanged.
    expect(JSON.stringify(calls[1].messages).startsWith(JSON.stringify(calls[0].messages).slice(0, -1))).toBe(true);
    // The two system blocks carry cache breakpoints.
    expect(JSON.stringify(calls[0].system)).toContain("ephemeral");
  });

  it("drafts into the review queue and never sends, even after a yes", async () => {
    const meta = await newMeta();
    let draftId = "";
    scripted([
      () => ({
        content: [
          {
            type: "tool_use",
            id: "tu1",
            name: "draft_message",
            input: { person_ids: ["p01", "p03"], channel: "sms", text: "Thank you for serving!", translations: { es: "¡Gracias por servir!" } },
          },
        ],
        stop_reason: "tool_use",
      }),
      (params) => {
        draftId = JSON.parse(lastToolResult(params)).draft_id;
        return { content: [{ type: "tool_use", id: "tu2", name: "send_draft", input: { draft_id: draftId } }], stop_reason: "tool_use" };
      },
      (params) => {
        expect(lastToolResult(params)).toContain("Not sent");
        return { content: [{ type: "text", text: "It goes to Sarah and Ana. It's waiting in Drafts." }], stop_reason: "end_turn" };
      },
    ]);
    await collect(runTurn({ leader, meta, text: "Thank Sarah and Ana for serving." }));
    expect((await getDraft(leader, draftId))?.status).toBe("needs_review");
    expect((await getDraft(leader, draftId))?.recipients.find((r) => r.personId === "p03")?.text).toBe("¡Gracias por servir!");

    scripted([
      () => ({ content: [{ type: "tool_use", id: "tu3", name: "send_draft", input: { draft_id: draftId } }], stop_reason: "tool_use" }),
      (params) => {
        expect(lastToolResult(params)).toContain("Drafts screen");
        return { content: [{ type: "text", text: "It's in Drafts; tap Send there." }], stop_reason: "end_turn" };
      },
    ]);
    await collect(runTurn({ leader, meta, text: "Yes, send it." }));
    // Only the Drafts screen's Send button delivers; Barnabas's yes leaves it waiting for review.
    expect((await getDraft(leader, draftId))?.status).toBe("needs_review");
    expect((await getDraft(leader, draftId))?.kind).toBe("general");
  });

  it("requires translations for recipients who read another language", async () => {
    const meta = await newMeta();
    scripted([
      () => ({
        content: [{ type: "tool_use", id: "tu1", name: "draft_message", input: { person_ids: ["p03", "p06"], channel: "sms", text: "See you Saturday!" } }],
        stop_reason: "tool_use",
      }),
      (params) => {
        const result = lastToolResult(params);
        expect(result).toContain("Spanish (es) for 1 recipient");
        expect(result).toContain("Korean (ko) for 1 recipient");
        return { content: [{ type: "text", text: "Let me add translations." }], stop_reason: "end_turn" };
      },
    ]);
    await collect(runTurn({ leader, meta, text: "Remind Ana and Jin-woo about Saturday." }));
  });

  it("notes interruptions and crisis turns as operator messages", async () => {
    const meta = await newMeta();
    scripted([() => ({ content: [{ type: "text", text: "Please call 911 if he's in danger." }], stop_reason: "end_turn" })]);
    const events = await collect(
      runTurn({ leader, meta, text: "I'm worried he might hurt himself", interruptedAfter: "Sarah has served nine weeks." }),
    );
    expect(events.find((e) => e.type === "notice")).toBeTruthy();
    const history = await getMessages(leader, meta.id);
    const note = (history[1] as { content: string }).content;
    expect(note).toContain("interrupted");
    expect(note).toContain("988");
  });

  it("refuses to save memory off the record", async () => {
    const meta = await newMeta();
    meta.offRecord = true;
    scripted([
      () => ({ content: [{ type: "tool_use", id: "tu1", name: "save_memory", input: { note: "Prefers calls" } }], stop_reason: "tool_use" }),
      (params) => {
        expect(lastToolResult(params)).toContain("off the record");
        return { content: [{ type: "text", text: "I can't save that right now." }], stop_reason: "end_turn" };
      },
    ]);
    await collect(runTurn({ leader, meta, text: "Remember I prefer calls" }));
  });
});

describe("request shape", () => {
  it("uses adaptive thinking, effort, fallbacks and cache breakpoints", async () => {
    freshStore();
    const meta = await newMeta();
    const params = turnParams(meta, []);
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.cache_control).toEqual({ type: "ephemeral" });
    expect(params.tools?.every((t) => "eager_input_streaming" in t && t.eager_input_streaming)).toBe(true);
  });

  it("drops declined-model blocks before a fallback boundary", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "a" },
      { type: "text", text: "Partial " },
      { type: "tool_use", id: "x", name: "find_person", input: {} },
      { type: "fallback", from: { model: "a" }, to: { model: "b" } },
      { type: "thinking", thinking: "", signature: "b" },
      { type: "text", text: "rest" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kept = historyContent(content as any).map((b) => b.type);
    expect(kept).toEqual(["text", "fallback", "thinking", "text"]);
  });
});

describe("voice turns", () => {
  it("use the voice model with between_tools thinking at low effort; typed turns keep the main model", async () => {
    const { turnParams } = await import("@/lib/engine/claude");
    const { config } = await import("@/lib/config");
    const meta = { id: "c1", context: "ctx", mode: "voice" } as unknown as Parameters<typeof turnParams>[0];
    const voice = turnParams(meta, [{ role: "user", content: "hi" }], "voice");
    expect(voice.model).toBe(config.voiceModel);
    expect(voice.thinking).toEqual({ type: "between_tools" });
    expect(voice.output_config?.effort).toBe("low");
    const text = turnParams(meta, [{ role: "user", content: "hi" }], "text");
    expect(text.model).toBe(config.model);
    expect(text.thinking).toEqual({ type: "adaptive" });
  });
});

describe("web search", () => {
  beforeEach(() => freshStore());

  it("is off by default: no web tools in the request", async () => {
    const calls = scripted([() => ({ content: [{ type: "text", text: "Hello." }], stop_reason: "end_turn" })]);
    await collect(runTurn({ leader, meta: await newMeta(), text: "hi" }));
    expect((calls[0]!.tools as { name: string }[]).some((t) => t.name === "web_search")).toBe(false);
  });

  it("when an admin turns it on, says it's looking, and a paused turn resumes without an extra message", async () => {
    const { saveAiSettings } = await import("@/lib/ai/settings");
    await saveAiSettings("demo", "Admin", { textModel: null, voiceModel: null, textEffort: null, webSearch: true, webDomains: ["ccli.com"] });
    const calls = scripted([
      () => ({ content: [{ type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "Be Thou My Vision CCLI" } }], stop_reason: "pause_turn" }),
      () => ({ content: [{ type: "text", text: "It's CCLI 30639, per ccli.com." }], stop_reason: "end_turn" }),
    ]);
    const events = await collect(runTurn({ leader, meta: await newMeta(), text: "What's the CCLI number for Be Thou My Vision?" }));
    const tools = calls[0]!.tools as { name: string; type?: string; allowed_domains?: string[] }[];
    const search = tools.find((t) => t.name === "web_search")!;
    expect(search.type).toBe("web_search_20260209");
    expect(search.allowed_domains).toEqual(["ccli.com"]);
    expect(events.find((e) => e.type === "tool")).toMatchObject({ name: "web_search", phrase: "Let me look that up." });
    // The second request resumes from the paused assistant turn, with no "continue" user message added.
    expect(calls).toHaveLength(2);
    const last = calls[1]!.messages[calls[1]!.messages.length - 1] as { role: string };
    expect(last.role).toBe("assistant");
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toMatch(/30639/);
  });

  it("Haiku gets the basic web tool versions", async () => {
    const { webTools } = await import("@/lib/engine/claude");
    const t = webTools("claude-haiku-5-5", { textModel: "", voiceModel: "", textEffort: "low", voiceEffort: "low", webSearch: true }) as { type: string }[];
    expect(t.map((x) => x.type)).toEqual(["web_search_20250305", "web_fetch_20250910"]);
  });
});
