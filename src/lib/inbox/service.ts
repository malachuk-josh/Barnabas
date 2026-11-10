import { z } from "zod";
import type { Leader } from "../auth/session";
import { LEVEL_LABELS, TEAM_ROLE_LABELS, type Access } from "../auth/roles";
import { newId } from "../data/ids";
import { directMessage } from "../notifications/notify";
import { NOTICE_SENDER } from "./notices";
import { accessFor, getLeaderRecord, levelOf, listLeaders, type LeaderRecord } from "../team";
import {
  loadIndex,
  loadMessages,
  loadRead,
  loadThread,
  markRead,
  saveMessages,
  saveThread,
  setThreadKey,
  threadForKey,
  touchIndex,
  withInboxLock,
  type InboxMessage,
  type InboxThread,
} from "./store";

/**
 * Messages between people on the church's list, e.g. a kids co-laborer and a parent during a service.
 * Who may start a thread: Admins, Leaders, anyone without a level yet, and Team may message anyone on the
 * list; Members may message only people who aren't Members (staff and teams). Anyone may reply in a thread
 * they're in, and only participants can read a thread (everyone else gets "not found"). Removed people
 * can't be messaged.
 */

export class InboxError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
const fail = (message: string, status = 400): never => {
  throw new InboxError(message, status);
};
const notFound = () => fail("That conversation isn't here.", 404);

export const Text = z.string().trim().min(1, "Write a message first.").max(2000, "Keep a message under 2,000 characters.");
const LeaderId = z.string().min(1).max(64);
export const StartInput = z.object({
  to: z.array(LeaderId).min(1, "Choose who to message.").max(20, "Message up to 20 people at once."),
  text: Text,
  about: z.string().trim().max(40).optional(),
});
export const ReplyInput = z.object({ text: Text });

export type InboxActor = { leader: Leader; access: Access };

export async function inboxActor(leader: Leader): Promise<InboxActor> {
  return { leader, access: await accessFor(leader) };
}

/** Members (and not admins) may start threads only with people who aren't Members. */
export const isMemberLevel = (access: Access) => access.level === "member" && !access.admin;

export type Person = { leaderId: string; name: string; label: string };

export function personLabel(r: Pick<LeaderRecord, "email" | "access" | "level" | "finance" | "teamRole">): string {
  const l = levelOf(r);
  return l.level === "team" && l.teamRole ? `${LEVEL_LABELS.team} · ${TEAM_ROLE_LABELS[l.teamRole]}` : LEVEL_LABELS[l.level];
}

/** Who this person may start a thread with, by name. */
export async function messagablePeople(actor: InboxActor, records?: LeaderRecord[]): Promise<Person[]> {
  const all = records ?? (await listLeaders(actor.leader.churchId));
  const member = isMemberLevel(actor.access);
  return all
    .filter((r) => !r.removed && r.leaderId !== actor.leader.leaderId)
    .filter((r) => !member || levelOf(r).level !== "member")
    .map((r) => ({ leaderId: r.leaderId, name: r.name || r.email, label: personLabel(r) }));
}

async function hashOf(participants: string[], about: string) {
  const data = new TextEncoder().encode(`${participants.join(",")}|${about.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

const cleanAbout = (about?: string) => (about ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

async function append(church: string, t: InboxThread, by: string, text: string) {
  const at = Math.max(Date.now(), t.updatedAt + 1);
  const msgs = await loadMessages(church, t.id);
  const msg: InboxMessage = { id: newId("msg"), seq: t.seq + 1, by, text, at };
  t.seq = msg.seq;
  t.updatedAt = at;
  t.last = { by, text: text.slice(0, 160), at };
  await saveMessages(church, t.id, [...msgs, msg]);
  await saveThread(church, t);
  await Promise.all(t.participants.map((p) => touchIndex(church, p, t.id, at)));
  await markRead(church, by, t.id, msg.seq);
  return msg;
}

function notify(actor: InboxActor, t: InboxThread, active: Set<string>) {
  const to = t.participants.filter((p) => p !== actor.leader.leaderId && active.has(p));
  if (to.length) directMessage(actor.leader.churchId, actor.leader, to, t.id);
}

/**
 * Starts a thread, or adds to the one that already has exactly these people and is about the same child.
 */
export async function startThread(actor: InboxActor, input: z.input<typeof StartInput>) {
  const v = StartInput.parse(input);
  const church = actor.leader.churchId;
  const me = actor.leader.leaderId;
  const records = await listLeaders(church);
  const allowed = new Set((await messagablePeople(actor, records)).map((p) => p.leaderId));
  const to = [...new Set(v.to.filter((id) => id !== me))];
  if (!to.length) fail("Choose who to message.");
  for (const id of to) {
    if (!allowed.has(id)) {
      const r = records.find((x) => x.leaderId === id);
      fail(r && isMemberLevel(actor.access) ? "Members can message the church staff and teams. Choose someone from the list." : "That person isn't on Barnabas.", 403);
    }
  }
  const participants = [me, ...to].sort();
  const about = cleanAbout(v.about);
  const hash = await hashOf(participants, about);
  const result = await withInboxLock(church, async () => {
    const existingId = await threadForKey(church, hash);
    const existing = existingId ? await loadThread(church, existingId) : null;
    if (existing && existing.participants.includes(me)) {
      const message = await append(church, existing, me, v.text);
      return { thread: existing, message, created: false };
    }
    const now = Date.now();
    const thread: InboxThread = { id: newId("thr"), participants, ...(about ? { about } : {}), createdBy: me, createdAt: now, updatedAt: now, seq: 0 };
    await setThreadKey(church, hash, thread.id);
    const message = await append(church, thread, me, v.text);
    return { thread, message, created: true };
  });
  notify(actor, result.thread, new Set(records.filter((r) => !r.removed).map((r) => r.leaderId)));
  return result;
}

async function threadFor(actor: InboxActor, id: string) {
  if (!/^[\w-]{1,64}$/.test(id)) notFound();
  const t = await loadThread(actor.leader.churchId, id);
  if (!t || !t.participants.includes(actor.leader.leaderId)) notFound();
  return t!;
}

export async function reply(actor: InboxActor, id: string, input: z.input<typeof ReplyInput>) {
  const v = ReplyInput.parse(input);
  const church = actor.leader.churchId;
  await threadFor(actor, id);
  if ((await loadThread(church, id))?.system) fail("Notifications can't be replied to.", 400);
  const out = await withInboxLock(church, async () => {
    const t = (await loadThread(church, id))!;
    const message = await append(church, t, actor.leader.leaderId, v.text);
    return { thread: t, message };
  });
  const records = await listLeaders(church);
  notify(actor, out.thread, new Set(records.filter((r) => !r.removed).map((r) => r.leaderId)));
  return out;
}

/** Names for a set of leaderIds: the people list first, then their own record (someone since removed). */
async function namesFor(church: string, ids: string[], records?: LeaderRecord[]) {
  const all = records ?? (await listLeaders(church));
  const byId = new Map(all.map((r) => [r.leaderId, r.name || r.email]));
  const missing = [...new Set(ids)].filter((id) => !byId.has(id));
  const found = await Promise.all(missing.map((id) => getLeaderRecord(church, id)));
  missing.forEach((id, i) => byId.set(id, found[i]?.name || "Someone no longer on Barnabas"));
  return byId;
}

export type ThreadSummary = {
  id: string;
  about?: string;
  /** Everyone in it but me. */
  with: { leaderId: string; name: string }[];
  updatedAt: number;
  unread: number;
  last?: { mine: boolean; name: string; text: string; at: number };
  /** The person's Notifications from Barnabas: no replies. */
  system?: "notifications";
};

function summarize(t: InboxThread, me: string, names: Map<string, string>, read: Record<string, number>): ThreadSummary {
  return {
    id: t.id,
    about: t.about,
    with: t.system ? [{ leaderId: NOTICE_SENDER, name: "Notifications" }] : t.participants.filter((p) => p !== me).map((p) => ({ leaderId: p, name: names.get(p) ?? "Someone" })),
    ...(t.system ? { system: t.system } : {}),
    updatedAt: t.updatedAt,
    unread: Math.max(0, t.seq - (read[t.id] ?? 0)),
    last: t.last ? { mine: t.last.by === me, name: t.last.by === me ? "You" : t.last.by === NOTICE_SENDER ? "Barnabas" : (names.get(t.last.by) ?? "Someone"), text: t.last.text.slice(0, 120), at: t.last.at } : undefined,
  };
}

async function myThreads(church: string, me: string, limit: number) {
  const refs = (await loadIndex(church, me)).slice(0, limit);
  const threads = await Promise.all(refs.map((r) => loadThread(church, r.id)));
  return threads.filter((t): t is InboxThread => Boolean(t && t.participants.includes(me))).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** My threads, most recent first, with unread counts. */
export async function listThreads(actor: InboxActor, limit = 200) {
  const church = actor.leader.churchId;
  const me = actor.leader.leaderId;
  const [threads, read] = await Promise.all([myThreads(church, me, limit), loadRead(church, me)]);
  const names = await namesFor(church, threads.flatMap((t) => t.participants));
  const summaries = threads.map((t) => summarize(t, me, names, read));
  return { threads: summaries, unread: summaries.reduce((n, s) => n + s.unread, 0) };
}

/** Opens a thread: its messages, oldest first, and marks it read. */
export async function openThread(actor: InboxActor, id: string) {
  const church = actor.leader.churchId;
  const me = actor.leader.leaderId;
  const t = await threadFor(actor, id);
  const [msgs, names] = await Promise.all([loadMessages(church, id), namesFor(church, t.participants)]);
  await markRead(church, me, id, t.seq);
  const read = { [t.id]: t.seq };
  return {
    thread: summarize(t, me, names, read),
    messages: msgs.map((m) => ({ id: m.id, mine: m.by === me, by: m.by, name: m.by === me ? "You" : m.by === NOTICE_SENDER ? "Barnabas" : (names.get(m.by) ?? "Someone"), text: m.text, at: m.at, ...(m.href ? { href: m.href } : {}) })),
  };
}

/** For the Messages badge in the menu: unread messages across someone's 50 most recent threads. */
export async function unreadCount(leader: Pick<Leader, "churchId" | "leaderId">): Promise<number> {
  try {
    const [threads, read] = await Promise.all([myThreads(leader.churchId, leader.leaderId, 50), loadRead(leader.churchId, leader.leaderId)]);
    return threads.reduce((n, t) => n + Math.max(0, t.seq - (read[t.id] ?? 0)), 0);
  } catch {
    return 0;
  }
}
