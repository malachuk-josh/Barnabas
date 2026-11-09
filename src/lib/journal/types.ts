import { z } from "zod";
import { GATHERING_KEYS, ISO_RE } from "../ops/gatherings";

/**
 * The Journal: a leader's own notes, sermon ideas, devotional guides and worship setlists. Private to the
 * leader who wrote them unless they share one with the leadership team (read-only). Safe to import from
 * the browser: no server dependencies.
 */

export const JOURNAL_KINDS = ["note", "sermon", "devotional", "setlist"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export const KIND_LABELS: Record<JournalKind, string> = {
  note: "Note",
  sermon: "Sermon",
  devotional: "Devotional guide",
  setlist: "Worship setlist",
};

export const KIND_HINTS: Record<JournalKind, string> = {
  note: "A quick thought, a prayer, something to remember",
  sermon: "Passage, big idea, outline, illustrations and application",
  devotional: "A day-by-day guide with passages, reflections and prayer",
  setlist: "Songs in order with keys, tempo, CCLI and transitions",
};

export const SERMON_STATUSES = ["idea", "drafting", "ready", "preached"] as const;
export type SermonStatus = (typeof SERMON_STATUSES)[number];
export const SERMON_STATUS_LABELS: Record<SermonStatus, string> = { idea: "Idea", drafting: "Drafting", ready: "Ready", preached: "Preached" };

export const LIMITS = { title: 120, body: 20000, tag: 30, tags: 12, short: 120, text: 4000, list: 60, quote: 1500 } as const;

const Text = (max: number) => z.string().max(max);
const Ref = z.string().trim().max(80);
const Iso = z.string().regex(ISO_RE, "Use a date like 2026-11-15.");
const Id = z.string().min(1).max(40);

export const OutlinePointSchema = z.object({
  id: Id,
  text: Text(LIMITS.text),
  subpoints: z.array(Text(LIMITS.text)).max(20).default([]),
  /** A scripture reference for the point; links into The Word. */
  scripture: Ref.optional(),
  /** The verse itself, word for word, with the translation it's quoted from. */
  quote: Text(LIMITS.quote).optional(),
});
export type OutlinePoint = z.infer<typeof OutlinePointSchema>;

export const SermonSchema = z.object({
  passages: z.array(Ref).max(12).default([]),
  bigIdea: Text(LIMITS.text).default(""),
  outline: z.array(OutlinePointSchema).max(LIMITS.list).default([]),
  illustrations: Text(LIMITS.text).default(""),
  application: Text(LIMITS.text).default(""),
  closing: Text(LIMITS.text).default(""),
  status: z.enum(SERMON_STATUSES).default("idea"),
  /** A Services sermon series this sermon belongs to. */
  seriesId: z.string().max(60).optional(),
  /** The Sunday it's to be preached (from the preaching rotation). */
  preachDate: Iso.optional(),
});
export type Sermon = z.infer<typeof SermonSchema>;

export const DevotionalDaySchema = z.object({
  id: Id,
  title: Text(LIMITS.short).default(""),
  passage: Ref.optional(),
  /** The passage, word for word, with the translation it's quoted from. */
  passageText: Text(LIMITS.quote).optional(),
  reflection: Text(LIMITS.text).default(""),
  questions: z.array(Text(500)).max(12).default([]),
  prayer: Text(LIMITS.text).default(""),
});
export type DevotionalDay = z.infer<typeof DevotionalDaySchema>;

export const DevotionalSchema = z.object({
  passages: z.array(Ref).max(12).default([]),
  days: z.array(DevotionalDaySchema).max(LIMITS.list).default([]),
});
export type Devotional = z.infer<typeof DevotionalSchema>;

export const SongSchema = z.object({
  id: Id,
  title: Text(LIMITS.short).default(""),
  artist: Text(LIMITS.short).default(""),
  key: Text(12).default(""),
  bpm: z.number().int().min(20).max(300).optional(),
  timeSignature: Text(8).default(""),
  ccli: Text(20).default(""),
  /** Arrangement or flow: "V1 C V2 C B C C", "start with keys only". */
  arrangement: Text(1000).default(""),
  scripture: Ref.optional(),
  /** Who leads it. */
  leader: Text(80).default(""),
  /** A transition or note after this song, before the next. */
  transition: Text(1000).default(""),
});
export type Song = z.infer<typeof SongSchema>;

export const SetlistSchema = z.object({
  serviceDate: Iso.optional(),
  gathering: z.enum(GATHERING_KEYS).optional(),
  theme: Text(LIMITS.short * 2).default(""),
  songs: z.array(SongSchema).max(LIMITS.list).default([]),
  /** Where it was last sent (Send to order of service); set by the server. */
  sentTo: z.object({ date: Iso, gathering: z.enum(GATHERING_KEYS), at: z.number(), by: z.string().max(100) }).optional(),
});
export type Setlist = z.infer<typeof SetlistSchema>;

export type JournalEntry = {
  id: string;
  /** The leader who wrote it. Only they can change it. */
  ownerId: string;
  ownerName: string;
  kind: JournalKind;
  title: string;
  tags: string[];
  pinned: boolean;
  /** Markdown. */
  body: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  /** Shared with the leadership team, read-only. Never with the kids check-in role. */
  shared: boolean;
  sharedAt?: number;
  sermon?: Sermon;
  devotional?: Devotional;
  setlist?: Setlist;
};

/** What the list shows: everything but the long parts. */
export type JournalSummary = Pick<JournalEntry, "id" | "ownerId" | "ownerName" | "kind" | "title" | "tags" | "pinned" | "createdAt" | "updatedAt" | "archivedAt" | "shared"> & {
  snippet: string;
  /** Lowercased title, tags and text, for search. */
  haystack: string;
  /** A sermon's status, a setlist's service date: one short line under the title. */
  detail?: string;
};

export const Tag = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.tag)
  .transform((t) => t.replace(/^#/, "").toLowerCase());

/** What the editor saves (autosave): every editable field, all optional. */
export const EntryPatchSchema = z.object({
  title: Text(LIMITS.title).optional(),
  tags: z.array(Tag).max(LIMITS.tags).optional(),
  body: Text(LIMITS.body).optional(),
  sermon: SermonSchema.optional(),
  devotional: DevotionalSchema.optional(),
  setlist: SetlistSchema.omit({ sentTo: true }).optional(),
});
export type EntryPatch = z.input<typeof EntryPatchSchema>;

export const NewEntrySchema = EntryPatchSchema.extend({ kind: z.enum(JOURNAL_KINDS) });
export type NewEntry = z.input<typeof NewEntrySchema>;

export function emptyFor(kind: JournalKind): Pick<JournalEntry, "sermon" | "devotional" | "setlist"> {
  if (kind === "sermon") return { sermon: SermonSchema.parse({}) };
  if (kind === "devotional") return { devotional: DevotionalSchema.parse({}) };
  if (kind === "setlist") return { setlist: SetlistSchema.parse({}) };
  return {};
}

/** All the text in an entry, for search and the card's snippet. */
export function entryText(e: Pick<JournalEntry, "body" | "sermon" | "devotional" | "setlist">): string {
  const parts: string[] = [];
  const s = e.sermon;
  if (s) parts.push(s.passages.join(" "), s.bigIdea, ...s.outline.flatMap((p) => [p.text, ...p.subpoints, p.scripture ?? ""]), s.illustrations, s.application, s.closing);
  const d = e.devotional;
  if (d) parts.push(d.passages.join(" "), ...d.days.flatMap((x) => [x.title, x.passage ?? "", x.reflection, ...x.questions, x.prayer]));
  const l = e.setlist;
  if (l) parts.push(l.theme, ...l.songs.flatMap((x) => [x.title, x.artist, x.scripture ?? "", x.transition]));
  parts.push(e.body);
  return parts.filter((p) => p && p.trim()).join(" \n");
}

/** Plain text for a card: markdown marks removed, one line. */
export function plainSnippet(text: string, max = 160): string {
  const t = text
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]+/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
