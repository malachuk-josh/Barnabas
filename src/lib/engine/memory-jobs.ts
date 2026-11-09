import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { Leader } from "../auth/session";
import {
  deleteConversation,
  getConversation,
  getMessages,
  provenanceKey,
  saveConversation,
  transcript,
} from "../data/conversations";
import { audit } from "../data/records";
import { MemoryFS } from "../memory/fs";
import { checkMemoryText } from "../policy/privacy";
import { kv } from "../store";
import { claude, historyContent, supportsFallbacks } from "./claude";
import { CORE_PATH, INBOX_PATH } from "./prompt";
import { KNOW_PATH, KNOW_QUESTIONS } from "./know";
import { THORN_PATH } from "./thorn";

const MEMORY_TOOL: Anthropic.Beta.BetaMemoryTool20250818 = { type: "memory_20250818", name: "memory" };

const POLICY_TEXT = () =>
  config.allowSensitiveMemory
    ? "The church's written policy allows sensitive pastoral details when the leader asked to remember them. Still keep them minimal."
    : "Never record health details, diagnoses, counseling content, family conflict, abuse, addiction, legal or immigration status, or finances. For congregants keep only a person reference (name and person id) and a minimal follow-up.";

const CONSOLIDATE_SYSTEM = () => `You maintain the memory of Barnabas, an AI assistant for one church ministry leader. After each conversation you update the leader's memory files so the next conversation starts with the right context.

Memory layout (markdown files under /memories):
- ${CORE_PATH}: who the leader is, their ministries, preferences, standing commitments and current priorities. Keep it under about 60 lines; it is loaded at the start of every conversation.
- /memories/people/<first-last>.md: one file per congregant the leader is caring for, with the person id, open follow-ups and dates. Minimal.
- /memories/topics/<name>.md: ongoing plans, such as a sermon series, an event or a project.
- ${INBOX_PATH}: quick notes saved during conversations. Move each relevant note into the right file and then remove it from the inbox.
- ${KNOW_PATH}: the leader's answers to Barnabas's twenty getting-to-know-you questions, one line each, starting "- [k01]" through "- [k20]". Keep this exact format and the ids. If the conversation clearly answered one of these (${KNOW_QUESTIONS.map((q) => `${q.id} ${q.topic}`).join("; ")}), add or update its line in one short sentence. Never delete a line unless the leader asked you to forget it, and don't copy these answers into other files.

Rules:
- Record only what the conversation supports. Don't speculate or add advice.
- Merge, don't duplicate. Update or remove facts that are no longer true (for example a follow-up that was completed).
- Write dates as yyyy-mm-dd.
- ${POLICY_TEXT()}
- Never record passwords, codes, account numbers or other secrets.
- Never record the leader's own health conditions anywhere. ${THORN_PATH} holds the only ones they agreed to share; Barnabas changes it only with their spoken permission. Don't edit it, copy from it, or add to it.
- If nothing worth remembering was said, change nothing.
When you're finished, reply with one short sentence describing what you changed.`;

const FORGET_SYSTEM = () => `You maintain the memory of Barnabas, an AI assistant for one church ministry leader. The leader deleted a conversation and asked Barnabas to forget it.

Remove from the memory files anything that came from the deleted conversation below. Keep facts that are also supported by other notes or that the leader clearly stated elsewhere; if unsure, remove it. Delete files that become empty. Don't add anything new.
When you're finished, reply with one short sentence describing what you removed.`;

async function runMemoryAgent(leader: Leader, conversationId: string, systemPrompt: string, userText: string, track: boolean) {
  const fs = new MemoryFS(
    { churchId: leader.churchId, leaderId: leader.leaderId },
    (text) => checkMemoryText(text, { allowSensitive: config.allowSensitiveMemory }),
    async (path) => {
      if (track) await kv().sadd(provenanceKey(leader, conversationId), path);
    },
  );
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userText }];
  let summary = "";
  for (let step = 0; step < 25; step++) {
    const response = await claude().beta.messages.create({
      model: config.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: config.memoryEffort },
      system: systemPrompt,
      tools: [MEMORY_TOOL],
      messages,
      ...(supportsFallbacks(config.model) ? { fallbacks: "default" as const, betas: [config.fallbackBeta] } : {}),
    });
    if (response.stop_reason === "refusal") throw new Error("Memory update was declined.");
    const content = historyContent(response.content);
    messages.push({ role: "assistant", content });
    const calls = content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !calls.length) {
      summary = content
        .filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      break;
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const out = call.name === "memory" ? await fs.run((call.input ?? {}) as Record<string, unknown>) : { text: `Unknown tool ${call.name}`, isError: true };
      if (!out.isError && call.name === "memory") {
        const cmd = (call.input as Record<string, unknown>)?.command;
        if (cmd !== "view") await audit(leader, { conversationId, action: `memory.${String(cmd)}`, detail: String((call.input as Record<string, unknown>)?.path ?? (call.input as Record<string, unknown>)?.old_path ?? "") });
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: out.text, ...(out.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { fs, summary };
}

/** Remove inbox lines saved during one conversation (after they were organized or forgotten). */
async function clearInboxLines(fs: MemoryFS, conversationId: string) {
  const inbox = await fs.read(INBOX_PATH);
  if (inbox === null) return;
  const kept = inbox.split("\n").filter((line) => !line.includes(`[conv:${conversationId}]`));
  const hasNotes = kept.some((l) => l.startsWith("- "));
  if (hasNotes) await fs.run({ command: "create", path: INBOX_PATH, file_text: kept.join("\n") });
  else await fs.run({ command: "delete", path: INBOX_PATH });
}

/** After a conversation ends: fold what was learned into the leader's memory files. */
export async function consolidateConversation(leader: Leader, conversationId: string) {
  const meta = await getConversation(leader, conversationId);
  if (!meta || meta.offRecord) return { skipped: true };
  const text = transcript(await getMessages(leader, conversationId));
  if (!text.trim()) return { skipped: true };
  try {
    const { fs, summary } = await runMemoryAgent(
      leader,
      conversationId,
      CONSOLIDATE_SYSTEM(),
      `Leader: ${leader.name}${leader.role ? ` (${leader.role})` : ""}\nConversation id: ${conversationId}\n\nTranscript:\n${text}\n\nUpdate the memory files now. Start by viewing /memories.`,
      true,
    );
    await clearInboxLines(fs, conversationId);
    meta.consolidatedAt = Date.now();
    meta.consolidationError = undefined;
    await saveConversation(leader, meta);
    return { skipped: false, summary };
  } catch (err) {
    console.error("[barnabas] consolidation failed", err);
    meta.consolidationError = "Memory update failed. Notes saved during the conversation are still in the inbox.";
    await saveConversation(leader, meta);
    return { skipped: false, error: meta.consolidationError };
  }
}

/** Delete a conversation and remove what Barnabas learned from it. */
export async function forgetConversation(leader: Leader, conversationId: string) {
  const meta = await getConversation(leader, conversationId);
  if (!meta) return { removed: false, touched: [] as string[] };
  const touched = await kv().smembers(provenanceKey(leader, conversationId));
  const text = transcript(await getMessages(leader, conversationId));
  const fs = new MemoryFS({ churchId: leader.churchId, leaderId: leader.leaderId });
  let summary = "";
  let error: string | undefined;
  if (text.trim() && (touched.length || meta.consolidatedAt)) {
    try {
      const result = await runMemoryAgent(
        leader,
        conversationId,
        FORGET_SYSTEM(),
        `Files this conversation changed: ${touched.length ? touched.join(", ") : "(unknown)"}\n\nDeleted conversation transcript:\n${text}\n\nRemove what came from it now. Start by viewing the files it changed.`,
        false,
      );
      summary = result.summary;
    } catch (err) {
      console.error("[barnabas] forget failed", err);
      error = "Barnabas couldn't clean its memory automatically. Review these files in the Memory screen.";
    }
  }
  await clearInboxLines(fs, conversationId);
  await deleteConversation(leader, conversationId);
  await audit(leader, { conversationId, action: "conversation.delete", detail: touched.join(", ") });
  return { removed: true, touched, summary, error };
}
