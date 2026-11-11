import { z } from "zod";
import { today } from "../dates";
import { GATHERING_KEYS, GATHERINGS } from "../ops/gatherings";
import { getProfile, DEFAULT_BIBLE_TRANSLATION } from "../profile";
import { canSendToService, createEntry, deleteEntry, getEntry, journalActor, JournalError, listEntries, sendToService, setShared, updateEntry, type JournalActor } from "../journal/service";
import { readEntry } from "../journal/store";
import { KIND_LABELS, LIMITS, SERMON_STATUSES, Tag, type DevotionalDay, type JournalEntry, type JournalSummary, type OutlinePoint, type Song } from "../journal/types";
import { quoteLine, quoteVerse } from "../journal/verses";
import { friendlyDate } from "../dates";
import { gateConfirmed } from "./gate";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * Barnabas's journal tools. The journal is the leader's own writing: saving their own note or a draft they
 * asked for needs no confirmation. Barnabas reads the journal only when the leader asks, and deletes an entry,
 * shares one or sends a setlist to the order of service only after a yes (the confirmation gate).
 * Any scripture Barnabas writes is quoted word for word in the leader's translation with its reference;
 * for the KJV the words come from the text The Word ships.
 */

const ok = (content: unknown): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;

const S = (max: number) => z.string().max(max);
const VerseIn = z.object({ reference: S(80), text: S(1500).optional() });
const OutlineIn = z.object({ text: S(4000), subpoints: z.array(S(4000)).max(20).optional(), scripture: S(80).optional(), quote: S(1500).optional() });
const DayIn = z.object({ title: S(120).optional(), passage: S(80).optional(), passage_text: S(1500).optional(), reflection: S(4000).optional(), questions: z.array(S(500)).max(12).optional(), prayer: S(4000).optional() });
const SongIn = z.object({
  title: S(120),
  artist: S(120).optional(),
  key: S(12).optional(),
  bpm: z.number().int().min(20).max(300).optional(),
  time_signature: S(8).optional(),
  ccli: S(20).optional(),
  arrangement: S(1000).optional(),
  scripture: S(80).optional(),
  leader: S(80).optional(),
  transition: S(1000).optional(),
});
const SermonIn = z.object({ passages: z.array(S(80)).max(12).optional(), big_idea: S(4000).optional(), outline: z.array(OutlineIn).max(60).optional(), illustrations: S(4000).optional(), application: S(4000).optional(), closing: S(4000).optional(), status: z.enum(SERMON_STATUSES).optional() });
const DevotionalIn = z.object({ passages: z.array(S(80)).max(12).optional(), days: z.array(DayIn).max(60).optional() });
const SetlistIn = z.object({ service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), gathering: z.enum(GATHERING_KEYS).optional(), theme: S(240).optional(), songs: z.array(SongIn).max(60).optional() });

/* JSON schemas for the definitions (inputs are validated with the zod schemas above). */
const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const strs = (description?: string) => ({ type: "array", items: { type: "string" }, ...(description ? { description } : {}) });
const VERSE_JSON = { type: "object", properties: { reference: str("e.g. 'Philippians 4:6-7'"), text: str("The verse word for word in the leader's Bible translation") }, required: ["reference"] };
const OUTLINE_JSON = { type: "object", properties: { text: str("The point"), subpoints: strs(), scripture: str("Reference for the point"), quote: str("The verse word for word in the leader's translation, if you quote it") }, required: ["text"] };
const DAY_JSON = { type: "object", properties: { title: str(), passage: str("Reference"), passage_text: str("The passage word for word in the leader's translation, if you quote it"), reflection: str(), questions: strs(), prayer: str("A prayer prompt") } };
const SONG_JSON = {
  type: "object",
  properties: { title: str(), artist: str("Author or artist"), key: str("e.g. 'G'"), bpm: { type: "integer" }, time_signature: str("e.g. '4/4'"), ccli: str("CCLI song number, only if the leader gave it"), arrangement: str("Flow, e.g. 'V1 C V2 C B C'"), scripture: str("Scripture tie-in reference"), leader: str("Who leads it"), transition: str("Transition or note before the next song") },
  required: ["title"],
};
const SERMON_JSON = { type: "object", properties: { passages: strs("References"), big_idea: str(), outline: { type: "array", items: OUTLINE_JSON }, illustrations: str(), application: str(), closing: str(), status: { type: "string", enum: [...SERMON_STATUSES] } } };
const DEVOTIONAL_JSON = { type: "object", properties: { passages: strs("References"), days: { type: "array", items: DAY_JSON } } };
const SETLIST_JSON = { type: "object", properties: { service_date: str("yyyy-mm-dd, a Sunday"), gathering: { type: "string", enum: [...GATHERING_KEYS], description: GATHERINGS.filter((g) => g.worship).map((g) => `${g.key}: ${g.label}`).join("; ") }, theme: str(), songs: { type: "array", items: SONG_JSON } } };

async function actorFor(ctx: ToolContext): Promise<JournalActor | ToolResult> {
  try {
    return await journalActor(ctx.leader);
  } catch (err) {
    if (err instanceof JournalError) return fail(err.message);
    throw err;
  }
}
const isResult = (x: unknown): x is ToolResult => Boolean(x && typeof x === "object" && "isError" in x);

async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof JournalError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
    throw err;
  }
}

/** Puts every quotation Barnabas wrote into the leader's translation, word for word, with its reference. */
class Scripture {
  notes: string[] = [];
  constructor(readonly translation: Awaited<ReturnType<typeof getProfile>>["bibleTranslation"]) {}
  static async for(ctx: ToolContext) {
    return new Scripture((await getProfile(ctx.leader)).bibleTranslation ?? DEFAULT_BIBLE_TRANSLATION);
  }
  /** A reference with an optional quotation: the line to store, or undefined. */
  async quote(reference: string | undefined, text: string | undefined): Promise<string | undefined> {
    // With the KJV a reference alone is enough: the words come from the text The Word ships.
    if (!text?.trim() && this.translation !== "kjv") return undefined;
    if (!reference?.trim()) {
      if (!text?.trim()) return undefined;
      this.notes.push("A quotation without a reference was left out; give the reference with every verse.");
      return undefined;
    }
    const q = await quoteVerse(reference, text, this.translation);
    if (!q) {
      this.notes.push(`"${reference}" isn't a reference Barnabas can read, so its quotation was left out.`);
      return undefined;
    }
    if (q.verified && this.translation === "kjv") this.notes.push(`${q.reference} is quoted from the KJV text.`);
    return quoteLine(q);
  }
  async lines(verses: z.infer<typeof VerseIn>[] | undefined): Promise<string> {
    const out: string[] = [];
    for (const v of verses ?? []) {
      const line = await this.quote(v.reference, v.text?.trim());
      if (line) out.push(`> ${line}`);
    }
    return out.join("\n\n");
  }
}

async function outlineFrom(list: z.infer<typeof OutlineIn>[] | undefined, sc: Scripture): Promise<Omit<OutlinePoint, "id">[]> {
  const out: Omit<OutlinePoint, "id">[] = [];
  for (const p of list ?? []) out.push({ text: p.text, subpoints: p.subpoints ?? [], scripture: p.scripture || undefined, quote: await sc.quote(p.scripture, p.quote) });
  return out;
}
async function dayFrom(d: z.infer<typeof DayIn>, sc: Scripture): Promise<Omit<DevotionalDay, "id">> {
  return { title: d.title ?? "", passage: d.passage || undefined, passageText: await sc.quote(d.passage, d.passage_text), reflection: d.reflection ?? "", questions: d.questions ?? [], prayer: d.prayer ?? "" };
}
const songFrom = (s: z.infer<typeof SongIn>): Omit<Song, "id"> => ({
  title: s.title,
  artist: s.artist ?? "",
  key: s.key ?? "",
  bpm: s.bpm,
  timeSignature: s.time_signature ?? "",
  ccli: s.ccli ?? "",
  arrangement: s.arrangement ?? "",
  scripture: s.scripture || undefined,
  leader: s.leader ?? "",
  transition: s.transition ?? "",
});

const link = (e: Pick<JournalEntry, "id">) => `/journal/${e.id}`;
/** The button under Barnabas's reply that opens the entry. */
const entryLink = (e: Pick<JournalEntry, "id" | "title">) => ({ label: `Open "${e.title.length > 40 ? `${e.title.slice(0, 39)}…` : e.title}" in Journal`, href: link(e) });
const linked = (r: ToolResult, ...entries: Pick<JournalEntry, "id" | "title">[]): ToolResult => ({ ...r, links: entries.map(entryLink) });

/* ---------- journal_note ---------- */

const journalNote = tool({
  def: {
    name: "journal_note",
    description:
      "\"Journal this…\": save a quick note in the leader's own Journal, private to them. Appends to the note named by entry_id or title if they have one, or starts a new note. Their own note needs no confirmation. Not for congregants' private details; not while off the record.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        text: str("The note, in the leader's words (markdown is fine)"),
        title: str("A short title for a new note, or the title of the note to add to"),
        entry_id: str("The id of the note to add to, from list_journal"),
        tags: strs("A few one-word tags, e.g. 'prayer'"),
        verses: { type: "array", items: VERSE_JSON, description: "Scripture to quote with the note" },
      },
      required: ["text"],
    },
  },
  schema: z.object({ text: S(8000).min(1), title: S(120).optional(), entry_id: S(40).optional(), tags: z.array(S(30)).max(12).optional(), verses: z.array(VerseIn).max(8).optional() }),
  async run(input, ctx) {
    if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing is saved, not even to the Journal. Say so; they can write it in Journal themselves.");
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const sc = await Scripture.for(ctx);
      const verses = await sc.lines(input.verses);
      const text = [input.text.trim(), verses].filter(Boolean).join("\n\n");
      let target: JournalEntry | null = null;
      if (input.entry_id) {
        target = await readEntry({ churchId: ctx.leader.churchId, leaderId: ctx.leader.leaderId }, input.entry_id);
        if (!target) return fail("That isn't one of the leader's journal entries. Use list_journal, or leave entry_id out to start a new note.");
      } else if (input.title) {
        const match = (await listEntries(actor, { kind: "note" })).find((s) => s.title.trim().toLowerCase() === input.title!.trim().toLowerCase());
        if (match) target = await readEntry({ churchId: ctx.leader.churchId, leaderId: ctx.leader.leaderId }, match.id);
      }
      if (target) {
        const body = `${target.body.replace(/\s+$/, "")}${target.body.trim() ? "\n\n" : ""}**${friendlyDate(today())}**\n\n${text}`;
        const tags = [...new Set([...target.tags, ...(input.tags ?? [])])].slice(0, 12);
        await updateEntry(actor, target.id, { body, tags });
        return linked(ok({ saved: "added to", title: target.title, id: target.id, link: link(target), notes: sc.notes, say: "Tell them in a few words it's in their Journal." }), target);
      }
      const title = input.title?.trim() || input.text.trim().split("\n")[0].replace(/^#+\s*/, "").slice(0, 60) || "Note";
      const e = await createEntry(actor, { kind: "note", title, body: text, tags: input.tags ?? [] });
      return linked(ok({ saved: "new note", title: e.title, id: e.id, link: link(e), notes: sc.notes, say: "Tell them in a few words it's in their Journal." }), e);
    });
  },
});

/* ---------- start_journal_entry ---------- */

const startEntry = tool({
  phrase: "I'll start that in your Journal.",
  def: {
    name: "start_journal_entry",
    description:
      "Start a sermon, devotional guide or worship setlist draft in the leader's Journal (private to them) when they ask you to help build one, filled in with what you've worked out together. " +
      "Quote any scripture word for word in the leader's Bible translation, always with its reference. Only include song details (key, BPM, CCLI) the leader gave or that you're sure of; leave the rest out. Returns the entry's id and link.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["sermon", "devotional", "setlist", "note"] },
        title: str(),
        tags: strs(),
        body: str("Free notes (markdown)"),
        verses: { type: "array", items: VERSE_JSON, description: "Scripture to quote in the notes" },
        sermon: SERMON_JSON,
        devotional: DEVOTIONAL_JSON,
        setlist: SETLIST_JSON,
      },
      required: ["kind", "title"],
    },
  },
  schema: z.object({ kind: z.enum(["sermon", "devotional", "setlist", "note"]), title: S(120).min(1), tags: z.array(S(30)).max(12).optional(), body: S(20000).optional(), verses: z.array(VerseIn).max(12).optional(), sermon: SermonIn.optional(), devotional: DevotionalIn.optional(), setlist: SetlistIn.optional() }),
  async run(input, ctx) {
    if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing is saved, not even to the Journal. Offer to help them write it in Journal themselves.");
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const sc = await Scripture.for(ctx);
      const body = [input.body?.trim(), await sc.lines(input.verses)].filter(Boolean).join("\n\n");
      const s = input.sermon;
      const d = input.devotional;
      const l = input.setlist;
      const e = await createEntry(actor, {
        kind: input.kind,
        title: input.title,
        tags: input.tags ?? [],
        body,
        sermon: input.kind === "sermon" ? { passages: s?.passages ?? [], bigIdea: s?.big_idea ?? "", outline: (await outlineFrom(s?.outline, sc)) as OutlinePoint[], illustrations: s?.illustrations ?? "", application: s?.application ?? "", closing: s?.closing ?? "", status: s?.status ?? "drafting" } : undefined,
        devotional: input.kind === "devotional" ? { passages: d?.passages ?? [], days: (await Promise.all((d?.days ?? []).map((x) => dayFrom(x, sc)))) as DevotionalDay[] } : undefined,
        setlist: input.kind === "setlist" ? { serviceDate: l?.service_date, gathering: l?.gathering, theme: l?.theme ?? "", songs: (l?.songs ?? []).map(songFrom) as Song[] } : undefined,
      });
      return linked(ok({ started: KIND_LABELS[e.kind], title: e.title, id: e.id, link: link(e), notes: sc.notes, say: "Tell them briefly it's in their Journal to shape further; offer the link and the next step." }), e);
    });
  },
});

/* ---------- list_journal / read_journal_entry ---------- */

const KINDS = ["note", "sermon", "devotional", "setlist"] as const;

const listJournal = tool({
  phrase: "Let me look in your Journal.",
  def: {
    name: "list_journal",
    description:
      "Find entries in the leader's Journal: newest first, or by words (titles, tags and text) and/or a tag. Their own entries, plus (when searching, or with shared_with_me) entries other leaders shared with them, read-only. Only when they ask about their Journal. Returns ids for read_journal_entry and update_journal_entry, snippets and links.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        query: str("Words to look for"),
        tag: str("One tag, e.g. 'advent'"),
        kind: { type: "string", enum: [...KINDS] },
        shared_with_me: { type: "boolean", description: "Only entries other leaders shared with them" },
      },
    },
  },
  schema: z.object({ query: S(100).optional(), tag: S(30).optional(), kind: z.enum(KINDS).optional(), shared_with_me: z.boolean().optional() }),
  async run(input, ctx) {
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const q = { q: input.query?.trim() || undefined, tag: input.tag?.trim() || undefined, kind: input.kind };
      const searching = Boolean(q.q || q.tag);
      const mine = input.shared_with_me ? [] : await listEntries(actor, q);
      const shared = input.shared_with_me || searching ? await listEntries(actor, { ...q, filter: "shared" }) : [];
      const rows: JournalSummary[] = [...mine, ...shared];
      if (!rows.length) {
        return ok({ entries: [], note: input.shared_with_me ? "No one has shared a journal entry with them yet." : searching ? "Nothing in their Journal matches. Offer to start an entry, or try other words." : "Their Journal is empty. Offer to start one." });
      }
      const top = rows.slice(0, 25);
      const result = ok({
        entries: top.map((r) => ({
          id: r.id,
          kind: KIND_LABELS[r.kind],
          title: r.title,
          updated: new Date(r.updatedAt).toISOString().slice(0, 10),
          tags: r.tags.length ? r.tags : undefined,
          pinned: r.pinned || undefined,
          snippet: searching ? r.snippet || undefined : undefined,
          by: r.ownerId === ctx.leader.leaderId ? undefined : `${r.ownerName} (shared, read-only)`,
          detail: r.detail,
          link: link(r),
        })),
        more: rows.length > top.length ? rows.length - top.length : undefined,
      });
      return searching ? linked(result, ...top.slice(0, 3)) : result;
    });
  },
});

const readJournalEntry = tool({
  phrase: "Opening that entry.",
  def: {
    name: "read_journal_entry",
    description: "One journal entry in full: the leader's own, or one another leader shared with them (read-only). Only when the leader asks about it.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { id: str("From list_journal") }, required: ["id"] },
  },
  schema: z.object({ id: S(40).min(1) }),
  async run({ id }, ctx) {
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const { entry: e, mine } = await getEntry(actor, id);
      return linked(ok({
        id: e.id,
        kind: KIND_LABELS[e.kind],
        title: e.title,
        tags: e.tags,
        by: mine ? undefined : `${e.ownerName} (shared with the leadership team; read-only, you can't change it)`,
        shared: e.shared,
        body: e.body || undefined,
        sermon: e.sermon,
        devotional: e.devotional,
        setlist: e.setlist && { ...e.setlist, sentTo: e.setlist.sentTo ? `${e.setlist.sentTo.date} ${e.setlist.sentTo.gathering}` : undefined },
        link: link(e),
      }), e);
    });
  },
});

/* ---------- update_journal_entry ---------- */

const updateJournalEntry = tool({
  def: {
    name: "update_journal_entry",
    description:
      "Change one of the leader's own journal entries (their own: no confirmation needed): add text to the end of the notes (append_notes, optionally dated, keeping everything already there), set or change tags, rename it, or edit a sermon's big idea or other parts, an outline point, a devotional day or a song. " +
      "Points, days and songs are numbered from 1 (read_journal_entry first if you need them); `at` edits that one, leaving it out adds a new one at the end. It never deletes an entry. Quote scripture word for word in the leader's translation, with its reference (verses). Not for entries others shared with them.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        id: str(),
        title: str(),
        tags: strs("The full new set of tags (short single words, at most 12)"),
        add_tags: strs(),
        remove_tags: strs(),
        append_notes: str("Added to the end of the notes; nothing already there is replaced"),
        dated: { type: "boolean", description: "Put today's date above the added notes, like a journal note" },
        verses: { type: "array", items: VERSE_JSON, description: "Scripture to quote at the end of the notes" },
        sermon: { type: "object", properties: { passages: strs(), big_idea: str(), illustrations: str(), application: str(), closing: str(), status: { type: "string", enum: [...SERMON_STATUSES] } } },
        outline_point: { ...OUTLINE_JSON, properties: { ...OUTLINE_JSON.properties, at: { type: "integer", description: "Which point to edit (1-based); leave out to add" } } },
        devotional_day: { ...DAY_JSON, properties: { ...DAY_JSON.properties, at: { type: "integer" } } },
        song: { ...SONG_JSON, properties: { ...SONG_JSON.properties, at: { type: "integer" } } },
        setlist: { type: "object", properties: { service_date: str(), gathering: SETLIST_JSON.properties.gathering, theme: str() } },
      },
      required: ["id"],
    },
  },
  schema: z.object({
    id: S(40).min(1),
    title: S(120).optional(),
    tags: z.array(S(30)).max(12).optional(),
    add_tags: z.array(S(30)).max(12).optional(),
    remove_tags: z.array(S(30)).max(12).optional(),
    append_notes: S(8000).optional(),
    dated: z.boolean().optional(),
    verses: z.array(VerseIn).max(12).optional(),
    sermon: SermonIn.omit({ outline: true }).optional(),
    outline_point: OutlineIn.extend({ at: z.number().int().min(1).optional() }).optional(),
    devotional_day: DayIn.extend({ at: z.number().int().min(1).optional() }).optional(),
    song: SongIn.partial().extend({ at: z.number().int().min(1).optional() }).optional(),
    setlist: SetlistIn.omit({ songs: true }).optional(),
  }),
  async run(input, ctx) {
    if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing is saved, not even to the Journal.");
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const { entry: e, mine } = await getEntry(actor, input.id);
      if (!mine) return fail(`${e.ownerName} shared this entry to read. Only they can change it. Offer to start the leader's own copy with start_journal_entry instead.`);
      const sc = await Scripture.for(ctx);
      const changed: string[] = [];
      const patch: Parameters<typeof updateEntry>[2] = {};
      if (input.title) (patch.title = input.title), changed.push("title");
      if (input.tags || input.add_tags?.length || input.remove_tags?.length) {
        const clean = (list: string[] | undefined) => (list ?? []).map((t) => Tag.safeParse(t)).flatMap((r) => (r.success ? [r.data] : []));
        const drop = new Set(clean(input.remove_tags));
        const next = [...new Set([...(input.tags ? clean(input.tags) : e.tags), ...clean(input.add_tags)])].filter((t) => !drop.has(t));
        if (next.length > LIMITS.tags) return fail(`An entry can have at most ${LIMITS.tags} tags.`);
        patch.tags = next;
        changed.push("tags");
      }
      const notes = input.append_notes?.trim();
      const extra = [notes && input.dated ? `**${friendlyDate(today())}**` : "", notes, await sc.lines(input.verses)].filter(Boolean).join("\n\n");
      if (extra) {
        patch.body = `${e.body.replace(/\s+$/, "")}${e.body.trim() ? "\n\n" : ""}${extra}`;
        if (patch.body.length > LIMITS.body) return fail(`That would make the entry longer than ${LIMITS.body} characters. Offer to start a new entry for it.`);
        changed.push("notes");
      }
      const pick = <T,>(list: T[], at: number | undefined, label: string): number => {
        if (at === undefined) return list.length;
        if (at > list.length) throw new JournalError(`There's no ${label} ${at}; it has ${list.length}.`);
        return at - 1;
      };

      if (input.sermon || input.outline_point) {
        if (e.kind !== "sermon" || !e.sermon) return fail("That entry isn't a sermon.");
        const s = structuredClone(e.sermon);
        const v = input.sermon;
        if (v) {
          if (v.passages) s.passages = v.passages;
          if (v.big_idea !== undefined) s.bigIdea = v.big_idea;
          if (v.illustrations !== undefined) s.illustrations = v.illustrations;
          if (v.application !== undefined) s.application = v.application;
          if (v.closing !== undefined) s.closing = v.closing;
          if (v.status) s.status = v.status;
          changed.push("sermon");
        }
        if (input.outline_point) {
          const i = pick(s.outline, input.outline_point.at, "point");
          const [p] = await outlineFrom([input.outline_point], sc);
          const prev = s.outline[i];
          const touchesScripture = input.outline_point.scripture !== undefined || input.outline_point.quote !== undefined;
          s.outline[i] = {
            id: prev?.id ?? "",
            text: p.text,
            subpoints: input.outline_point.subpoints ? p.subpoints : prev?.subpoints ?? [],
            scripture: input.outline_point.scripture !== undefined ? p.scripture : prev?.scripture,
            quote: touchesScripture ? p.quote : prev?.quote,
          };
          changed.push(input.outline_point.at ? `point ${input.outline_point.at}` : `new point ${i + 1}`);
        }
        patch.sermon = s;
      }
      if (input.devotional_day) {
        if (e.kind !== "devotional" || !e.devotional) return fail("That entry isn't a devotional guide.");
        const d = structuredClone(e.devotional);
        const i = pick(d.days, input.devotional_day.at, "day");
        const prev = d.days[i];
        const next = await dayFrom(input.devotional_day, sc);
        d.days[i] = prev
          ? { ...prev, ...Object.fromEntries(Object.entries(next).filter(([k, val]) => val !== undefined && (val !== "" || k === "title") && !(Array.isArray(val) && !val.length))) }
          : ({ id: "", ...next } as DevotionalDay);
        patch.devotional = d;
        changed.push(input.devotional_day.at ? `day ${input.devotional_day.at}` : `new day ${i + 1}`);
      }
      if (input.song || input.setlist) {
        if (e.kind !== "setlist" || !e.setlist) return fail("That entry isn't a worship setlist.");
        const { sentTo: _sent, ...l } = structuredClone(e.setlist);
        if (input.setlist) {
          if (input.setlist.service_date) l.serviceDate = input.setlist.service_date;
          if (input.setlist.gathering) l.gathering = input.setlist.gathering;
          if (input.setlist.theme !== undefined) l.theme = input.setlist.theme;
          changed.push("setlist");
        }
        if (input.song) {
          const { at, ...song } = input.song;
          const i = pick(l.songs, at, "song");
          if (!l.songs[i] && !song.title) return fail("A new song needs a title.");
          const full = songFrom({ title: "", ...song });
          const field = (k: keyof typeof full) => (k === "timeSignature" ? "time_signature" : k) as keyof typeof song;
          const given = Object.fromEntries((Object.keys(full) as (keyof typeof full)[]).filter((k) => song[field(k)] !== undefined).map((k) => [k, full[k]]));
          l.songs[i] = { ...(l.songs[i] ?? { id: "", ...songFrom({ title: song.title ?? "" }) }), ...given } as Song;
          changed.push(at ? `song ${at}` : `new song ${i + 1}`);
        }
        patch.setlist = l;
      }
      if (!changed.length) return fail("Nothing to change. Say what to add or edit.");
      await updateEntry(actor, e.id, patch);
      return linked(ok({ updated: changed, title: patch.title ?? e.title, link: link(e), notes: sc.notes }), { id: e.id, title: patch.title ?? e.title });
    });
  },
});

/* ---------- Gated: share, send to the order of service ---------- */

const shareJournalEntry = tool({
  def: {
    name: "share_journal_entry",
    description:
      "Share one of the leader's journal entries with the leadership team to read (they can't change it), or stop sharing it. Confirmed in code: the first call only proposes; ask the leader, and call again with the same details after they say yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { id: str(), shared: { type: "boolean", description: "true to share, false to stop sharing" } }, required: ["id", "shared"] },
  },
  schema: z.object({ id: S(40).min(1), shared: z.boolean() }),
  async run({ id, shared }, ctx) {
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const { entry: e, mine } = await getEntry(actor, id);
      if (!mine) return fail("Only the leader who wrote an entry can share it.");
      if (e.shared === shared) return ok({ unchanged: true, note: shared ? "It's already shared with the leadership team." : "It isn't shared." });
      if (!gateConfirmed(ctx, "share_journal_entry", JSON.stringify([id, shared]))) {
        return fail(`Not confirmed yet. Ask: ${shared ? `share "${e.title}" with the leadership team, so other leaders can read it (not change it)?` : `stop sharing "${e.title}"?`} Call share_journal_entry again with the same details after they say yes.`);
      }
      await setShared(actor, id, shared, ctx.meta.offRecord ? undefined : ctx.meta.id);
      return ok({ shared, title: e.title, say: shared ? "Tell them other leaders can read it under Journal → Shared with me." : "Tell them it's private again." });
    });
  },
});

const sendSetlist = tool({
  def: {
    name: "send_setlist_to_service",
    description:
      "Add a worship setlist's songs to that Sunday service's order of service in Services (starting the order from the usual template if there isn't one). Sending again updates the same songs instead of adding them twice. " +
      "For pastors, staff, schedulers and the worship team's lead. Confirmed in code: the first call only proposes; ask, and call again with the same details after they say yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { id: str("The setlist's id"), date: str("yyyy-mm-dd, a Sunday; defaults to the setlist's service date"), gathering: SETLIST_JSON.properties.gathering }, required: ["id"] },
  },
  schema: z.object({ id: S(40).min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), gathering: z.enum(GATHERING_KEYS).optional() }),
  async run(input, ctx) {
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const { entry: e, mine } = await getEntry(actor, input.id);
      if (!mine) return fail("Only the leader who wrote a setlist can send it. They could share it with a planner, or the leader can make their own copy.");
      if (e.kind !== "setlist" || !e.setlist) return fail("That entry isn't a worship setlist.");
      if (!(await canSendToService(actor))) return fail("Pastors, staff, schedulers and the worship team's lead send setlists to the order of service. Offer to share the setlist with them instead.");
      const date = input.date ?? e.setlist.serviceDate;
      const g = input.gathering ?? e.setlist.gathering;
      if (!date || !g) return fail("Which Sunday and which service (8:30 or 10:45)? Ask, then call again with date and gathering.");
      const label = GATHERINGS.find((x) => x.key === g)?.label ?? g;
      const songs = e.setlist.songs.filter((s) => s.title.trim()).length;
      if (!gateConfirmed(ctx, "send_setlist_to_service", JSON.stringify([e.id, date, g]))) {
        return fail(`Not confirmed yet. Ask: add the ${songs} songs from "${e.title}" to the ${label} order of service on ${friendlyDate(date)}${e.setlist.sentTo ? " (updating what was sent before)" : ""}? Call send_setlist_to_service again with the same details after they say yes.`);
      }
      const out = await sendToService(actor, e.id, { date, gathering: g }, ctx.meta.offRecord ? undefined : ctx.meta.id);
      return ok({ sent: out.songs, service: `${label}, ${friendlyDate(date)}`, started_from_usual_order: out.started || undefined, link: `/services/plan?date=${date}`, say: "Tell them in one sentence; they can adjust it in Services → Order of service." });
    });
  },
});

/* ---------- search, append, tag, delete ---------- */


const deleteJournalEntry = tool({
  def: {
    name: "delete_journal_entry",
    description:
      "Delete one of the leader's own journal entries for good (it can't be undone), only when they ask. Confirmed in code: the first call only proposes; ask the leader, naming the entry, and call again with the same id after they say yes. Entries others shared can't be deleted.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { id: str() }, required: ["id"] },
  },
  schema: z.object({ id: S(40).min(1) }),
  async run({ id }, ctx) {
    const actor = await actorFor(ctx);
    if (isResult(actor)) return actor;
    return guard(async () => {
      const { entry: e, mine } = await getEntry(actor, id);
      if (!mine) return fail(`${e.ownerName} wrote this entry; only they can delete it.`);
      if (!gateConfirmed(ctx, "delete_journal_entry", JSON.stringify([id]))) {
        return fail(`Not confirmed yet. Ask: delete the ${KIND_LABELS[e.kind].toLowerCase()} "${e.title}" from their Journal for good? It can't be undone. Call delete_journal_entry again with the same id after they say yes.`);
      }
      await deleteEntry(actor, id);
      return { ...ok({ deleted: e.title, say: "Tell them in a few words it's gone." }), links: [{ label: "Open Journal", href: "/journal" }] };
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const JOURNAL_MORE_TOOLS: ToolSpec<any>[] = [deleteJournalEntry];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const JOURNAL_TOOLS: ToolSpec<any>[] = [journalNote, startEntry, listJournal, readJournalEntry, updateJournalEntry, shareJournalEntry, sendSetlist];
