import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { newToken } from "../care/welcome";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { ISO_RE } from "../ops/gatherings";
import { checkMemoryText } from "../policy/privacy";
import { accessFor } from "../team";
import { dropLink, loadEvents, lookupLink, resetEvents, saveLink, updateEvents } from "./store";
import { FIELD_KINDS, type Answer, type EventsBook, type FormField, type RegEvent, type Registration } from "./types";

/**
 * Events with registration. Leaders with `events.manage` create events and forms, see registrants,
 * export them and check people in; anyone can register through the public link. Capacity counts party
 * size; when an event is full, registrations join the waitlist (if it has one) and move up in order when
 * someone cancels. Payments aren't collected (see `Payment` in ./types: Stripe plugs in there).
 */

export class EventsError extends Error {}
const fail = (message: string): never => {
  throw new EventsError(message);
};

const ISO = z.string().regex(ISO_RE, "Use a date like 2026-11-22.");
const Time = z.string().trim().regex(/^\d{1,2}:\d{2} (AM|PM)$/, 'Use a time like "6:00 PM".');

export type EventsActor = { leader: Leader; access: Access; manager: boolean };

export async function eventsActor(leader: Leader): Promise<EventsActor> {
  const access = await accessFor(leader);
  return { leader, access, manager: can(access, "events.manage") };
}

function needManage(actor: EventsActor) {
  if (!actor.manager) fail("Pastors, deacons and staff manage events and registrations.");
}

async function log(leader: Leader, action: string, detail: string, conversationId?: string) {
  await audit(leader, { action: `events.${action}`, detail: detail.slice(0, 300), conversationId });
}

const findEvent = (book: EventsBook, id: string) => book.events.find((e) => e.id === id) ?? fail("That event doesn't exist.");

/* ---------- Counts ---------- */

export function counts(book: EventsBook, eventId: string) {
  const regs = book.registrations.filter((r) => r.eventId === eventId);
  const people = (s: Registration["status"]) => regs.filter((r) => r.status === s).reduce((n, r) => n + r.partySize, 0);
  const registered = people("registered");
  const event = book.events.find((e) => e.id === eventId);
  return {
    registered,
    registrations: regs.filter((r) => r.status === "registered").length,
    waitlisted: people("waitlisted"),
    checkedIn: regs.filter((r) => r.status === "registered" && r.checkedInAt).reduce((n, r) => n + r.partySize, 0),
    cancelled: regs.filter((r) => r.status === "cancelled").length,
    capacity: event?.capacity,
    spotsLeft: event?.capacity !== undefined ? Math.max(0, event.capacity - registered) : null,
    paymentDue: regs.filter((r) => r.status === "registered" && r.payment.status === "due").length,
  };
}

/* ---------- Events and forms ---------- */

const FieldInput = z
  .object({
    id: z.string().max(40).optional(),
    label: z.string().trim().min(1, "Every question needs a label.").max(80),
    kind: z.enum(FIELD_KINDS),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.kind === "choice" && (f.options?.length ?? 0) < 2) ctx.addIssue({ code: "custom", message: `"${f.label}" needs at least two choices.`, path: ["options"] });
  });

export const EventInput = z.object({
  title: z.string().trim().min(1, "Give the event a title.").max(100),
  date: ISO,
  time: Time.optional().or(z.literal("")),
  endTime: Time.optional().or(z.literal("")),
  location: z.string().trim().min(1, "Where is it?").max(160),
  description: z.string().trim().max(800).optional(),
  churchEventId: z.string().max(80).optional(),
  capacity: z.number().int().min(1).max(5000).nullable().optional(),
  waitlist: z.boolean().default(true),
  open: z.boolean().default(true),
  maxParty: z.number().int().min(1).max(20).default(1),
  priceCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  fields: z.array(FieldInput).max(15).default([]),
});

function cleanFields(fields: z.infer<typeof EventInput>["fields"]): FormField[] {
  const ids = new Set<string>();
  return fields.map((f) => {
    let id = f.id || f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || newId("q");
    while (ids.has(id)) id = `${id}_2`;
    ids.add(id);
    return { id, label: f.label, kind: f.kind, required: f.required, options: f.kind === "choice" ? f.options : undefined, min: f.kind === "number" ? f.min : undefined, max: f.kind === "number" ? f.max : undefined };
  });
}

export async function createEvent(actor: EventsActor, input: z.input<typeof EventInput>) {
  needManage(actor);
  const v = EventInput.parse(input);
  const ev: RegEvent = {
    id: newId("evt"),
    title: v.title,
    date: v.date,
    time: v.time || undefined,
    endTime: v.endTime || undefined,
    location: v.location,
    description: v.description || undefined,
    churchEventId: v.churchEventId,
    capacity: v.capacity ?? undefined,
    waitlist: v.waitlist,
    open: v.open,
    maxParty: v.maxParty,
    priceCents: v.priceCents || undefined,
    fields: cleanFields(v.fields),
    token: newToken(),
    createdAt: Date.now(),
    createdBy: actor.leader.leaderId,
  };
  await updateEvents(actor.leader.churchId, ["events"], (book) => {
    if (ev.churchEventId && book.events.some((e) => e.churchEventId === ev.churchEventId)) fail("That church event already takes registrations.");
    book.events.push(ev);
  });
  await saveLink(actor.leader.churchId, ev);
  await log(actor.leader, "create", ev.id);
  return ev;
}

export async function updateEvent(actor: EventsActor, id: string, input: z.input<typeof EventInput>) {
  needManage(actor);
  const v = EventInput.parse(input);
  const result = await updateEvents(actor.leader.churchId, ["events", "registrations"], (book) => {
    const ev = findEvent(book, id);
    Object.assign(ev, {
      title: v.title, date: v.date, time: v.time || undefined, endTime: v.endTime || undefined, location: v.location, description: v.description || undefined,
      capacity: v.capacity ?? undefined, waitlist: v.waitlist, open: v.open, maxParty: v.maxParty, priceCents: v.priceCents || undefined, fields: cleanFields(v.fields),
    });
    // More room (or no limit) moves people up from the waitlist.
    const promoted = promote(book, ev);
    return { event: ev, promoted };
  });
  await log(actor.leader, "update", id);
  return result;
}

/** Turns the public link off and makes a new one (the old link stops working). */
export async function newLink(actor: EventsActor, id: string) {
  needManage(actor);
  const { old, ev } = await updateEvents(actor.leader.churchId, ["events"], (book) => {
    const ev = findEvent(book, id);
    const old = ev.token;
    ev.token = newToken();
    return { old, ev };
  });
  await dropLink(old);
  await saveLink(actor.leader.churchId, ev);
  await log(actor.leader, "link.new", id);
  return ev;
}

export async function removeEvent(actor: EventsActor, id: string) {
  needManage(actor);
  const ev = await updateEvents(actor.leader.churchId, ["events", "registrations"], (book) => {
    const ev = findEvent(book, id);
    book.events = book.events.filter((e) => e.id !== id);
    book.registrations = book.registrations.filter((r) => r.eventId !== id);
    return ev;
  });
  await dropLink(ev.token);
  await log(actor.leader, "remove", id);
}

/* ---------- Registering ---------- */

/** Builds the validator for one event's form: name, contact, party size and each custom question. */
export function registrationSchema(ev: Pick<RegEvent, "fields" | "maxParty">) {
  const answer = (f: FormField) => {
    let s: z.ZodTypeAny;
    if (f.kind === "text") s = z.string().trim().max(300);
    else if (f.kind === "choice") s = z.enum(f.options as [string, ...string[]], { message: `Pick one of the choices for "${f.label}".` });
    else if (f.kind === "number") {
      let n = z.coerce.number({ message: `"${f.label}" needs a number.` }).int(`"${f.label}" needs a whole number.`);
      if (f.min !== undefined) n = n.min(f.min, `"${f.label}" must be at least ${f.min}.`);
      if (f.max !== undefined) n = n.max(f.max, `"${f.label}" must be at most ${f.max}.`);
      s = n;
    } else s = z.boolean({ message: `Answer yes or no for "${f.label}".` });
    if (!f.required) return s.optional().or(z.literal("")).optional();
    if (f.kind === "text") return z.string().trim().min(1, `Please answer "${f.label}".`).max(300);
    return s;
  };
  return z.object({
    name: z.string().trim().min(1, "Add your name.").max(100),
    email: z.string().trim().email("Check the email address.").max(200).optional().or(z.literal("")),
    phone: z.string().trim().max(40).regex(/^[0-9 ()+.\-]*$/, "Use digits for the phone number.").optional().or(z.literal("")),
    partySize: z.coerce.number().int().min(1).max(ev.maxParty, ev.maxParty === 1 ? "Register one person at a time." : `Up to ${ev.maxParty} people per registration.`).default(1),
    answers: z.object(Object.fromEntries(ev.fields.map((f) => [f.id, answer(f)]))).default({}),
  });
}

export type RegistrationInput = { name: unknown; email?: unknown; phone?: unknown; partySize?: unknown; answers?: unknown };

/**
 * Records a registration: registered while there's room, otherwise waitlisted (if the event keeps a
 * waitlist) or turned away. `leader` is null for the public page.
 */
export async function register(churchId: string, eventId: string, input: RegistrationInput, leader: Leader | null) {
  const book0 = await loadEvents(churchId);
  const ev0 = findEvent(book0, eventId);
  if (!leader && !ev0.open) fail("Registration for this event is closed.");
  const v = registrationSchema(ev0).parse(input);
  if (!v.email && !v.phone && !leader) fail("Add an email or a phone number so we can reach you.");
  for (const a of Object.values(v.answers)) {
    if (typeof a === "string" && checkMemoryText(a, { allowSensitive: true })) fail("Please leave out passwords, codes and account numbers.");
  }
  const reg = await updateEvents(churchId, ["registrations"], (book) => {
    const ev = findEvent(book, eventId);
    if (ev.date < new Date().toISOString().slice(0, 10)) fail("This event has already happened.");
    const dup = book.registrations.find((r) => r.eventId === ev.id && r.status !== "cancelled" && r.name.toLowerCase() === v.name.toLowerCase() && ((v.email && r.email === v.email) || (v.phone && r.phone === v.phone)));
    if (dup) fail(`${v.name} is already ${dup.status === "waitlisted" ? "on the waitlist" : "registered"}.`);
    const c = counts(book, ev.id);
    const fits = c.spotsLeft === null || (v.partySize <= c.spotsLeft && c.waitlisted === 0);
    if (!fits && !ev.waitlist) fail(c.spotsLeft ? `Only ${c.spotsLeft} spot${c.spotsLeft === 1 ? "" : "s"} left.` : "This event is full.");
    const answers: Record<string, Answer> = {};
    for (const [k, a] of Object.entries(v.answers)) if (a !== undefined && a !== "") answers[k] = a as Answer;
    const r: Registration = {
      id: newId("reg"),
      eventId: ev.id,
      name: v.name,
      email: v.email || undefined,
      phone: v.phone || undefined,
      partySize: v.partySize,
      answers,
      status: fits ? "registered" : "waitlisted",
      payment: ev.priceCents ? { status: "due", amountCents: ev.priceCents * v.partySize } : { status: "not_required" },
      source: leader ? "leader" : "public",
      createdAt: Date.now(),
    };
    book.registrations.push(r);
    return r;
  });
  if (leader) await log(leader, "register", `${eventId} ${reg.id} ${reg.status}`);
  return reg;
}

/** Moves waitlisted registrations up, oldest first, while they fit. */
function promote(book: EventsBook, ev: RegEvent) {
  const promoted: Registration[] = [];
  for (const r of book.registrations.filter((x) => x.eventId === ev.id && x.status === "waitlisted").sort((a, b) => a.createdAt - b.createdAt)) {
    const left = counts(book, ev.id).spotsLeft;
    if (left !== null && r.partySize > left) break;
    r.status = "registered";
    r.promotedAt = Date.now();
    promoted.push(r);
  }
  return promoted;
}

export async function cancelRegistration(actor: EventsActor, regId: string) {
  needManage(actor);
  const result = await updateEvents(actor.leader.churchId, ["registrations"], (book) => {
    const r = book.registrations.find((x) => x.id === regId) ?? fail("That registration doesn't exist.");
    if (r.status === "cancelled") fail("That registration is already cancelled.");
    r.status = "cancelled";
    r.cancelledAt = Date.now();
    r.checkedInAt = undefined;
    const promoted = promote(book, findEvent(book, r.eventId));
    return { registration: r, promoted };
  });
  await log(actor.leader, "cancel", `${regId} promoted ${result.promoted.map((p) => p.id).join(",") || "none"}`);
  return result;
}

export async function checkIn(actor: EventsActor, regId: string, present: boolean) {
  needManage(actor);
  const r = await updateEvents(actor.leader.churchId, ["registrations"], (book) => {
    const r = book.registrations.find((x) => x.id === regId) ?? fail("That registration doesn't exist.");
    if (r.status !== "registered") fail(r.status === "waitlisted" ? "They're on the waitlist. Move them up first." : "That registration was cancelled.");
    r.checkedInAt = present ? Date.now() : undefined;
    r.checkedInBy = present ? actor.leader.name : undefined;
    return r;
  });
  await log(actor.leader, present ? "checkin" : "checkin.undo", regId);
  return r;
}

/** Marks a payment taken at the door (cash or check), waived or refunded. Online payment is a Stripe step for later. */
export async function setPayment(actor: EventsActor, regId: string, status: "paid" | "due" | "waived" | "refunded") {
  needManage(actor);
  const r = await updateEvents(actor.leader.churchId, ["registrations"], (book) => {
    const r = book.registrations.find((x) => x.id === regId) ?? fail("That registration doesn't exist.");
    if (r.payment.status === "not_required") fail("This event is free.");
    r.payment = { ...r.payment, status, markedBy: actor.leader.name, markedAt: Date.now() };
    return r;
  });
  await log(actor.leader, "payment", `${regId} ${status}`);
  return r;
}

/** Moves one waitlisted registration up even if it goes over capacity (a leader's call). */
export async function admit(actor: EventsActor, regId: string) {
  needManage(actor);
  const r = await updateEvents(actor.leader.churchId, ["registrations"], (book) => {
    const r = book.registrations.find((x) => x.id === regId) ?? fail("That registration doesn't exist.");
    if (r.status !== "waitlisted") fail("They aren't on the waitlist.");
    r.status = "registered";
    r.promotedAt = Date.now();
    return r;
  });
  await log(actor.leader, "admit", regId);
  return r;
}

/* ---------- CSV ---------- */

/** A spreadsheet cell: quoted, and never read as a formula. */
export function csvCell(value: unknown) {
  let s = value === undefined || value === null ? "" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registrationsCsv(ev: RegEvent, regs: Registration[]) {
  const head = ["Name", "Email", "Phone", "Party size", "Status", "Checked in", "Payment", "Registered", ...ev.fields.map((f) => f.label)];
  const rows = regs
    .filter((r) => r.eventId === ev.id)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => [r.name, r.email, r.phone, r.partySize, r.status, r.checkedInAt ? new Date(r.checkedInAt).toISOString() : "", r.payment.status, new Date(r.createdAt).toISOString(), ...ev.fields.map((f) => r.answers[f.id])]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ---------- The public page ---------- */

/** The open event a public token belongs to, or null (malformed, unknown, replaced or removed all read the same). */
export async function resolveEventToken(token: string): Promise<{ churchId: string; event: RegEvent; book: EventsBook } | null> {
  const found = await lookupLink(token);
  if (!found) return null;
  const book = await loadEvents(found.churchId);
  const event = book.events.find((e) => e.id === found.eventId);
  if (!event || event.token !== token) return null;
  return { churchId: found.churchId, event, book };
}

/** What the public page may show: the event and its form, and whether there's room. Nothing about who registered. */
export function publicView(ev: RegEvent, book: EventsBook) {
  const c = counts(book, ev.id);
  return {
    title: ev.title, date: ev.date, time: ev.time, endTime: ev.endTime, location: ev.location, description: ev.description, priceCents: ev.priceCents, maxParty: ev.maxParty,
    fields: ev.fields, open: ev.open, full: c.spotsLeft === 0 || (c.spotsLeft !== null && c.waitlisted > 0), waitlist: ev.waitlist,
  };
}

export async function clearDemoEvents(actor: EventsActor) {
  needManage(actor);
  if (actor.access.role !== "pastor" && actor.access.role !== "staff") fail("A pastor or staff member can clear the demo events.");
  const book = await loadEvents(actor.leader.churchId);
  if (!book.meta.demo) fail("There are no demo events to clear.");
  for (const e of book.events) await dropLink(e.token);
  await resetEvents(actor.leader.churchId);
  await log(actor.leader, "demo.clear", "Cleared demo events");
}

export { loadEvents };
