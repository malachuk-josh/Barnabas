import { z } from "zod";
import type { Leader } from "../auth/session";
import { newId } from "../data/ids";
import { getJSON, setJSON } from "../store";
import { isTime } from "./time";
import type { CalendarEvent, EventInput } from "./types";

const key = (l: Pick<Leader, "churchId" | "leaderId">) => `cal:${l.churchId}:${l.leaderId}`;

export const EventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd"),
    start: z.string().refine(isTime, "Use HH:MM (24-hour)").optional(),
    end: z.string().refine(isTime, "Use HH:MM (24-hour)").optional(),
    allDay: z.boolean().default(false),
    location: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
    kind: z.enum(["meeting", "visit", "rest", "service", "prep", "event", "other"]).default("other"),
  })
  .superRefine((v, ctx) => {
    if (v.allDay) return;
    if (!v.start || !v.end) ctx.addIssue({ code: "custom", message: "Timed events need a start and end time", path: ["start"] });
    else if (v.end <= v.start) ctx.addIssue({ code: "custom", message: "The end time must be after the start time", path: ["end"] });
  });

export async function allEvents(leader: Leader): Promise<CalendarEvent[]> {
  return (await getJSON<CalendarEvent[]>(key(leader))) ?? [];
}

async function saveAll(leader: Leader, events: CalendarEvent[]) {
  // Keep about two years of history; older events fall off.
  const sorted = events.sort((a, b) => (a.date + (a.start ?? "")).localeCompare(b.date + (b.start ?? "")));
  await setJSON(key(leader), sorted.slice(-2000));
}

export async function listEvents(leader: Leader, from: string, to: string) {
  return (await allEvents(leader)).filter((e) => e.date >= from && e.date <= to);
}

export async function getEvent(leader: Leader, id: string) {
  return (await allEvents(leader)).find((e) => e.id === id) ?? null;
}

function clean(input: EventInput): EventInput {
  return input.allDay ? { ...input, start: undefined, end: undefined } : input;
}

export async function insertEvent(leader: Leader, input: EventInput, createdBy: CalendarEvent["createdBy"]) {
  const now = Date.now();
  const event: CalendarEvent = { ...clean(input), id: newId("evt"), createdBy, createdAt: now, updatedAt: now };
  const all = await allEvents(leader);
  all.push(event);
  await saveAll(leader, all);
  return event;
}

export async function replaceEvent(leader: Leader, event: CalendarEvent) {
  const all = await allEvents(leader);
  const i = all.findIndex((e) => e.id === event.id);
  if (i < 0) return null;
  all[i] = { ...event, ...clean(event), updatedAt: Date.now() };
  await saveAll(leader, all);
  return all[i];
}

export async function removeEvent(leader: Leader, id: string) {
  const all = await allEvents(leader);
  const event = all.find((e) => e.id === id) ?? null;
  if (!event) return null;
  await saveAll(leader, all.filter((e) => e.id !== id));
  return event;
}

export async function clearCalendar(leader: Leader) {
  await setJSON(key(leader), []);
}
