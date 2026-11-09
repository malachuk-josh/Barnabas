import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { churchData } from "../chms";
import { addDays, friendlyDate, today } from "../dates";
import { newId } from "../data/ids";
import { audit, saveDraft, type Draft } from "../data/records";
import { GATHERING_KEYS, gathering, ISO_RE, meetsOn, type GatheringKey } from "../ops/gatherings";
import { checkMemoryText } from "../policy/privacy";
import { config } from "../config";
import { accessFor } from "../team";
import { swapAccepted, swapRequested } from "../notifications/notify";
import { loadServe, resetServe, updateServe } from "./store";
import type { Assignment, ServeBook, ServeTeam, SwapRequest, Volunteer } from "./types";

/**
 * Volunteer scheduling. Every change goes through here: validated, permission-checked (schedulers edit
 * any team, team leads their own, anyone can sign up for an open slot or ask a teammate to cover theirs),
 * checked for conflicts (one place per gathering, blackout dates, a monthly cap), applied under the
 * church's lock, and written to the audit log. Reminders are drafted into the review queue, never sent.
 */

export class ServeError extends Error {}
const fail = (message: string): never => {
  throw new ServeError(message);
};

export const ISO = z.string().regex(ISO_RE, "Use a date like 2026-11-15.");
const Id = z.string().min(1).max(60);

export type ServeActor = { leader: Leader; access: Access; scheduler: boolean };

export async function serveActor(leader: Leader): Promise<ServeActor> {
  const access = await accessFor(leader);
  return { leader, access, scheduler: can(access, "ops.schedule") };
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const sameName = (a: string | undefined, b: string | undefined) => Boolean(a && b && slug(a) === slug(b));

/** Team leads (by the name the church published, or added by a scheduler) edit their own team's roster. */
export function isTeamLead(actor: Pick<ServeActor, "leader">, team: Pick<ServeTeam, "lead" | "leadLeaderIds">) {
  return sameName(actor.leader.name, team.lead) || Boolean(team.leadLeaderIds?.includes(actor.leader.leaderId));
}

export function canEditTeam(actor: ServeActor, team: Pick<ServeTeam, "lead" | "leadLeaderIds">) {
  return actor.scheduler || isTeamLead(actor, team);
}

/** The volunteer record that is this leader: linked by leader id, or a published leader with the same name. */
export function selfVolunteer(book: ServeBook, leader: Pick<Leader, "leaderId" | "name">) {
  return book.volunteers.find((v) => v.leaderId === leader.leaderId) ?? book.volunteers.find((v) => !v.leaderId && sameName(v.name, leader.name));
}

function team(book: ServeBook, id: string) {
  return book.teams.find((t) => t.id === id) ?? fail("That team doesn't exist.");
}
function volunteer(book: ServeBook, id: string) {
  return book.volunteers.find((v) => v.id === id) ?? fail("That co-laborer isn't on any team.");
}
function needEdit(actor: ServeActor, t: ServeTeam) {
  if (!canEditTeam(actor, t)) fail(`Only a scheduler or the ${t.name} lead can change this roster.`);
}

async function log(leader: Leader, action: string, detail: string, conversationId?: string) {
  await audit(leader, { action: `serve.${action}`, detail: detail.slice(0, 300), conversationId });
}

/* ---------- Availability rules ---------- */

const live = (a: Assignment) => a.status !== "declined";

export function onBlackout(v: Volunteer, date: string) {
  return v.blackouts.find((b) => b.from <= date && date <= b.to);
}

/** Distinct dates this volunteer serves in the date's calendar month. */
export function datesInMonth(book: ServeBook, volunteerId: string, date: string, exceptAssignmentId?: string) {
  const month = date.slice(0, 7);
  return new Set(book.assignments.filter((a) => a.volunteerId === volunteerId && live(a) && a.id !== exceptAssignmentId && a.date.startsWith(month)).map((a) => a.date));
}

/**
 * Why this volunteer can't take this slot, or null if they can: already serving at that gathering,
 * a blackout date, or over their monthly cap (a new date in a month that already has `maxPerMonth`).
 */
export function unavailable(book: ServeBook, v: Volunteer, slot: { date: string; gathering: GatheringKey }, exceptAssignmentId?: string): string | null {
  const clash = book.assignments.find((a) => a.volunteerId === v.id && live(a) && a.id !== exceptAssignmentId && a.date === slot.date && a.gathering === slot.gathering);
  if (clash) {
    const t = book.teams.find((x) => x.id === clash.teamId);
    return `${v.name} is already serving ${t ? `on ${t.name}` : ""} at the ${gathering(slot.gathering)?.label ?? slot.gathering} that day.`.replace("  ", " ");
  }
  const off = onBlackout(v, slot.date);
  if (off) return `${v.name} is away ${off.from === off.to ? `on ${friendlyDate(off.from)}` : `from ${friendlyDate(off.from)} to ${friendlyDate(off.to)}`}${off.note ? ` (${off.note})` : ""}.`;
  if (v.maxPerMonth !== undefined) {
    const dates = datesInMonth(book, v.id, slot.date, exceptAssignmentId);
    if (!dates.has(slot.date) && dates.size >= v.maxPerMonth) return `${v.name} already serves ${dates.size} times this month, and the church keeps them to ${v.maxPerMonth}.`;
  }
  return null;
}

export const SlotInput = z.object({ date: ISO, gathering: z.enum(GATHERING_KEYS), teamId: Id, positionId: Id });
export type Slot = z.infer<typeof SlotInput>;

function checkSlot(book: ServeBook, slot: Slot, exceptAssignmentId?: string) {
  const t = team(book, slot.teamId);
  if (!t.gatherings.includes(slot.gathering)) fail(`${t.name} doesn't serve at the ${gathering(slot.gathering)?.label}.`);
  if (!meetsOn(slot.gathering, slot.date)) fail(`The ${gathering(slot.gathering)?.label} isn't on ${friendlyDate(slot.date)}.`);
  const p = t.positions.find((x) => x.id === slot.positionId) ?? fail(`${t.name} has no position called ${slot.positionId}.`);
  const filled = book.assignments.filter((a) => live(a) && a.id !== exceptAssignmentId && a.date === slot.date && a.gathering === slot.gathering && a.teamId === t.id && a.positionId === p.id).length;
  return { t, p, open: p.needed - filled };
}

/* ---------- Assigning, signing up, removing ---------- */

export const AssignInput = SlotInput.extend({ volunteerId: Id });

/** A scheduler or the team lead puts a teammate in an open slot. */
export async function assign(actor: ServeActor, input: z.input<typeof AssignInput>, source: Assignment["source"] = "scheduler", conversationId?: string) {
  const v = AssignInput.parse(input);
  const result = await updateServe(actor.leader.churchId, ["assignments", "volunteers"], (book) => {
    const { t, p, open } = checkSlot(book, v);
    needEdit(actor, t);
    if (open <= 0) fail(`${p.name} is already filled for that ${gathering(v.gathering)?.label}.`);
    const vol = volunteer(book, v.volunteerId);
    const why = unavailable(book, vol, v);
    if (why) fail(why);
    if (!vol.teamIds.includes(t.id)) vol.teamIds.push(t.id);
    const a: Assignment = { id: newId("asg"), date: v.date, gathering: v.gathering, teamId: t.id, positionId: p.id, volunteerId: vol.id, status: "scheduled", source, createdAt: Date.now(), createdBy: actor.leader.leaderId };
    book.assignments.push(a);
    return { assignment: a, volunteer: vol, team: t, position: p };
  });
  await log(actor.leader, "assign", `${result.assignment.id} ${v.date} ${v.gathering} ${v.teamId}/${v.positionId} -> ${v.volunteerId}`, conversationId);
  return result;
}

/** Anyone signed in can take an open slot themselves; they join the team if they weren't on it. */
export async function signUp(actor: ServeActor, input: z.input<typeof SlotInput>) {
  const v = SlotInput.parse(input);
  if (v.date < today()) fail("That date has passed.");
  const result = await updateServe(actor.leader.churchId, ["assignments", "volunteers"], (book) => {
    const { t, p, open } = checkSlot(book, v);
    if (open <= 0) fail(`${p.name} is already filled. Pick another open slot.`);
    let me = selfVolunteer(book, actor.leader);
    if (!me) {
      me = { id: newId("vol"), name: actor.leader.name, leaderId: actor.leader.leaderId, teamIds: [], blackouts: [], createdAt: Date.now() };
      book.volunteers.push(me);
    }
    me.leaderId ??= actor.leader.leaderId;
    const why = unavailable(book, me, v);
    if (why) fail(why.replace(me.name, "You").replace("You is", "You're").replace("You already serves", "You already serve"));
    if (!me.teamIds.includes(t.id)) me.teamIds.push(t.id);
    const a: Assignment = { id: newId("asg"), date: v.date, gathering: v.gathering, teamId: t.id, positionId: p.id, volunteerId: me.id, status: "confirmed", source: "signup", createdAt: Date.now(), createdBy: actor.leader.leaderId };
    book.assignments.push(a);
    return { assignment: a, team: t, position: p };
  });
  await log(actor.leader, "signup", `${result.assignment.id} ${v.date} ${v.gathering} ${v.teamId}/${v.positionId}`);
  return result;
}

function isSelf(book: ServeBook, actor: ServeActor, volunteerId: string) {
  return selfVolunteer(book, actor.leader)?.id === volunteerId;
}

/** Removes someone from a slot (it opens up). Their own slot, or a scheduler or the team lead. */
export async function unassign(actor: ServeActor, assignmentId: string) {
  const removed = await updateServe(actor.leader.churchId, ["assignments", "swaps"], (book) => {
    const a = book.assignments.find((x) => x.id === assignmentId) ?? fail("That slot isn't on the roster anymore.");
    if (!isSelf(book, actor, a.volunteerId)) needEdit(actor, team(book, a.teamId));
    book.assignments = book.assignments.filter((x) => x.id !== a.id);
    for (const s of book.swaps) if (s.assignmentId === a.id && s.status === "pending") s.status = "cancelled";
    return a;
  });
  await log(actor.leader, "unassign", `${assignmentId}`);
  return removed;
}

/** The volunteer (or their team lead) says they can't make it: the slot reads as declined and opens up. */
export async function setStatus(actor: ServeActor, assignmentId: string, status: Assignment["status"]) {
  const a = await updateServe(actor.leader.churchId, ["assignments"], (book) => {
    const a = book.assignments.find((x) => x.id === assignmentId) ?? fail("That slot isn't on the roster anymore.");
    if (!isSelf(book, actor, a.volunteerId)) needEdit(actor, team(book, a.teamId));
    a.status = status;
    return a;
  });
  await log(actor.leader, "status", `${assignmentId} ${status}`);
  return a;
}

/* ---------- Swaps: ask a teammate to cover, they accept, the roster updates ---------- */

export const SwapInput = z.object({ assignmentId: Id, toVolunteerId: Id, note: z.string().trim().max(200).optional() });

export async function requestSwap(actor: ServeActor, input: z.input<typeof SwapInput>, conversationId?: string) {
  const v = SwapInput.parse(input);
  if (v.note && checkMemoryText(v.note, { allowSensitive: config.allowSensitiveMemory })) fail("Keep the note short and general, without personal details.");
  const swap = await updateServe(actor.leader.churchId, ["swaps"], (book) => {
    const a = book.assignments.find((x) => x.id === v.assignmentId) ?? fail("That slot isn't on the roster anymore.");
    const t = team(book, a.teamId);
    if (!isSelf(book, actor, a.volunteerId) && !canEditTeam(actor, t)) fail("You can ask someone to cover your own slot. A scheduler or the team lead can ask for anyone.");
    if (a.date < today()) fail("That date has passed.");
    const to = volunteer(book, v.toVolunteerId);
    if (to.id === a.volunteerId) fail("Pick someone else to cover.");
    if (!to.teamIds.includes(t.id)) fail(`${to.name} isn't on ${t.name}.`);
    const why = unavailable(book, to, a, a.id);
    if (why) fail(why);
    if (book.swaps.some((s) => s.assignmentId === a.id && s.status === "pending")) fail("There's already a swap request waiting for this slot.");
    const s: SwapRequest = { id: newId("swap"), assignmentId: a.id, fromVolunteerId: a.volunteerId, toVolunteerId: to.id, note: v.note || undefined, status: "pending", createdAt: Date.now(), createdBy: actor.leader.leaderId };
    book.swaps.push(s);
    return s;
  });
  await log(actor.leader, "swap.request", `${swap.id} ${swap.assignmentId} -> ${swap.toVolunteerId}`, conversationId);
  swapRequested(actor, swap);
  return swap;
}

/** The teammate accepts (or declines). A scheduler or the team lead can answer for someone who isn't on Barnabas. */
export async function respondSwap(actor: ServeActor, swapId: string, accept: boolean) {
  const result = await updateServe(actor.leader.churchId, ["swaps", "assignments"], (book) => {
    const s = book.swaps.find((x) => x.id === swapId) ?? fail("That swap request doesn't exist.");
    if (s.status !== "pending") fail(`That request was already ${s.status}.`);
    const a = book.assignments.find((x) => x.id === s.assignmentId);
    if (!a) {
      s.status = "cancelled";
      return fail("That slot isn't on the roster anymore.");
    }
    const t = team(book, a.teamId);
    if (!isSelf(book, actor, s.toVolunteerId) && !canEditTeam(actor, t)) fail("Only the person asked to cover (or a scheduler or the team lead) can answer this.");
    s.resolvedAt = Date.now();
    s.resolvedBy = actor.leader.leaderId;
    if (!accept) {
      s.status = "declined";
      return { swap: s, assignment: a };
    }
    const to = volunteer(book, s.toVolunteerId);
    const why = unavailable(book, to, a, a.id);
    if (why) fail(why);
    s.status = "accepted";
    a.volunteerId = to.id;
    a.status = "confirmed";
    a.source = "swap";
    a.remindedAt = undefined;
    return { swap: s, assignment: a };
  });
  await log(actor.leader, accept ? "swap.accept" : "swap.decline", swapId);
  if (accept) swapAccepted(actor, result.swap);
  return result;
}

export async function cancelSwap(actor: ServeActor, swapId: string) {
  const s = await updateServe(actor.leader.churchId, ["swaps"], (book) => {
    const s = book.swaps.find((x) => x.id === swapId) ?? fail("That swap request doesn't exist.");
    if (s.status !== "pending") fail(`That request was already ${s.status}.`);
    const a = book.assignments.find((x) => x.id === s.assignmentId);
    const t = a ? book.teams.find((x) => x.id === a.teamId) : undefined;
    if (!isSelf(book, actor, s.fromVolunteerId) && !(t && canEditTeam(actor, t))) fail("Only whoever asked (or a scheduler or the team lead) can cancel it.");
    s.status = "cancelled";
    s.resolvedAt = Date.now();
    return s;
  });
  await log(actor.leader, "swap.cancel", swapId);
  return s;
}

/* ---------- Volunteers, availability and teams ---------- */

export const VolunteerInput = z.object({
  name: z.string().trim().min(1, "Add a name.").max(100),
  personId: z.string().max(40).optional(),
  teamIds: z.array(Id).min(1, "Pick at least one team.").max(10),
  email: z.string().trim().email("Check the email address.").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).regex(/^[0-9 ()+.\-]*$/, "Use digits for the phone number.").optional(),
  maxPerMonth: z.number().int().min(1).max(10).optional(),
});

export async function addVolunteer(actor: ServeActor, input: z.input<typeof VolunteerInput>) {
  const v = VolunteerInput.parse(input);
  if (v.personId && !(await churchData().getPerson(v.personId))) fail(`No one with id ${v.personId} is in the directory.`);
  const vol = await updateServe(actor.leader.churchId, ["volunteers"], (book) => {
    for (const id of v.teamIds) needEdit(actor, team(book, id));
    if (book.volunteers.some((x) => (v.personId && x.personId === v.personId) || sameName(x.name, v.name))) fail(`${v.name} is already a co-laborer. Add them to the team from their row instead.`);
    const vol: Volunteer = { id: newId("vol"), name: v.name, personId: v.personId, teamIds: v.teamIds, email: v.email || undefined, phone: v.phone || undefined, maxPerMonth: v.maxPerMonth, blackouts: [], createdAt: Date.now() };
    book.volunteers.push(vol);
    return vol;
  });
  await log(actor.leader, "volunteer.add", `${vol.id} ${v.teamIds.join(",")}`);
  return vol;
}

export const VolunteerPatch = z.object({ teamIds: z.array(Id).max(10).optional(), maxPerMonth: z.number().int().min(1).max(10).nullable().optional() });

export async function updateVolunteer(actor: ServeActor, volunteerId: string, input: z.input<typeof VolunteerPatch>) {
  const v = VolunteerPatch.parse(input);
  const vol = await updateServe(actor.leader.churchId, ["volunteers"], (book) => {
    const vol = volunteer(book, volunteerId);
    const touched = new Set([...(v.teamIds ?? []), ...vol.teamIds]);
    for (const id of touched) if (!v.teamIds || v.teamIds.includes(id) !== vol.teamIds.includes(id)) needEdit(actor, team(book, id));
    if (v.maxPerMonth !== undefined) {
      if (!vol.teamIds.some((id) => canEditTeam(actor, team(book, id)))) fail("Only a scheduler or their team lead can change how often someone serves.");
      // The real leaders the church asked to keep light stay at their cap.
      if (vol.leadership && vol.maxPerMonth && (v.maxPerMonth === null || v.maxPerMonth > vol.maxPerMonth)) fail(`${vol.name} serves at most ${vol.maxPerMonth} times a month at the church's request.`);
      vol.maxPerMonth = v.maxPerMonth ?? undefined;
    }
    if (v.teamIds) vol.teamIds = v.teamIds;
    return vol;
  });
  await log(actor.leader, "volunteer.update", `${volunteerId} ${Object.keys(v).join(",")}`);
  return vol;
}

export const BlackoutInput = z.object({ volunteerId: Id.optional(), from: ISO, to: ISO, note: z.string().trim().max(80).optional() });

/** Away dates. Your own, or (for schedulers and team leads) a teammate's. Notes stay general. */
export async function addBlackout(actor: ServeActor, input: z.input<typeof BlackoutInput>) {
  const v = BlackoutInput.parse(input);
  if (v.to < v.from) fail("The end date must be on or after the start.");
  if (v.note && checkMemoryText(v.note, { allowSensitive: config.allowSensitiveMemory })) fail("Keep the note general, like \"Away\" or \"Traveling\".");
  const result = await updateServe(actor.leader.churchId, ["volunteers"], (book) => {
    let vol = v.volunteerId ? volunteer(book, v.volunteerId) : selfVolunteer(book, actor.leader);
    if (!vol) {
      vol = { id: newId("vol"), name: actor.leader.name, leaderId: actor.leader.leaderId, teamIds: [], blackouts: [], createdAt: Date.now() };
      book.volunteers.push(vol);
    }
    if (!isSelf(book, actor, vol.id) && !vol.teamIds.some((id) => canEditTeam(actor, team(book, id)))) fail("You can add your own away dates. A scheduler or their team lead can add someone else's.");
    const b = { id: newId("away"), from: v.from, to: v.to, note: v.note || undefined };
    vol.blackouts.push(b);
    vol.blackouts.sort((x, y) => x.from.localeCompare(y.from));
    const clashes = book.assignments.filter((a) => a.volunteerId === vol!.id && live(a) && a.date >= v.from && a.date <= v.to);
    return { volunteer: vol, blackout: b, clashes };
  });
  await log(actor.leader, "blackout.add", `${result.volunteer.id} ${v.from}..${v.to}`);
  return result;
}

export async function removeBlackout(actor: ServeActor, volunteerId: string, blackoutId: string) {
  await updateServe(actor.leader.churchId, ["volunteers"], (book) => {
    const vol = volunteer(book, volunteerId);
    if (!isSelf(book, actor, vol.id) && !vol.teamIds.some((id) => canEditTeam(actor, team(book, id)))) fail("Only they, a scheduler or their team lead can change their away dates.");
    vol.blackouts = vol.blackouts.filter((b) => b.id !== blackoutId);
  });
  await log(actor.leader, "blackout.remove", `${volunteerId} ${blackoutId}`);
}

export const PositionsInput = z.object({
  teamId: Id,
  positions: z.array(z.object({ id: z.string().max(40).optional(), name: z.string().trim().min(1).max(40), needed: z.number().int().min(1).max(12) })).min(1).max(20),
  gatherings: z.array(z.enum(GATHERING_KEYS)).min(1).optional(),
  lead: z.string().trim().max(100).optional(),
});

export async function setPositions(actor: ServeActor, input: z.input<typeof PositionsInput>) {
  const v = PositionsInput.parse(input);
  const t = await updateServe(actor.leader.churchId, ["teams"], (book) => {
    const t = team(book, v.teamId);
    needEdit(actor, t);
    const ids = new Set<string>();
    t.positions = v.positions.map((p) => {
      let id = p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || newId("pos");
      while (ids.has(id)) id = `${id}-2`;
      ids.add(id);
      return { id, name: p.name, needed: p.needed };
    });
    if (v.gatherings) t.gatherings = v.gatherings;
    if (v.lead !== undefined) {
      if (!actor.scheduler) fail("Only a scheduler can change who leads a team.");
      t.lead = v.lead || undefined;
    }
    return t;
  });
  await log(actor.leader, "team.positions", v.teamId);
  return t;
}

export const TeamInput = z.object({ name: z.string().trim().min(1).max(60), gatherings: z.array(z.enum(GATHERING_KEYS)).min(1), lead: z.string().trim().max(100).optional() });

export async function addTeam(actor: ServeActor, input: z.input<typeof TeamInput>) {
  if (!actor.scheduler) fail("Only a scheduler can add a team.");
  const v = TeamInput.parse(input);
  const t = await updateServe(actor.leader.churchId, ["teams"], (book) => {
    if (book.teams.some((x) => sameName(x.name, v.name))) fail(`There's already a team called ${v.name}.`);
    const t: ServeTeam = { id: newId("team"), name: v.name, lead: v.lead || undefined, gatherings: v.gatherings, positions: [{ id: "volunteer", name: "Co-laborer", needed: 2 }] };
    book.teams.push(t);
    return t;
  });
  await log(actor.leader, "team.add", t.id);
  return t;
}

/* ---------- Coverage and auto-fill ---------- */

export type Candidate = { volunteer: Volunteer; servedRecently: number; reason?: string };

/** Teammates who could cover a slot, best first (fewest Sundays in the last eight weeks), and who can't, with why. */
export function coverageFor(book: ServeBook, slot: Pick<Slot, "date" | "gathering" | "teamId">, exceptVolunteerId?: string) {
  const since = addDays(slot.date, -56);
  const recent = (id: string) => new Set(book.assignments.filter((a) => a.volunteerId === id && live(a) && a.date >= since && a.date < slot.date).map((a) => a.date)).size;
  const all = book.volunteers.filter((v) => v.teamIds.includes(slot.teamId) && v.id !== exceptVolunteerId);
  const out: Candidate[] = all.map((v) => ({ volunteer: v, servedRecently: recent(v.id), reason: unavailable(book, v, slot) ?? undefined }));
  return {
    available: out.filter((c) => !c.reason).sort((a, b) => a.servedRecently - b.servedRecently || a.volunteer.name.localeCompare(b.volunteer.name)),
    unavailable: out.filter((c) => c.reason),
  };
}

/** Fills open slots for one team at one gathering from available teammates, respecting blackouts and caps. */
export async function autoFill(actor: ServeActor, input: { date: string; gathering: GatheringKey; teamId: string }) {
  const v = SlotInput.omit({ positionId: true }).parse(input);
  const filled = await updateServe(actor.leader.churchId, ["assignments"], (book) => {
    const t = team(book, v.teamId);
    needEdit(actor, t);
    const added: Assignment[] = [];
    for (const p of t.positions) {
      let { open } = checkSlot(book, { ...v, positionId: p.id });
      while (open > 0) {
        const pick = coverageFor(book, v).available[0];
        if (!pick) break;
        const a: Assignment = { id: newId("asg"), date: v.date, gathering: v.gathering, teamId: t.id, positionId: p.id, volunteerId: pick.volunteer.id, status: "scheduled", source: "auto", createdAt: Date.now(), createdBy: actor.leader.leaderId };
        book.assignments.push(a);
        added.push(a);
        open--;
      }
    }
    return added;
  });
  await log(actor.leader, "autofill", `${v.date} ${v.gathering} ${v.teamId} +${filled.length}`);
  return filled;
}

/* ---------- Reminders: drafted into the review queue, never sent ---------- */

export function reminderText(firstName: string, lines: string[], date: string, church: string) {
  return `Hi ${firstName}, a friendly reminder that you're serving ${friendlyDate(date)}: ${lines.join("; ")}. Thank you for serving! If something comes up, ask a teammate to cover in Barnabas or reply to let us know. (${church})`;
}

/** One draft for a date (optionally one team), with a personal line per volunteer. Returns null when no one is scheduled. */
export async function draftReminders(actor: ServeActor, date: string, teamId?: string, conversationId?: string) {
  ISO.parse(date);
  const book = await loadServe(actor.leader.churchId);
  const teams = teamId ? [team(book, teamId)] : book.teams.filter((t) => canEditTeam(actor, t));
  if (!teams.length) fail("You can draft reminders for teams you schedule or lead.");
  for (const t of teams) needEdit(actor, t);
  const rows = book.assignments.filter((a) => a.date === date && live(a) && teams.some((t) => t.id === a.teamId));
  if (!rows.length) return null;
  const church = config.churchName.replace(/\s*\(demo\)\s*$/i, "");
  const byVol = new Map<string, Assignment[]>();
  for (const a of rows) byVol.set(a.volunteerId, [...(byVol.get(a.volunteerId) ?? []), a]);
  const recipients: Draft["recipients"] = [];
  for (const [vid, list] of byVol) {
    const vol = volunteer(book, vid);
    const person = vol.personId ? await churchData().getPerson(vol.personId) : null;
    const lines = list
      .sort((x, y) => x.gathering.localeCompare(y.gathering))
      .map((a) => {
        const t = book.teams.find((x) => x.id === a.teamId)!;
        return `${t.positions.find((p) => p.id === a.positionId)?.name ?? "serving"} with ${t.name} at the ${gathering(a.gathering)?.label.replace(/^Sunday |^Wednesday /, "")}`;
      });
    const first = person?.firstName ?? vol.name.split(/\s+/)[0];
    const text = reminderText(first, lines, date, church);
    recipients.push({ personId: vol.personId ?? vol.id, name: vol.name, language: "en", text, phone: vol.phone ?? person?.phone, email: vol.email ?? person?.email });
  }
  const draft: Draft = {
    id: newId("draft"),
    leaderId: actor.leader.leaderId,
    conversationId: conversationId ?? `serve:${date}`,
    channel: "sms",
    kind: "serve",
    baseText: recipients[0].text,
    recipients,
    status: "needs_review",
    createdAt: Date.now(),
  };
  await saveDraft(actor.leader, draft);
  await updateServe(actor.leader.churchId, ["assignments"], (b) => {
    for (const a of b.assignments) if (rows.some((r) => r.id === a.id)) a.remindedAt = draft.createdAt;
  });
  await audit(actor.leader, { action: "draft.create", detail: `${draft.id} serving reminders ${date} to ${recipients.length}`, conversationId });
  return draft;
}

/* ---------- Demo ---------- */

export async function clearDemoServe(actor: ServeActor) {
  if (!actor.scheduler) fail("Only a scheduler can clear the demo rosters.");
  const book = await loadServe(actor.leader.churchId);
  if (!book.meta.demo) fail("There are no demo rosters to clear.");
  await resetServe(actor.leader.churchId, ["teams"]);
  await log(actor.leader, "demo.clear", "Cleared demo rosters");
}

export { loadServe };
