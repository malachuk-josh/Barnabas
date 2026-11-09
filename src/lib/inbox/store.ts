import { getJSON, setJSON, withLock } from "../store";

/**
 * Messages inside Barnabas, between people on the church's list (not the outbound text and email drafts in
 * `src/lib/messages`). Redis layout, per church:
 *   inbox:{church}:thread:{id}     the thread: participants (leaderIds), what it's about, its sequence number
 *   inbox:{church}:msgs:{id}       its messages, oldest first, the newest MESSAGE_CAP kept
 *   inbox:{church}:mine:{leaderId} that person's threads, most recent activity first
 *   inbox:{church}:read:{leaderId} threadId -> the last sequence number they've read
 *   inbox:{church}:key:{hash}      participants + about -> threadId, so a second "start" joins the first thread
 * Writes happen under one per-church lock (a church's message volume is small).
 */

export type InboxThread = {
  id: string;
  /** leaderIds, sorted. Always includes whoever started it. */
  participants: string[];
  /** A child's first name, when the thread is about a child (e.g. from kids check-in). */
  about?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Counts every message ever sent in the thread; unread = seq - the reader's marker. */
  seq: number;
  last?: { by: string; text: string; at: number };
};

export type InboxMessage = { id: string; seq: number; by: string; text: string; at: number };
export type ThreadRef = { id: string; at: number };

export const MESSAGE_CAP = 500;
export const INDEX_CAP = 1000;

const k = (church: string, ...rest: string[]) => ["inbox", church, ...rest].join(":");

export const loadThread = (church: string, id: string) => getJSON<InboxThread>(k(church, "thread", id));
export const saveThread = (church: string, t: InboxThread) => setJSON(k(church, "thread", t.id), t);
export const loadMessages = async (church: string, id: string) => (await getJSON<InboxMessage[]>(k(church, "msgs", id))) ?? [];
export const saveMessages = (church: string, id: string, msgs: InboxMessage[]) => setJSON(k(church, "msgs", id), msgs.slice(-MESSAGE_CAP));
export const loadIndex = async (church: string, leaderId: string) => (await getJSON<ThreadRef[]>(k(church, "mine", leaderId))) ?? [];
export const saveIndex = (church: string, leaderId: string, refs: ThreadRef[]) => setJSON(k(church, "mine", leaderId), refs.slice(0, INDEX_CAP));
export const loadRead = async (church: string, leaderId: string) => (await getJSON<Record<string, number>>(k(church, "read", leaderId))) ?? {};
export const saveRead = (church: string, leaderId: string, read: Record<string, number>) => setJSON(k(church, "read", leaderId), read);
export const threadForKey = (church: string, hash: string) => getJSON<string>(k(church, "key", hash));
export const setThreadKey = (church: string, hash: string, id: string) => setJSON(k(church, "key", hash), id);

export function withInboxLock<T>(church: string, fn: () => Promise<T>) {
  return withLock(k(church, "lock"), fn);
}

/** Moves a thread to the top of someone's list. */
export async function touchIndex(church: string, leaderId: string, threadId: string, at: number) {
  const refs = (await loadIndex(church, leaderId)).filter((r) => r.id !== threadId);
  await saveIndex(church, leaderId, [{ id: threadId, at }, ...refs]);
}

export async function markRead(church: string, leaderId: string, threadId: string, seq: number) {
  const read = await loadRead(church, leaderId);
  if ((read[threadId] ?? 0) >= seq) return;
  read[threadId] = seq;
  await saveRead(church, leaderId, read);
}
