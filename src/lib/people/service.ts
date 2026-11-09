import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { invalidateChurchData } from "../chms";
import { config } from "../config";
import { updateCare } from "../care/store";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { updateBooks } from "../finance/store";
import { normalizeEmail, normalizePhone } from "../messages/phone";
import { GATHERING_KEYS } from "../ops/gatherings";
import { checkMemoryText } from "../policy/privacy";
import { updateServe } from "../serve/store";
import { accessFor } from "../team";
import { displayName, isActive } from "./native";
import { loadPeople, updatePeople, LEADERSHIP_FIELD_ID } from "./store";
import { FIELD_KINDS, GROUP_KINDS, HOUSEHOLD_ROLES, MEMBER_STATUSES, type GroupRecord, type PeopleBook, type PersonRecord } from "./types";

/**
 * The People database, the church's system of record. Everyone signed in can see the directory; contact
 * details, birthdays and notes follow the rules in `peopleView` below. Editing needs `people.edit` (pastors,
 * staff). Every change is validated, made under the church's lock, and written to the audit log.
 */

export class PeopleError extends Error {}
const fail = (m: string): never => {
  throw new PeopleError(m);
};

export type PeopleActor = { leader: Leader; access: Access; edit: boolean; contacts: boolean; notes: boolean; privateNotes: boolean };

export async function peopleActor(leader: Leader): Promise<PeopleActor> {
  const access = await accessFor(leader);
  return {
    leader,
    access,
    edit: can(access, "people.edit"),
    // Contact details and notes: the people who follow up (pastors, deacons, staff), as care does today.
    contacts: can(access, "people.edit") || can(access, "care.assign"),
    notes: can(access, "care.assign"),
    privateNotes: can(access, "care.view_all"),
  };
}

const needEdit = (a: PeopleActor) => a.edit || fail("Only pastors and staff edit the church's People records.");
const log = (leader: Leader, action: string, detail: string) => audit(leader, { action: `people.${action}`, detail: detail.slice(0, 300) });

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-15.");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const AddressInput = z.object({ street: opt(120), city: opt(60), state: opt(30), zip: opt(15) }).optional();

export const PersonInput = z.object({
  firstName: z.string().trim().min(1, "Add a first name.").max(60),
  lastName: z.string().trim().max(60).default(""),
  nickname: opt(40),
  email: opt(200).refine((v) => !v || normalizeEmail(v), "That email doesn't look right."),
  phone: opt(30).refine((v) => !v || normalizePhone(v), "That mobile number couldn't be read."),
  homePhone: opt(30),
  address: AddressInput,
  birthdate: ISO.optional().or(z.literal("")).transform((v) => v || undefined),
  anniversary: ISO.optional().or(z.literal("")).transform((v) => v || undefined),
  status: z.enum(MEMBER_STATUSES).default("regular"),
  membershipDate: ISO.optional().or(z.literal("")).transform((v) => v || undefined),
  householdId: z.string().max(60).optional().or(z.literal("")).transform((v) => v || undefined),
  newHousehold: opt(80),
  householdRole: z.enum(HOUSEHOLD_ROLES).optional(),
  language: z.enum(["en", "es", "ko"]).default("en"),
  custom: z.record(z.string().max(40), z.string().max(500)).default({}),
});

function clean(v: z.infer<typeof PersonInput>) {
  return { ...v, email: normalizeEmail(v.email) ?? undefined, phone: normalizePhone(v.phone) ?? undefined, address: v.address && Object.values(v.address).some(Boolean) ? v.address : undefined };
}

export async function savePerson(actor: PeopleActor, input: z.input<typeof PersonInput>, id?: string) {
  needEdit(actor);
  const v = clean(PersonInput.parse(input));
  const result = await updatePeople(actor.leader.churchId, ["people", "households"], (b) => {
    for (const k of Object.keys(v.custom)) if (!b.fields.some((f) => f.id === k)) delete v.custom[k];
    let householdId = v.householdId;
    if (v.newHousehold) {
      const h = { id: newId("hh"), name: v.newHousehold, createdAt: Date.now() };
      b.households.push(h);
      householdId = h.id;
    } else if (householdId && !b.households.some((h) => h.id === householdId)) fail("That household doesn't exist anymore.");
    const { newHousehold: _n, ...data } = v;
    if (id) {
      const p = b.people.find((x) => x.id === id) ?? fail("That person isn't in the directory anymore.");
      Object.assign(p, { ...data, householdId, custom: { ...p.custom, ...data.custom }, updatedAt: Date.now() });
      return p;
    }
    const p: PersonRecord = { id: newId("per"), ...data, householdId, createdAt: Date.now(), updatedAt: Date.now() };
    b.people.push(p);
    return p;
  });
  invalidateChurchData();
  await log(actor.leader, id ? "update" : "add", result.id);
  return result;
}

export async function setArchived(actor: PeopleActor, id: string, archived: boolean) {
  needEdit(actor);
  const p = await updatePeople(actor.leader.churchId, ["people"], (b) => {
    const p = b.people.find((x) => x.id === id) ?? fail("That person isn't in the directory.");
    if (p.mergedInto) fail("This record was merged into another one.");
    p.archivedAt = archived ? Date.now() : undefined;
    p.updatedAt = Date.now();
    return p;
  });
  invalidateChurchData();
  await log(actor.leader, archived ? "archive" : "restore", id);
  return p;
}

/* ---------- Households ---------- */

export const HouseholdInput = z.object({ name: z.string().trim().min(1).max(80), homePhone: opt(30), address: AddressInput, members: z.array(z.object({ personId: z.string().max(60), role: z.enum(HOUSEHOLD_ROLES) })).max(30).optional() });

export async function saveHousehold(actor: PeopleActor, input: z.input<typeof HouseholdInput>, id?: string) {
  needEdit(actor);
  const v = HouseholdInput.parse(input);
  const h = await updatePeople(actor.leader.churchId, ["people", "households"], (b) => {
    const h = id ? (b.households.find((x) => x.id === id) ?? fail("That household doesn't exist.")) : { id: newId("hh"), name: v.name, createdAt: Date.now() };
    if (!id) b.households.push(h);
    Object.assign(h, { name: v.name, homePhone: v.homePhone, address: v.address && Object.values(v.address).some(Boolean) ? v.address : undefined });
    if (v.members) {
      for (const p of b.people) if (p.householdId === h.id && !v.members.some((m) => m.personId === p.id)) Object.assign(p, { householdId: undefined, householdRole: undefined, updatedAt: Date.now() });
      for (const m of v.members) {
        const p = b.people.find((x) => x.id === m.personId) ?? fail("Someone in that household isn't in the directory.");
        Object.assign(p, { householdId: h.id, householdRole: m.role, updatedAt: Date.now() });
      }
    }
    return h;
  });
  invalidateChurchData();
  await log(actor.leader, "household", h.id);
  return h;
}

/* ---------- Duplicates and merging ---------- */

const nameKey = (p: PersonRecord) => `${p.firstName} ${p.lastName}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();

/** Likely duplicates: the same email, the same mobile number, or the same name. */
export function duplicates(book: PeopleBook) {
  const active = book.people.filter(isActive);
  const groups = new Map<string, PersonRecord[]>();
  const add = (k: string, p: PersonRecord) => groups.set(k, [...(groups.get(k) ?? []), p]);
  for (const p of active) {
    if (p.email) add(`email:${p.email}`, p);
    if (p.phone) add(`phone:${p.phone}`, p);
    add(`name:${nameKey(p)}`, p);
  }
  const seen = new Set<string>();
  const out: { reason: string; people: PersonRecord[] }[] = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const id = list.map((p) => p.id).sort().join("|");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ reason: k.startsWith("email") ? "Same email" : k.startsWith("phone") ? "Same mobile number" : "Same name", people: list });
  }
  return out;
}

/** Points every record elsewhere in Barnabas that referred to `from` at `to`: care, serving, giving. */
async function relink(church: string, from: string, to: string) {
  await updateCare(church, ["cases", "pathways", "guests", "prayers"], (b) => {
    for (const c of b.cases) if (c.subject.personId === from) c.subject.personId = to;
    for (const p of b.pathways) if (p.personId === from) p.personId = to;
    for (const g of b.guests) if (g.personId === from) g.personId = to;
    for (const p of b.prayers) if (p.personId === from) p.personId = to;
  }).catch(() => undefined);
  await updateServe(church, ["volunteers"], (b) => {
    for (const v of b.volunteers) if (v.personId === from) v.personId = to;
  }).catch(() => undefined);
  await updateBooks(church, ["gifts", "recurring"], (b) => {
    for (const g of b.gifts) if (g.personId === from) g.personId = to;
    for (const r of b.recurring) if (r.personId === from) r.personId = to;
  }).catch(() => undefined);
}

/** Merges `dropId` into `keepId`: blank fields are filled from the duplicate, memberships, attendance and notes move over, and every link elsewhere follows. */
export async function mergePeople(actor: PeopleActor, keepId: string, dropId: string) {
  needEdit(actor);
  if (keepId === dropId) fail("Pick two different people.");
  const kept = await updatePeople(actor.leader.churchId, ["people", "groups", "attendance", "notes"], (b) => {
    const keep = b.people.find((p) => p.id === keepId && isActive(p)) ?? fail("The record to keep isn't in the directory.");
    const drop = b.people.find((p) => p.id === dropId && isActive(p)) ?? fail("The duplicate isn't in the directory.");
    for (const k of ["nickname", "email", "phone", "homePhone", "address", "birthdate", "anniversary", "membershipDate", "householdId", "householdRole"] as const) {
      if (!keep[k] && drop[k]) (keep as Record<string, unknown>)[k] = drop[k];
    }
    if (keep.status === "visitor" && drop.status !== "visitor") keep.status = drop.status;
    keep.custom = { ...drop.custom, ...keep.custom };
    keep.updatedAt = Date.now();
    for (const g of b.groups) {
      const swap = (ids: string[]) => [...new Set(ids.map((x) => (x === dropId ? keepId : x)))];
      g.memberIds = swap(g.memberIds);
      g.leaderIds = swap(g.leaderIds);
    }
    for (const a of b.attendance) if (a.personId === dropId) a.personId = keepId;
    b.attendance = b.attendance.filter((a, i, all) => all.findIndex((x) => x.personId === a.personId && x.date === a.date && x.kind === a.kind && x.gathering === a.gathering && x.groupId === a.groupId) === i);
    for (const n of b.notes) if (n.personId === dropId) n.personId = keepId;
    drop.mergedInto = keepId;
    drop.updatedAt = Date.now();
    return keep;
  });
  await relink(actor.leader.churchId, dropId, keepId);
  invalidateChurchData();
  await log(actor.leader, "merge", `${dropId} -> ${keepId}`);
  return kept;
}

/* ---------- Groups ---------- */

export const GroupInput = z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(GROUP_KINDS).default("small_group"), meets: opt(80), description: opt(500), leaderIds: z.array(z.string().max(60)).max(10).default([]), memberIds: z.array(z.string().max(60)).max(500).default([]) });

export async function saveGroup(actor: PeopleActor, input: z.input<typeof GroupInput>, id?: string) {
  needEdit(actor);
  const v = GroupInput.parse(input);
  const g = await updatePeople(actor.leader.churchId, ["groups"], (b) => {
    const known = new Set(b.people.filter(isActive).map((p) => p.id));
    const members = [...new Set([...v.memberIds, ...v.leaderIds])].filter((x) => known.has(x));
    if (id) {
      const g = b.groups.find((x) => x.id === id) ?? fail("That group doesn't exist.");
      Object.assign(g, { ...v, memberIds: members, leaderIds: v.leaderIds.filter((x) => known.has(x)) });
      return g;
    }
    const g: GroupRecord = { id: newId("grp"), ...v, memberIds: members, leaderIds: v.leaderIds.filter((x) => known.has(x)), createdAt: Date.now() };
    b.groups.push(g);
    return g;
  });
  invalidateChurchData();
  await log(actor.leader, id ? "group.update" : "group.add", g.id);
  return g;
}

export async function archiveGroup(actor: PeopleActor, id: string) {
  needEdit(actor);
  await updatePeople(actor.leader.churchId, ["groups"], (b) => {
    const g = b.groups.find((x) => x.id === id) ?? fail("That group doesn't exist.");
    g.archivedAt = Date.now();
  });
  invalidateChurchData();
  await log(actor.leader, "group.archive", id);
}

/* ---------- Attendance ---------- */

export const AttendanceInput = z.object({
  date: ISO,
  kind: z.enum(["worship", "group"]),
  gathering: z.enum(GATHERING_KEYS).optional(),
  groupId: z.string().max(60).optional(),
  presentIds: z.array(z.string().max(60)).max(2000),
});

/** Takes attendance for one gathering or group on one date: the list replaces what was recorded before. */
export async function recordAttendance(actor: PeopleActor, input: z.input<typeof AttendanceInput>) {
  if (!actor.edit && !can(actor.access, "care.assign")) fail("Pastors, deacons and staff take attendance.");
  const v = AttendanceInput.parse(input);
  if (v.kind === "worship" && !v.gathering) fail("Pick the gathering.");
  if (v.kind === "group" && !v.groupId) fail("Pick the group.");
  const n = await updatePeople(actor.leader.churchId, ["attendance"], (b) => {
    if (v.groupId && !b.groups.some((g) => g.id === v.groupId)) fail("That group doesn't exist.");
    const same = (a: (typeof b.attendance)[number]) => a.date === v.date && a.kind === v.kind && (v.kind === "worship" ? a.gathering === v.gathering : a.groupId === v.groupId);
    b.attendance = b.attendance.filter((a) => !same(a));
    const known = new Set(b.people.filter(isActive).map((p) => p.id));
    const ids = [...new Set(v.presentIds)].filter((x) => known.has(x));
    for (const personId of ids) b.attendance.push({ id: newId("att"), personId, date: v.date, kind: v.kind, gathering: v.gathering, groupId: v.groupId, present: true, recordedBy: actor.leader.leaderId, at: Date.now() });
    return ids.length;
  });
  invalidateChurchData();
  await log(actor.leader, "attendance", `${v.date} ${v.kind} ${v.gathering ?? v.groupId}: ${n}`);
  return { present: n };
}

/* ---------- Notes ---------- */

export const NoteInput = z.object({ text: z.string().trim().min(1).max(1000), private: z.boolean().default(false) });

/** Notes follow the same memory policy as Barnabas's memory and care notes (no secrets; no sensitive details unless the church allows it). */
export async function addNote(actor: PeopleActor, personId: string, input: z.input<typeof NoteInput>) {
  if (!actor.notes) fail("Pastors, deacons and staff keep notes on people.");
  const v = NoteInput.parse(input);
  if (v.private && !actor.privateNotes) fail("Only pastors keep private notes.");
  const problem = checkMemoryText(v.text, { allowSensitive: config.allowSensitiveMemory });
  if (problem) fail(problem.replace(/^Not saved/, "Not saved to the note"));
  const note = await updatePeople(actor.leader.churchId, ["notes"], (b) => {
    if (!b.people.some((p) => p.id === personId)) fail("That person isn't in the directory.");
    const n = { id: newId("note"), personId, text: v.text, private: v.private, byId: actor.leader.leaderId, byName: actor.leader.name, at: Date.now() };
    b.notes.push(n);
    return n;
  });
  await log(actor.leader, "note", personId);
  return note;
}

export async function removeNote(actor: PeopleActor, id: string) {
  await updatePeople(actor.leader.churchId, ["notes"], (b) => {
    const n = b.notes.find((x) => x.id === id) ?? fail("That note is gone.");
    if (n.byId !== actor.leader.leaderId && !actor.privateNotes) fail("Only whoever wrote a note, or a pastor, removes it.");
    b.notes = b.notes.filter((x) => x.id !== id);
  });
  await log(actor.leader, "note.remove", id);
}

/* ---------- Custom fields ---------- */

export const FieldInput = z.object({ label: z.string().trim().min(1).max(40), kind: z.enum(FIELD_KINDS), options: z.array(z.string().trim().min(1).max(40)).max(20).optional() });

export async function addField(actor: PeopleActor, input: z.input<typeof FieldInput>) {
  needEdit(actor);
  const v = FieldInput.parse(input);
  if (v.kind === "choice" && (v.options?.length ?? 0) < 2) fail("A choice field needs at least two options.");
  const f = await updatePeople(actor.leader.churchId, ["fields"], (b) => {
    if (b.fields.some((x) => x.label.toLowerCase() === v.label.toLowerCase())) fail(`There's already a field called "${v.label}".`);
    const f = { id: newId("fld"), ...v, createdAt: Date.now() };
    b.fields.push(f);
    return f;
  });
  await log(actor.leader, "field.add", f.label);
  return f;
}

export async function removeField(actor: PeopleActor, id: string) {
  needEdit(actor);
  await updatePeople(actor.leader.churchId, ["fields", "people"], (b) => {
    b.fields = b.fields.filter((f) => f.id !== id);
    for (const p of b.people) delete p.custom[id];
  });
  await log(actor.leader, "field.remove", id);
}

/* ---------- What a viewer sees ---------- */

export type PersonView = ReturnType<typeof personView>;

/** One person as this viewer may see them: contacts for the people who follow up; notes by the care rules. */
export function personView(book: PeopleBook, actor: PeopleActor, p: PersonRecord) {
  const h = p.householdId ? book.households.find((x) => x.id === p.householdId) : undefined;
  return {
    id: p.id,
    name: displayName(p),
    firstName: p.firstName,
    lastName: p.lastName,
    nickname: p.nickname,
    status: p.status,
    membershipDate: p.membershipDate,
    language: p.language,
    household: h ? { id: h.id, name: h.name } : null,
    householdRole: p.householdRole,
    /** Their leadership role (Lead Pastor, Deacon, Worship Leader…), shown to everyone who can see the directory. */
    leadershipRole: p.custom[LEADERSHIP_FIELD_ID]?.trim() || undefined,
    birthday: p.birthdate ? p.birthdate.slice(5) : undefined,
    archived: Boolean(p.archivedAt),
    groups: book.groups.filter((g) => !g.archivedAt && g.memberIds.includes(p.id)).map((g) => ({ id: g.id, name: g.name, leader: g.leaderIds.includes(p.id) })),
    contact: actor.contacts ? { email: p.email, phone: p.phone, homePhone: p.homePhone, address: p.address, birthdate: p.birthdate, anniversary: p.anniversary } : null,
    custom: actor.contacts ? p.custom : {},
  };
}

export async function peopleFor(leader: Leader) {
  const [actor, book] = await Promise.all([peopleActor(leader), loadPeople(leader.churchId)]);
  return { actor, book };
}
