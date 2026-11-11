import { beforeEach, describe, expect, it } from "vitest";
import type { ConversationMeta } from "@/lib/data/conversations";
import { createConversation } from "@/lib/data/conversations";
import { setClaude, type ClaudeClient } from "@/lib/engine/claude";
import { appPath } from "@/lib/engine/nav-tools";
import { CORE_TOOLS, executeTool, toolNamesFor } from "@/lib/engine/tools";
import { runTurn, type TurnEvent } from "@/lib/engine/turn";
import { addPerson, recordSignIn } from "@/lib/team";
import { useFixtureChurch } from "./fixtures";
import { freshStore, leader } from "./helpers";

const meta = (): ConversationMeta => ({ id: `c${Math.random().toString(36).slice(2)}`, title: "t", mode: "text", offRecord: false, createdAt: 0, updatedAt: 0, context: "ctx", turns: 0 });
const ctx = (l = leader) => ({ leader: l, meta: meta(), turnStartedAt: Date.now(), lastUserText: "open it" });

beforeEach(async () => {
  freshStore();
  useFixtureChurch();
  await recordSignIn(leader);
});

describe("open_page", () => {
  it("opens The Word at a reference, and hands back the page to open", async () => {
    const r = await executeTool("open_page", { reference: "John 3:16" }, ctx());
    expect(r.isError).toBe(false);
    expect(r.navigate).toBe("/word?b=43&c=3&v=16");
    expect(r.links?.[0]?.href).toBe("/word?b=43&c=3&v=16");
    expect((await executeTool("open_page", { reference: "Hezekiah 4:1" }, ctx())).isError).toBe(true);
  });

  it("opens only the app's own pages", async () => {
    expect((await executeTool("open_page", { href: "/calendar" }, ctx())).navigate).toBe("/calendar");
    expect((await executeTool("open_page", { href: "/people/p01" }, ctx())).navigate).toBe("/people/p01");
    for (const bad of ["https://evil.example", "//evil.example", "/api/people", "/nowhere", "javascript:alert(1)"]) {
      expect(appPath(bad), bad).toBeNull();
      expect((await executeTool("open_page", { href: bad }, ctx())).isError, bad).toBe(true);
    }
  });

  it("respects access levels: a member can open The Word but not the directory", async () => {
    const maria = { ...leader, leaderId: "navmem01", name: "Maria", email: "maria@example.org" };
    await addPerson("demo", maria.leaderId, { name: "Maria", email: maria.email, level: "member" }, "test");
    expect(toolNamesFor({ role: "leader", admin: false, level: "member" })).toContain("open_page");
    expect((await executeTool("open_page", { reference: "Psalm 23" }, ctx(maria))).isError).toBe(false);
    expect((await executeTool("open_page", { href: "/people" }, ctx(maria))).isError).toBe(true);
  });

  it("is always at hand (no tool search needed)", () => {
    expect(CORE_TOOLS).toContain("open_page");
  });

  it("reaches the app as a navigate event during the turn", async () => {
    const m = meta();
    await createConversation(leader, m);
    const steps = [
      [{ type: "tool_use", id: "t1", name: "open_page", input: { reference: "Romans 8" } }],
      [{ type: "text", text: "I've opened Romans 8." }],
    ];
    setClaude({
      beta: {
        messages: {
          stream() {
            const content = steps.shift()!;
            const message = { id: "m", role: "assistant", model: "t", content, stop_reason: content[0]!.type === "tool_use" ? "tool_use" : "end_turn" };
            return {
              async *[Symbol.asyncIterator]() {
                for (const b of content) yield { type: "content_block_start", content_block: b };
              },
              finalMessage: async () => message,
            };
          },
          async create() {
            return { content: [], stop_reason: "end_turn" };
          },
        },
      },
    } as unknown as ClaudeClient);
    const events: TurnEvent[] = [];
    for await (const e of runTurn({ leader, meta: m, text: "Take me to Romans 8" })) events.push(e);
    expect(events).toContainEqual({ type: "navigate", href: "/word?b=45&c=8" });
  });
});
