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
import { audit, getDraft, saveDraft, type Draft } from "../data/records";
import { canSendDraft } from "../messages/permissions";
import { getProfile } from "../profile";
import { MemoryFS } from "../memory/fs";
import { slug } from "../memory/paths";
import { isAffirmative } from "../policy/confirm";
import { gateConfirmed } from "./gate";
import { OPS_TOOLS } from "./ops-tools";
import { GROWTH_TOOLS } from "./growth-tools";
import { KNOW_TOOLS } from "./know";
import { THORN_TOOLS } from "./thorn";
import { SITE_TOOLS } from "./site-tools";
import { JOURNAL_TOOLS } from "./journal-tools";
import { APP_TOOLS } from "./app-tools";
import { PEOPLE_TOOLS } from "./people-tools";
import { checkMemoryText, mentionsHealth } from "../policy/privacy";
import { kv } from "../store";
import { followUps, radarNow } from "./briefing";
import { INBOX_PATH } from "./prompt";
import { can, isLimited, type Access } from "../auth/roles";
import type { ActionLink } from "./links";
import { accessFor } from "../team";
import { HEALTH_LABELS } from "../finance/budget";
import { donorSummaries, lastMonths, monthLabel } from "../finance/giving";
import { dollars, wholeDollars } from "../finance/money";
import { addTransaction, recordGifts } from "../finance/service";
import { loadBooks } from "../finance/store";
import { onlineTotals } from "../finance/online";
import { stripeStatus } from "../stripe/config";
import { listPayouts } from "../stripe/store";
import { GIFT_METHODS, METHOD_LABELS, type Books, type GiftMethod } from "../finance/types";
import { budgetView, financeOverview, givingSummary, missionsView, sameDayLastYear } from "../finance/views";
import { SIGNAL_LABELS } from "../care/load";
import { addPrayer, assignCase, careActor, CareError, closeCase, logCareEvent as logCareEventCompat, logContact, openCase, recordGuest } from "../care/service";
import { CASE_STATUS_LABELS, CASE_TYPES, CASE_TYPE_LABELS, CONTACT_KINDS, CONTACT_LABELS, GUEST_INTERESTS, PATHWAY_LABELS, PATHWAY_STEPS, type TeamMember } from "../care/types";
import { caseDetail, caseRows, careFor, discipleship, myCareLoad, recentGuests, teamView } from "../care/views";
import { isMine } from "../care/visibility";

export type ToolContext = {
  leader: Leader;
  meta: ConversationMeta;
  /** When the current leader turn started (ms). Drafts must predate it to be sendable. */
  turnStartedAt: number;
  /** What the leader said this turn, used by the confirmation gate. */
  lastUserText: string;
  /** Team and Member levels: only these tools (null or absent: all). */
  toolNames?: string[] | null;
};

export type ToolResult = {
  content: string;
  isError: boolean;
  /** Buttons for the leader under the reply, e.g. "Open Ruth's record" (paths inside the app only). */
  links?: ActionLink[];
};

export type ToolSpec<S extends z.ZodTypeAny> = {
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
    on_leadership_team: p.leadership || undefined,
    church_note: p.note,
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
      properties: { name: { type: "string", description: "Full or partial name, e.g. 'Jamie' or 'Jamie Rivera'" } },
      required: ["name"],
    },
  },
  schema: z.object({ name: z.string().min(1).max(100) }),
  async run({ name }) {
    const matches = await churchData().findPeople(name);
    if (!matches.length) return ok({ matches: [], note: `No one named "${name}" is in the directory. Say so, and don't guess at someone else. The leader can add them, or import the church's list.` });
    const shown = matches.slice(0, 6);
    return { ...ok({ matches: shown.map((p) => ({ ...personCard(p), page: `/people/${encodeURIComponent(p.id)}` })) }), links: shown.slice(0, 4).map((p) => ({ label: `Open ${p.name}'s record`, href: `/people/${encodeURIComponent(p.id)}` })) };
  },
});

const getPersonSummary = tool({
  phrase: "One moment, pulling that up.",
  def: {
    name: "get_person_summary",
    description: "Serving history, worship and small-group attendance, upcoming assignments, weariness signals and open follow-ups for one person.",
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
    return {
      ...ok({
        ...personCard(person),
        serving_last_8_weeks: byTeam,
        worship_last_4_sundays: `${worship.filter((a) => a.present).length} of ${worship.length}`,
        small_group_last_meetings: groups.length ? `${groups.filter((g) => g.present).length} of ${groups.length}` : "not in a group",
        upcoming_assignments: upcoming,
        last_thanked: person.lastThanked ? friendlyDate(person.lastThanked) : "no record",
        burnout_signals: signal && signal.band !== "ok" ? { level: signal.band, reasons: signal.drivers, suggestion: signal.suggestion } : "none",
        open_follow_ups: follow,
        your_notes_file: hasNotes ? memoryFile : null,
      }),
      links: [{ label: `Open ${person.name}'s record`, href: `/people/${encodeURIComponent(person.id)}` }],
    };
  },
});

const getVolunteerLoad = tool({
  phrase: "Let me check how the teams are doing.",
  def: {
    name: "get_volunteer_load",
    description: "Weariness watch for co-laborers: who is carrying too much or pulling back, with the reasons and a suggested next step. Optionally filter to one team.",
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
    const notes = new Map((await churchData().listPeople()).filter((p) => p.note).map((p) => [p.id, p.note!]));
    return ok({
      flagged: flagged.slice(0, 8).map((r) => ({ person_id: r.personId, name: r.name, level: r.band, teams: r.teams, reasons: r.drivers, suggestion: r.suggestion, church_note: notes.get(r.personId) })),
      healthy_count: entries.length - flagged.length,
      team_leads: Object.fromEntries(teams.filter((t) => t.lead).map((t) => [t.name, t.lead])),
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
        note: { type: "string", description: "One sentence, e.g. 'Prefers texts over calls before 9am' or 'Check on Jamie after the move, by Friday'" },
        about_person_id: { type: "string", description: "Set when the note is about a congregant" },
      },
      required: ["note"],
    },
  },
  schema: z.object({ note: z.string().min(3).max(400), about_person_id: z.string().max(40).optional() }),
  async run({ note, about_person_id }, ctx) {
    if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing can be saved.");
    // The leader's own health is never saved as a quick note: it needs their spoken permission first.
    if (!about_person_id && mentionsHealth(note)) {
      return fail("Not saved: if this is about the leader's own health, use remember_thorn to ask whether they'd like you to remember it as a thorn in the flesh or keep it private. Otherwise save only a minimal follow-up without the details.");
    }
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
      "Create a draft text or email for one or more people (by person_id, or everyone serving on a team). You never send anything: the draft waits in the leader's Drafts screen, where they review it and tap Send. " +
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
      kind: "general",
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
      status: "Waiting in the leader's Drafts screen. Summarize it in a sentence and say they can review it and tap Send there. You can't send it.",
    });
  },
});

const sendDraft = tool({
  def: {
    name: "send_draft",
    description:
      "You can't send messages. Delivery happens only when a leader taps Send on that draft in the Drafts screen. Call this when the leader says yes to sending: it checks the draft and returns what to tell them.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { draft_id: { type: "string" } }, required: ["draft_id"] },
  },
  schema: z.object({ draft_id: z.string().min(1).max(60) }),
  async run({ draft_id }, ctx) {
    const draft = await getDraft(ctx.leader, draft_id);
    if (!draft) return fail(`No draft ${draft_id}.`);
    if (draft.status !== "needs_review") return fail(`That draft is already ${draft.status.replace("_", " ")}.`);
    const access = await accessFor(ctx.leader);
    await audit(ctx.leader, { conversationId: ctx.meta.id, action: "draft.ready", detail: draft.id });
    return ok(
      canSendDraft(access, draft)
        ? `Not sent: only the leader can send, from the Drafts screen. Tell them it's waiting in Drafts and they can tap Send there after a last look (${draft.recipients.length} recipient${draft.recipients.length > 1 ? "s" : ""}).`
        : "Not sent: only the leader's pastor or staff can send this, from the Drafts screen. Tell the leader it's waiting in Drafts and who can send it.",
    );
  },
});

const logCareEvent = tool({
  def: {
    name: "log_care_event",
    description:
      "Older way to record a pastoral contact (visit, call, hospital visit, prayer, text) with an optional minimal follow-up and due date. It lands on the person's open shepherding need held by this leader, or notes a new one. Prefer log_care_contact. Keep it minimal, without sensitive details.",
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
    return careWrite(async () => {
      const actor = await careActor(ctx.leader);
      const c = await logCareEventCompat(actor, { personId: person.id, kind: input.kind, followUp: input.follow_up, due: input.due }, convId(ctx));
      await audit(ctx.leader, { conversationId: ctx.meta.id, action: "care.log", detail: `${input.kind} ${person.id} -> ${c.id}` });
      return `Logged ${input.kind} with ${person.name} on shepherding need ${c.id}${input.follow_up ? `, next step: ${input.follow_up}` : ""}.`;
    });
  },
});

/* ---------- Pastoral care (visibility checked in code on every call) ---------- */

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const convId = (ctx: ToolContext) => (ctx.meta.offRecord ? undefined : ctx.meta.id);

/** Runs a care write; policy and permission refusals come back as plain errors for Barnabas to relay. */
async function careWrite(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const out = await fn();
    const isResult = typeof out === "object" && out !== null && "isError" in out && "content" in out;
    return isResult ? (out as ToolResult) : ok(out);
  } catch (err) {
    if (err instanceof CareError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
    throw err;
  }
}

function findMember(members: TeamMember[], q: string): TeamMember | TeamMember[] | null {
  const query = q.trim().toLowerCase();
  const exact = members.find((m) => m.id === q || m.name.toLowerCase() === query);
  if (exact) return exact;
  const partial = members.filter((m) => m.name.toLowerCase().includes(query));
  return partial.length === 1 ? partial[0] : partial.length ? partial : null;
}

const listCareCases = tool({
  phrase: "Let me check the shepherding list.",
  def: {
    name: "list_care_cases",
    description:
      "Open shepherding needs this leader can see: scope 'mine' (assigned to them, the default) or 'all'; optionally one type or only overdue next steps. Each need has its type, status, who holds it, the next step and when it's due, and the last contact.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["mine", "all"] },
        type: { type: "string", enum: [...CASE_TYPES] },
        overdue: { type: "boolean", description: "Only needs whose next step is past due" },
      },
    },
  },
  schema: z.object({ scope: z.enum(["mine", "all"]).optional(), type: z.enum(CASE_TYPES).optional(), overdue: z.boolean().optional() }),
  async run({ scope = "mine", type, overdue }, ctx) {
    const { actor, book } = await careFor(ctx.leader);
    const rows = caseRows(book, actor, { scope, type, overdue });
    return ok({
      as_of: today(),
      showing: `${scope === "mine" ? "needs assigned to you" : "every need you can see"}${type ? `, ${CASE_TYPE_LABELS[type].toLowerCase()} only` : ""}${overdue ? ", overdue only" : ""}`,
      cases: rows.slice(0, 15).map((r) => ({
        case_id: r.id,
        name: r.name,
        type: r.typeLabel,
        status: CASE_STATUS_LABELS[r.status],
        held_by: r.mine ? "you" : r.assigneeName,
        confidential: r.confidential || undefined,
        next_step: r.nextStep?.text ?? null,
        due: r.nextStep?.due ?? null,
        overdue: r.overdue || undefined,
        last_contact: r.lastContact ? `${CONTACT_LABELS[r.lastContact.kind as keyof typeof CONTACT_LABELS]} on ${r.lastContact.date} by ${r.lastContact.by}` : "none yet",
      })),
      total: rows.length,
      team: scope === "all" ? { open_cases: teamView(book).totalOpen } : undefined,
    });
  },
});

const careCaseDetail = tool({
  phrase: "Let me pull up that need.",
  def: {
    name: "care_case_detail",
    description: "One shepherding need: who it's for, type, status, who holds it, the summary, the next step, and the timeline of contacts with their minimal notes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { case_id: { type: "string" } }, required: ["case_id"] },
  },
  schema: z.object({ case_id: z.string().min(1).max(60) }),
  async run({ case_id }, ctx) {
    const { actor, book } = await careFor(ctx.leader);
    const c = caseDetail(book, actor, case_id);
    if (!c) return fail("No shepherding need with that id that this leader can see. Use list_care_cases.");
    return ok({
      case_id: c.id,
      for: c.subject.name,
      person_id: c.subject.personId ?? null,
      type: CASE_TYPE_LABELS[c.type],
      status: CASE_STATUS_LABELS[c.status],
      confidential: c.confidential,
      held_by: isMine(actor.viewer, c.assigneeId) ? "you" : c.assigneeName,
      summary: c.summary ?? null,
      next_step: c.nextStep ?? null,
      contacts: c.contacts.map((x) => ({ kind: CONTACT_LABELS[x.kind], date: x.date, by: x.byName, note: x.note ?? null })),
    });
  },
});

const myCareLoadTool = tool({
  phrase: "Let me look at your week.",
  def: {
    name: "my_care_load",
    description:
      "This leader's own care load, private to them: open needs by type and weight (crisis and grief count more), contacts in the last 7 days, days since their last day off, rest days in the last 30 days, and a gentle signal (steady, full or stretched) with the reasons.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {} },
  },
  schema: z.object({}).passthrough(),
  async run(_input, ctx) {
    const { actor, book } = await careFor(ctx.leader);
    const load = await myCareLoad(ctx.leader, book, actor);
    return ok({
      private: "Only for this leader.",
      signal: SIGNAL_LABELS[load.signal],
      reasons: load.reasons,
      open_cases: load.openCases,
      by_type: load.byType.map((t) => `${t.count} ${t.label.toLowerCase()}`),
      weighted_load: load.weighted,
      contacts_last_7_days: load.contactsThisWeek,
      days_without_a_day_off: load.daysWithoutDayOff,
      last_day_off: load.lastDayOff,
      rest_days_last_30: load.restDaysLast30.length,
      overdue_next_steps: load.overdue,
      how_it_works: "Stretched if one thing is heavy or two are full; full if one is.",
    });
  },
});

const discipleshipNextSteps = tool({
  phrase: "Let me see who's ready.",
  def: {
    name: "discipleship_next_steps",
    description:
      "People ready for their next step on the discipleship pathway (first visit, Discover Faith class, salvation decision, baptism, membership class, membership, a Growth Group or Life Group, serving, giving), each with the reason. Filter to one step, e.g. 'membership_class' for 'Who's ready for the membership class?'. Also lists upcoming class sessions.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { step: { type: "string", enum: [...PATHWAY_STEPS] } } },
  },
  schema: z.object({ step: z.enum(PATHWAY_STEPS).optional() }),
  async run({ step }, ctx) {
    const { book } = await careFor(ctx.leader);
    const asOf = today();
    const d = discipleship(book, asOf, step);
    const upcoming = d.classes.flatMap((c) => c.sessions.filter((s) => s.date >= asOf).map((s) => ({ class: c.name, date: s.date, time: s.time ?? null, topic: s.topic, enrolled: c.enrollees.length })));
    return ok({
      ready: d.nextSteps.slice(0, 20).map((n) => ({ name: n.name, person_id: n.personId ?? null, guest: n.guestId ? true : undefined, next_step: PATHWAY_LABELS[n.step], why: n.reason })),
      total: d.nextSteps.length,
      upcoming_class_sessions: upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    });
  },
});

const recentGuestsTool = tool({
  phrase: "Let me check on our guests.",
  def: {
    name: "recent_guests",
    description: "Guests from the last three weeks: when they visited, who's following up, open follow-up tasks, and whether anyone has reached them yet. By default only guests no one has contacted.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { include_contacted: { type: "boolean" } } },
  },
  schema: z.object({ include_contacted: z.boolean().optional() }),
  async run({ include_contacted }, ctx) {
    const { actor, book } = await careFor(ctx.leader);
    const rows = recentGuests(book, actor, { uncontactedOnly: !include_contacted });
    return ok({
      guests: rows.map((g) => ({
        guest_id: g.id,
        name: g.name,
        visits: g.visits,
        following_up: g.mine ? "you" : g.assigneeName,
        contacted: g.contacted,
        interested_in: g.interests,
        open_tasks: g.tasks.filter((t) => !t.doneAt).map((t) => ({ task: t.label, due: new Date(t.dueAt).toISOString().slice(0, 16).replace("T", " "), overdue: t.overdue || undefined, holder: t.mine ? "you" : t.assigneeName })),
      })),
    });
  },
});

const openCareCase = tool({
  def: {
    name: "open_care_case",
    description:
      "Note a shepherding need for a person or household when the leader asks. It's assigned to the leader unless they name someone else (pastors, deacons and staff can) or 'unassigned' for the pastors' queue. Optionally log the first contact and a next step. Notes stay minimal: no diagnoses or sensitive details.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        person_id: { type: "string", description: "From find_person" },
        name: { type: "string", description: "Only for someone not in the directory" },
        household: { type: "boolean", description: "The need is for the whole household" },
        type: { type: "string", enum: [...CASE_TYPES] },
        confidential: { type: "boolean", description: "Pastors only. Use when the leader asks for it" },
        assignee: { type: "string", description: "'me' (default), 'unassigned', or a team member's name" },
        summary: { type: "string", description: "One minimal line, e.g. 'At Berkshire Medical Center this week'" },
        next_step: { type: "string" },
        due: { type: "string", description: "yyyy-mm-dd" },
        contact_kind: { type: "string", enum: [...CONTACT_KINDS], description: "If the leader already reached them" },
        contact_note: { type: "string" },
      },
      required: ["type"],
    },
  },
  schema: z.object({
    person_id: z.string().max(40).optional(),
    name: z.string().max(100).optional(),
    household: z.boolean().optional(),
    type: z.enum(CASE_TYPES),
    confidential: z.boolean().optional(),
    assignee: z.string().max(80).optional(),
    summary: z.string().max(400).optional(),
    next_step: z.string().max(400).optional(),
    due: ISO_DATE.optional(),
    contact_kind: z.enum(CONTACT_KINDS).optional(),
    contact_note: z.string().max(400).optional(),
  }),
  async run(input, ctx) {
    return careWrite(async () => {
      const actor = await careActor(ctx.leader);
      let assignee = input.assignee?.trim() || "me";
      if (!["me", "unassigned"].includes(assignee)) {
        const m = findMember(actor.members, assignee);
        if (!m) return fail(`No one on the shepherding team is called "${assignee}".`);
        if (Array.isArray(m)) return fail(`"${assignee}" could be ${m.map((x) => x.name).join(" or ")}. Ask which.`);
        assignee = m.id;
      }
      const c = await openCase(
        actor,
        {
          personId: input.person_id,
          name: input.name,
          household: input.household,
          type: input.type,
          confidential: input.confidential ?? false,
          assignee,
          summary: input.summary,
          nextStep: input.next_step,
          due: input.due,
          contact: input.contact_kind ? { kind: input.contact_kind, date: today(), note: input.contact_note } : undefined,
        },
        "barnabas",
        convId(ctx),
      );
      return {
        done: `Noted ${/^[aeiou]/i.test(CASE_TYPE_LABELS[c.type]) ? "an" : "a"} ${CASE_TYPE_LABELS[c.type].toLowerCase()} need for ${c.subject.name}${c.assigneeId ? `, held by ${c.assigneeId === actor.self.id ? "you" : actor.members.find((m) => m.id === c.assigneeId)?.name}` : ", unassigned for the pastors"}${c.contacts.length ? ", with today's contact logged" : ""}${c.nextStep ? `. Next step: ${c.nextStep.text}` : ""}.`,
        case_id: c.id,
        confidential: c.confidential,
        tell_the_leader: "Say in one short sentence what you did.",
      };
    });
  },
});

const logCareContact = tool({
  def: {
    name: "log_care_contact",
    description: "Log a contact on a shepherding need (visit, call, text, card, meal) when the leader tells you about one, with an optional minimal note and the next step. Date defaults to today.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        case_id: { type: "string" },
        kind: { type: "string", enum: [...CONTACT_KINDS] },
        date: { type: "string", description: "yyyy-mm-dd; default today" },
        note: { type: "string", description: "Minimal, e.g. 'In good spirits'" },
        next_step: { type: "string" },
        due: { type: "string", description: "yyyy-mm-dd" },
      },
      required: ["case_id", "kind"],
    },
  },
  schema: z.object({ case_id: z.string().min(1).max(60), kind: z.enum(CONTACT_KINDS), date: ISO_DATE.optional(), note: z.string().max(400).optional(), next_step: z.string().max(400).optional(), due: ISO_DATE.optional() }),
  async run(input, ctx) {
    return careWrite(async () => {
      const actor = await careActor(ctx.leader);
      const c = await logContact(actor, input.case_id, { kind: input.kind, date: input.date ?? today(), note: input.note, nextStep: input.next_step, due: input.due }, convId(ctx));
      return `Logged a ${CONTACT_LABELS[input.kind].toLowerCase()} with ${c.subject.name}${c.nextStep && input.next_step ? `. Next step: ${c.nextStep.text}${c.nextStep.due ? `, by ${friendlyDate(c.nextStep.due)}` : ""}` : ""}. Tell the leader in one short sentence.`;
    });
  },
});

const addPrayerRequest = tool({
  def: {
    name: "add_prayer_request",
    description: "Add a prayer request to the church's prayer list when the leader asks. Private requests are seen by pastors and this leader; shareable ones by the whole team. Keep it short and without sensitive details.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        name: { type: "string", description: "Only for someone not in the directory" },
        request: { type: "string", description: "e.g. 'Rest and healing as she recovers at home'" },
        shareable: { type: "boolean", description: "Only if the person is happy for it to be shared with the prayer team" },
      },
      required: ["request"],
    },
  },
  schema: z.object({ person_id: z.string().max(40).optional(), name: z.string().max(100).optional(), request: z.string().min(3).max(500), shareable: z.boolean().optional() }),
  async run(input, ctx) {
    return careWrite(async () => {
      const actor = await careActor(ctx.leader);
      const p = await addPrayer(actor, { personId: input.person_id, name: input.name, request: input.request, shareable: input.shareable ?? false }, convId(ctx));
      return `Added a ${p.shareable ? "shareable" : "private"} prayer request for ${p.name}. Tell the leader in one short sentence.`;
    });
  },
});

const recordGuestTool = tool({
  def: {
    name: "record_guest",
    description:
      "Record a first-time guest's card when the leader tells you about one: name, contact, how they heard, kids' ages, a prayer request, interests. It makes the follow-up: a thank-you draft in the review queue (nothing is sent), a welcome call within 48 hours, assigned in rotation among the deacons and connections staff.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        how_heard: { type: "string" },
        kids_ages: { type: "string" },
        prayer_request: { type: "string" },
        interests: { type: "array", items: { type: "string", enum: [...GUEST_INTERESTS] } },
        visit_date: { type: "string", description: "yyyy-mm-dd; default today" },
      },
      required: ["name"],
    },
  },
  schema: z.object({
    name: z.string().min(1).max(100),
    email: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
    how_heard: z.string().max(200).optional(),
    kids_ages: z.string().max(100).optional(),
    prayer_request: z.string().max(500).optional(),
    interests: z.array(z.enum(GUEST_INTERESTS)).max(10).optional(),
    visit_date: ISO_DATE.optional(),
  }),
  async run(input, ctx) {
    return careWrite(async () => {
      const actor = await careActor(ctx.leader);
      const g = await recordGuest(
        ctx.leader.churchId,
        actor,
        { name: input.name, email: input.email, phone: input.phone, howHeard: input.how_heard, kidsAges: input.kids_ages, prayerRequest: input.prayer_request, interests: input.interests ?? [], visitDate: input.visit_date },
        actor.members,
        convId(ctx),
      );
      const holder = actor.members.find((m) => m.id === g.assigneeId)?.name ?? "the team";
      const draft = g.tasks.find((t) => t.kind === "thank_you")?.draftId;
      return `Recorded ${g.name}'s guest card. ${holder === actor.self.name ? "You're" : `${holder} is`} following up: a welcome call within 48 hours${draft ? ", and a thank-you draft is waiting in Drafts for review (not sent)" : ""}. Tell the leader in one or two short sentences.`;
    });
  },
});

const assignCareCase = tool({
  def: {
    name: "assign_care_case",
    description:
      "Give a shepherding need to a team member, or 'me' to take it yourself, or 'unassigned' to hand it to the pastors' queue. Giving it to someone else is confirmed in code: the first call proposes it; tell the leader and ask; call again with the same details after they say yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { case_id: { type: "string" }, assignee: { type: "string", description: "'me', 'unassigned', or a team member's name" } }, required: ["case_id", "assignee"] },
  },
  schema: z.object({ case_id: z.string().min(1).max(60), assignee: z.string().min(1).max(80) }),
  async run(input, ctx) {
    return careWrite(async () => {
      const { actor, book } = await careFor(ctx.leader);
      const c = caseDetail(book, actor, input.case_id);
      if (!c) return fail("No shepherding need with that id that this leader can see.");
      let target: TeamMember | null = null;
      if (input.assignee.trim().toLowerCase() === "me") target = actor.self;
      else if (input.assignee.trim().toLowerCase() !== "unassigned") {
        const m = findMember(actor.members, input.assignee);
        if (!m) return fail(`No one on the shepherding team is called "${input.assignee}".`);
        if (Array.isArray(m)) return fail(`"${input.assignee}" could be ${m.map((x) => x.name).join(" or ")}. Ask which.`);
        target = m;
      }
      const toSelf = target ? isMine(actor.viewer, target.id) : false;
      if (!toSelf) {
        const summary = target ? `give ${c.subject.name}'s ${CASE_TYPE_LABELS[c.type].toLowerCase()} need to ${target.name}` : `hand ${c.subject.name}'s need back to the pastors' queue, unassigned`;
        if (!gateConfirmed(ctx, "assign_care_case", JSON.stringify([c.id, target?.id ?? null]))) return fail(`Not confirmed yet. Ask the leader: ${summary}? Call assign_care_case again with the same details after they say yes.`);
      }
      const updated = await assignCase(actor, c.id, target?.id ?? null, convId(ctx));
      return `${toSelf ? "You now hold" : target ? `${target.name} now holds` : "The pastors' queue now has"} ${updated.subject.name}'s need. Tell the leader in one short sentence.`;
    });
  },
});

const closeCareCase = tool({
  def: {
    name: "close_care_case",
    description: "Mark a shepherding need as met when care is complete. Confirmed in code: the first call proposes it; ask the leader; call again with the same case_id after they say yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { case_id: { type: "string" }, note: { type: "string", description: "Optional minimal note on how it was met" } }, required: ["case_id"] },
  },
  schema: z.object({ case_id: z.string().min(1).max(60), note: z.string().max(400).optional() }),
  async run(input, ctx) {
    return careWrite(async () => {
      const { actor, book } = await careFor(ctx.leader);
      const c = caseDetail(book, actor, input.case_id);
      if (!c) return fail("No shepherding need with that id that this leader can see.");
      if (!c.canClose) return fail("Only whoever holds the need, or a pastor, deacon or staff member, can mark it met. Tell the leader kindly.");
      if (!gateConfirmed(ctx, "close_care_case", c.id)) return fail(`Not confirmed yet. Ask the leader: mark ${c.subject.name}'s ${CASE_TYPE_LABELS[c.type].toLowerCase()} need as met? Call close_care_case again after they say yes.`);
      await closeCase(actor, c.id, input.note, convId(ctx));
      return `Marked ${c.subject.name}'s need as met. Tell the leader in one short sentence.`;
    });
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

/** Online giving through Stripe: totals only (no names, no gift list). It can't charge, refund or change anything. */
const onlineGivingTool = tool({
  phrase: "Let me look at online giving.",
  def: {
    name: "online_giving_summary",
    description:
      "Online giving through Stripe for this month or this year: gross given online, processing fees, what givers covered, refunds, net, number of gifts and recurring gifts, card vs bank (ACH), by fund, and the latest payouts to the bank. Aggregates only, never donor names. Read-only: it cannot create charges or refunds (refunds are made in the Stripe dashboard). Pastors, treasurers and deacons.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { period: { type: "string", enum: ["this_month", "this_year"] } } },
  },
  schema: z.object({ period: z.enum(["this_month", "this_year"]).optional() }),
  async run({ period = "this_year" }, ctx) {
    const access = await financeAccess(ctx);
    if (!can(access, "finance.view")) return fail(NO_FINANCE);
    const status = stripeStatus();
    const books = await loadBooks(ctx.leader.churchId);
    const asOf = today();
    const from = period === "this_month" ? `${asOf.slice(0, 7)}-01` : `${asOf.slice(0, 4)}-01-01`;
    const t = onlineTotals(books, from, asOf);
    const funds = new Map(books.chart.funds.map((f) => [f.id, f.name]));
    const payouts = (await listPayouts(ctx.leader.churchId)).slice(0, 3);
    return ok({
      stripe: status.connected ? (status.testMode ? "connected (test mode: these are test gifts, not real money)" : "connected") : "not connected (online giving isn't set up; see Finance → Online giving)",
      period: { from, to: asOf },
      given_online: wholeDollars(t.gross),
      gifts: t.count,
      recurring_gifts: t.recurringCount,
      card_and_wallets: wholeDollars(t.card),
      bank_ach: wholeDollars(t.ach),
      processing_fees: dollars(t.fees),
      fees_covered_by_givers: dollars(t.coveredFees),
      refunded: dollars(t.refunded),
      net: wholeDollars(t.net),
      disputed: t.disputed,
      by_fund: Object.entries(t.byFund).filter(([, v]) => v).map(([id, v]) => ({ fund: funds.get(id) ?? id, total: wholeDollars(v) })),
      latest_payouts: payouts.map((p) => ({ arrives: p.arrivalDate, net: dollars(p.amount), gross: dollars(p.gross), fees: dollars(p.fees) })),
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
  listCareCases,
  careCaseDetail,
  myCareLoadTool,
  discipleshipNextSteps,
  recentGuestsTool,
  openCareCase,
  logCareContact,
  addPrayerRequest,
  recordGuestTool,
  assignCareCase,
  closeCareCase,
  ...OPS_TOOLS,
  ...GROWTH_TOOLS,
  ...KNOW_TOOLS,
  ...THORN_TOOLS,
  ...SITE_TOOLS,
  onlineGivingTool,
  ...JOURNAL_TOOLS,
  ...APP_TOOLS,
  ...PEOPLE_TOOLS,
];

/** Tool definitions in a fixed order (part of the cached prompt prefix). */
export const TOOL_DEFS: Anthropic.Beta.BetaTool[] = ALL.map((t) => t.def);

/** Barnabas's own memory, the person's calendar and the getting-to-know-you questions: nobody else's information. */
const MEMBER_TOOLS = [
  "recall_memory",
  "save_memory",
  "list_calendar",
  "add_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "ask_to_know",
  "ask_permission_to_know",
  "record_to_know",
  "remember_thorn",
  "send_app_message",
  "list_app_messages",
  "read_app_message",
  "update_my_settings",
];
const TEAM_TOOLS = [...MEMBER_TOOLS, "journal_note", "start_journal_entry", "list_journal", "read_journal_entry", "update_journal_entry", "get_schedule", "whos_serving"];
const TEAM_ROLE_TOOLS: Record<string, string[]> = {
  kids: ["kids_checkin_counts"],
  checkin: ["kids_checkin_counts"],
  care: ["my_care_load", "list_care_cases", "care_case_detail", "log_care_contact", "add_prayer_request"],
};

/**
 * The tools Barnabas may use with this person: every tool for Leaders and Admins (each still checks
 * permissions), and only their own information at the Team and Member levels. null means all.
 */
export function toolNamesFor(access: Access | null | undefined): string[] | null {
  if (!access || !isLimited(access)) return null;
  if (access.level === "member") return MEMBER_TOOLS;
  return [...TEAM_TOOLS, ...(TEAM_ROLE_TOOLS[access.teamRole ?? "serving"] ?? [])];
}

export function toolDefsFor(names: string[] | null | undefined): Anthropic.Beta.BetaTool[] {
  return names ? TOOL_DEFS.filter((d) => names.includes(d.name)) : TOOL_DEFS;
}

const BY_NAME = new Map(ALL.map((t) => [t.def.name, t]));

export function holdingPhrase(name: string): string | undefined {
  return BY_NAME.get(name)?.phrase;
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const spec = BY_NAME.get(name);
  if (!spec) return fail(`Unknown tool ${name}.`);
  if (ctx.toolNames && !ctx.toolNames.includes(name)) return fail(`${name} isn't available at this person's access level.`);
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
