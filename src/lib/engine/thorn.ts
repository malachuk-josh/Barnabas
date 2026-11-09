import { createHash } from "node:crypto";
import { z } from "zod";
import type { Leader } from "../auth/session";
import { today } from "../dates";
import { provenanceKey } from "../data/conversations";
import { audit } from "../data/records";
import { MemoryFS } from "../memory/fs";
import { detectCrisis } from "../policy/crisis";
import { checkMemoryText } from "../policy/privacy";
import { kv } from "../store";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * "A thorn in the flesh" (2 Corinthians 12:7, KJV): something the leader carries, such as a chronic health
 * condition, that bears on their ministry. Health details are never saved on their own; this is the one
 * way the leader's OWN health can be remembered, and only with their spoken permission:
 *   1. remember_thorn is called with the detail: nothing is saved; Barnabas asks whether to remember it
 *      as a thorn in the flesh or keep it private.
 *   2. On the leader's very next message, remember_thorn is called again with the same detail. It saves
 *      only if those words clearly say to remember it. Anything else (including "keep it private") means
 *      nothing is stored, and the offer is closed.
 * Congregants' health stays under the church's memory policy; this is only for the leader themselves.
 */

export const THORN_PATH = "/memories/thorn-in-the-flesh.md";
export const THORN_VERSE = "And lest I should be exalted above measure through the abundance of the revelations, there was given to me a thorn in the flesh";
export const THORN_REF = "2 Corinthians 12:7";
const TOOL = "remember_thorn";

/** Clear permission to remember: a plain yes, or "remember it / save it", and nothing that keeps it private. */
export function consentsToRemember(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length > 200) return false;
  if (/\b(private|privately|don'?t|do not|no|nope|not|rather not|keep (it|that) (to myself|between us)|forget)\b/i.test(t)) return false;
  return (
    /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|absolutely|that'?s fine|go ahead|you can|i'?d like that)\b/i.test(t) ||
    /\b(remember (it|that|this)|save (it|that|this)|please do|you may|that would help|as a thorn)\b/i.test(t)
  );
}

export function detailKey(detail: string): string {
  return createHash("sha256").update(detail.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

export async function readThorns(leader: Pick<Leader, "churchId" | "leaderId">): Promise<string | null> {
  return new MemoryFS({ churchId: leader.churchId, leaderId: leader.leaderId }).read(THORN_PATH);
}

/** The leader-context section: what they've chosen to share, to keep in mind gently. */
export async function thornContext(leader: Pick<Leader, "churchId" | "leaderId">): Promise<string> {
  const file = (await readThorns(leader)) ?? "";
  const lines = file.split("\n").filter((l) => l.trim().startsWith("- "));
  if (!lines.length) return "";
  return [
    "# A thorn in the flesh (shared with you, with permission)",
    ...lines,
    "Keep this in mind with grace when you plan with them or they sound worn. Don't bring it up for its own sake, and never mention it to anyone else.",
  ].join("\n");
}

const ok = (content: unknown): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;

export const rememberThorn = tool({
  def: {
    name: TOOL,
    description:
      "For the leader's OWN health or ongoing personal struggle that bears on their ministry, such as a chronic condition (never a congregant's). " +
      "First call: nothing is saved; politely ask whether they'd like you to remember it as a thorn in the flesh, or keep it private and not store it. " +
      "After they answer, call again with exactly the same detail: it saves only if their words clearly say to remember it.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { detail: { type: "string", description: "One short, factual sentence in their words, e.g. 'Lives with rheumatoid arthritis; mornings are hardest.'" } },
      required: ["detail"],
    },
  },
  schema: z.object({ detail: z.string().min(3).max(300) }),
  async run({ detail }, ctx: ToolContext) {
    const meta = ctx.meta;
    if (meta.offRecord) return fail("This conversation is off the record, so nothing can be saved. Don't offer.");
    const clean = detail.replace(/\s+/g, " ").trim();
    const key = detailKey(clean);
    const pending = meta.pending?.tool === TOOL ? meta.pending : undefined;

    // Second call, on the leader's very next message, about the same detail: their words decide.
    if (pending && pending.key === key && pending.turn === meta.turns - 1) {
      meta.pending = undefined;
      if (!consentsToRemember(ctx.lastUserText)) {
        await audit(ctx.leader, { conversationId: meta.id, action: "memory.thorn.declined", detail: "kept private" });
        return ok({ saved: false, how: "They'd rather keep it private. Nothing was stored. Acknowledge that warmly in a few words, and don't save it any other way or ask again in this conversation." });
      }
      // Health is allowed here because the leader gave permission; secrets and children's details never are.
      const problem = checkMemoryText(clean, { allowSensitive: true });
      if (problem) return fail(problem);
      const fs = new MemoryFS({ churchId: ctx.leader.churchId, leaderId: ctx.leader.leaderId }, undefined, async (path) => {
        await kv().sadd(provenanceKey(ctx.leader, meta.id), path);
      });
      const existing = (await fs.read(THORN_PATH)) ?? `# A thorn in the flesh\n\n"${THORN_VERSE}" (${THORN_REF}, KJV)\n\nWhat you've asked Barnabas to keep in mind. Delete any line to have him forget it.\n`;
      const result = await fs.run({ command: "create", path: THORN_PATH, file_text: `${existing.replace(/\n*$/, "\n")}- ${today()}: ${clean}\n` });
      if (result.isError) return fail(result.text);
      await audit(ctx.leader, { conversationId: meta.id, action: "memory.thorn.saved", detail: "saved with spoken permission" });
      return ok({ saved: true, how: "Saved with their permission. Thank them briefly; say they can remove it any time on the Memory screen." });
    }

    // A first call: never in a hard moment; otherwise record the offer and have Barnabas ask.
    if (detectCrisis(ctx.lastUserText)) return fail("Not now: stay with what they need. Don't offer to remember anything.");
    if (pending && pending.turn === meta.turns) return fail("You've already asked about this in this reply.");
    meta.pending = { tool: TOOL, key, turn: meta.turns };
    return ok({
      saved: false,
      ask:
        "Nothing is saved yet. After caring for what they said, ask gently, in your own words, something like: " +
        "\"Would you like me to remember that as a thorn in the flesh, so I can keep it in mind as we plan, or would you rather keep it private and I won't store it?\" " +
        "Then wait. When they answer, call remember_thorn again with exactly the same detail.",
    });
  },
});

export const THORN_TOOLS = [rememberThorn];
