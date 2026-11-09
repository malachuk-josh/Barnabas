import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { friendlyDate } from "../dates";
import { GATHERING_KEYS, gathering, ISO_RE, meetsOn, weekday, type GatheringKey } from "../ops/gatherings";
import { loadServe } from "../serve/store";
import { accessFor } from "../team";
import { parseRef } from "./scripture";
import { loadServices, resetServices, updateServices } from "./store";
import { ITEM_KINDS, type PreachingDate, type ServiceItem, type ServicePlan, type ServicesBook } from "./types";

/**
 * Sermon series, the preaching rotation and orders of service. Everyone can read them; changes need
 * `services.plan` (pastors and staff), are validated, and are audited. Scripture references must parse,
 * so every one links into The Word.
 */

export class ServicesError extends Error {}
const fail = (message: string): never => {
  throw new ServicesError(message);
};

const ISO = z.string().regex(ISO_RE, "Use a date like 2026-11-15.");
const Passage = z
  .string()
  .trim()
  .max(60)
  .refine((s) => !s || Boolean(parseRef(s)) || s.split(/[;,]/).every((p) => Boolean(parseRef(p))), "Use a reference like Philippians 2:1-11.");

export type ServicesActor = { leader: Leader; access: Access; planner: boolean };

export async function servicesActor(leader: Leader): Promise<ServicesActor> {
  const access = await accessFor(leader);
  return { leader, access, planner: can(access, "services.plan") };
}

function needPlan(actor: ServicesActor) {
  if (!actor.planner) fail("Pastors and staff plan services. Ask one of them to make this change.");
}

async function log(leader: Leader, action: string, detail: string, conversationId?: string) {
  await audit(leader, { action: `services.${action}`, detail: detail.slice(0, 300), conversationId });
}

/* ---------- Series ---------- */

export const SeriesInput = z.object({
  title: z.string().trim().min(1, "Give the series a title.").max(80),
  passage: Passage.optional(),
  startDate: ISO,
  endDate: ISO,
  notes: z.string().trim().max(400).optional(),
});

export async function addSeries(actor: ServicesActor, input: z.input<typeof SeriesInput>) {
  needPlan(actor);
  const v = SeriesInput.parse(input);
  if (v.endDate < v.startDate) fail("The series ends before it starts.");
  const s = await updateServices(actor.leader.churchId, ["series", "rotation"], (book) => {
    const s = { id: newId("series"), title: v.title, passage: v.passage || undefined, startDate: v.startDate, endDate: v.endDate, notes: v.notes || undefined, createdAt: Date.now() };
    book.series.push(s);
    book.series.sort((a, b) => a.startDate.localeCompare(b.startDate));
    // Sundays in the series pick it up in the rotation.
    for (const r of book.rotation) if (!r.seriesId && r.date >= s.startDate && r.date <= s.endDate) r.seriesId = s.id;
    return s;
  });
  await log(actor.leader, "series.add", s.id);
  return s;
}

export async function updateSeries(actor: ServicesActor, id: string, input: z.input<typeof SeriesInput>) {
  needPlan(actor);
  const v = SeriesInput.parse(input);
  if (v.endDate < v.startDate) fail("The series ends before it starts.");
  const s = await updateServices(actor.leader.churchId, ["series"], (book) => {
    const s = book.series.find((x) => x.id === id) ?? fail("That series doesn't exist.");
    Object.assign(s, { title: v.title, passage: v.passage || undefined, startDate: v.startDate, endDate: v.endDate, notes: v.notes || undefined });
    return s;
  });
  await log(actor.leader, "series.update", id);
  return s;
}

export async function removeSeries(actor: ServicesActor, id: string) {
  needPlan(actor);
  await updateServices(actor.leader.churchId, ["series", "rotation"], (book) => {
    if (!book.series.some((x) => x.id === id)) fail("That series doesn't exist.");
    book.series = book.series.filter((x) => x.id !== id);
    for (const r of book.rotation) if (r.seriesId === id) r.seriesId = undefined;
  });
  await log(actor.leader, "series.remove", id);
}

/* ---------- Preaching rotation ---------- */

export const PreachInput = z.object({
  date: ISO,
  preacher: z.string().trim().min(1, "Who's preaching?").max(80),
  seriesId: z.string().max(60).optional(),
  passage: Passage.optional(),
  title: z.string().trim().max(100).optional(),
});

export async function setPreacher(actor: ServicesActor, input: z.input<typeof PreachInput>, conversationId?: string) {
  needPlan(actor);
  const v = PreachInput.parse(input);
  if (weekday(v.date) !== 0) fail(`${friendlyDate(v.date)} isn't a Sunday.`);
  const entry = await updateServices(actor.leader.churchId, ["rotation"], (book) => {
    if (v.seriesId && !book.series.some((s) => s.id === v.seriesId)) fail("That series doesn't exist.");
    const series = v.seriesId ?? book.series.find((s) => v.date >= s.startDate && v.date <= s.endDate)?.id;
    const entry: PreachingDate = { date: v.date, preacher: v.preacher, seriesId: series, passage: v.passage || undefined, title: v.title || undefined };
    book.rotation = [...book.rotation.filter((r) => r.date !== v.date), entry].sort((a, b) => a.date.localeCompare(b.date));
    return entry;
  });
  await log(actor.leader, "rotation.set", `${v.date} ${v.preacher}`, conversationId);
  return entry;
}

export async function clearPreacher(actor: ServicesActor, date: string) {
  needPlan(actor);
  ISO.parse(date);
  await updateServices(actor.leader.churchId, ["rotation"], (book) => {
    book.rotation = book.rotation.filter((r) => r.date !== date);
  });
  await log(actor.leader, "rotation.clear", date);
}

/* ---------- Orders of service ---------- */

export const ItemInput = z.object({
  id: z.string().max(40).optional(),
  kind: z.enum(ITEM_KINDS),
  title: z.string().trim().min(1, "Every item needs a title.").max(100),
  minutes: z.number().int().min(0).max(120),
  person: z.string().trim().max(80).optional(),
  passage: Passage.optional(),
  notes: z.string().trim().max(300).optional(),
});

export const PlanInput = z.object({ date: ISO, gathering: z.enum(GATHERING_KEYS), items: z.array(ItemInput).max(40) });

function checkGathering(date: string, g: GatheringKey) {
  const info = gathering(g);
  if (!info?.worship) fail("Orders of service are for the Sunday worship services.");
  if (!meetsOn(g, date)) fail(`The ${info!.label} isn't on ${friendlyDate(date)}.`);
}

export async function savePlan(actor: ServicesActor, input: z.input<typeof PlanInput>, conversationId?: string) {
  needPlan(actor);
  const v = PlanInput.parse(input);
  checkGathering(v.date, v.gathering);
  const plan = await updateServices(actor.leader.churchId, ["plans"], (book) => {
    const existing = book.plans.find((p) => p.date === v.date && p.gathering === v.gathering);
    const items: ServiceItem[] = v.items.map((i) => ({ id: i.id || newId("item"), kind: i.kind, title: i.title, minutes: i.minutes, person: i.person || undefined, passage: i.passage || undefined, notes: i.notes || undefined }));
    if (existing) {
      existing.items = items;
      existing.updatedAt = Date.now();
      existing.updatedBy = actor.leader.name;
      return existing;
    }
    const plan: ServicePlan = { id: newId("plan"), date: v.date, gathering: v.gathering, items, updatedAt: Date.now(), updatedBy: actor.leader.name };
    book.plans.push(plan);
    return plan;
  });
  await log(actor.leader, "plan.save", `${v.date} ${v.gathering} ${plan.items.length} items`, conversationId);
  return plan;
}

/** MGBC's usual order, filled in from the rotation (preacher, passage) and the roster (who leads worship). */
export async function templateItems(churchId: string, book: ServicesBook, date: string, g: GatheringKey): Promise<ServiceItem[]> {
  const preach = book.rotation.find((r) => r.date === date);
  const series = preach?.seriesId ? book.series.find((s) => s.id === preach.seriesId) : undefined;
  const passage = preach?.passage;
  const serve = await loadServe(churchId).catch(() => null);
  const leadAsg = serve?.assignments.find((a) => a.date === date && a.gathering === g && a.teamId === "worship" && a.positionId === "worship-leader" && a.status !== "declined");
  const worship = leadAsg ? serve!.volunteers.find((v) => v.id === leadAsg.volunteerId)?.name : undefined;
  const firstSunday = Number(date.slice(8, 10)) <= 7;
  const item = (kind: ServiceItem["kind"], title: string, minutes: number, extra: Partial<ServiceItem> = {}): ServiceItem => ({ id: newId("item"), kind, title, minutes, ...extra });
  return [
    item("welcome", "Welcome and announcements", 4, { person: preach?.preacher }),
    item("song", "Opening song", 4, { person: worship }),
    item("song", "Song", 4, { person: worship }),
    item("scripture", "Scripture reading", 3, { passage }),
    item("prayer", "Pastoral prayer", 3),
    item("song", "Song", 4, { person: worship }),
    item("sermon", preach?.title || (series ? `${series.title}` : "Sermon"), 35, { person: preach?.preacher, passage }),
    ...(firstSunday ? [item("communion", "The Lord's Supper", 10, { person: preach?.preacher })] : []),
    item("offering", "Offering", 4),
    item("song", "Closing song", 4, { person: worship }),
    item("benediction", "Benediction", 1, { person: preach?.preacher }),
  ];
}

/** Starts an empty order of service from the usual template. Replacing an existing plan isn't done here. */
export async function startPlan(actor: ServicesActor, date: string, g: GatheringKey, conversationId?: string) {
  needPlan(actor);
  ISO.parse(date);
  checkGathering(date, g);
  const book = await loadServices(actor.leader.churchId);
  const existing = book.plans.find((p) => p.date === date && p.gathering === g);
  if (existing?.items.length) fail("That service already has an order. Edit it, or clear it first.");
  const items = await templateItems(actor.leader.churchId, book, date, g);
  return savePlan(actor, { date, gathering: g, items }, conversationId);
}

/** Copies one service's order to the other service the same day. */
export async function copyPlan(actor: ServicesActor, date: string, from: GatheringKey, to: GatheringKey) {
  needPlan(actor);
  const book = await loadServices(actor.leader.churchId);
  const src = book.plans.find((p) => p.date === date && p.gathering === from) ?? fail("There's no order to copy yet.");
  return savePlan(actor, { date, gathering: to, items: src.items.map((i) => ({ ...i, id: undefined })) });
}

export const totalMinutes = (items: Pick<ServiceItem, "minutes">[]) => items.reduce((n, i) => n + i.minutes, 0);

export async function clearDemoServices(actor: ServicesActor) {
  needPlan(actor);
  const book = await loadServices(actor.leader.churchId);
  if (!book.meta.demo) fail("There's no demo rotation to clear.");
  await resetServices(actor.leader.churchId);
  await log(actor.leader, "demo.clear", "Cleared demo rotation");
}

export { loadServices };
