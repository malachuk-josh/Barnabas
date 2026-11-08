import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { ConversationMeta, Message } from "../data/conversations";
import { BARNABAS_SYSTEM } from "./prompt";
import { TOOL_DEFS } from "./tools";

type Beta = typeof Anthropic.Beta.prototype;
export type ClaudeClient = { beta: { messages: Pick<Beta["messages"], "stream" | "create"> } };

let client: ClaudeClient | null = null;

export function claude(): ClaudeClient {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 60_000 }) as unknown as ClaudeClient;
  return client;
}

export function setClaude(c: ClaudeClient | null) {
  client = c;
}

/** Server-side refusal fallback is available on these models (not on Haiku). */
export function supportsFallbacks(model: string) {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

function system(meta: ConversationMeta): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    // Shared by every leader: caches across all traffic.
    { type: "text", text: BARNABAS_SYSTEM, cache_control: { type: "ephemeral" } },
    // This leader's context, frozen when the conversation started.
    { type: "text", text: meta.context, cache_control: { type: "ephemeral" } },
  ];
}

export function turnParams(meta: ConversationMeta, messages: Message[]): Anthropic.Beta.MessageCreateParamsStreaming {
  const fallbacks = supportsFallbacks(config.model);
  return {
    model: config.model,
    max_tokens: 16000,
    stream: true,
    thinking: { type: "adaptive" },
    output_config: { effort: config.effort },
    // Automatic caching for the growing conversation, after the two system breakpoints.
    cache_control: { type: "ephemeral" },
    tools: TOOL_DEFS,
    system: system(meta),
    messages,
    ...(fallbacks ? { fallbacks: "default" as const, betas: [config.fallbackBeta] } : {}),
  };
}

/**
 * Pre-warm the cache for a new conversation: max_tokens 0, same tools, system, thinking and effort
 * as real turns, with the breakpoint on the last shared block (not on the placeholder message).
 */
export async function warmCache(meta: ConversationMeta) {
  await claude().beta.messages.create({
    model: config.model,
    max_tokens: 0,
    thinking: { type: "adaptive" },
    output_config: { effort: config.effort },
    tools: TOOL_DEFS,
    system: system(meta),
    messages: [{ role: "user", content: "warmup" }],
  });
}

const MODEL_INTERNAL = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);

/**
 * What to store as the assistant turn. After a mid-output fallback, blocks before the last
 * `fallback` boundary that only the declined model can use (thinking, tool calls) are left out;
 * text and everything after the boundary is kept unchanged.
 */
export function historyContent(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  let boundary = -1;
  content.forEach((b, i) => {
    if (b.type === "fallback") boundary = i;
  });
  const kept = boundary < 0 ? content : content.filter((b, i) => i > boundary || !MODEL_INTERNAL.has(b.type));
  return kept as unknown as Anthropic.Beta.BetaContentBlockParam[];
}
