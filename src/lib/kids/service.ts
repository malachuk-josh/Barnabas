import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { friendlyDate } from "../dates";
import { GATHERING_KEYS, gathering, ISO_RE, meetsOn, type GatheringKey } from "../ops/gatherings";
import { accessFor } from "../team";
import { checkoutRefused } from "../notifications/notify";
import { loadKids, updateKids } from "./store";
import type { CheckIn, Child, Household, KidsBook, KidsLogEntry } from "./types";

/**
 * Kids check-in. Children's records are the most sensitive data in Barnabas:
 *   - the station (find a family, check in and out, labels, room counts) needs `kids.checkin`;
 *   - adding or editing families, medical notes and authorized pickups needs `kids.admin`;
 *   - checkout needs the pickup code on the parent's tag; a wrong code is refused and logged;
 *   - every check-in, check-out and refusal is in the church's kids log and the leader's audit log;
 *   - Barnabas sees counts and, when asked, first names only; nothing about children goes to memory.
 */

export class KidsError extends Error {}
const fail = (message: string): never => {
  throw new KidsError(message);
};

const ISO = z.string().regex(ISO_RE, "Use a date like 2026-11-15.");
const Id = z.string().min(1).max(60);
const Short = (max: number) => z.string().trim().max(max);
const Phone = z.string().trim().max(40).regex(/^[0-9 ()+.\-]*$/, "Use digits for the phone number.");

export type KidsActor = { leader: Leader; access: Access; station: boolean; admin: boolean };

export async function kidsActor(leader: Leader): Promise<KidsActor> {
  const access = await accessFor(leader);
  return { leader, access, station: can(access, "kids.checkin"), admin: can(access, "kids.admin") };
}

export function needStation(actor: KidsActor) {
  if (!actor.station) fail("Kids check-in is limited to the pastors and staff who run it. Ask your church administrator if you need it.");
}
function needAdmin(actor: KidsActor) {
  if (!actor.admin) fail("Only kids ministry admins (pastors and staff) can change family records.");
}

function entry(book: KidsBook, actor: KidsActor, action: KidsLogEntry["action"], detail: string) {
  book.log.push({ at: Date.now(), action, by: actor.leader.name, detail });
  if (book.log.length > 5000) book.log = book.log.slice(-5000);
}

async function log(leader: Leader, action: string, detail: string) {
  await audit(leader, { action: `kids.${action}`, detail: detail.slice(0, 300) });
}

const household = (book: KidsBook, id: string) => book.households.find((h) => h.id === id) ?? fail("That family isn't on file.");

/* ---------- Families (kids.admin) ---------- */

const ChildInput = z.object({
  id: z.string().max(60).optional(),
  firstName: Short(40).min(1, "Add the child's first name."),
  lastName: Short(40).min(1, "Add the child's last name."),
  birthdate: ISO.optional().or(z.literal("")),
  grade: Short(20).optional(),
  allergies: Short(120).optional(),
  medical: Short(300).optional(),
  roomId: z.string().max(40).optional().or(z.literal("")),
});

export const HouseholdInput = z.object({
  name: Short(60).min(1, "Add the family's last name."),
  guardians: z.array(z.object({ name: Short(80).min(1, "Add the guardian's name."), phone: Phone.optional(), relationship: Short(30).optional() })).min(1, "Add at least one parent or guardian.").max(4),
  children: z.array(ChildInput).max(10).default([]),
  pickups: z.array(z.object({ name: Short(80).min(1), relationship: Short(30).optional() })).max(8).default([]),
  notes: Short(300).optional(),
});

function cleanChildren(input: z.infer<typeof ChildInput>[], book: KidsBook): Child[] {
  return input.map((c) => {
    if (c.roomId && !book.rooms.some((r) => r.id === c.roomId)) fail("Pick one of the rooms.");
    return { id: c.id || newId("child"), firstName: c.firstName, lastName: c.lastName, birthdate: c.birthdate || undefined, grade: c.grade || undefined, allergies: c.allergies || undefined, medical: c.medical || undefined, roomId: c.roomId || undefined };
  });
}

export async function saveHousehold(actor: KidsActor, input: z.input<typeof HouseholdInput>, id?: string) {
  needAdmin(actor);
  const v = HouseholdInput.parse(input);
  const h = await updateKids(actor.leader.churchId, ["households", "log"], (book) => {
    const now = Date.now();
    if (id) {
      const h = household(book, id);
      Object.assign(h, { name: v.name, guardians: v.guardians.map((g) => ({ ...g, phone: g.phone || undefined, relationship: g.relationship || undefined })), children: cleanChildren(v.children, book), pickups: v.pickups, notes: v.notes || undefined, updatedAt: now });
      entry(book, actor, "family", `updated ${h.id}`);
      return h;
    }
    const h: Household = { id: newId("fam"), name: v.name, guardians: v.guardians.map((g) => ({ ...g, phone: g.phone || undefined, relationship: g.relationship || undefined })), children: cleanChildren(v.children, book), pickups: v.pickups, notes: v.notes || undefined, createdAt: now, updatedAt: now };
    book.households.push(h);
    entry(book, actor, "family", `added ${h.id}`);
    return h;
  });
  await log(actor.leader, id ? "family.update" : "family.add", h.id);
  return h;
}

export async function removeHousehold(actor: KidsActor, id: string) {
  needAdmin(actor);
  await updateKids(actor.leader.churchId, ["households", "log"], (book) => {
    household(book, id);
    if (book.checkins.some((c) => c.householdId === id && !c.checkedOutAt)) fail("Check the children out before removing the family.");
    book.households = book.households.filter((h) => h.id !== id);
    entry(book, actor, "family", `removed ${id}`);
  });
  await log(actor.leader, "family.remove", id);
}

/* ---------- Finding a family ---------- */

const digits = (s?: string) => (s ?? "").replace(/\D/g, "");

/** By last name (family, child or guardian), or the last four digits of a guardian's phone. */
export function searchFamilies(book: KidsBook, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (/^\d{4}$/.test(q)) return book.households.filter((h) => h.guardians.some((g) => digits(g.phone).endsWith(q)));
  if (q.length < 2) return [];
  const last = (name: string) => name.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  return book.households.filter((h) => h.name.toLowerCase().startsWith(q) || h.children.some((c) => c.lastName.toLowerCase().startsWith(q)) || h.guardians.some((g) => last(g.name).startsWith(q)));
}

/* ---------- Check-in ---------- */

const CODE_CHARS = "ACDEFHJKLMNPRTUVWXY34679";
export function pickupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

export const CheckInInput = z.object({
  date: ISO,
  gathering: z.enum(GATHERING_KEYS),
  householdId: Id,
  children: z.array(z.object({ childId: Id, roomId: Id })).min(1, "Pick at least one child.").max(10),
});

const active = (c: CheckIn) => !c.checkedOutAt;
export const staffKey = (date: string, g: string, roomId: string) => `${date}|${g}|${roomId}`;

/** Checks children in. Siblings checked in together share one pickup code, printed on each label and the parent's tag. */
export async function checkInChildren(actor: KidsActor, input: z.input<typeof CheckInInput>) {
  needStation(actor);
  const v = CheckInInput.parse(input);
  if (!meetsOn(v.gathering, v.date)) fail(`The ${gathering(v.gathering)?.label} isn't on ${friendlyDate(v.date)}.`);
  const result = await updateKids(actor.leader.churchId, ["checkins", "log"], (book) => {
    const h = household(book, v.householdId);
    // Reuse the family's code if one of their children is already checked in at this gathering.
    const sibling = book.checkins.find((c) => c.householdId === h.id && c.date === v.date && c.gathering === v.gathering && active(c));
    const code = sibling?.pickupCode ?? pickupCode();
    const added: CheckIn[] = [];
    for (const pick of v.children) {
      const child = h.children.find((c) => c.id === pick.childId) ?? fail("That child isn't in this family.");
      const room = book.rooms.find((r) => r.id === pick.roomId) ?? fail("Pick a room.");
      if (!room.gatherings.includes(v.gathering)) fail(`${room.name} doesn't meet at the ${gathering(v.gathering)?.label}.`);
      if (book.checkins.some((c) => c.childId === child.id && c.date === v.date && c.gathering === v.gathering && active(c))) fail(`${child.firstName} is already checked in.`);
      const inRoom = book.checkins.filter((c) => c.roomId === room.id && c.date === v.date && c.gathering === v.gathering && active(c)).length;
      if (room.capacity && inRoom >= room.capacity) fail(`${room.name} is full (${room.capacity}). Check with the room leader.`);
      const c: CheckIn = { id: newId("ci"), date: v.date, gathering: v.gathering, roomId: room.id, childId: child.id, householdId: h.id, pickupCode: code, checkedInAt: Date.now(), checkedInBy: actor.leader.name };
      book.checkins.push(c);
      added.push(c);
      entry(book, actor, "checkin", `${child.id} -> ${room.id} ${v.date} ${v.gathering}`);
    }
    return { checkins: added, code, household: h };
  });
  await log(actor.leader, "checkin", `${v.householdId} ${result.checkins.length} ${v.date} ${v.gathering}`);
  return result;
}

export const CheckOutInput = z.object({ checkinIds: z.array(Id).min(1).max(10), code: z.string().trim().min(1, "Enter the code from the parent's tag.").max(12), pickedUpBy: Short(80).optional() });

/** Checks children out. The code must match the parent's tag; a wrong code is refused and logged. */
export async function checkOutChildren(actor: KidsActor, input: z.input<typeof CheckOutInput>) {
  needStation(actor);
  const v = CheckOutInput.parse(input);
  const outcome = await updateKids(actor.leader.churchId, ["checkins", "log"], (book) => {
    const rows = v.checkinIds.map((id) => book.checkins.find((c) => c.id === id) ?? fail("That check-in isn't on file."));
    if (rows.some((c) => c.checkedOutAt)) fail("Already checked out.");
    const ok = rows.every((c) => c.pickupCode === v.code.toUpperCase().replace(/\s/g, ""));
    if (!ok) {
      entry(book, actor, "checkout_refused", `wrong code for ${rows.map((c) => c.childId).join(",")}`);
      return { refused: true as const };
    }
    const h = household(book, rows[0].householdId);
    if (v.pickedUpBy) {
      const allowed = [...h.guardians.map((g) => g.name), ...h.pickups.map((p) => p.name)].map((n) => n.toLowerCase());
      if (!allowed.includes(v.pickedUpBy.toLowerCase())) {
        entry(book, actor, "checkout_refused", `${v.pickedUpBy} isn't an authorized pickup for ${h.id}`);
        return { refused: true as const, unauthorized: true as const };
      }
    }
    const now = Date.now();
    for (const c of rows) {
      c.checkedOutAt = now;
      c.checkedOutBy = actor.leader.name;
      c.pickedUpBy = v.pickedUpBy || undefined;
      entry(book, actor, "checkout", `${c.childId} from ${c.roomId}${v.pickedUpBy ? ` by ${v.pickedUpBy}` : ""}`);
    }
    return { refused: false as const, checkins: rows };
  });
  if (outcome.refused) {
    await log(actor.leader, "checkout.refused", v.checkinIds.join(","));
    if ("unauthorized" in outcome) checkoutRefused(actor);
    fail("unauthorized" in outcome ? "That person isn't on this family's pickup list. Find a parent or guardian, or a pastor." : "That code doesn't match the parent's tag. Ask to see the tag again, or find a staff member.");
  }
  await log(actor.leader, "checkout", v.checkinIds.join(","));
  return outcome.checkins!;
}

export async function setStaffing(actor: KidsActor, input: { date: string; gathering: GatheringKey; roomId: string; adults: number }) {
  needStation(actor);
  const v = z.object({ date: ISO, gathering: z.enum(GATHERING_KEYS), roomId: Id, adults: z.number().int().min(0).max(20) }).parse(input);
  await updateKids(actor.leader.churchId, ["staffing", "log"], (book) => {
    if (!book.rooms.some((r) => r.id === v.roomId)) fail("That room doesn't exist.");
    book.staffing[staffKey(v.date, v.gathering, v.roomId)] = v.adults;
    entry(book, actor, "staff", `${v.roomId} ${v.date} ${v.gathering}: ${v.adults} adults`);
  });
  await log(actor.leader, "staffing", `${v.roomId} ${v.date} ${v.gathering} ${v.adults}`);
}

/* ---------- Rooms, labels and counts ---------- */

export type RoomRow = {
  id: string;
  name: string;
  ages: string;
  ratio: number;
  capacity?: number;
  adults: number;
  present: number;
  checkedOut: number;
  warning: string | null;
  children: { checkinId: string; householdId: string; firstName: string; lastInitial: string; allergies: boolean; checkedInAt: number }[];
};

export function ratioWarning(present: number, adults: number, ratio: number, capacity?: number): string | null {
  if (present === 0) return null;
  if (adults === 0) return `No adults recorded for ${present} child${present === 1 ? "" : "ren"}.`;
  if (adults < 2) return "Only one adult in the room: two are needed for safety.";
  if (present > adults * ratio) return `Over ratio: ${present} children for ${adults} adults (1 to ${ratio}). Add ${Math.ceil(present / ratio) - adults} more.`;
  if (capacity && present >= capacity) return `At capacity (${capacity}).`;
  return null;
}

export function roomRows(book: KidsBook, date: string, g: GatheringKey): RoomRow[] {
  return book.rooms
    .filter((r) => r.gatherings.includes(g))
    .map((r) => {
      const here = book.checkins.filter((c) => c.roomId === r.id && c.date === date && c.gathering === g);
      const now = here.filter(active);
      const adults = book.staffing[staffKey(date, g, r.id)] ?? 0;
      const kids = now.map((c) => {
        const h = book.households.find((x) => x.id === c.householdId);
        const child = h?.children.find((x) => x.id === c.childId);
        return { checkinId: c.id, householdId: c.householdId, firstName: child?.firstName ?? "Child", lastInitial: (child?.lastName ?? "").slice(0, 1), allergies: Boolean(child?.allergies), checkedInAt: c.checkedInAt };
      });
      return { id: r.id, name: r.name, ages: r.ages, ratio: r.ratio, capacity: r.capacity, adults, present: now.length, checkedOut: here.length - now.length, warning: ratioWarning(now.length, adults, r.ratio, r.capacity), children: kids.sort((a, b) => a.firstName.localeCompare(b.firstName)) };
    });
}

/** Label data: a label per child and one pickup tag for the parent, all with the same code. */
export function labelsFor(book: KidsBook, checkinIds: string[]) {
  const rows = checkinIds.map((id) => book.checkins.find((c) => c.id === id)).filter((c): c is CheckIn => Boolean(c && active(c)));
  if (!rows.length) return null;
  const h = book.households.find((x) => x.id === rows[0].householdId);
  if (!h) return null;
  const children = rows.map((c) => {
    const child = h.children.find((x) => x.id === c.childId)!;
    const room = book.rooms.find((r) => r.id === c.roomId);
    return { checkinId: c.id, firstName: child.firstName, lastName: child.lastName, room: room?.name ?? "", allergies: child.allergies, code: c.pickupCode, date: c.date, gathering: gathering(c.gathering)?.label ?? c.gathering };
  });
  return { family: h.name, code: rows[0].pickupCode, date: rows[0].date, gathering: gathering(rows[0].gathering)?.label ?? rows[0].gathering, children };
}

/**
 * What Barnabas may know: counts per room and ratio warnings; first names only when asked. Never last
 * names, allergies, medical notes, guardians, phone numbers or pickup codes.
 */
export function kidsCounts(book: KidsBook, date: string, g?: GatheringKey, withFirstNames = false) {
  const gatherings = g ? [g] : (GATHERING_KEYS.filter((k) => meetsOn(k, date)) as GatheringKey[]);
  return gatherings.map((key) => {
    const rooms = roomRows(book, date, key);
    return {
      gathering: gathering(key)?.label ?? key,
      checked_in_now: rooms.reduce((n, r) => n + r.present, 0),
      checked_out: rooms.reduce((n, r) => n + r.checkedOut, 0),
      rooms: rooms.map((r) => ({ room: r.name, children: r.present, adults: r.adults, warning: r.warning ?? undefined, first_names: withFirstNames ? r.children.map((c) => c.firstName) : undefined })),
    };
  });
}

export { loadKids };
