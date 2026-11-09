import { z } from "zod";
import { isLimited } from "../auth/roles";
import { friendlyDate, today } from "../dates";
import { counts, createEvent, EventInput, eventsActor, EventsError, updateEvent } from "../events/service";
import { loadEvents } from "../events/store";
import type { RegEvent } from "../events/types";
import { inboxActor, InboxError, isMemberLevel, listThreads, messagablePeople, openThread, reply, startThread, type Person } from "../inbox/service";
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES, typesFor, type NotificationType } from "../notifications/types";
import { getProfile, saveProfile, BIBLE_TRANSLATIONS, type Profile } from "../profile";
import { NotificationsPatch, ProfileBody, VoiceBody } from "../profile/schema";
import { accessFor, levelOf, listLeaders } from "../team";
import { gateConfirmed } from "./gate";
import type { ActionLink } from "./links";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * Barnabas's app tools: the church's events with registration (create, change, list), in-app Messages
 * between people on Barnabas, and the leader's own settings. Every call checks permissions with the same
 * service functions the pages use. Creating or changing an event (it shows on the church calendar and
 * website) and sending a message are confirmed in code; the leader's own settings aren't.
 */

const ok = (content: unknown, links?: ActionLink[]): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false, ...(links?.length ? { links } : {}) });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;
const convId = (ctx: ToolContext) => (ctx.meta.offRecord ? undefined : ctx.meta.id);
const issues = (err: z.ZodError) => err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");

async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof EventsError || err instanceof InboxError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(issues(err));
    throw err;
  }
}

/* ---------- Events ---------- */

const dollars = (cents?: number) => (cents ? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)} per person` : "free");
const eventLink = (e: Pick<RegEvent, "id" | "title">): ActionLink => ({ label: `Open ${e.title}`.slice(0, 60), href: `/events/${encodeURIComponent(e.id)}` });

function describe(e: Pick<RegEvent, "title" | "date" | "time" | "endTime" | "location" | "capacity" | "open" | "priceCents">) {
  const when = `${friendlyDate(e.date)}${e.time ? `, ${e.time}${e.endTime ? `–${e.endTime}` : ""}` : ""}`;
  return `"${e.title}" on ${when} at ${e.location} (registration ${e.open ? "open" : "closed"}, ${e.capacity ? `up to ${e.capacity} people` : "no limit"}, ${dollars(e.priceCents)})`;
}

const eventProps = {
  title: { type: "string" },
  date: { type: "string", description: "yyyy-mm-dd" },
  time: { type: "string", description: 'Start time like "6:00 PM"; empty for all day' },
  end_time: { type: "string", description: 'Like "8:00 PM"' },
  location: { type: "string" },
  description: { type: "string", description: "A few sentences for the event page" },
  registration_open: { type: "boolean", description: "Whether the public registration link takes sign-ups (default true)" },
  capacity: { type: ["integer", "null"], description: "Most people (counting party size); null for no limit" },
  waitlist: { type: "boolean", description: "When full, new sign-ups join a waitlist (default true)" },
  max_party: { type: "integer", description: "Up to how many people one registration can bring (default 1)" },
  price_dollars: { type: ["number", "null"], description: "Cost per person in dollars; 0 or null for free" },
};

const Str = (max: number) => z.string().trim().max(max);
const EventFields = z.object({
  title: Str(100).optional(),
  date: z.string().max(20).optional(),
  time: Str(20).optional(),
  end_time: Str(20).optional(),
  location: Str(160).optional(),
  description: Str(800).optional(),
  registration_open: z.boolean().optional(),
  capacity: z.number().int().nullable().optional(),
  waitlist: z.boolean().optional(),
  max_party: z.number().int().optional(),
  price_dollars: z.number().min(0).nullable().optional(),
});
type EventFieldsIn = z.infer<typeof EventFields>;
const FIELD_ORDER = ["title", "date", "time", "end_time", "location", "description", "registration_open", "capacity", "waitlist", "max_party", "price_dollars"] as const;

/** The tool's fields over an event's current values, in the shape the events service validates. */
function toEventInput(f: EventFieldsIn, base?: RegEvent): z.input<typeof EventInput> {
  const pick = <K extends keyof EventFieldsIn, T>(k: K, current: T): EventFieldsIn[K] | T => (f[k] !== undefined ? f[k] : current);
  const price = pick("price_dollars", base?.priceCents !== undefined ? base.priceCents / 100 : null);
  return {
    title: pick("title", base?.title ?? "") as string,
    date: pick("date", base?.date ?? "") as string,
    time: pick("time", base?.time ?? "") as string,
    endTime: pick("end_time", base?.endTime ?? "") as string,
    location: pick("location", base?.location ?? "") as string,
    description: pick("description", base?.description ?? "") as string,
    capacity: pick("capacity", base?.capacity ?? null) as number | null,
    waitlist: pick("waitlist", base?.waitlist ?? true) as boolean,
    open: pick("registration_open", base?.open ?? true) as boolean,
    maxParty: pick("max_party", base?.maxParty ?? 1) as number,
    priceCents: price ? Math.round((price as number) * 100) : null,
    fields: base ? base.fields.map((x) => ({ ...x })) : [],
  };
}

const keyOf = (f: EventFieldsIn) => FIELD_ORDER.map((k) => f[k] ?? null);

const listEventsTool = tool({
  phrase: "Let me look at the events.",
  def: {
    name: "list_events",
    description:
      "Upcoming church events that take registration (the Events page): event_id, title, date and time, location, whether registration is open, capacity and spots left, and cost. Use for event_id before update_event. Counts only, no registrant names.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { search: { type: "string", description: "Part of a title, e.g. 'Reverb'" }, include_past: { type: "boolean" } } },
  },
  schema: z.object({ search: z.string().max(100).optional(), include_past: z.boolean().optional() }),
  async run({ search, include_past }, ctx) {
    const book = await loadEvents(ctx.leader.churchId);
    let events = book.events.filter((e) => include_past || e.date >= today()).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
    if (search) events = events.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()));
    if (!events.length) return ok(search ? `No upcoming event matches "${search}".` : "No upcoming events take registration yet. They can add one, or ask you to.", [{ label: "Open Events", href: "/events" }]);
    return ok(
      {
        events: events.slice(0, 25).map((e) => {
          const c = counts(book, e.id);
          return { event_id: e.id, title: e.title, date: e.date, when: friendlyDate(e.date), time: e.time, end_time: e.endTime, location: e.location, registration: e.open ? "open" : "closed", registered: c.registered, capacity: e.capacity ?? "no limit", spots_left: c.spotsLeft ?? "no limit", cost: dollars(e.priceCents) };
        }),
      },
      [...events.slice(0, 3).map(eventLink), { label: "Open Events", href: "/events" }],
    );
  },
});

const createEventTool = tool({
  phrase: "Let me set that up.",
  def: {
    name: "create_event",
    description:
      "Create a church event with a registration page (it shows on the Events page, the church calendar and the website). For pastors, deacons and staff. Not for the leader's own calendar (use add_calendar_event). " +
      "Confirmed in code: the first call only proposes; read the details back, and call again with exactly the same details after they say yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: eventProps, required: ["title", "date", "location"] },
  },
  schema: EventFields.extend({ title: Str(100), date: z.string().max(20), location: Str(160) }),
  async run(input, ctx) {
    const actor = await eventsActor(ctx.leader);
    if (!actor.manager) return fail("Pastors, deacons and staff create events. Tell the leader kindly, and suggest asking one of them.");
    const parsed = EventInput.safeParse(toEventInput(input));
    if (!parsed.success) return fail(`Check the details: ${issues(parsed.error)}`);
    const v = parsed.data;
    if (v.date < today()) return fail("That date has already passed. Ask for the right date.");
    const summary = describe({ ...v, time: v.time || undefined, endTime: v.endTime || undefined, capacity: v.capacity ?? undefined, priceCents: v.priceCents ?? undefined });
    if (!gateConfirmed(ctx, "create_event", JSON.stringify(keyOf(input)))) {
      return fail(`Not confirmed yet. Ask: create ${summary}? It will show on the church calendar and website. Call create_event again with the same details after they say yes.`);
    }
    return guard(async () => {
      const ev = await createEvent(actor, toEventInput(input));
      return ok({ created: describe(ev), event_id: ev.id, say: "Tell them it's on the Events page, where they can add registration questions and share the public link." }, [eventLink(ev)]);
    });
  },
});

const updateEventTool = tool({
  phrase: "Let me make that change.",
  def: {
    name: "update_event",
    description:
      "Change a church event with registration: title, date, times, location, description, registration open or closed, capacity, waitlist, party size or cost. Only pass what changes. Get event_id from list_events. For pastors, deacons and staff. " +
      "Confirmed in code: the first call only proposes; ask, and call again with exactly the same details after they say yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { event_id: { type: "string" }, ...eventProps }, required: ["event_id"] },
  },
  schema: EventFields.extend({ event_id: z.string().min(1).max(60) }),
  async run({ event_id, ...changes }, ctx) {
    const actor = await eventsActor(ctx.leader);
    if (!actor.manager) return fail("Pastors, deacons and staff change events. Tell the leader kindly, and suggest asking one of them.");
    const book = await loadEvents(ctx.leader.churchId);
    const ev = book.events.find((e) => e.id === event_id);
    if (!ev) return fail("No event with that id. Call list_events first.");
    const parsed = EventInput.safeParse(toEventInput(changes, ev));
    if (!parsed.success) return fail(`Check the details: ${issues(parsed.error)}`);
    const v = parsed.data;
    const before: Record<string, unknown> = { title: ev.title, date: ev.date, time: ev.time ?? "", end_time: ev.endTime ?? "", location: ev.location, description: ev.description ?? "", registration: ev.open ? "open" : "closed", capacity: ev.capacity ?? "no limit", waitlist: ev.waitlist, max_party: ev.maxParty, price: dollars(ev.priceCents) };
    const after: Record<string, unknown> = { title: v.title, date: v.date, time: v.time ?? "", end_time: v.endTime ?? "", location: v.location, description: v.description ?? "", registration: v.open ? "open" : "closed", capacity: v.capacity ?? "no limit", waitlist: v.waitlist, max_party: v.maxParty, price: dollars(v.priceCents ?? undefined) };
    const diff = Object.keys(before).filter((k) => before[k] !== after[k]).map((k) => `${k.replace("_", " ")}: ${before[k] === "" ? "(none)" : before[k]} → ${after[k] === "" ? "(none)" : after[k]}`);
    if (!diff.length) return ok({ unchanged: true, note: "Nothing would change; it already reads that way." }, [eventLink(ev)]);
    if (!gateConfirmed(ctx, "update_event", JSON.stringify([event_id, ...keyOf(changes)]))) {
      return fail(`Not confirmed yet. Ask: change "${ev.title}" (${diff.join("; ")})? The church calendar and website update too. Call update_event again with the same details after they say yes.`);
    }
    return guard(async () => {
      const { event, promoted } = await updateEvent(actor, event_id, toEventInput(changes, ev));
      return ok({ updated: describe(event), changed: diff, moved_up_from_waitlist: promoted.length || undefined }, [eventLink(event)]);
    });
  },
});

/* ---------- In-app Messages ---------- */

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** People this person may message whose name matches: exact full name first, then every word as the start of a name part. */
function matchPeople(query: string, people: Person[]): Person[] {
  const byId = people.filter((p) => p.leaderId === query.trim());
  if (byId.length) return byId;
  const q = norm(query);
  if (!q) return [];
  const exact = people.filter((p) => norm(p.name) === q);
  if (exact.length) return exact;
  const words = q.split(" ");
  return people.filter((p) => {
    const parts = norm(p.name).split(" ");
    return words.every((w) => parts.some((x) => x.startsWith(w)));
  });
}

const threadLink = (id: string): ActionLink => ({ label: "Open the conversation", href: `/inbox?t=${encodeURIComponent(id)}` });
const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ") + " UTC";

const sendAppMessage = tool({
  phrase: "Let me get that ready.",
  def: {
    name: "send_app_message",
    description:
      "Send a message in Barnabas's Messages (the in-app inbox) to one or more people who use Barnabas, by name, or reply in one of the leader's conversations (thread_id from list_app_messages). " +
      "Use this for people on Barnabas (staff, teams, members who sign in). For a text or email to anyone in the directory, use draft_message instead. " +
      "Members can message only the church staff and teams. If a name matches more than one person, ask which and pass their id. " +
      "Confirmed in code: the first call only proposes; read the exact words back, and call again with exactly the same details after they say yes.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string" }, description: "Names (or ids) of the people, for a new message" },
        thread_id: { type: "string", description: "To reply in an existing conversation instead" },
        text: { type: "string", description: "The exact words to send" },
        about: { type: "string", description: "Optional short subject, e.g. a child's first name or 'Youth retreat'" },
      },
      required: ["text"],
    },
  },
  schema: z.object({ to: z.array(z.string().trim().min(1).max(100)).max(20).optional(), thread_id: z.string().min(1).max(64).optional(), text: z.string().trim().min(1).max(2000), about: z.string().trim().max(40).optional() }),
  async run({ to, thread_id, text, about }, ctx) {
    const actor = await inboxActor(ctx.leader);
    return guard(async () => {
      if (thread_id) {
        const { thread } = await openThreadPeek(actor, thread_id);
        const names = thread.with.map((w) => w.name).join(", ") || "the conversation";
        if (!gateConfirmed(ctx, "send_app_message", JSON.stringify(["reply", thread_id, text]))) {
          return fail(`Not confirmed yet. Ask: send this to ${names} in Messages: "${text}"? Call send_app_message again with the same details after they say yes.`);
        }
        await reply(actor, thread_id, { text });
        return ok({ sent: true, to: names, say: "Tell them it's sent, in a few words." }, [threadLink(thread_id)]);
      }
      if (!to?.length) return fail("Who should it go to? Ask, then call again with their names.");
      const records = await listLeaders(ctx.leader.churchId);
      const people = await messagablePeople(actor, records);
      const chosen: Person[] = [];
      for (const name of to) {
        const found = matchPeople(name, people);
        if (found.length > 1) return fail(`"${name}" could be ${found.slice(0, 6).map((p) => `${p.name} (${p.label}, id ${p.leaderId})`).join(" or ")}. Ask which one, then call again with their id.`);
        if (!found.length) {
          const member = isMemberLevel(actor.access) && records.some((r) => !r.removed && levelOf(r).level === "member" && matchPeople(name, [{ leaderId: r.leaderId, name: r.name || r.email, label: "" }]).length);
          return fail(member ? "Members can message the church staff and teams, not other members. Say so kindly." : `No one called "${name}" uses Barnabas. For a text or email to someone in the directory, offer draft_message instead.`);
        }
        if (!chosen.some((p) => p.leaderId === found[0]!.leaderId)) chosen.push(found[0]!);
      }
      const names = chosen.map((p) => p.name).join(", ");
      const ids = chosen.map((p) => p.leaderId).sort();
      if (!gateConfirmed(ctx, "send_app_message", JSON.stringify(["new", ids, text, about ?? ""]))) {
        return fail(`Not confirmed yet. Ask: send this to ${names} in Messages${about ? ` (about ${about})` : ""}: "${text}"? Call send_app_message again with the same details after they say yes.`);
      }
      const { thread } = await startThread(actor, { to: ids, text, about });
      return ok({ sent: true, to: names, say: "Tell them it's sent, in a few words. Replies show up in Messages." }, [threadLink(thread.id)]);
    });
  },
});

/** A thread's people without marking it read (for the confirmation before a reply). */
async function openThreadPeek(actor: Awaited<ReturnType<typeof inboxActor>>, id: string) {
  const { threads } = await listThreads(actor);
  const thread = threads.find((t) => t.id === id);
  if (!thread) throw new InboxError("That conversation isn't here. Call list_app_messages for the leader's conversations.", 404);
  return { thread };
}

const listAppMessages = tool({
  phrase: "Let me check your messages.",
  def: {
    name: "list_app_messages",
    description: "The leader's recent conversations in Barnabas's Messages (the in-app inbox), newest first: thread_id, who it's with, subject, unread count and the last message. Read-only; doesn't mark anything read. Not for text or email drafts (those are in Drafts).",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { unread_only: { type: "boolean" }, limit: { type: "integer", description: "Default 10" } } },
  },
  schema: z.object({ unread_only: z.boolean().optional(), limit: z.number().int().min(1).max(30).optional() }),
  async run({ unread_only, limit }, ctx) {
    const actor = await inboxActor(ctx.leader);
    const { threads, unread } = await listThreads(actor);
    const shown = threads.filter((t) => !unread_only || t.unread > 0).slice(0, limit ?? 10);
    if (!shown.length) return ok(unread_only ? "No unread messages." : "No conversations in Messages yet.", [{ label: "Open Messages", href: "/inbox" }]);
    return ok(
      {
        unread_total: unread,
        conversations: shown.map((t) => ({ thread_id: t.id, with: t.with.map((w) => w.name).join(", "), about: t.about, unread: t.unread, last: t.last ? { from: t.last.name, text: t.last.text, at: when(t.last.at) } : undefined })),
        note: "Message words are private to the people in each conversation: don't save them to memory or repeat them to anyone else.",
      },
      [...(shown.length === 1 ? [threadLink(shown[0]!.id)] : []), { label: "Open Messages", href: "/inbox" }],
    );
  },
});

const readAppMessage = tool({
  phrase: "Let me open it.",
  def: {
    name: "read_app_message",
    description: "Open one of the leader's conversations in Messages (thread_id from list_app_messages): its recent messages, oldest first. Marks it read.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { thread_id: { type: "string" } }, required: ["thread_id"] },
  },
  schema: z.object({ thread_id: z.string().min(1).max(64) }),
  async run({ thread_id }, ctx) {
    const actor = await inboxActor(ctx.leader);
    return guard(async () => {
      const { thread, messages } = await openThread(actor, thread_id);
      return ok(
        {
          with: thread.with.map((w) => w.name).join(", "),
          about: thread.about,
          earlier_messages: messages.length > 30 ? messages.length - 30 : undefined,
          messages: messages.slice(-30).map((m) => ({ from: m.name, text: m.text, at: when(m.at) })),
          note: "To answer, use send_app_message with this thread_id (confirmed first). Don't save these words to memory.",
        },
        [threadLink(thread_id)],
      );
    });
  },
});

/* ---------- The leader's own settings ---------- */

const V = VoiceBody.shape;
const SettingsIn = z.object({
  bible_translation: ProfileBody.shape.bibleTranslation,
  reply_language: ProfileBody.shape.replyLanguage.optional(),
  timezone: ProfileBody.shape.timezone.optional(),
  preferred_name: ProfileBody.shape.preferredName.optional(),
  speak_replies: V.speakReplies.optional(),
  hands_free: V.handsFree.optional(),
  read_typed: V.readTyped,
  pause_ms: V.pauseMs,
  notifications_on: NotificationsPatch.shape.enabled,
  notification_types: NotificationsPatch.shape.types,
});

const LANG_NAMES: Record<Profile["replyLanguage"], string> = { en: "English", es: "Spanish", ko: "Korean" };
const VOICE_KEYS = [
  ["speak_replies", "speakReplies", "Speak replies"],
  ["hands_free", "handsFree", "Hands-free"],
  ["read_typed", "readTyped", "Read typed replies aloud"],
] as const;
const onOff = (b: boolean) => (b ? "on" : "off");

const updateMySettings = tool({
  phrase: "Let me change that.",
  def: {
    name: "update_my_settings",
    description:
      "Change the leader's own settings: Bible translation, the language you reply in, time zone, what you call them, voice options (speak replies, hands-free, read typed replies aloud, how long to wait before answering) and which notifications they get. Only pass what changes. Their own settings, so no confirmation is needed. " +
      `Bible translations: ${Object.entries(BIBLE_TRANSLATIONS).map(([id, name]) => `${id} (${name})`).join(", ")}. Notification types: ${NOTIFICATION_TYPES.map((t) => `${t} (${NOTIFICATION_LABELS[t].label})`).join(", ")}.`,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        bible_translation: { type: "string", enum: Object.keys(BIBLE_TRANSLATIONS) },
        reply_language: { type: "string", enum: ["en", "es", "ko"] },
        timezone: { type: "string", description: "IANA time zone, e.g. 'America/Chicago'" },
        preferred_name: { type: "string", description: "What you call them, e.g. 'Pastor Dana'" },
        speak_replies: { type: "boolean" },
        hands_free: { type: "boolean", description: "Keep listening between turns" },
        read_typed: { type: "boolean", description: "Speak replies to typed messages too" },
        pause_ms: { type: "integer", description: "Wait before answering, 200 to 2000 ms (default 600)" },
        notifications_on: { type: "boolean", description: "The master switch for all notifications" },
        notification_types: { type: "object", description: "e.g. {\"briefing\": false}", additionalProperties: { type: "boolean" } },
      },
    },
  },
  schema: SettingsIn,
  async run(input, ctx) {
    const access = await accessFor(ctx.leader);
    const typed = isLimited(access);
    if (typed && (VOICE_KEYS.some(([k]) => input[k] === true) || input.pause_ms !== undefined)) {
      return fail("Barnabas is typed-only at this person's access level, so voice options can't be turned on. Say so kindly.");
    }
    const offered = typesFor(access);
    const asked = Object.keys(input.notification_types ?? {}) as NotificationType[];
    const notOffered = asked.filter((t) => !offered.includes(t));
    if (notOffered.length) return fail(`They don't get ${notOffered.map((t) => NOTIFICATION_LABELS[t].label).join(", ")} notifications. They can choose from: ${offered.map((t) => NOTIFICATION_LABELS[t].label).join(", ") || "none"}.`);

    const current = await getProfile(ctx.leader);
    const next: Profile = { ...current, voice: { ...current.voice }, notifications: { ...current.notifications, types: { ...current.notifications.types } } };
    const changed: string[] = [];
    const set = <T>(label: string, from: T, to: T | undefined, show: (x: T) => string, apply: (x: T) => void) => {
      if (to === undefined || to === from) return;
      apply(to);
      changed.push(`${label}: ${show(from)} → ${show(to)}`);
    };
    set("Bible translation", current.bibleTranslation, input.bible_translation, (x) => BIBLE_TRANSLATIONS[x],(x) => (next.bibleTranslation = x));
    set("Reply language", current.replyLanguage, input.reply_language, (x) => LANG_NAMES[x], (x) => (next.replyLanguage = x));
    set("Time zone", current.timezone, input.timezone, (x) => x, (x) => (next.timezone = x));
    set("What Barnabas calls you", current.preferredName, input.preferred_name, (x) => x, (x) => (next.preferredName = x));
    for (const [k, field, label] of VOICE_KEYS) set(label, Boolean(current.voice[field]), input[k], onOff, (x) => (next.voice[field] = x));
    set("Wait before answering", current.voice.pauseMs, input.pause_ms, (x) => `${(x / 1000).toFixed(1)} s`, (x) => (next.voice.pauseMs = x));
    set("Notifications", current.notifications.enabled, input.notifications_on, onOff, (x) => (next.notifications.enabled = x));
    for (const t of asked) set(`${NOTIFICATION_LABELS[t].label} notifications`, current.notifications.types[t], input.notification_types?.[t], onOff, (x) => (next.notifications.types[t] = x));

    const settings: ActionLink[] = [{ label: "Open Settings", href: "/settings" }];
    if (!changed.length) return ok({ unchanged: true, note: "Those settings are already that way." }, settings);
    // The same check the Settings page's save makes on the whole profile.
    const check = ProfileBody.safeParse(next);
    if (!check.success) return fail(`Check the settings: ${issues(check.error)}`);
    await saveProfile(ctx.leader, next);
    return ok({ changed, say: "Tell them what changed in a sentence; some voice changes apply after the page reloads." }, settings);
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const APP_TOOLS: ToolSpec<any>[] = [listEventsTool, createEventTool, updateEventTool, sendAppMessage, listAppMessages, readAppMessage, updateMySettings];
