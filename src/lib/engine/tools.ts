import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config";
import { churchData, LANGUAGE_NAMES, type Language, type Person } from "../chms";
import type { Leader } from "../auth/session";
import { addDays, friendlyDate, today } from "../dates";
import type { ConversationMeta } from "../data/conversations";
import { provenanceKey } from "../data/conversations";
import { newId } from "../data/ids";
import { addCare, addHold, audit, getDraft, queueDraft, saveDraft, type Draft } from "../data/records";
import { MemoryFS } from "../memory/fs";
import { slug } from "../memory/paths";
import { isAffirmative } from "../policy/confirm";
import { checkMemoryText } from "../policy/privacy";
import { kv } from "../store";
import { followUps, radarNow } from "./briefing";
import { INBOX_PATH } from "./prompt";

export type ToolContext = {
  leader: Leader;
  meta: ConversationMeta;
  /** When the current leader turn started (ms). Drafts must predate it to be sendable. */
  turnStartedAt: number;
  /** What the leader said this turn, used by the confirmation gate. */
  lastUserText: string;
};

export type ToolResult = { content: string; isError: boolean };

type ToolSpec<S extends z.ZodTypeAny> = {
  def: Anthropic.Beta.BetaTool;
  schema: S;
  /** Short line the voice app can speak while the tool runs. */
  phrase?: string;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>;
};

const ok = (content: unknown): ToolResult => ({
  content: typeof content === "string" ? content : JSON.stringify(content),
  isError: false,
});
const fail = (content: string): ToolResult => ({ content, isError: true });

function tool<S extends z.ZodTypeAny>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}

function memoryFor(ctx: ToolContext) {
  const policy = (text: string) => checkMemoryText(text, { allowSensitive: config.allowSensitiveMemory });
  return new MemoryFS(
    { churchId: ctx.leader.churchId, leaderId: ctx.leader.leaderId },
    policy,
    async (path) => {
      if (!ctx.meta.offRecord) await kv().sadd(provenanceKey(ctx.leader, ctx.meta.id), path);
    },
  );
}

function personCard(p: Person) {
  return {
    person_id: p.id,
    name: p.name,
    written_language: LANGUAGE_NAMES[p.language],
    household: p.household ?? null,
    small_group: p.smallGroup ?? null,
  };
}

const findPerson = tool({
  phrase: "Let me look them up.",
  def: {
    name: "find_person",
    description: "Search the church directory by name. Returns matching people with their person_id and preferred written language. Use before any other person tool when you only have a name.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Full or partial name, e.g. 'Sarah' or 'Sarah Kim'" } },
      required: ["name"],
    },
  },
  schema: z.object({ name: z.string().min(1).max(100) }),
  async run({ name }) {
    const matches = await churchData().findPeople(name);
    if (!matches.length) return ok({ matches: [], note: `No one named "${name}" is in the directory.` });
    return ok({ matches: matches.slice(0, 6).map(personCard) });
  },
});

const getPersonSummary = tool({
  phrase: "One moment, pulling that up.",
  def: {
    name: "get_person_summary",
    description: "Serving history, worship and small-group attendance, upcoming assignments, burnout signals and open follow-ups for one person.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { person_id: { type: "string" } },
      required: ["person_id"],
    },
  },
  schema: z.object({ person_id: z.string().min(1).max(40) }),
  async run({ person_id }, ctx) {
    const data = churchData();
    const person = await data.getPerson(person_id);
    if (!person) return fail(`No person with id ${person_id}. Use find_person first.`);
    const { radar, serving, attendance, sunday } = await radarNow();
    const teams = new Map((await data.teams()).map((t) => [t.id, t.name]));
    const since = addDays(sunday, -7 * 7);
    const mine = serving.filter((s) => s.personId === person_id && s.date >= since);
    const byTeam: Record<string, { served: number; declined: number }> = {};
    for (const s of mine) {
      const name = teams.get(s.teamId) ?? s.teamId;
      byTeam[name] ??= { served: 0, declined: 0 };
      if (s.status === "served") byTeam[name].served++;
      if (s.status === "declined") byTeam[name].declined++;
    }
    const worship = attendance.filter((a) => a.personId === person_id && a.kind === "worship" && a.date > addDays(sunday, -28));
    const groups = attendance.filter((a) => a.personId === person_id && a.kind === "group").sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4);
    const rosters = await data.rosters(today(), addDays(today(), 14));
    const upcoming = rosters.filter((r) => r.people.some((p) => p.personId === person_id)).map((r) => `${r.teamName}, ${friendlyDate(r.date)}`);
    const signal = radar.find((r) => r.personId === person_id);
    const follow = (await followUps(ctx.leader)).filter((f) => f.personId === person_id).map((f) => f.reason);
    const memoryFile = `/memories/people/${slug(person.name)}.md`;
    const hasNotes = (await memoryFor(ctx).read(memoryFile)) !== null;
    return ok({
      ...personCard(person),
      serving_last_8_weeks: byTeam,
      worship_last_4_sundays: `${worship.filter((a) => a.present).length} of ${worship.length}`,
      small_group_last_meetings: groups.length ? `${groups.filter((g) => g.present).length} of ${groups.length}` : "not in a group",
      upcoming_assignments: upcoming,
      last_thanked: person.lastThanked ? friendlyDate(person.lastThanked) : "no record",
      burnout_signals: signal && signal.band !== "ok" ? { level: signal.band, reasons: signal.drivers, suggestion: signal.suggestion } : "none",
      open_follow_ups: follow,
      your_notes_file: hasNotes ? memoryFile : null,
    });
  },
});

const getVolunteerLoad = tool({
  phrase: "Let me check how the teams are doing.",
  def: {
    name: "get_volunteer_load",
    description: "Burnout radar for volunteers: who is carrying too much or pulling back, with the reasons and a suggested next step. Optionally filter to one team.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { team: { type: "string", description: "Team name or id, e.g. 'kids' or 'Worship team'" } },
    },
  },
  schema: z.object({ team: z.string().max(60).optional() }),
  async run({ team }) {
    const { radar } = await radarNow();
    const teams = await churchData().teams();
    let entries = radar;
    if (team) {
      const t = teams.find((x) => x.id === team.toLowerCase() || x.name.toLowerCase().includes(team.toLowerCase()));
      if (!t) return fail(`No team called "${team}". Teams: ${teams.map((x) => x.name).join(", ")}.`);
      entries = radar.filter((r) => r.teams.includes(t.name));
    }
    const flagged = entries.filter((r) => r.band !== "ok");
    return ok({
      flagged: flagged.slice(0, 8).map((r) => ({ person_id: r.personId, name: r.name, level: r.band, teams: r.teams, reasons: r.drivers, suggestion: r.suggestion })),
      healthy_count: entries.length - flagged.length,
    });
  },
});

const getSchedule = tool({
  phrase: "Let me check the schedule.",
  def: {
    name: "get_schedule",
    description: "Serving rosters and church events between two dates (default: the next 7 days). Dates are yyyy-mm-dd.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
    },
  },
  schema: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  async run({ from, to }) {
    const start = from ?? today();
    const end = to ?? addDays(start, 7);
    const data = churchData();
    const [rosters, events] = await Promise.all([data.rosters(start, end), data.events(start, end)]);
    return ok({
      rosters: rosters.map((r) => ({ date: r.date, team: r.teamName, people: r.people.map((p) => ({ person_id: p.personId, name: p.name })) })),
      events,
    });
  },
});

const listFollowUps = tool({
  phrase: "Let me check your follow-ups.",
  def: {
    name: "list_follow_ups",
    description: "Open pastoral follow-ups for this leader: care visits with a next step, and people who have stopped attending.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {} },
  },
  schema: z.object({}).passthrough(),
  async run(_input, ctx) {
    const items = await followUps(ctx.leader);
    return ok({ follow_ups: items.map((f) => ({ person_id: f.personId, name: f.name, reason: f.reason, due: f.due ?? null })) });
  },
});

const recallMemory = tool({
  phrase: "Let me check my notes.",
  def: {
    name: "recall_memory",
    description: "Open one of your memory files (or list a folder) for this leader. Paths start with /memories.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "e.g. /memories/people/sarah-kim.md" } },
      required: ["path"],
    },
  },
  schema: z.object({ path: z.string().min(1).max(200) }),
  async run({ path }, ctx) {
    const result = await memoryFor(ctx).run({ command: "view", path });
    return { content: result.text, isError: result.isError };
  },
});

const saveMemory = tool({
  def: {
    name: "save_memory",
    description: "Save one short, factual note to this leader's memory, such as a preference, a commitment, a ministry plan, or a minimal follow-up about a person. It is organized into the leader's memory after the conversation.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "One sentence, e.g. 'Prefers texts over calls before 9am' or 'Check on Grace after her recovery, by Friday'" },
        about_person_id: { type: "string", description: "Set when the note is about a congregant" },
      },
      required: ["note"],
    },
  },
  schema: z.object({ note: z.string().min(3).max(400), about_person_id: z.string().max(40).optional() }),
  async run({ note, about_person_id }, ctx) {
    if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing can be saved.");
    const problem = checkMemoryText(note, { allowSensitive: config.allowSensitiveMemory });
    if (problem) return fail(problem);
    let about = "";
    if (about_person_id) {
      const p = await churchData().getPerson(about_person_id);
      if (!p) return fail(`No person with id ${about_person_id}.`);
      about = ` (about ${p.name}, ${p.id})`;
    }
    const fs = memoryFor(ctx);
    const existing = (await fs.read(INBOX_PATH)) ?? "# Notes to organize\n";
    const line = `- ${today()} [conv:${ctx.meta.id}]${about} ${note.replace(/\s+/g, " ").trim()}`;
    const result = await fs.run({ command: "create", path: INBOX_PATH, file_text: `${existing.replace(/\n*$/, "\n")}${line}\n` });
    if (result.isError) return fail(result.text);
    await audit(ctx.leader, { conversationId: ctx.meta.id, action: "memory.save", detail: note.slice(0, 200) });
    return ok("Saved.");
  },
});

const draftMessage = tool({
  phrase: "Writing that up now.",
  def: {
    name: "draft_message",
    description:
      "Create a draft text or email for one or more people (by person_id, or everyone serving on a team). Nothing is sent: the leader reviews it and you call send_draft only after they say yes. " +
      "For recipients whose written language isn't English, include a translation for each such language in `translations` (keys: es, ko).",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        person_ids: { type: "array", items: { type: "string" } },
        team: { type: "string", description: "Instead of person_ids: everyone who served on this team in the last 8 weeks" },
        channel: { type: "string", enum: ["sms", "email"] },
        subject: { type: "string", description: "Email subject (email only)" },
        text: { type: "string", description: "The message in English" },
        translations: {
          type: "object",
          properties: { es: { type: "string" }, ko: { type: "string" } },
        },
      },
      required: ["channel", "text"],
    },
  },
  schema: z.object({
    person_ids: z.array(z.string().max(40)).max(200).optional(),
    team: z.string().max(60).optional(),
    channel: z.enum(["sms", "email"]),
    subject: z.string().max(200).optional(),
    text: z.string().min(1).max(2000),
    translations: z.object({ es: z.string().max(2400).optional(), ko: z.string().max(2400).optional() }).optional(),
  }),
  async run(input, ctx) {
    const data = churchData();
    let people: Person[] = [];
    if (input.person_ids?.length) {
      const found = await Promise.all(input.person_ids.map((id) => data.getPerson(id)));
      const missing = input.person_ids.filter((_, i) => !found[i]);
      if (missing.length) return fail(`Unknown person_id: ${missing.join(", ")}. Use find_person.`);
      people = found.filter((p): p is Person => Boolean(p));
    } else if (input.team) {
      const teams = await data.teams();
      const t = teams.find((x) => x.id === input.team!.toLowerCase() || x.name.toLowerCase().includes(input.team!.toLowerCase()));
      if (!t) return fail(`No team called "${input.team}".`);
      const serving = await data.serving(addDays(today(), -56));
      const ids = [...new Set(serving.filter((s) => s.teamId === t.id && s.status === "served").map((s) => s.personId))];
      people = (await Promise.all(ids.map((id) => data.getPerson(id)))).filter((p): p is Person => Boolean(p));
    } else {
      return fail("Give person_ids or a team.");
    }
    if (!people.length) return fail("No recipients found.");

    const needed = new Map<Language, number>();
    for (const p of people) if (p.language !== "en") needed.set(p.language, (needed.get(p.language) ?? 0) + 1);
    const missing = [...needed.keys()].filter((lang) => !input.translations?.[lang as "es" | "ko"]?.trim());
    if (missing.length) {
      const detail = missing.map((l) => `${LANGUAGE_NAMES[l]} (${l}) for ${needed.get(l)} recipient${needed.get(l)! > 1 ? "s" : ""}`).join(", ");
      return fail(`Some recipients read another language. Call draft_message again with translations for: ${detail}.`);
    }
    const draft: Draft = {
      id: newId("draft"),
      leaderId: ctx.leader.leaderId,
      conversationId: ctx.meta.id,
      channel: input.channel,
      subject: input.subject,
      baseText: input.text,
      recipients: people.map((p) => ({
        personId: p.id,
        name: p.name,
        language: p.language,
        text: p.language === "en" ? input.text : input.translations![p.language as "es" | "ko"]!,
      })),
      status: "needs_review",
      createdAt: Date.now(),
    };
    await saveDraft(ctx.leader, draft);
    await audit(ctx.leader, { conversationId: ctx.meta.id, action: "draft.create", detail: `${draft.id} to ${people.length}` });
    const langs = [...needed.entries()].map(([l, n]) => `${n} in ${LANGUAGE_NAMES[l]}`);
    return ok({
      draft_id: draft.id,
      recipients: people.length,
      by_language: langs.length ? [`${people.length - [...needed.values()].reduce((a, b) => a + b, 0)} in English`, ...langs] : ["all in English"],
      status: "Waiting for the leader. Summarize it and ask whether to send it. It also appears in the Drafts screen.",
    });
  },
});

const sendDraft = tool({
  def: {
    name: "send_draft",
    description: "Send a draft the leader has heard and approved. Only call this after the leader says yes in their latest turn.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { draft_id: { type: "string" } }, required: ["draft_id"] },
  },
  schema: z.object({ draft_id: z.string().min(1).max(60) }),
  async run({ draft_id }, ctx) {
    const draft = await getDraft(ctx.leader, draft_id);
    if (!draft) return fail(`No draft ${draft_id}.`);
    if (draft.status !== "needs_review") return fail(`That draft is already ${draft.status === "queued" ? "queued" : "discarded"}.`);
    if (draft.createdAt >= ctx.turnStartedAt) {
      return fail("Not confirmed: the leader hasn't heard this draft yet. Summarize it and ask whether to send it.");
    }
    if (!isAffirmative(ctx.lastUserText)) {
      return fail("Not confirmed: the leader's last reply wasn't a clear yes. Ask: 'Want me to send it?'");
    }
    await queueDraft(ctx.leader, draft);
    await audit(ctx.leader, { conversationId: ctx.meta.id, action: "draft.queue", detail: draft.id });
    return ok(
      `Queued ${draft.recipients.length} message${draft.recipients.length > 1 ? "s" : ""}. Text and email delivery isn't connected in this version, so tell the leader it's queued in the outbox, not delivered.`,
    );
  },
});

const logCareEvent = tool({
  def: {
    name: "log_care_event",
    description: "Record a pastoral contact (visit, call, hospital visit, prayer, text) with an optional minimal follow-up and due date. Keep it minimal: who, what kind of contact, and the next step, without sensitive details.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        kind: { type: "string", enum: ["visit", "call", "hospital", "prayer", "text", "other"] },
        follow_up: { type: "string", description: "e.g. 'Ask how her recovery is going'" },
        due: { type: "string", description: "yyyy-mm-dd" },
      },
      required: ["person_id", "kind"],
    },
  },
  schema: z.object({
    person_id: z.string().min(1).max(40),
    kind: z.enum(["visit", "call", "hospital", "prayer", "text", "other"]),
    follow_up: z.string().max(300).optional(),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async run(input, ctx) {
    const person = await churchData().getPerson(input.person_id);
    if (!person) return fail(`No person with id ${input.person_id}.`);
    if (input.follow_up) {
      const problem = checkMemoryText(input.follow_up, { allowSensitive: config.allowSensitiveMemory });
      if (problem) return fail(problem);
    }
    const record = await addCare(ctx.leader, {
      personId: person.id,
      personName: person.name,
      kind: input.kind,
      followUp: input.follow_up,
      due: input.due,
      conversationId: ctx.meta.offRecord ? undefined : ctx.meta.id,
    });
    await audit(ctx.leader, { conversationId: ctx.meta.id, action: "care.log", detail: `${record.kind} ${person.id}` });
    return ok(`Logged ${input.kind} with ${person.name}${input.follow_up ? `, follow-up: ${input.follow_up}` : ""}.`);
  },
});

const blockTime = tool({
  def: {
    name: "block_time",
    description: "Hold time on the leader's calendar for rest, sabbath, prayer or preparation. First call proposes it; call again with the same values after the leader says yes.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "yyyy-mm-dd" },
        start: { type: "string", description: "e.g. 09:00" },
        end: { type: "string", description: "e.g. 12:00" },
        label: { type: "string" },
      },
      required: ["date", "start", "end", "label"],
    },
  },
  schema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: z.string().regex(/^\d{1,2}:\d{2}$/),
    end: z.string().regex(/^\d{1,2}:\d{2}$/),
    label: z.string().min(1).max(80),
  }),
  async run(input, ctx) {
    const key = JSON.stringify([input.date, input.start, input.end, input.label.trim().toLowerCase()]);
    const pending = ctx.meta.pending;
    const confirmed =
      pending?.tool === "block_time" && pending.key === key && pending.turn < ctx.meta.turns && isAffirmative(ctx.lastUserText);
    if (!confirmed) {
      ctx.meta.pending = { tool: "block_time", key, turn: ctx.meta.turns };
      return fail(
        `Not confirmed yet. Ask the leader: hold ${friendlyDate(input.date)} from ${input.start} to ${input.end} for "${input.label}"? Call block_time again with the same values after they say yes.`,
      );
    }
    ctx.meta.pending = undefined;
    await addHold(ctx.leader, input);
    await audit(ctx.leader, { conversationId: ctx.meta.id, action: "calendar.hold", detail: `${input.date} ${input.start}-${input.end}` });
    return ok("Held on the Barnabas calendar. Calendar sync isn't connected in this version, so remind the leader to add it to their own calendar.");
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL: ToolSpec<any>[] = [
  findPerson,
  getPersonSummary,
  getVolunteerLoad,
  getSchedule,
  listFollowUps,
  recallMemory,
  saveMemory,
  draftMessage,
  sendDraft,
  logCareEvent,
  blockTime,
];

/** Tool definitions in a fixed order (part of the cached prompt prefix). */
export const TOOL_DEFS: Anthropic.Beta.BetaTool[] = ALL.map((t) => t.def);

const BY_NAME = new Map(ALL.map((t) => [t.def.name, t]));

export function holdingPhrase(name: string): string | undefined {
  return BY_NAME.get(name)?.phrase;
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const spec = BY_NAME.get(name);
  if (!spec) return fail(`Unknown tool ${name}.`);
  // Tool inputs stream eagerly and aren't validated by the API, so validate before running.
  const parsed = spec.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return fail(`Invalid input for ${name}: ${parsed.error.issues.map((i: z.ZodIssue) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`);
  }
  try {
    return await spec.run(parsed.data, ctx);
  } catch (err) {
    console.error(`[barnabas] tool ${name} failed`, err);
    return fail(`${name} failed on our side. Tell the leader it didn't work.`);
  }
}
