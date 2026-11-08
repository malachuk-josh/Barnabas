import { getJSON, setJSON, kv } from "../store";
import type { Leader } from "../auth/session";
import type { Language } from "../chms/types";
import { newId } from "./ids";

/* ---------- Drafts (review queue) ---------- */

export type DraftRecipient = { personId: string; name: string; language: Language; text: string };

export type Draft = {
  id: string;
  leaderId: string;
  conversationId: string;
  channel: "sms" | "email";
  subject?: string;
  baseText: string;
  recipients: DraftRecipient[];
  status: "needs_review" | "queued" | "discarded";
  createdAt: number;
  queuedAt?: number;
};

const draftKey = (l: Leader, id: string) => `draft:${l.churchId}:${l.leaderId}:${id}`;
const draftIndex = (l: Leader) => `drafts:${l.churchId}:${l.leaderId}`;

export async function saveDraft(leader: Leader, draft: Draft) {
  await setJSON(draftKey(leader, draft.id), draft);
  await kv().sadd(draftIndex(leader), draft.id);
}

export async function getDraft(leader: Leader, id: string) {
  return getJSON<Draft>(draftKey(leader, id));
}

export async function listDrafts(leader: Leader) {
  const ids = await kv().smembers(draftIndex(leader));
  const drafts = await Promise.all(ids.map((id) => getDraft(leader, id)));
  return drafts.filter((d): d is Draft => Boolean(d)).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * "Queue" stands in for delivery: no SMS or email provider is connected in this build,
 * so queued messages are recorded in the outbox and nothing leaves the app.
 */
export async function queueDraft(leader: Leader, draft: Draft) {
  draft.status = "queued";
  draft.queuedAt = Date.now();
  await saveDraft(leader, draft);
  const outboxKey = `outbox:${leader.churchId}`;
  const outbox = (await getJSON<unknown[]>(outboxKey)) ?? [];
  outbox.push({ draftId: draft.id, leaderId: leader.leaderId, at: draft.queuedAt, count: draft.recipients.length });
  await setJSON(outboxKey, outbox.slice(-1000));
}

/* ---------- Care events and follow-ups ---------- */

export type CareEvent = {
  id: string;
  personId: string;
  personName: string;
  kind: "visit" | "call" | "hospital" | "prayer" | "text" | "other";
  followUp?: string;
  due?: string;
  done?: boolean;
  createdAt: number;
  conversationId?: string;
};

const careKey = (l: Leader) => `care:${l.churchId}:${l.leaderId}`;

export async function listCare(leader: Leader) {
  return (await getJSON<CareEvent[]>(careKey(leader))) ?? [];
}

export async function addCare(leader: Leader, event: Omit<CareEvent, "id" | "createdAt">) {
  const all = await listCare(leader);
  const record: CareEvent = { ...event, id: newId("care"), createdAt: Date.now() };
  all.push(record);
  await setJSON(careKey(leader), all.slice(-500));
  return record;
}

export async function completeCare(leader: Leader, id: string) {
  const all = await listCare(leader);
  const item = all.find((c) => c.id === id);
  if (item) item.done = true;
  await setJSON(careKey(leader), all);
  return item ?? null;
}

/* ---------- Audit log ---------- */

export type AuditEntry = { at: number; conversationId?: string; action: string; detail: string };

const auditKey = (l: Leader) => `audit:${l.churchId}:${l.leaderId}`;

/** Every per-leader record key, for deleting a leader's data. */
export function leaderRecordKeys(l: Leader) {
  return [careKey(l), auditKey(l), draftIndex(l), `holds:${l.churchId}:${l.leaderId}`];
}

export async function audit(leader: Leader, entry: Omit<AuditEntry, "at">) {
  const all = (await getJSON<AuditEntry[]>(auditKey(leader))) ?? [];
  all.push({ ...entry, at: Date.now() });
  await setJSON(auditKey(leader), all.slice(-500));
}

export async function listAudit(leader: Leader) {
  return (await getJSON<AuditEntry[]>(auditKey(leader))) ?? [];
}
