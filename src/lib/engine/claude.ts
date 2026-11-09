import Anthropic from "@anthropic-ai/sdk";
import { config, type Effort } from "../config";
import { defaultAi, resolvedAi, type ResolvedAi } from "../ai/settings";
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

export type TurnMode = "voice" | "text";

/**
 * Model and thinking for a turn. Spoken turns go to the voice model with the least thinking it
 * allows (Claude Sonnet 5.5: `between_tools`, no extended thinking) so the first words come fast;
 * typed turns keep the main model with adaptive thinking. Switching models inside one conversation
 * is fine: thinking blocks are passed back unchanged and the API drops any the model can't read.
 */
export function modelFor(mode: TurnMode, ai: ResolvedAi = defaultAi()): { model: string; thinking: Anthropic.Beta.BetaThinkingConfigParam; effort: Effort } {
  if (mode === "voice") {
    const model = ai.voiceModel;
    // between_tools (Sonnet 5.5's no-extended-thinking mode) is accepted at high effort or below; the choices stop at high.
    return { model, thinking: model.startsWith("claude-sonnet-5-5") ? { type: "between_tools" } : { type: "adaptive" }, effort: ai.voiceEffort as Effort };
  }
  return { model: ai.textModel, thinking: { type: "adaptive" }, effort: ai.textEffort as Effort };
}

export function turnParams(meta: ConversationMeta, messages: Message[], mode: TurnMode = "text", ai?: ResolvedAi): Anthropic.Beta.MessageCreateParamsStreaming {
  const { model, thinking, effort } = modelFor(mode, ai);
  const fallbacks = supportsFallbacks(model);
  return {
    model,
    max_tokens: 16000,
    stream: true,
    thinking,
    // `between_tools` is accepted only at effort high or below; voice runs at low.
    output_config: { effort },
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
export async function warmCache(meta: ConversationMeta, churchId?: string) {
  // A conversation started by voice is warmed for the voice model (caches are per model).
  const mode: TurnMode = meta.mode === "voice" ? "voice" : "text";
  const { model, thinking, effort } = modelFor(mode, churchId ? await resolvedAi(churchId) : undefined);
  await claude().beta.messages.create({
    model,
    max_tokens: 0,
    thinking,
    output_config: { effort },
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
