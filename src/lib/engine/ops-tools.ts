import { z } from "zod";
import { can } from "../auth/roles";
import { addDays, friendlyDate, today } from "../dates";
import { counts, EventsError } from "../events/service";
import { loadEvents } from "../events/store";
import { kidsActor, KidsError, kidsCounts } from "../kids/service";
import { loadKids } from "../kids/store";
import { GATHERING_KEYS, GATHERINGS, gathering, gatheringsOn, nextMeeting, type GatheringKey } from "../ops/gatherings";
import { isOpsError } from "../ops/http";
import { assign, coverageFor, draftReminders, sameName, serveActor, ServeError } from "../serve/service";
import { loadServe } from "../serve/store";
import { rosterFor } from "../serve/views";
import { wordHref } from "../services/scripture";
import { servicesActor, ServicesError, setPreacher, startPlan, totalMinutes } from "../services/service";
import { loadServices } from "../services/store";
import { ITEM_LABELS } from "../services/types";
import { accessFor } from "../team";
import { gateConfirmed } from "./gate";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * Barnabas's operations tools: who's serving, coverage, reminders, the preaching rotation, orders of
 * service, event registration counts and kids check-in counts. Permissions are checked in code on every
 * call. Children's data never comes back beyond counts and (when asked, with kids.checkin) first names.
 */

const ok = (content: unknown): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const convId = (ctx: ToolContext) => (ctx.meta.offRecord ? undefined : ctx.meta.id);

async function opsWrite(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (isOpsError(err) || err instanceof ServeError || err instanceof ServicesError || err instanceof EventsError || err instanceof KidsError) return fail((err as Error).message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
    throw err;
  }
}

const nextSunday = () => nextMeeting(today(), [0]);
const gatheringKey = z.enum(GATHERING_KEYS);
const GATHERING_HELP = `One of ${GATHERINGS.map((g) => `${g.key} (${g.label})`).join(", ")}`;

function findTeam<T extends { id: string; name: string }>(teams: T[], q: string): T | T[] | null {
  const query = q.trim().toLowerCase();
  const exact = teams.find((t) => t.id === query || t.name.toLowerCase() === query);
  if (exact) return exact;
  const partial = teams.filter((t) => t.name.toLowerCase().includes(query) || query.includes(t.id));
  return partial.length === 1 ? partial[0] : partial.length ? partial : null;
}

/* ---------- Volunteer scheduling ---------- */

const whosServing = tool({
  phrase: "Let me check the roster.",
  def: {
    name: "whos_serving",
    description:
      "The serving roster for one date (default: this coming Sunday): for each gathering (Sunday 8:30 and 10:45 worship, 9:45 Growth Groups, Wednesday 6:00 Kids Club and Teens), each team's positions, who is scheduled and how many slots are open. Optionally one team.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { date: { type: "string", description: "yyyy-mm-dd" }, team: { type: "string", description: "Team name, e.g. 'Worship team' or 'Greeters'" } } },
  },
  schema: z.object({ date: ISO_DATE.optional(), team: z.string().max(60).optional() }),
  async run({ date, team }, ctx) {
    const day = date ?? nextSunday();
    const [actor, book] = await Promise.all([serveActor(ctx.leader), loadServe(ctx.leader.churchId)]);
    if (!gatheringsOn(day).length) return fail(`Nothing meets on ${friendlyDate(day)}. Sundays and Wednesdays have gatherings.`);
    let only: string | undefined;
    if (team) {
      const t = findTeam(book.teams, team);
      if (!t) return fail(`No team called "${team}". Teams: ${book.teams.map((x) => x.name).join(", ")}.`);
      if (Array.isArray(t)) return fail(`"${team}" could be ${t.map((x) => x.name).join(" or ")}. Ask which.`);
      only = t.id;
    }
    const roster = rosterFor(book, actor, day).map((g) => ({
      gathering: g.label,
      gathering_key: g.key,
      teams: g.teams
        .filter((t) => !only || t.teamId === only)
        .map((t) => ({
          team: t.teamName,
          team_lead: t.lead,
          open_slots: t.open,
          positions: t.positions.map((p) => ({ position: p.name, serving: p.slots.filter((s) => s.name && s.status !== "declined").map((s) => (s.pendingSwap ? `${s.name} (asked ${s.pendingSwap.toName} to cover)` : s.name)), declined: p.slots.filter((s) => s.status === "declined").map((s) => s.name), open: p.open })),
        })),
    }));
    const anyone = roster.some((g) => g.teams.some((t) => t.positions.some((p) => p.serving.length)));
    return ok({
      date: friendlyDate(day),
      roster,
      note: anyone ? undefined : "No one is scheduled yet. Say so plainly; don't name anyone. The leader can schedule people on the Serve page or ask you to find coverage.",
    });
  },
});

const findCoverage = tool({
  phrase: "Let me see who could cover.",
  def: {
    name: "find_coverage",
    description:
      "Who could cover an open slot: teammates who aren't away (blackout dates), aren't already serving at that gathering and are under their monthly limit, best first (fewest Sundays served lately), plus who can't and why. Read-only; use schedule_volunteer to put someone in.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "yyyy-mm-dd" }, gathering: { type: "string", description: GATHERING_HELP }, team: { type: "string" } },
      required: ["date", "team"],
    },
  },
  schema: z.object({ date: ISO_DATE, gathering: gatheringKey.optional(), team: z.string().min(1).max(60) }),
  async run({ date, gathering: g, team }, ctx) {
    const book = await loadServe(ctx.leader.churchId);
    const t = findTeam(book.teams, team);
    if (!t) return fail(`No team called "${team}".`);
    if (Array.isArray(t)) return fail(`"${team}" could be ${t.map((x) => x.name).join(" or ")}. Ask which.`);
    const keys = (g ? [g] : t.gatherings).filter((k) => gatheringsOn(date).some((x) => x.key === k));
    if (!keys.length) return fail(`${t.name} doesn't serve on ${friendlyDate(date)}.`);
    return ok({
      team: t.name,
      date: friendlyDate(date),
      by_gathering: keys.map((k) => {
        const c = coverageFor(book, { date, gathering: k, teamId: t.id });
        return { gathering: gathering(k)?.label, gathering_key: k, could_cover: c.available.map((x) => ({ volunteer_id: x.volunteer.id, name: x.volunteer.name, sundays_served_last_8_weeks: x.servedRecently })), cannot: c.unavailable.map((x) => ({ name: x.volunteer.name, why: x.reason })) };
      }),
      note: "If no one could cover, say so and suggest asking the team lead or inviting someone new. Never suggest a name that isn't listed.",
    });
  },
});

const scheduleVolunteer = tool({
  def: {
    name: "schedule_volunteer",
    description:
      "Put a teammate in an open slot (schedulers and the team's lead only). Confirmed in code: the first call proposes it; tell the leader who, where and when, and ask; call again with the same details after they say yes. Blackouts, double-booking and monthly limits are enforced.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string" },
        gathering: { type: "string", description: GATHERING_HELP },
        team: { type: "string" },
        position: { type: "string", description: "e.g. 'Door greeter'" },
        volunteer: { type: "string", description: "The volunteer's name or volunteer_id from find_coverage" },
      },
      required: ["date", "gathering", "team", "position", "volunteer"],
    },
  },
  schema: z.object({ date: ISO_DATE, gathering: gatheringKey, team: z.string().min(1).max(60), position: z.string().min(1).max(60), volunteer: z.string().min(1).max(100) }),
  async run(input, ctx) {
    return opsWrite(async () => {
      const [actor, book] = await Promise.all([serveActor(ctx.leader), loadServe(ctx.leader.churchId)]);
      const t = findTeam(book.teams, input.team);
      if (!t || Array.isArray(t)) return fail(`Which team? ${book.teams.map((x) => x.name).join(", ")}.`);
      const p = findTeam(t.positions, input.position);
      if (!p || Array.isArray(p)) return fail(`${t.name} positions: ${t.positions.map((x) => x.name).join(", ")}.`);
      const v = book.volunteers.find((x) => x.id === input.volunteer) ?? book.volunteers.find((x) => sameName(x.name, input.volunteer));
      if (!v) return fail(`No volunteer called "${input.volunteer}" is on any team. Don't guess; ask the leader to add them on the Serve page.`);
      const key = JSON.stringify([input.date, input.gathering, t.id, p.id, v.id]);
      const summary = `${v.name} as ${p.name} with ${t.name} at the ${gathering(input.gathering)?.label}, ${friendlyDate(input.date)}`;
      if (!gateConfirmed(ctx, "schedule_volunteer", key)) return fail(`Not confirmed yet. Ask the leader: schedule ${summary}? Call schedule_volunteer again with the same details after they say yes.`);
      await assign(actor, { date: input.date, gathering: input.gathering, teamId: t.id, positionId: p.id, volunteerId: v.id }, "scheduler", convId(ctx));
      return ok(`Scheduled ${summary}. Tell the leader in one short sentence. Nothing was sent to ${v.name.split(" ")[0]}; offer to draft a reminder.`);
    });
  },
});

const draftServingReminders = tool({
  phrase: "Writing those reminders.",
  def: {
    name: "draft_serving_reminders",
    description:
      "Draft reminder texts for everyone serving on a date (optionally one team), each with their own positions and times, into the leader's Drafts review queue. Nothing is sent: delivery isn't connected yet. For teams the leader schedules or leads.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { date: { type: "string", description: "yyyy-mm-dd; default this coming Sunday" }, team: { type: "string" } } },
  },
  schema: z.object({ date: ISO_DATE.optional(), team: z.string().max(60).optional() }),
  async run({ date, team }, ctx) {
    return opsWrite(async () => {
      const day = date ?? nextSunday();
      const [actor, book] = await Promise.all([serveActor(ctx.leader), loadServe(ctx.leader.churchId)]);
      let teamId: string | undefined;
      if (team) {
        const t = findTeam(book.teams, team);
        if (!t || Array.isArray(t)) return fail(`Which team? ${book.teams.map((x) => x.name).join(", ")}.`);
        teamId = t.id;
      }
      const draft = await draftReminders(actor, day, teamId, convId(ctx));
      if (!draft) return ok(`No one is scheduled ${team ? `on ${team} ` : ""}for ${friendlyDate(day)}, so there's nothing to remind. Say so.`);
      return ok({ draft_id: draft.id, recipients: draft.recipients.map((r) => r.name), status: "In the Drafts screen for review. Nothing was sent; text and email delivery comes later. Tell the leader in one sentence." });
    });
  },
});

/* ---------- Services ---------- */

const preachingRotation = tool({
  phrase: "Let me check the preaching schedule.",
  def: {
    name: "preaching_rotation",
    description: "Who preaches which Sunday, with the sermon series and passage when they're planned. Default: the next eight Sundays.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { from: { type: "string", description: "yyyy-mm-dd" }, weeks: { type: "number" } } },
  },
  schema: z.object({ from: ISO_DATE.optional(), weeks: z.number().int().min(1).max(26).optional() }),
  async run({ from, weeks = 8 }, ctx) {
    const book = await loadServices(ctx.leader.churchId);
    const start = from ?? today();
    const end = addDays(start, 7 * weeks);
    const rows = book.rotation.filter((r) => r.date >= start && r.date <= end);
    const seriesOf = (id?: string) => book.series.find((s) => s.id === id);
    return ok({
      rotation: rows.map((r) => ({ date: friendlyDate(r.date), preacher: r.preacher, series: seriesOf(r.seriesId)?.title, passage: r.passage, title: r.title })),
      series: book.series.filter((s) => s.endDate >= start && s.startDate <= end).map((s) => ({ title: s.title, passage: s.passage, from: friendlyDate(s.startDate), to: friendlyDate(s.endDate) })),
      note: rows.length ? "Ethan and Eric are real pastors; speak of them only in their roles." : "No one is on the rotation for those Sundays yet. Say so; don't guess.",
    });
  },
});

const setPreacherTool = tool({
  def: {
    name: "set_preacher",
    description: "Put someone on the preaching rotation for a Sunday (pastors and staff only), optionally with a passage and sermon title. Replacing someone already scheduled is confirmed in code: propose, ask, call again after a yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { date: { type: "string" }, preacher: { type: "string" }, passage: { type: "string", description: "e.g. Philippians 2:1-11" }, title: { type: "string" } }, required: ["date", "preacher"] },
  },
  schema: z.object({ date: ISO_DATE, preacher: z.string().min(1).max(80), passage: z.string().max(60).optional(), title: z.string().max(100).optional() }),
  async run(input, ctx) {
    return opsWrite(async () => {
      const actor = await servicesActor(ctx.leader);
      if (!actor.planner) return fail("Only pastors and staff plan the preaching rotation. Tell the leader kindly.");
      const book = await loadServices(ctx.leader.churchId);
      const current = book.rotation.find((r) => r.date === input.date);
      if (current && !sameName(current.preacher, input.preacher)) {
        const key = JSON.stringify([input.date, input.preacher.toLowerCase(), input.passage ?? "", input.title ?? ""]);
        if (!gateConfirmed(ctx, "set_preacher", key)) return fail(`Not confirmed yet. ${current.preacher} is on for ${friendlyDate(input.date)}. Ask the leader: put ${input.preacher} on instead? Call set_preacher again after they say yes.`);
      }
      const entry = await setPreacher(actor, input, convId(ctx));
      return ok(`${entry.preacher} is preaching ${friendlyDate(entry.date)}${entry.passage ? ` from ${entry.passage}` : ""}. Tell the leader in one sentence.`);
    });
  },
});

const planService = tool({
  phrase: "Let me pull up the order of service.",
  def: {
    name: "plan_service",
    description: "The order of service for a Sunday worship service: each item in order with minutes, who leads it and any scripture, and the total time. Also who's preaching.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { date: { type: "string" }, gathering: { type: "string", enum: ["sun-0830", "sun-1045"] } } },
  },
  schema: z.object({ date: ISO_DATE.optional(), gathering: z.enum(["sun-0830", "sun-1045"]).optional() }),
  async run({ date, gathering: g }, ctx) {
    const day = date ?? nextSunday();
    const book = await loadServices(ctx.leader.churchId);
    const keys = (g ? [g] : ["sun-0830", "sun-1045"]) as GatheringKey[];
    const preach = book.rotation.find((r) => r.date === day);
    return ok({
      date: friendlyDate(day),
      preaching: preach ? { preacher: preach.preacher, passage: preach.passage, title: preach.title } : "not on the rotation yet",
      services: keys.map((k) => {
        const plan = book.plans.find((p) => p.date === day && p.gathering === k);
        if (!plan?.items.length) return { service: gathering(k)?.label, order: "Not planned yet. Offer to outline it from the usual order (outline_service)." };
        return {
          service: gathering(k)?.label,
          total_minutes: totalMinutes(plan.items),
          order: plan.items.map((i) => ({ item: ITEM_LABELS[i.kind], title: i.title, minutes: i.minutes, leads: i.person, scripture: i.passage, in_the_word: i.passage ? Boolean(wordHref(i.passage)) : undefined })),
        };
      }),
    });
  },
});

const outlineService = tool({
  def: {
    name: "outline_service",
    description: "Outline an order of service for a Sunday that doesn't have one yet, from the church's usual order: welcome, songs, scripture reading, prayer, the sermon (preacher and passage from the rotation), communion on first Sundays, offering, benediction. Pastors and staff only. The leader refines it on the Services page.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { date: { type: "string" }, gathering: { type: "string", enum: ["sun-0830", "sun-1045"] } }, required: ["date", "gathering"] },
  },
  schema: z.object({ date: ISO_DATE, gathering: z.enum(["sun-0830", "sun-1045"]) }),
  async run({ date, gathering: g }, ctx) {
    return opsWrite(async () => {
      const actor = await servicesActor(ctx.leader);
      if (!actor.planner) return fail("Only pastors and staff plan services. Tell the leader kindly.");
      const plan = await startPlan(actor, date, g, convId(ctx));
      return ok({ done: `Outlined the ${gathering(g)?.label} for ${friendlyDate(date)}: ${plan.items.length} items, about ${totalMinutes(plan.items)} minutes.`, items: plan.items.map((i) => `${i.title}${i.person ? ` (${i.person})` : ""}`), tell_the_leader: "Say what you outlined in one or two sentences and that they can adjust it on the Services page." });
    });
  },
});

/* ---------- Events ---------- */

const eventRegistrations = tool({
  phrase: "Let me check registrations.",
  def: {
    name: "event_registrations",
    description: "Registration counts for upcoming events (or one event): registered, capacity and spots left, waitlist, checked in, payments due. Counts only, no registrant names.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { event: { type: "string", description: "Part of the event's title, e.g. 'Reverb'" } } },
  },
  schema: z.object({ event: z.string().max(100).optional() }),
  async run({ event }, ctx) {
    const book = await loadEvents(ctx.leader.churchId);
    let events = book.events.filter((e) => e.date >= addDays(today(), -1));
    if (event) {
      const q = event.toLowerCase();
      events = book.events.filter((e) => e.title.toLowerCase().includes(q));
      if (!events.length) return fail(`No event with registration matches "${event}". Events: ${book.events.map((e) => e.title).join(", ") || "none yet"}.`);
    }
    if (!events.length) return ok("No upcoming events take registration yet. Say so, and that they can add one on the Events page.");
    return ok({
      events: events.map((e) => {
        const c = counts(book, e.id);
        return { title: e.title, date: friendlyDate(e.date), time: e.time, registered: c.registered, capacity: e.capacity ?? "no limit", spots_left: c.spotsLeft ?? "no limit", waitlist: e.waitlist ? c.waitlisted : "no waitlist", checked_in: c.checkedIn, payments_due: c.paymentDue || undefined, registration: e.open ? "open" : "closed", cost: e.priceCents ? `$${(e.priceCents / 100).toFixed(0)} per person, paid at the event for now` : undefined };
      }),
      note: "Zero registrations is normal before an event is shared. Mention the public link on the Events page if it helps.",
    });
  },
});

/* ---------- Kids check-in (counts and first names only) ---------- */

const kidsCheckinCounts = tool({
  phrase: "Let me check the kids rooms.",
  def: {
    name: "kids_checkin_counts",
    description:
      "How many children are checked in, room by room, with adults and any ratio warnings, for a date (default today) and gathering. Only for leaders who run kids check-in. Never returns last names, allergies, medical notes, guardians or pickup codes; first names only if the leader asks who is in a room.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { date: { type: "string" }, gathering: { type: "string", description: GATHERING_HELP }, first_names: { type: "boolean", description: "Only when the leader asks who is in the rooms" } } },
  },
  schema: z.object({ date: ISO_DATE.optional(), gathering: gatheringKey.optional(), first_names: z.boolean().optional() }),
  async run({ date, gathering: g, first_names }, ctx) {
    const actor = await kidsActor(ctx.leader);
    if (!actor.station) return fail("Kids check-in is limited to the pastors and staff who run it. Tell the leader kindly that you can't share it.");
    const day = date ?? today();
    const book = await loadKids(ctx.leader.churchId);
    if (!gatheringsOn(day).length) return ok(`Nothing meets on ${friendlyDate(day)}.`);
    return ok({
      date: friendlyDate(day),
      families_on_file: book.households.length,
      gatherings: kidsCounts(book, day, g, Boolean(first_names)),
      privacy: "Children's details stay in Kids check-in. Never save anything about a child to memory, a draft or the calendar.",
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const OPS_TOOLS: ToolSpec<any>[] = [whosServing, findCoverage, scheduleVolunteer, draftServingReminders, preachingRotation, setPreacherTool, planService, outlineService, eventRegistrations, kidsCheckinCounts];

/** A short summary of this leader's operations access for the conversation context. */
export async function opsAccessLine(ctx: Pick<ToolContext, "leader">) {
  const access = await accessFor(ctx.leader);
  const parts = [
    can(access, "ops.schedule") ? "schedules every team" : "signs up to serve and leads their own team if they're its lead",
    can(access, "services.plan") ? "plans services" : "reads service plans",
    can(access, "events.manage") ? "manages events" : "sees event counts",
    can(access, "kids.checkin") ? "runs kids check-in" : "no kids check-in access",
  ];
  return parts.join(", ");
}

