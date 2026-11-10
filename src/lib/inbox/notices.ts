import { newId } from "../data/ids";
import { loadMessages, loadThread, saveMessages, saveThread, touchIndex, withInboxLock, type InboxThread } from "./store";

/** Who notifications come from in Messages. */
export const NOTICE_SENDER = "barnabas";
export const noticeThreadId = (leaderId: string) => `notices-${leaderId}`;

/**
 * Every notification also lands in the person's Messages, in one "Notifications" conversation from
 * Barnabas (no replies), so it's there even without push on this device. Same words as the push.
 */
export async function recordNotice(churchId: string, leaderId: string, n: { title: string; body: string; url?: string }) {
  await withInboxLock(churchId, async () => {
    const id = noticeThreadId(leaderId);
    const now = Date.now();
    const t: InboxThread = (await loadThread(churchId, id)) ?? { id, participants: [leaderId], system: "notifications", createdBy: NOTICE_SENDER, createdAt: now, updatedAt: now, seq: 0 };
    const at = Math.max(now, t.updatedAt + 1);
    const text = `${n.title}: ${n.body}`;
    const msgs = await loadMessages(churchId, id);
    t.seq += 1;
    t.updatedAt = at;
    t.last = { by: NOTICE_SENDER, text: text.slice(0, 160), at };
    await saveMessages(churchId, id, [...msgs, { id: newId("msg"), seq: t.seq, by: NOTICE_SENDER, text, at, ...(n.url && n.url.startsWith("/") && !n.url.startsWith("//") ? { href: n.url } : {}) }]);
    await saveThread(churchId, t);
    await touchIndex(churchId, leaderId, id, at);
  });
}
