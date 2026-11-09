import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config";
import { churchData, LANGUAGE_NAMES, type Language, type Person } from "../chms";
import type { Leader } from "../auth/session";
import { addDays, friendlyDate, today } from "../dates";
import type { ConversationMeta } from "../data/conversations";
import { provenanceKey } from "../data/conversations";
import { newId } from "../data/ids";
import { calendarRange, createEvent, deleteEvent, updateEvent } from "../calendar/service";
import { EventInputSchema, getEvent } from "../calendar/store";
import { addDaysIso, time12, todayIn } from "../calendar/time";
import { addCare, audit, getDraft, queueDraft, saveDraft, type Draft } from "../data/records";
import { getProfile } from "../profile";
import { MemoryFS } from "../memory/fs";
import { slug } from "../memory/paths";
import { isAffirmative } from "../policy/confirm";
import { checkMemoryText } from "../policy/privacy";
import { kv } from "../store";
import { followUps, radarNow } from "./briefing";
import { INBOX_PATH } from "./prompt";
import { can } from "../auth/roles";
import { accessFor } from "../team";
import { HEALTH_LABELS } from "../finance/budget";
import { donorSummaries, lastMonths, monthLabel } from "../finance/giving";
import { dollars, wholeDollars } from "../finance/money";
import { addTransaction, recordGifts } from "../finance/service";
import { loadBooks } from "../finance/store";
import { GIFT_METHODS, METHOD_LABELS, type Books, type GiftMethod } from "../finance/types";
import { budgetView, financeOverview, givingSummary, missionsView, sameDayLastYear } from "../finance/views";

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

const EVENT_KIND = ["meeting", "visit", "rest", "service", "prep", "event", "other"] as const;

const listCalendar = tool({
  phrase: "Let me check your calendar.",
  def: {
    name: "list_calendar",
    description:
      "The leader's calendar between two dates (default: today through the next 7 days): Barnabas events (editable, with event_id), events from their connected Google or Outlook calendars (read-only), and church events (read-only). Dates are yyyy-mm-dd; times are 24-hour in the leader's time zone.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
  },
  schema: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  async run({ from, to }, ctx) {
    const { timezone } = await getProfile(ctx.leader);
    const start = from ?? todayIn(timezone);
    const end = to ?? addDaysIso(start, 7);
    if (end < start || end > addDaysIso(start, 62)) return fail("Use a range of up to two months.");
    const range = await calendarRange(ctx.leader, start, end);
    return ok({
      time_zone: timezone,
      barnabas_events: range.events.map((e) => ({ event_id: e.id, title: e.title, date: e.date, start: e.start ?? null, end: e.end ?? null, all_day: e.allDay, location: e.location ?? null, kind: e.kind, added_by: e.createdBy })),
      other_events: range.outside.map((e) => ({ source: e.source === "church" ? "church calendar" : e.source === "google" ? "Google Calendar" : "Outlook", title: e.title, date: e.date, start: e.start ?? null, end: e.end ?? null, all_day: e.allDay, location: e.location ?? null })),
      sync_problems: range.problems,
    });
  },
});

const eventFields = {
  title: { type: "string" },
  date: { type: "string", description: "yyyy-mm-dd" },
  start: { type: "string", description: "HH:MM, 24-hour, leader's time zone" },
  end: { type: "string", description: "HH:MM, 24-hour" },
  all_day: { type: "boolean" },
  location: { type: "string" },
  notes: { type: "string", description: "Private to Barnabas; keep minimal" },
  kind: { type: "string", enum: [...EVENT_KIND] },
} as const;

function toInput(i: { title: string; date: string; start?: string; end?: string; all_day?: boolean; location?: string; notes?: string; kind?: string }) {
  return { title: i.title, date: i.date, start: i.start, end: i.end, allDay: Boolean(i.all_day), location: i.location, notes: i.notes, kind: i.kind ?? "other" };
}

function secretsOnly(text: string | undefined) {
  if (!text) return null;
  const problem = checkMemoryText(text, { allowSensitive: true });
  return problem ? problem.replace("Not saved", "Not added") : null;
}

const addCalendarEvent = tool({
  def: {
    name: "add_calendar_event",
    description:
      "Add an event to the leader's Barnabas calendar (it is also copied to their connected Google or Outlook calendar). Use when the leader asks to add something. For something you are suggesting yourself, such as rest time, ask first.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: eventFields, required: ["title", "date"] },
  },
  schema: z.object({
    title: z.string().min(1).max(120),
    date: z.string(),
    start: z.string().optional(),
    end: z.string().optional(),
    all_day: z.boolean().optional(),
    location: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    kind: z.enum(EVENT_KIND).optional(),
  }),
  async run(input, ctx) {
    const problem = secretsOnly(`${input.title} ${input.notes ?? ""} ${input.location ?? ""}`);
    if (problem) return fail(problem);
    const parsed = EventInputSchema.safeParse(toInput(input));
    if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
    const event = await createEvent(ctx.leader, parsed.data, "barnabas", ctx.meta.id);
    return ok({ event_id: event.id, added: `${event.title}, ${friendlyDate(event.date)}${event.start ? ` ${time12(event.start)} to ${time12(event.end!)}` : " (all day)"}`, sync: event.syncError ?? "ok" });
  },
});

const updateCalendarEvent = tool({
  def: {
    name: "update_calendar_event",
    description: "Change a Barnabas calendar event (by event_id from list_calendar). Send only the fields that change. Events from Google, Outlook or the church calendar can't be changed here.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { event_id: { type: "string" }, ...eventFields }, required: ["event_id"] },
  },
  schema: z.object({
    event_id: z.string().min(1).max(60),
    title: z.string().min(1).max(120).optional(),
    date: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    all_day: z.boolean().optional(),
    location: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    kind: z.enum(EVENT_KIND).optional(),
  }),
  async run(input, ctx) {
    const current = await getEvent(ctx.leader, input.event_id);
    if (!current) return fail(`No Barnabas event ${input.event_id}. Use list_calendar to find it.`);
    const merged = {
      title: input.title ?? current.title,
      date: input.date ?? current.date,
      start: input.start ?? current.start,
      end: input.end ?? current.end,
      all_day: input.all_day ?? current.allDay,
      location: input.location ?? current.location,
      notes: input.notes ?? current.notes,
      kind: input.kind ?? current.kind,
    };
    const problem = secretsOnly(`${merged.title} ${merged.notes ?? ""} ${merged.location ?? ""}`);
    if (problem) return fail(problem);
    const parsed = EventInputSchema.safeParse(toInput(merged));
    if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
    const event = await updateEvent(ctx.leader, input.event_id, parsed.data, "barnabas", ctx.meta.id);
    if (!event) return fail("That event no longer exists.");
    return ok({ event_id: event.id, now: `${event.title}, ${friendlyDate(event.date)}${event.start ? ` ${time12(event.start)} to ${time12(event.end!)}` : " (all day)"}`, sync: event.syncError ?? "ok" });
  },
});

const deleteCalendarEvent = tool({
  def: {
    name: "delete_calendar_event",
    description: "Delete a Barnabas calendar event. First call proposes it; call again with the same event_id after the leader says yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] },
  },
  schema: z.object({ event_id: z.string().min(1).max(60) }),
  async run({ event_id }, ctx) {
    const event = await getEvent(ctx.leader, event_id);
    if (!event) return fail(`No Barnabas event ${event_id}.`);
    const pending = ctx.meta.pending;
    const confirmed = pending?.tool === "delete_calendar_event" && pending.key === event_id && pending.turn < ctx.meta.turns && isAffirmative(ctx.lastUserText);
    if (!confirmed) {
      ctx.meta.pending = { tool: "delete_calendar_event", key: event_id, turn: ctx.meta.turns };
      return fail(`Not confirmed yet. Ask the leader: delete "${event.title}" on ${friendlyDate(event.date)}? Call delete_calendar_event again after they say yes.`);
    }
    ctx.meta.pending = undefined;
    await deleteEvent(ctx.leader, event_id, "barnabas", ctx.meta.id);
    return ok(`Deleted "${event.title}".`);
  },
});


/* ---------- Finance (permission-checked in code on every call) ---------- */

const NO_FINANCE = "This leader's role doesn't include church finances. Tell them kindly that finance is limited to the pastor, treasurer and deacons, and they can ask the church administrator.";
const NO_DONORS = "Individual giving is confidential: only the pastor and treasurer can see who gave what. Offer the church-wide totals instead.";

async function financeAccess(ctx: ToolContext) {
  return accessFor(ctx.leader);
}

const pct = (n: number | null) => (n === null ? null : `${Math.round(n)}%`);

function findFund(books: Books, name: string | undefined) {
  if (!name) return books.chart.funds.find((f) => !f.restricted) ?? null;
  const q = name.trim().toLowerCase();
  return books.chart.funds.find((f) => f.id === q || f.name.toLowerCase() === q) ?? books.chart.funds.find((f) => f.name.toLowerCase().includes(q) || q.includes(f.id)) ?? null;
}

const financeOverviewTool = tool({
  phrase: "Let me look at the books.",
  def: {
    name: "finance_overview",
    description:
      "Church finances at a glance for this year to date: income vs expenses, General fund balance, restricted fund balances, giving this month vs the same time last year, budget health by ministry, and missions giving vs pledged. Aggregates only; no donor names. Only pastors, treasurers and deacons can use it.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {} },
  },
  schema: z.object({}).passthrough(),
  async run(_input, ctx) {
    const access = await financeAccess(ctx);
    if (!can(access, "finance.view")) return fail(NO_FINANCE);
    const o = financeOverview(await loadBooks(ctx.leader.churchId), today());
    return ok({
      as_of: o.asOf,
      demo_data: o.demo,
      year_to_date: { income: wholeDollars(o.ytd.income), expenses: wholeDollars(o.ytd.expenses), net: wholeDollars(o.ytd.net) },
      general_fund_balance: wholeDollars(o.generalFund.balance),
      restricted_funds: o.restrictedFunds.map((f) => ({ fund: f.name, balance: wholeDollars(f.balance) })),
      giving_this_month: { so_far: wholeDollars(o.giving.monthToDate), same_days_last_year: wholeDollars(o.giving.lastYearSamePeriod), whole_month_last_year: wholeDollars(o.giving.lastYearMonth) },
      budget: o.budgetHealth.hasBudget
        ? { year_elapsed: `${Math.round(o.budgetHealth.elapsed * 100)}%`, ministries: o.budgetHealth.groups.map((g) => ({ ministry: g.group, status: HEALTH_LABELS[g.health], spent: wholeDollars(g.actual), budget_for_year: wholeDollars(g.annual), percent_spent: pct(g.pctUsed) })) }
        : "No budget for this year yet.",
      missions: o.missions.campaign
        ? { campaign: o.missions.campaign.name, goal: wholeDollars(o.missions.campaign.goal), pledged: wholeDollars(o.missions.campaign.pledged), received: wholeDollars(o.missions.campaign.received), missions_fund_balance: wholeDollars(o.missions.fundBalance) }
        : { missions_fund_balance: wholeDollars(o.missions.fundBalance) },
    });
  },
});

const budgetStatusTool = tool({
  phrase: "Let me check the budget.",
  def: {
    name: "budget_status",
    description:
      "How the church is tracking against this year's budget, by ministry or category (Salaries and benefits, Missions, Facilities, Utilities, Ministries, Benevolence, Administration, and income). With a ministry, returns its line items. Shows actual vs budget, variance, percent spent and on track / watch / over.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { ministry: { type: "string", description: "Optional ministry or category, e.g. 'Facilities' or 'teens'" } } },
  },
  schema: z.object({ ministry: z.string().max(60).optional() }),
  async run({ ministry }, ctx) {
    const access = await financeAccess(ctx);
    if (!can(access, "finance.view")) return fail(NO_FINANCE);
    const books = await loadBooks(ctx.leader.churchId);
    const asOf = today();
    const year = Number(asOf.slice(0, 4));
    const report = budgetView(books, year, asOf);
    if (!report.exists) return ok(`There's no ${year} budget yet.`);
    const fmt = (r: { actual: number; annual: number; toDate: number; variance: number; pctUsed: number | null; health: keyof typeof HEALTH_LABELS; kind: string }) => ({
      status: HEALTH_LABELS[r.health],
      actual: wholeDollars(r.actual),
      budget_for_year: wholeDollars(r.annual),
      budget_to_date: wholeDollars(r.toDate),
      [r.kind === "income" ? "ahead_of_budget" : "under_budget"]: wholeDollars(r.variance),
      percent_of_year_budget: pct(r.pctUsed),
    });
    if (ministry) {
      const q = ministry.toLowerCase();
      const rows = report.rows.filter((r) => r.group.toLowerCase().includes(q) || r.account.name.toLowerCase().includes(q));
      if (!rows.length) return fail(`No budget lines match "${ministry}". Categories: ${[...new Set(report.groups.map((g) => g.group))].join(", ")}.`);
      return ok({ year, year_elapsed: `${Math.round(report.elapsed * 100)}%`, lines: rows.map((r) => ({ line: r.account.name, category: r.group, ...fmt(r), seasonal: r.timing === "seasonal" || undefined })) });
    }
    return ok({
      year,
      year_elapsed: `${Math.round(report.elapsed * 100)}%`,
      income: { actual: wholeDollars(report.totals.income.actual), budget_to_date: wholeDollars(report.totals.income.toDate), budget_for_year: wholeDollars(report.totals.income.annual) },
      expenses: { actual: wholeDollars(report.totals.expense.actual), budget_to_date: wholeDollars(report.totals.expense.toDate), budget_for_year: wholeDollars(report.totals.expense.annual) },
      by_category: report.groups.map((g) => ({ category: g.group, kind: g.kind, ...fmt(g) })),
    });
  },
});

const missionsStatusTool = tool({
  phrase: "Let me check on missions.",
  def: {
    name: "missions_status",
    description: "Missions giving and support: the faith-promise campaign (goal, pledged, received), the Missions fund balance, and each missions partner's monthly commitment vs what's been paid this year, with their latest prayer update date. No donor names.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {} },
  },
  schema: z.object({}).passthrough(),
  async run(_input, ctx) {
    const access = await financeAccess(ctx);
    if (!can(access, "finance.view")) return fail(NO_FINANCE);
    // Always the aggregate view here: pledges by name aren't needed to answer how missions is doing.
    const m = missionsView(await loadBooks(ctx.leader.churchId), { role: "deacon", admin: false }, today());
    return ok({
      missions_fund_balance: wholeDollars(m.fund?.balance ?? 0),
      missions_giving_this_year: wholeDollars(m.missionsGivingYtd),
      campaigns: m.campaigns.map((c) => ({ name: c.campaign.name, goal: wholeDollars(c.campaign.goal), pledged: wholeDollars(c.pledged), received: wholeDollars(c.received), pledges: c.pledgeCount, percent_of_goal: pct(c.pctOfGoal), ends: c.campaign.end })),
      partners: m.partners.filter((p) => p.partner.active).map((p) => ({ name: p.partner.name, field: p.partner.field, work: p.partner.type, monthly: wholeDollars(p.partner.monthly), committed_this_year: wholeDollars(p.committed), paid_this_year: wholeDollars(p.paid), last_prayer_update: p.lastUpdate ?? null })),
    });
  },
});

const givingSummaryTool = tool({
  phrase: "Let me look at giving.",
  def: {
    name: "giving_summary",
    description:
      "Church-wide giving totals for a period (this month, last month, or this year), by fund and method, with the same period last year and the monthly trend. Totals only. Pass donor (a name or person_id) for one person's giving this year: that works only for the pastor or treasurer, and returns just their totals, not every gift.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["this_month", "last_month", "this_year"] },
        donor: { type: "string", description: "Only for pastor or treasurer: a person's name or person_id" },
      },
    },
  },
  schema: z.object({ period: z.enum(["this_month", "last_month", "this_year"]).optional(), donor: z.string().max(100).optional() }),
  async run({ period = "this_year", donor }, ctx) {
    const access = await financeAccess(ctx);
    if (!can(access, "finance.view")) return fail(NO_FINANCE);
    if (donor && !can(access, "giving.donors")) return fail(NO_DONORS);
    const books = await loadBooks(ctx.leader.churchId);
    const asOf = today();
    const year = Number(asOf.slice(0, 4));
    if (donor) {
      const person = /^p\d+$/.test(donor) ? await churchData().getPerson(donor) : (await churchData().findPeople(donor))[0] ?? null;
      const key = person ? `p:${person.id}` : `n:${donor.trim().toLowerCase().replace(/\s+/g, " ")}`;
      const summary = donorSummaries(books.gifts, year).find((d) => d.key === key || d.name.toLowerCase() === donor.trim().toLowerCase());
      if (!summary) return ok(`No gifts from ${person?.name ?? donor} recorded in ${year}.`);
      return ok({ confidential: "Share only with this leader.", donor: summary.name, year, given_this_year: wholeDollars(summary.total), gifts: summary.count, last_gift: summary.lastGift, given_last_year: wholeDollars(summary.previousTotal) });
    }
    const month = asOf.slice(0, 7);
    const lastMonth = lastMonths(asOf, 2)[0];
    const ranges = {
      this_month: [`${month}-01`, asOf],
      last_month: [`${lastMonth}-01`, `${lastMonth}-31`],
      this_year: [`${year}-01-01`, asOf],
    } as const;
    const [from, to] = ranges[period];
    const g = givingSummary(books, { role: "deacon", admin: false }, from, to < asOf ? to : asOf, { trendMonths: 6 });
    const ly = givingSummary(books, { role: "deacon", admin: false }, sameDayLastYear(from), sameDayLastYear(to < asOf ? to : asOf), { trendMonths: 1 });
    return ok({
      period: { from: g.from, to: g.to },
      total: wholeDollars(g.total),
      same_period_last_year: wholeDollars(ly.total),
      gifts: g.count,
      givers: g.givers,
      by_fund: g.byFund.filter((f) => f.total).map((f) => ({ fund: f.name, total: wholeDollars(f.total) })),
      by_method: Object.fromEntries(Object.entries(g.byMethod).filter(([, v]) => v).map(([k, v]) => [METHOD_LABELS[k as GiftMethod], wholeDollars(v)])),
      last_six_months: g.trend.map((p) => ({ month: monthLabel(p.month, "long"), total: wholeDollars(p.total) })),
    });
  },
});

const recordGift = tool({
  def: {
    name: "record_gift",
    description:
      "Record one gift (pastor or treasurer only). First call proposes it; tell the leader exactly what you'll record and ask. Call again with the same details after they say yes. Amount is in dollars.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        donor: { type: "string", description: "A person_id from find_person, or a name for someone not in the directory" },
        amount: { type: "number", description: "Dollars, e.g. 250" },
        fund: { type: "string", description: "General (default), Missions, Building or Benevolence" },
        method: { type: "string", enum: [...GIFT_METHODS] },
        date: { type: "string", description: "yyyy-mm-dd; default today" },
      },
      required: ["donor", "amount", "method"],
    },
  },
  schema: z.object({
    donor: z.string().min(1).max(100),
    amount: z.number().positive().max(10_000_000),
    fund: z.string().max(60).optional(),
    method: z.enum(GIFT_METHODS),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async run(input, ctx) {
    const access = await financeAccess(ctx);
    if (!can(access, "finance.edit") || !can(access, "giving.donors")) return fail("Only the pastor or treasurer can record gifts. Tell the leader kindly.");
    const books = await loadBooks(ctx.leader.churchId);
    const fund = findFund(books, input.fund);
    if (!fund) return fail(`No fund called "${input.fund}". Funds: ${books.chart.funds.map((f) => f.name).join(", ")}.`);
    const byId = /^p\d+$/.test(input.donor);
    const person = byId ? await churchData().getPerson(input.donor) : (await churchData().findPeople(input.donor)).find((p) => p.name.toLowerCase() === input.donor.trim().toLowerCase()) ?? null;
    if (byId && !person) return fail(`No person with id ${input.donor}. Use find_person.`);
    const date = input.date ?? today();
    const cents = Math.round(input.amount * 100);
    const donorName = person?.name ?? input.donor.trim();
    const key = JSON.stringify(["gift", person?.id ?? donorName.toLowerCase(), cents, fund.id, input.method, date]);
    const summary = `${dollars(cents)} from ${donorName} to the ${fund.name}, ${METHOD_LABELS[input.method].toLowerCase()}, dated ${friendlyDate(date)}`;
    if (!gateConfirmed(ctx, "record_gift", key)) return fail(`Not confirmed yet. Ask the leader: record ${summary}? Call record_gift again with the same details after they say yes.`);
    const r = await recordGifts(ctx.leader, { depositDate: date, gifts: [{ date, personId: person?.id, donorName: person ? undefined : donorName, amount: cents, fundId: fund.id, method: input.method }] }, { source: "barnabas", conversationId: ctx.meta.id });
    return ok(`Recorded ${summary}. Deposit ${r.txn.id} is in the ledger, not yet cleared.`);
  },
});

const recordExpense = tool({
  def: {
    name: "record_expense",
    description:
      "Record a church expense paid from a bank account (pastor or treasurer only). First call proposes it; tell the leader exactly what you'll record and ask. Call again with the same details after they say yes. Amount is in dollars. Payroll runs through the payroll provider; don't calculate pay.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Payee and what for, e.g. 'Hardware store: classroom shelves'" },
        amount: { type: "number", description: "Dollars" },
        account: { type: "string", description: "Expense account name or number, e.g. 'Kids ministry' or '5400'" },
        fund: { type: "string", description: "Default: the account's usual fund, otherwise General" },
        date: { type: "string", description: "yyyy-mm-dd; default today" },
      },
      required: ["description", "amount", "account"],
    },
  },
  schema: z.object({
    description: z.string().trim().min(1).max(160),
    amount: z.number().positive().max(10_000_000),
    account: z.string().min(1).max(80),
    fund: z.string().max(60).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async run(input, ctx) {
    const access = await financeAccess(ctx);
    if (!can(access, "finance.edit")) return fail("Only the pastor or treasurer can record expenses. Tell the leader kindly.");
    const books = await loadBooks(ctx.leader.churchId);
    const q = input.account.trim().toLowerCase();
    const expenses = books.chart.accounts.filter((a) => a.type === "expense" && !a.archived);
    const exact = expenses.find((a) => a.number === q || a.name.toLowerCase() === q);
    const matches = exact ? [exact] : expenses.filter((a) => a.name.toLowerCase().includes(q) || a.group.toLowerCase() === q);
    if (matches.length !== 1) {
      return fail(matches.length ? `"${input.account}" could mean ${matches.map((a) => `${a.number} ${a.name}`).join(", ")}. Ask which.` : `No expense account matches "${input.account}". Ask the leader which account, or use budget_status to see categories.`);
    }
    const account = matches[0];
    const fund = input.fund ? findFund(books, input.fund) : books.chart.funds.find((f) => f.id === account.defaultFundId) ?? findFund(books, undefined);
    if (!fund) return fail(`No fund called "${input.fund}".`);
    const bank = books.chart.accounts.find((a) => a.bank && !a.archived);
    if (!bank) return fail("There's no bank account in the books yet.");
    const date = input.date ?? today();
    const cents = Math.round(input.amount * 100);
    const key = JSON.stringify(["expense", input.description.toLowerCase(), cents, account.id, fund.id, date]);
    const summary = `${dollars(cents)} for "${input.description}" to ${account.name} (${account.number}), ${fund.name}, paid from ${bank.name} on ${friendlyDate(date)}`;
    if (!gateConfirmed(ctx, "record_expense", key)) return fail(`Not confirmed yet. Ask the leader: record ${summary}? Call record_expense again with the same details after they say yes.`);
    const txn = await addTransaction(ctx.leader, { date, description: input.description, bankAccountId: bank.id, direction: "out", lines: [{ accountId: account.id, fundId: fund.id, amount: cents }] }, "barnabas", ctx.meta.id);
    return ok(`Recorded ${summary}. Transaction ${txn.id}, not yet cleared.`);
  },
});

/**
 * The confirmation gate for finance writes: the first call records what was proposed; it runs only when
 * a later turn calls again with exactly the same details and the leader's words are a clear yes.
 */
function gateConfirmed(ctx: ToolContext, toolName: string, key: string): boolean {
  const pending = ctx.meta.pending;
  const confirmed = pending?.tool === toolName && pending.key === key && pending.turn < ctx.meta.turns && isAffirmative(ctx.lastUserText);
  if (confirmed) {
    ctx.meta.pending = undefined;
    return true;
  }
  ctx.meta.pending = { tool: toolName, key, turn: ctx.meta.turns };
  return false;
}

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
  listCalendar,
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  financeOverviewTool,
  budgetStatusTool,
  missionsStatusTool,
  givingSummaryTool,
  recordGift,
  recordExpense,
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
