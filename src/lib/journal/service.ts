import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, isCheckinOnly, type Access } from "../auth/roles";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { friendlyDate } from "../dates";
import { GATHERING_KEYS, gathering, ISO_RE, meetsOn, type GatheringKey } from "../ops/gatherings";
import { canEditTeam, serveActor } from "../serve/service";
import { loadServe } from "../serve/store";
import { parseRef } from "../services/scripture";
import { templateItems } from "../services/service";
import { loadServices, updateServices } from "../services/store";
import type { ServiceItem } from "../services/types";
import { accessFor } from "../team";
import { readEntry, readIndex, removeEntry, sharedMembers, writeEntry } from "./store";
import { emptyFor, EntryPatchSchema, JOURNAL_KINDS, NewEntrySchema, type EntryPatch, type JournalEntry, type JournalKind, type JournalSummary, type NewEntry, type Song } from "./types";

/**
 * Every journal read and change goes through here. A leader's entries are theirs alone: only the owner can
 * change, share, archive or delete one. Another signed-in leader can read an entry only while its owner
 * shares it with the leadership team, and never edit it. The kids check-in role has no journal at all.
 * Sharing, sending a setlist to the order of service and deleting are audited.
 */

export class JournalError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
const fail = (message: string, status = 400): never => {
  throw new JournalError(message, status);
};

export type JournalActor = { leader: Leader; access: Access };

export async function journalActor(leader: Leader): Promise<JournalActor> {
  const access = await accessFor(leader);
  if (isCheckinOnly(access)) fail("Your role is kids check-in only.", 403);
  return { leader, access };
}

const owner = (a: JournalActor) => ({ churchId: a.leader.churchId, leaderId: a.leader.leaderId });

async function log(actor: JournalActor, action: string, detail: string, conversationId?: string) {
  await audit(actor.leader, { action: `journal.${action}`, detail: detail.slice(0, 300), conversationId });
}

/* ---------- Reading ---------- */

export const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(JOURNAL_KINDS).optional(),
  tag: z.string().trim().max(30).optional(),
  /** mine (default, not archived), pinned, shared (shared with me by others), archived */
  filter: z.enum(["mine", "pinned", "shared", "archived"]).optional(),
});
export type ListQuery = z.input<typeof ListQuery>;

/** Summaries of the leader's own entries, or of entries others shared with them. Newest first, pinned on top. */
export async function listEntries(actor: JournalActor, query: ListQuery = {}): Promise<JournalSummary[]> {
  const q = ListQuery.parse(query);
  let rows: JournalSummary[];
  if (q.filter === "shared") rows = await sharedWithMe(actor);
  else {
    rows = await readIndex(owner(actor));
    if (q.filter === "archived") rows = rows.filter((r) => r.archivedAt);
    else rows = rows.filter((r) => !r.archivedAt);
    if (q.filter === "pinned") rows = rows.filter((r) => r.pinned);
  }
  if (q.kind) rows = rows.filter((r) => r.kind === q.kind);
  if (q.tag) {
    const tag = q.tag.replace(/^#/, "").toLowerCase();
    rows = rows.filter((r) => r.tags.includes(tag));
  }
  if (q.q) {
    const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((r) => words.every((w) => r.haystack.includes(w)));
  }
  return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

async function sharedWithMe(actor: JournalActor): Promise<JournalSummary[]> {
  const members = (await sharedMembers(actor.leader.churchId)).filter((m) => m.ownerId !== actor.leader.leaderId);
  const owners = [...new Set(members.map((m) => m.ownerId))];
  const indexes = await Promise.all(owners.map((o) => readIndex({ churchId: actor.leader.churchId, leaderId: o })));
  const wanted = new Set(members.map((m) => `${m.ownerId}:${m.id}`));
  return indexes.flat().filter((s) => s.shared && !s.archivedAt && wanted.has(`${s.ownerId}:${s.id}`));
}

/** The tags the leader has used, most used first. */
export async function myTags(actor: JournalActor): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const s of await readIndex(owner(actor))) if (!s.archivedAt) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

export type EntryView = { entry: JournalEntry; mine: boolean };

/** One entry: the leader's own, or one shared with the leadership team (read-only). Anything else is "not found". */
export async function getEntry(actor: JournalActor, id: string): Promise<EntryView> {
  const own = await readEntry(owner(actor), id);
  if (own) return { entry: own, mine: true };
  const m = (await sharedMembers(actor.leader.churchId)).find((x) => x.id === id && x.ownerId !== actor.leader.leaderId);
  if (m) {
    const e = await readEntry({ churchId: actor.leader.churchId, leaderId: m.ownerId }, id);
    if (e && e.shared && !e.archivedAt) return { entry: e, mine: false };
  }
  return fail("That journal entry isn't here, or it isn't shared with you.", 404);
}

/** The leader's own entry, for a change. A shared entry someone else wrote is read-only. */
async function ownEntry(actor: JournalActor, id: string): Promise<JournalEntry> {
  const e = await readEntry(owner(actor), id);
  if (e) return e;
  const view = await getEntry(actor, id);
  return view.mine ? view.entry : fail("This entry was shared with you to read. Only the leader who wrote it can change it.", 403);
}

/* ---------- Writing ---------- */

const DEFAULT_TITLES: Record<JournalKind, string> = { note: "Untitled note", sermon: "New sermon", devotional: "New devotional guide", setlist: "New setlist" };

function ensureIds<T extends { id?: string }>(list: T[] | undefined, prefix: string): (T & { id: string })[] | undefined {
  return list?.map((x) => ({ ...x, id: x.id || newId(prefix) }));
}

/** Applies a validated patch to an entry, keeping only the structured part that fits its kind. */
function apply(e: JournalEntry, raw: EntryPatch) {
  const p = EntryPatchSchema.parse(raw);
  if (p.title !== undefined) e.title = p.title.trim() || DEFAULT_TITLES[e.kind];
  if (p.tags !== undefined) e.tags = [...new Set(p.tags)];
  if (p.body !== undefined) e.body = p.body;
  if (e.kind === "sermon" && p.sermon) e.sermon = p.sermon;
  if (e.kind === "devotional" && p.devotional) e.devotional = p.devotional;
  if (e.kind === "setlist" && p.setlist) e.setlist = { ...p.setlist, sentTo: e.setlist?.sentTo };
}

/** Raw input with item ids filled in, so the editor and Barnabas can leave them out. */
function withIds(raw: EntryPatch): EntryPatch {
  const out = { ...raw };
  if (raw.sermon) out.sermon = { ...raw.sermon, outline: ensureIds(raw.sermon.outline as { id?: string }[] | undefined, "pt") as never };
  if (raw.devotional) out.devotional = { ...raw.devotional, days: ensureIds(raw.devotional.days as { id?: string }[] | undefined, "day") as never };
  if (raw.setlist) out.setlist = { ...raw.setlist, songs: ensureIds(raw.setlist.songs as { id?: string }[] | undefined, "song") as never };
  return out;
}

export async function createEntry(actor: JournalActor, input: NewEntry): Promise<JournalEntry> {
  const { kind, ...rest } = NewEntrySchema.parse(withIds(input as EntryPatch & { kind: JournalKind }));
  const now = Date.now();
  const e: JournalEntry = {
    id: newId("jr"),
    ownerId: actor.leader.leaderId,
    ownerName: actor.leader.name,
    kind,
    title: DEFAULT_TITLES[kind],
    tags: [],
    pinned: false,
    body: "",
    createdAt: now,
    updatedAt: now,
    shared: false,
    ...emptyFor(kind),
  };
  apply(e, rest);
  await writeEntry(owner(actor), e);
  return e;
}

export async function updateEntry(actor: JournalActor, id: string, patch: EntryPatch): Promise<JournalEntry> {
  const e = await ownEntry(actor, id);
  apply(e, withIds(patch));
  e.updatedAt = Date.now();
  await writeEntry(owner(actor), e);
  return e;
}

export async function duplicateEntry(actor: JournalActor, id: string): Promise<JournalEntry> {
  const src = await ownEntry(actor, id);
  const now = Date.now();
  const copy: JournalEntry = structuredClone({ ...src, id: newId("jr"), title: `${src.title} (copy)`.slice(0, 120), pinned: false, shared: false, sharedAt: undefined, archivedAt: undefined, createdAt: now, updatedAt: now });
  if (copy.setlist) copy.setlist.sentTo = undefined;
  // Fresh item ids, so sending the copy to a service never touches what the original sent.
  copy.sermon?.outline.forEach((p) => (p.id = newId("pt")));
  copy.devotional?.days.forEach((d) => (d.id = newId("day")));
  copy.setlist?.songs.forEach((s) => (s.id = newId("song")));
  await writeEntry(owner(actor), copy);
  return copy;
}

export async function setPinned(actor: JournalActor, id: string, pinned: boolean) {
  const e = await ownEntry(actor, id);
  e.pinned = pinned;
  await writeEntry(owner(actor), e);
  return e;
}

export async function setArchived(actor: JournalActor, id: string, archived: boolean) {
  const e = await ownEntry(actor, id);
  e.archivedAt = archived ? Date.now() : undefined;
  await writeEntry(owner(actor), e);
  return e;
}

/** Shares with the leadership team (read-only), or stops sharing. Audited. */
export async function setShared(actor: JournalActor, id: string, shared: boolean, conversationId?: string) {
  const e = await ownEntry(actor, id);
  e.shared = shared;
  e.sharedAt = shared ? Date.now() : undefined;
  await writeEntry(owner(actor), e);
  await log(actor, shared ? "share" : "unshare", `${e.id} ${e.kind}`, conversationId);
  return e;
}

/** Deletes for good. Only the owner, from the app or through Barnabas (delete_journal_entry, confirmed first). Audited. */
export async function deleteEntry(actor: JournalActor, id: string) {
  const e = await ownEntry(actor, id);
  await removeEntry(owner(actor), id);
  await log(actor, "delete", `${e.id} ${e.kind}`);
}

/* ---------- Sermons: a preaching date ---------- */

export const PreachLinkInput = z.object({
  date: z.string().regex(ISO_RE).nullable(),
  seriesId: z.string().max(60).nullable().optional(),
});

/** Links a sermon to a Sunday in the preaching rotation and, optionally, a sermon series. Nothing in Services changes. */
export async function linkPreaching(actor: JournalActor, id: string, input: z.input<typeof PreachLinkInput>) {
  const v = PreachLinkInput.parse(input);
  const e = await ownEntry(actor, id);
  if (e.kind !== "sermon" || !e.sermon) fail("Only a sermon links to a preaching date.");
  if (v.date && new Date(`${v.date}T00:00:00Z`).getUTCDay() !== 0) fail(`${friendlyDate(v.date)} isn't a Sunday.`);
  const book = await loadServices(actor.leader.churchId);
  if (v.seriesId && !book.series.some((s) => s.id === v.seriesId)) fail("That series isn't in Services.");
  e.sermon!.preachDate = v.date ?? undefined;
  let seriesId = v.seriesId === undefined ? e.sermon!.seriesId : v.seriesId ?? undefined;
  if (v.date && v.seriesId === undefined && !seriesId) seriesId = book.rotation.find((r) => r.date === v.date)?.seriesId ?? book.series.find((s) => v.date! >= s.startDate && v.date! <= s.endDate)?.id;
  e.sermon!.seriesId = seriesId;
  e.updatedAt = Date.now();
  await writeEntry(owner(actor), e);
  return e;
}

/* ---------- Setlists: send to the order of service ---------- */

export const SendInput = z.object({ date: z.string().regex(ISO_RE, "Use a date like 2026-11-15."), gathering: z.enum(GATHERING_KEYS) });

/** Pastors and staff (services.plan), schedulers (ops.schedule) and the worship team's lead may send a setlist. */
export async function canSendToService(actor: JournalActor): Promise<boolean> {
  if (can(actor.access, "services.plan")) return true;
  const sa = await serveActor(actor.leader);
  if (sa.scheduler) return true;
  const serve = await loadServe(actor.leader.churchId).catch(() => null);
  return Boolean(serve?.teams.some((t) => (t.id === "worship" || /worship/i.test(t.name)) && canEditTeam(sa, t)));
}

/** Item ids for a setlist's songs: the same song always gets the same id, so a re-send updates in place. */
const itemPrefix = (entryId: string) => `jsong_${entryId.replace(/^jr_/, "").slice(0, 14)}_`;
const itemId = (entryId: string, songId: string) => `${itemPrefix(entryId)}${songId.replace(/^song_/, "").slice(0, 14)}`;
const PLACEHOLDER_SONGS = new Set(["Opening song", "Song", "Closing song"]);

export function songNotes(s: Song): string | undefined {
  const bits = [s.key && `Key ${s.key}`, s.bpm && `${s.bpm} BPM`, s.timeSignature, s.ccli && `CCLI ${s.ccli}`, s.artist, s.arrangement, s.transition && `Then: ${s.transition}`].filter(Boolean);
  const text = bits.join(" · ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 300) : undefined;
}

function songItems(e: JournalEntry): ServiceItem[] {
  return (e.setlist?.songs ?? [])
    .filter((s) => s.title.trim())
    .map((s) => ({
      id: itemId(e.id, s.id),
      kind: "song" as const,
      title: s.title.trim().slice(0, 100),
      minutes: 4,
      person: s.leader.trim() || undefined,
      passage: s.scripture && parseRef(s.scripture) ? s.scripture : undefined,
      notes: songNotes(s),
    }));
}

/** Puts the songs in place of what this setlist sent before, else in place of the usual order's placeholder songs, else after the welcome. */
function placeSongs(items: ServiceItem[], songs: ServiceItem[], prefix: string): ServiceItem[] {
  const ours = (i: ServiceItem) => i.id.startsWith(prefix);
  let at = items.findIndex(ours);
  let rest = items.filter((i) => !ours(i));
  if (at < 0) {
    const placeholder = (i: ServiceItem) => i.kind === "song" && PLACEHOLDER_SONGS.has(i.title) && !i.notes;
    const first = rest.findIndex(placeholder);
    if (first >= 0) {
      at = first;
      rest = rest.filter((i) => !placeholder(i));
    } else {
      const w = rest.findIndex((i) => i.kind === "welcome");
      at = w >= 0 ? w + 1 : 0;
    }
  } else {
    at = Math.min(at, rest.length);
  }
  return [...rest.slice(0, at), ...songs, ...rest.slice(at)];
}

function checkWorship(date: string, g: GatheringKey) {
  const info = gathering(g);
  if (!info?.worship) fail("A setlist goes to a Sunday worship service.");
  if (!meetsOn(g, date)) fail(`The ${info!.label} isn't on ${friendlyDate(date)}.`);
}

/**
 * Adds the setlist's songs to that service's order of service, starting the order from the usual template
 * if there isn't one. Re-sending updates the same items rather than adding them again; sending to another
 * service moves them. The caller confirms first (the app's dialog, or Barnabas's confirmation gate).
 */
export async function sendToService(actor: JournalActor, id: string, input: z.input<typeof SendInput>, conversationId?: string) {
  const v = SendInput.parse(input);
  const e = await ownEntry(actor, id);
  if (e.kind !== "setlist" || !e.setlist) fail("Only a worship setlist goes to the order of service.");
  if (!(await canSendToService(actor))) fail("Pastors, staff, schedulers and the worship team's lead send setlists to the order of service. Ask one of them, or share this setlist with them.", 403);
  checkWorship(v.date, v.gathering);
  const songs = songItems(e);
  if (!songs.length) fail("Add at least one song with a title first.");
  const prefix = itemPrefix(e.id);
  const before = await loadServices(actor.leader.churchId);
  const needsTemplate = !before.plans.find((p) => p.date === v.date && p.gathering === v.gathering)?.items.length;
  const template = needsTemplate ? await templateItems(actor.leader.churchId, before, v.date, v.gathering) : [];
  const prev = e.setlist!.sentTo;
  const plan = await updateServices(actor.leader.churchId, ["plans"], (book) => {
    // Sent somewhere else before: take the songs back out of that order.
    if (prev && (prev.date !== v.date || prev.gathering !== v.gathering)) {
      const old = book.plans.find((p) => p.date === prev.date && p.gathering === prev.gathering);
      if (old) old.items = old.items.filter((i) => !i.id.startsWith(prefix));
    }
    let p = book.plans.find((x) => x.date === v.date && x.gathering === v.gathering);
    if (!p) {
      p = { id: newId("plan"), date: v.date, gathering: v.gathering, items: [], updatedAt: Date.now(), updatedBy: actor.leader.name };
      book.plans.push(p);
    }
    const base = p.items.length ? p.items : template;
    p.items = placeSongs(base, songs, prefix).slice(0, 40);
    p.updatedAt = Date.now();
    p.updatedBy = actor.leader.name;
    return p;
  });
  e.setlist = { ...e.setlist!, serviceDate: v.date, gathering: v.gathering, sentTo: { date: v.date, gathering: v.gathering, at: Date.now(), by: actor.leader.name } };
  await writeEntry(owner(actor), e);
  await log(actor, "setlist.send", `${e.id} to ${v.date} ${v.gathering}: ${songs.length} songs${needsTemplate ? " (started from the usual order)" : ""}`, conversationId);
  return { entry: e, plan, started: needsTemplate, songs: songs.length };
}
