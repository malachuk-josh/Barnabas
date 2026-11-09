import Anthropic from "@anthropic-ai/sdk";
import type { Leader } from "../auth/session";
import {
  appendMessages,
  getMessages,
  lockKey,
  saveConversation,
  type ConversationMeta,
  type Message,
} from "../data/conversations";
import { CRISIS_REMINDER, detectCrisis } from "../policy/crisis";
import { withLock } from "../store";
import { claude, historyContent, modelFor, turnParams, type TurnMode } from "./claude";
import { executeTool, holdingPhrase, type ToolContext } from "./tools";

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phrase?: string }
  | { type: "notice"; kind: "crisis"; text: string }
  | { type: "timing"; model: string; setupMs: number; firstTextMs: number | null; totalMs: number }
  | { type: "done"; stopReason: string | null }
  | { type: "error"; message: string };

export type TurnInput = {
  leader: Leader;
  meta: ConversationMeta;
  text: string;
  /** The last sentence the leader actually heard before interrupting, if they interrupted. */
  interruptedAfter?: string;
  /** The leader's local time, e.g. "Sunday 9:42 AM". */
  localTime?: string;
  /** The leader spoke this turn (rather than typed it): use the faster voice model. */
  voice?: boolean;
};

const MAX_STEPS = 8;
const REFUSAL_LINE = "I'm not able to help with that one. Is there something else I can do?";

function operatorNote(input: TurnInput, crisis: boolean): Message | null {
  const notes: string[] = [];
  if (input.localTime) notes.push(`Leader's local time: ${input.localTime}.`);
  if (input.interruptedAfter) {
    notes.push(`The leader interrupted your last reply after hearing: "${input.interruptedAfter.slice(0, 300)}". They did not hear the rest.`);
  }
  if (crisis) notes.push(CRISIS_REMINDER);
  return notes.length ? { role: "system", content: notes.join("\n") } : null;
}

/**
 * One leader turn: append the leader's words, then stream Claude and run tools until Claude
 * finishes speaking. History is append-only; the lock keeps turns of one conversation in order.
 */
export async function* runTurn(input: TurnInput): AsyncGenerator<TurnEvent> {
  const queue: TurnEvent[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  const push = (e: TurnEvent) => {
    queue.push(e);
    wake?.();
  };

  const work = withLock(lockKey(input.leader, input.meta.id), () => turn(input, push))
    .catch((err) => {
      console.error("[barnabas] turn failed", err);
      push({ type: "error", message: errorMessage(err) });
    })
    .finally(() => {
      finished = true;
      wake?.();
    });

  while (true) {
    if (queue.length) {
      yield queue.shift()!;
      continue;
    }
    if (finished) break;
    await new Promise<void>((r) => (wake = r));
    wake = null;
  }
  await work;
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Barnabas isn't connected to Claude yet. Add ANTHROPIC_API_KEY to the server settings.";
  if (err instanceof Anthropic.RateLimitError) return "Barnabas is busy right now. Try again in a minute.";
  if (err instanceof Anthropic.APIError) return "Barnabas couldn't reach Claude just now. Try again.";
  if (err instanceof Error && err.message.includes("busy")) return err.message;
  return "Something went wrong on our side. Try again.";
}

async function turn(input: TurnInput, emit: (e: TurnEvent) => void) {
  const { leader, meta } = input;
  const turnStartedAt = Date.now();
  const crisis = detectCrisis(input.text);
  if (crisis) {
    emit({ type: "notice", kind: "crisis", text: "If anyone is in immediate danger, call 911. The 988 Suicide & Crisis Lifeline is available by call or text: 988." });
  }

  const added: Message[] = [{ role: "user", content: input.text }];
  const note = operatorNote(input, crisis);
  if (note) added.push(note);
  let messages = await appendMessages(leader, meta, ...added);
  let mode: TurnMode = input.voice ? "voice" : "text";
  const setupMs = Date.now() - turnStartedAt;
  let firstTextMs: number | null = null;

  const ctx: ToolContext = { leader, meta, turnStartedAt, lastUserText: input.text };
  let stopReason: string | null = null;
  let parseRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = claude().beta.messages.stream(turnParams(meta, messages, mode));
    let announced = false;
    let message: Anthropic.Beta.BetaMessage;
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          if (firstTextMs === null) firstTextMs = Date.now() - turnStartedAt;
          emit({ type: "text", text: event.delta.text });
        } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          const phrase = announced ? undefined : holdingPhrase(event.content_block.name);
          if (phrase) announced = true;
          emit({ type: "tool", name: event.content_block.name, phrase });
        }
      }
      message = await stream.finalMessage();
      parseRetries = 0;
    } catch (err) {
      // With eager input streaming, a tool input that isn't parseable JSON rejects the stream.
      // Re-issue that step; API errors are rethrown.
      // If the voice model rejects the request before saying anything, answer with the main model instead.
      if (mode === "voice" && firstTextMs === null && err instanceof Anthropic.BadRequestError) {
        console.warn("[barnabas] voice model request rejected; using the main model", err.message);
        mode = "text";
        continue;
      }
      if (err instanceof Anthropic.APIError || parseRetries++ >= 2) throw err;
      continue;
    }

    stopReason = message.stop_reason;
    const content = historyContent(message.content);

    if (message.stop_reason === "refusal") {
      // The whole fallback chain declined. Keep only the text that was already spoken.
      const spoken = content.filter((b) => b.type === "text");
      if (spoken.length) messages = await appendMessages(leader, meta, { role: "assistant", content: spoken });
      emit({ type: "text", text: (spoken.length ? " " : "") + REFUSAL_LINE });
      break;
    }

    messages = await appendMessages(leader, meta, { role: "assistant", content });
    const toolUses = content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use");

    if (message.stop_reason === "max_tokens" && toolUses.length) {
      // A tool call cut off mid-input: answer each one with an error so the history stays valid.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((t) => ({
        type: "tool_result",
        tool_use_id: t.id,
        is_error: true,
        content: "The tool input was cut off. Try again with a shorter input.",
      }));
      messages = await appendMessages(leader, meta, { role: "user", content: results });
      continue;
    }

    if (message.stop_reason !== "tool_use" || !toolUses.length) break;

    // Run the turn's tool calls concurrently and return every result in one message.
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const r = await executeTool(t.name, t.input, ctx);
        return { type: "tool_result", tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
      }),
    );
    messages = await appendMessages(leader, meta, { role: "user", content: results });
  }

  meta.turns += 1;
  meta.updatedAt = Date.now();
  if (meta.turns === 1 || meta.title === "New conversation") meta.title = titleFrom(input.text);
  await saveConversation(leader, meta);
  const timing = { model: modelFor(mode).model, setupMs, firstTextMs, totalMs: Date.now() - turnStartedAt };
  console.log(`[barnabas] turn ${mode} model=${timing.model} setup=${setupMs}ms firstText=${firstTextMs ?? "-"}ms total=${timing.totalMs}ms`);
  emit({ type: "timing", ...timing });
  emit({ type: "done", stopReason });
}

function titleFrom(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t || "New conversation";
}

export async function conversationMessages(leader: Leader, meta: ConversationMeta) {
  return getMessages(leader, meta.id);
}
