import type Anthropic from "@anthropic-ai/sdk";
import { getJSON, kv, setJSON } from "../store";
import type { Leader } from "../auth/session";

export type Mode = "voice" | "text";

export type ConversationMeta = {
  id: string;
  title: string;
  mode: Mode;
  offRecord: boolean;
  createdAt: number;
  updatedAt: number;
  /** Per-leader system block, frozen at creation so the prompt cache stays valid all conversation. */
  context: string;
  turns: number;
  endedAt?: number;
  consolidatedAt?: number;
  consolidationError?: string;
  /** An action Barnabas proposed that needs the leader's yes on a later turn. */
  pending?: { tool: string; key: string; turn: number };
  /** Getting-to-know-you questions asked in this conversation (see engine/know.ts). */
  know?: { asked: string[]; lastAskTurn?: number; permission?: { status: "asked" | "granted" | "declined"; turn: number } };
};

export type Message = Anthropic.Beta.BetaMessageParam;

/** Off-the-record conversations live only for the length of a call. */
const OFF_RECORD_TTL = 60 * 60;

const base = (l: Leader) => `conv:${l.churchId}:${l.leaderId}`;
const metaKey = (l: Leader, id: string) => `${base(l)}:${id}:meta`;
const messagesKey = (l: Leader, id: string) => `${base(l)}:${id}:messages`;
const indexKey = (l: Leader) => `convs:${l.churchId}:${l.leaderId}`;
export const lockKey = (l: Leader, id: string) => `lock:${base(l)}:${id}`;
export const provenanceKey = (l: Leader, id: string) => `prov:${l.churchId}:${l.leaderId}:${id}`;

export async function createConversation(leader: Leader, meta: ConversationMeta) {
  const ttl = meta.offRecord ? { ttlSeconds: OFF_RECORD_TTL } : undefined;
  await setJSON(metaKey(leader, meta.id), meta, ttl);
  await setJSON(messagesKey(leader, meta.id), [], ttl);
  if (!meta.offRecord) await kv().sadd(indexKey(leader), meta.id);
}

export async function getConversation(leader: Leader, id: string) {
  return getJSON<ConversationMeta>(metaKey(leader, id));
}

export async function saveConversation(leader: Leader, meta: ConversationMeta) {
  await setJSON(metaKey(leader, meta.id), meta, meta.offRecord ? { ttlSeconds: OFF_RECORD_TTL } : undefined);
}

export async function getMessages(leader: Leader, id: string): Promise<Message[]> {
  return (await getJSON<Message[]>(messagesKey(leader, id))) ?? [];
}

/**
 * Append-only: callers pass only new messages. Earlier turns are never rewritten,
 * which keeps the prompt cache valid and keeps Claude's thinking blocks usable.
 */
export async function appendMessages(leader: Leader, meta: ConversationMeta, ...added: Message[]) {
  const current = await getMessages(leader, meta.id);
  current.push(...added);
  await setJSON(messagesKey(leader, meta.id), current, meta.offRecord ? { ttlSeconds: OFF_RECORD_TTL } : undefined);
  return current;
}

export async function listConversations(leader: Leader): Promise<ConversationMeta[]> {
  const ids = await kv().smembers(indexKey(leader));
  const metas = await Promise.all(ids.map((id) => getConversation(leader, id)));
  return metas.filter((m): m is ConversationMeta => Boolean(m)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteConversation(leader: Leader, id: string) {
  await kv().del(metaKey(leader, id), messagesKey(leader, id), provenanceKey(leader, id));
  await kv().srem(indexKey(leader), id);
}

/** Plain-text transcript of what was said (for memory consolidation and forgetting). */
export function transcript(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const blocks = typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content ?? [];
    for (const b of blocks) {
      if (b.type === "text" && b.text.trim()) lines.push(`${m.role === "user" ? "Leader" : "Barnabas"}: ${b.text.trim()}`);
      if (b.type === "tool_use") lines.push(`(Barnabas used ${b.name})`);
    }
  }
  return lines.join("\n");
}
