import type { Leader } from "../auth/session";
import { getJSON, kv, setJSON, withLock } from "../store";
import { entryText, plainSnippet, KIND_LABELS, SERMON_STATUS_LABELS, type JournalEntry, type JournalSummary } from "./types";

/**
 * Redis layout, per church and leader (journal entries are the leader's own writing):
 *   jrnl:{church}:{leaderId}          the leader's index: one summary per entry (title, tags, snippet, search text)
 *   jrnl:{church}:{leaderId}:e:{id}   one entry, whole
 *   jrnl:{church}:shared              "{leaderId}:{id}" for every entry shared with the leadership team
 * Changes to a leader's journal run under their own lock.
 */

type Owner = Pick<Leader, "churchId" | "leaderId">;

export const indexKey = (o: Owner) => `jrnl:${o.churchId}:${o.leaderId}`;
export const entryKey = (o: Owner, id: string) => `jrnl:${o.churchId}:${o.leaderId}:e:${id}`;
export const sharedKey = (churchId: string) => `jrnl:${churchId}:shared`;
const lockKey = (o: Owner) => `lock:jrnl:${o.churchId}:${o.leaderId}`;

const MAX_HAYSTACK = 6000;

export function summarize(e: JournalEntry): JournalSummary {
  const text = entryText(e);
  let detail: string | undefined;
  if (e.kind === "sermon" && e.sermon) detail = [SERMON_STATUS_LABELS[e.sermon.status], e.sermon.passages[0]].filter(Boolean).join(" · ");
  if (e.kind === "setlist" && e.setlist) detail = [`${e.setlist.songs.length} song${e.setlist.songs.length === 1 ? "" : "s"}`, e.setlist.serviceDate].filter(Boolean).join(" · ");
  if (e.kind === "devotional" && e.devotional) detail = `${e.devotional.days.length} day${e.devotional.days.length === 1 ? "" : "s"}${e.devotional.passages[0] ? ` · ${e.devotional.passages[0]}` : ""}`;
  return {
    id: e.id,
    ownerId: e.ownerId,
    ownerName: e.ownerName,
    kind: e.kind,
    title: e.title,
    tags: e.tags,
    pinned: e.pinned,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    archivedAt: e.archivedAt,
    shared: e.shared,
    snippet: plainSnippet(
      (e.kind === "sermon" && e.sermon?.bigIdea) ||
        (e.kind === "setlist" && e.setlist?.songs.map((x) => x.title).filter(Boolean).join(" · ")) ||
        (e.kind === "devotional" && e.devotional?.days.map((x) => x.title).filter(Boolean).join(" · ")) ||
        e.body ||
        text,
    ),
    haystack: `${e.title}\n${e.tags.join(" ")}\n${KIND_LABELS[e.kind]}\n${text}`.toLowerCase().slice(0, MAX_HAYSTACK),
    detail: detail || undefined,
  };
}

export async function readIndex(o: Owner): Promise<JournalSummary[]> {
  return (await getJSON<JournalSummary[]>(indexKey(o))) ?? [];
}

export async function readEntry(o: Owner, id: string): Promise<JournalEntry | null> {
  if (!/^[\w-]{1,40}$/.test(id)) return null;
  return getJSON<JournalEntry>(entryKey(o, id));
}

/** Saves an entry and its summary, and keeps the shared list in step. */
export async function writeEntry(o: Owner, entry: JournalEntry) {
  await withLock(lockKey(o), async () => {
    await setJSON(entryKey(o, entry.id), entry);
    const index = (await readIndex(o)).filter((s) => s.id !== entry.id);
    index.push(summarize(entry));
    await setJSON(indexKey(o), index);
  });
  const member = `${o.leaderId}:${entry.id}`;
  if (entry.shared) await kv().sadd(sharedKey(o.churchId), member);
  else await kv().srem(sharedKey(o.churchId), member);
}

export async function removeEntry(o: Owner, id: string) {
  await withLock(lockKey(o), async () => {
    await kv().del(entryKey(o, id));
    await setJSON(indexKey(o), (await readIndex(o)).filter((s) => s.id !== id));
  });
  await kv().srem(sharedKey(o.churchId), `${o.leaderId}:${id}`);
}

/** Shared entries: who wrote each one, and its id. */
export async function sharedMembers(churchId: string): Promise<{ ownerId: string; id: string }[]> {
  return (await kv().smembers(sharedKey(churchId)))
    .map((m) => {
      const i = m.indexOf(":");
      return i > 0 ? { ownerId: m.slice(0, i), id: m.slice(i + 1) } : null;
    })
    .filter((x): x is { ownerId: string; id: string } => Boolean(x));
}

/** Everything in one leader's journal, for Settings → Privacy → delete my data. */
export async function deleteJournal(o: Owner) {
  const index = await readIndex(o);
  const ids = new Set(index.map((s) => s.id));
  for (const m of await sharedMembers(o.churchId)) if (m.ownerId === o.leaderId) ids.add(m.id);
  if (ids.size) await kv().del(...[...ids].map((id) => entryKey(o, id)));
  if (ids.size) await kv().srem(sharedKey(o.churchId), ...[...ids].map((id) => `${o.leaderId}:${id}`));
  await kv().del(indexKey(o));
}

/** How many entries a leader has (the only thing about the journal Barnabas's conversation context holds). */
export async function journalCount(o: Owner): Promise<number> {
  return (await readIndex(o)).filter((s) => !s.archivedAt).length;
}
