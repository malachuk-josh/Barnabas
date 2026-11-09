import { z } from "zod";
import type { Leader } from "../auth/session";
import { can } from "../auth/roles";
import { churchData } from "../chms";
import { config } from "../config";
import { today } from "../dates";
import { newId } from "../data/ids";
import { audit, listCare, saveDraft, type Draft } from "../data/records";
import { checkMemoryText } from "../policy/privacy";
import { getJSON, setJSON } from "../store";
import { getLeaderRecord } from "../team";
import { initialTasks, pickAssignee, thankYouText, visitTasks } from "./guests";
import { careKey, listRest, loadCare, resetCare, saveRest, updateCare } from "./store";
import { findMember, leaderMemberId, memberName, viewerFor } from "./team";
import {
  CASE_STATUSES,
  CASE_TYPES,
  CLASS_KINDS,
  CLASS_STEP,
  CONTACT_KINDS,
  GUEST_INTERESTS,
  PATHWAY_STEPS,
  type CareBook,
  type CareCase,
  type CaseType,
  type ContactKind,
  type GuestCard,
  type Pathway,
  type PrayerRequest,
  type TeamMember,
} from "./types";
import { canAssignCase, canCloseCase, canHoldCase, canSeeCase, canSeePrayer, canWorkCase, isMine, type Viewer } from "./visibility";

/**
 * Every change to care records goes through here: validated, permission-checked against the viewer,
 * policy-checked (no diagnoses or other sensitive details unless the church opts in), applied under the
 * church's lock, and written to the audit log.
 */

export class CareError extends Error {}

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-08.");
const Note = z.string().trim().max(400);

export type CareActor = { leader: Leader; viewer: Viewer; members: TeamMember[]; self: TeamMember };

/** The signed-in leader as a shepherding team member, with what they may see. */
export async function careActor(leader: Leader): Promise<CareActor> {
  const { viewer, members } = await viewerFor(leader);
  const self =
    members.find((m) => m.id === leaderMemberId(leader.leaderId)) ??
    ({ id: leaderMemberId(leader.leaderId), name: leader.name, title: leader.role, role: viewer.access.role, placeholder: false, connections: false, leaderId: leader.leaderId } satisfies TeamMember);
  return { leader, viewer, members: members.some((m) => m.id === self.id) ? members : [...members, self], self };
}

/** The church's memory policy, applied to every note, next step, summary and prayer request. */
export function noteProblem(text: string | undefined | null): string | null {
  if (!text?.trim()) return null;
  return checkMemoryText(text, { allowSensitive: config.allowSensitiveMemory });
}

function checkNote(...texts: (string | undefined | null)[]) {
  for (const t of texts) {
    const problem = noteProblem(t);
    if (problem) throw new CareError(problem);
  }
}

async function log(leader: Leader, action: string, detail: string, conversationId?: string) {
  await audit(leader, { action: `care.${action}`, detail: detail.slice(0, 300), conversationId });
}

function findCase(book: CareBook, id: string) {
  const c = book.cases.find((x) => x.id === id);
  if (!c) throw new CareError("That shepherding case doesn't exist anymore.");
  return c;
}

function member(actor: CareActor, id: string) {
  const m = actor.members.find((x) => x.id === id);
  if (!m) throw new CareError("Pick someone from the shepherding team.");
  return m;
}

const fail = (message: string): never => {
  throw new CareError(message);
};

/* ---------- Cases ---------- */

export const OpenCaseInput = z.object({
  personId: z.string().max(40).optional(),
  name: z.string().trim().max(100).optional(),
  household: z.boolean().optional(),
  type: z.enum(CASE_TYPES),
  confidential: z.boolean().default(false),
  /** A team member id, "me" (default) or "unassigned". */
  assignee: z.string().max(80).default("me"),
  summary: Note.optional(),
  nextStep: Note.optional(),
  due: ISO.optional(),
  contact: z.object({ kind: z.enum(CONTACT_KINDS), date: ISO, note: Note.optional() }).optional(),
});

export async function openCase(actor: CareActor, input: z.input<typeof OpenCaseInput>, source: CareCase["source"] = "app", conversationId?: string) {
  const v = OpenCaseInput.parse(input);
  checkNote(v.summary, v.nextStep, v.contact?.note);
  let subjectName = v.name?.trim() ?? "";
  if (v.personId) {
    const person = await churchData().getPerson(v.personId);
    if (!person) fail(`No one with id ${v.personId} is in the directory.`);
    subjectName = v.household && person!.household ? person!.household : person!.name;
  }
  if (!subjectName) fail("Who is this case for? Pick someone from the directory or type a name.");

  let assigneeId: string | undefined;
  if (v.assignee === "me") assigneeId = actor.self.id;
  else if (v.assignee !== "unassigned") {
    const m = member(actor, v.assignee);
    if (!isMine(actor.viewer, m.id) && !can(actor.viewer.access, "care.assign")) fail("Your role can open cases for yourself or hand them to the pastors, not assign them to someone else.");
    if (!canHoldCase(m, { confidential: v.confidential })) fail("A confidential case can only be assigned to a pastor.");
    assigneeId = m.id;
  }
  if (assigneeId === actor.self.id && !canHoldCase(actor.self, { confidential: v.confidential })) fail("Only pastors hold confidential cases. Leave it unassigned for the pastors, or assign it to one.");

  const now = Date.now();
  const c: CareCase = {
    id: newId("case"),
    subject: { kind: v.household ? "household" : "person", personId: v.personId, name: subjectName },
    type: v.type,
    status: v.contact ? "active" : assigneeId ? "assigned" : "new",
    confidential: v.confidential,
    assigneeId,
    summary: v.summary || undefined,
    nextStep: v.nextStep ? { text: v.nextStep, due: v.due } : undefined,
    contacts: v.contact ? [{ id: newId("ct"), kind: v.contact.kind, date: v.contact.date, byId: actor.self.id, byName: actor.self.name, note: v.contact.note || undefined, at: now }] : [],
    openedById: actor.self.id,
    openedByName: actor.self.name,
    openedAt: now,
    updatedAt: now,
    source,
  };
  await updateCare(actor.leader.churchId, ["cases"], (book) => {
    book.cases.push(c);
  });
  await log(actor.leader, "case.open", `${c.id} ${c.type}${c.confidential ? " confidential" : ""} -> ${assigneeId ?? "unassigned"}`, conversationId);
  return c;
}

export const ContactInput = z.object({
  kind: z.enum(CONTACT_KINDS),
  date: ISO,
  note: Note.optional(),
  nextStep: Note.optional(),
  due: ISO.optional(),
});

export async function logContact(actor: CareActor, caseId: string, input: z.input<typeof ContactInput>, conversationId?: string) {
  const v = ContactInput.parse(input);
  checkNote(v.note, v.nextStep);
  const result = await updateCare(actor.leader.churchId, ["cases"], (book) => {
    const c = findCase(book, caseId);
    if (!canWorkCase(actor.viewer, c)) fail("That case isn't one you can see.");
    if (c.status === "closed") fail("That case is closed. Reopen it to log a contact.");
    c.contacts.push({ id: newId("ct"), kind: v.kind, date: v.date, byId: actor.self.id, byName: actor.self.name, note: v.note || undefined, at: Date.now() });
    c.contacts.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
    if (v.nextStep) c.nextStep = { text: v.nextStep, due: v.due };
    c.status = v.nextStep ? "follow_up" : "active";
    c.updatedAt = Date.now();
    return c;
  });
  await log(actor.leader, "case.contact", `${caseId} ${v.kind}`, conversationId);
  return result;
}

export const UpdateCaseInput = z.object({
  status: z.enum(CASE_STATUSES).exclude(["closed"]).optional(),
  type: z.enum(CASE_TYPES).optional(),
  summary: Note.optional(),
  nextStep: Note.optional(),
  due: ISO.optional().or(z.literal("")),
  confidential: z.boolean().optional(),
});

export async function updateCase(actor: CareActor, caseId: string, input: z.input<typeof UpdateCaseInput>) {
  const v = UpdateCaseInput.parse(input);
  checkNote(v.summary, v.nextStep);
  const result = await updateCare(actor.leader.churchId, ["cases"], (book) => {
    const c = findCase(book, caseId);
    if (!canWorkCase(actor.viewer, c)) fail("That case isn't one you can see.");
    if (c.status === "closed") fail("That case is closed. Reopen it first.");
    if (v.confidential !== undefined && v.confidential !== c.confidential) {
      if (actor.viewer.access.role !== "pastor") fail("Only a pastor can change whether a case is confidential.");
      if (v.confidential && c.assigneeId) {
        const holder = findMember(actor.members, c.assigneeId);
        if (holder && !canHoldCase(holder, { confidential: true })) fail("Assign it to a pastor before marking it confidential.");
      }
      c.confidential = v.confidential;
    }
    if (v.status) c.status = v.status;
    if (v.type) c.type = v.type;
    if (v.summary !== undefined) c.summary = v.summary || undefined;
    if (v.nextStep !== undefined) c.nextStep = v.nextStep ? { text: v.nextStep, due: v.due || undefined } : undefined;
    else if (v.due !== undefined && c.nextStep) c.nextStep.due = v.due || undefined;
    c.updatedAt = Date.now();
    return c;
  });
  await log(actor.leader, "case.update", `${caseId} ${Object.keys(v).join(",")}`);
  return result;
}

/** Assign to a team member (or null for the pastors' queue). Giving a case to someone else needs care.assign. */
export async function assignCase(actor: CareActor, caseId: string, assigneeId: string | null, conversationId?: string) {
  const result = await updateCare(actor.leader.churchId, ["cases"], (book) => {
    const c = findCase(book, caseId);
    if (!canSeeCase(actor.viewer, c)) fail("That case isn't one you can see.");
    if (c.status === "closed") fail("That case is closed.");
    const toSelf = assigneeId !== null && isMine(actor.viewer, assigneeId);
    if (!toSelf && !canAssignCase(actor.viewer, c)) fail("Your role can't assign shepherding cases to someone else. A pastor or deacon can.");
    if (assigneeId) {
      const m = member(actor, assigneeId);
      if (!canHoldCase(m, c)) fail("A confidential case can only be assigned to a pastor.");
    }
    c.assigneeId = assigneeId ?? undefined;
    if (c.status === "new" && assigneeId) c.status = "assigned";
    if (!assigneeId) c.status = "new";
    c.updatedAt = Date.now();
    return c;
  });
  await log(actor.leader, "case.assign", `${caseId} -> ${assigneeId ?? "unassigned"}`, conversationId);
  return result;
}

export async function closeCase(actor: CareActor, caseId: string, note?: string, conversationId?: string) {
  const closing = Note.optional().parse(note);
  checkNote(closing);
  const result = await updateCare(actor.leader.churchId, ["cases"], (book) => {
    const c = findCase(book, caseId);
    if (!canCloseCase(actor.viewer, c)) fail("Only whoever holds the case, or a pastor or deacon, can close it.");
    if (c.status === "closed") fail("That case is already closed.");
    c.status = "closed";
    c.closedAt = Date.now();
    c.closedNote = closing || undefined;
    c.updatedAt = Date.now();
    return c;
  });
  await log(actor.leader, "case.close", caseId, conversationId);
  return result;
}

export async function reopenCase(actor: CareActor, caseId: string) {
  const result = await updateCare(actor.leader.churchId, ["cases"], (book) => {
    const c = findCase(book, caseId);
    if (!canCloseCase(actor.viewer, c)) fail("Only whoever held the case, or a pastor or deacon, can reopen it.");
    c.status = c.contacts.length ? "active" : c.assigneeId ? "assigned" : "new";
    c.closedAt = undefined;
    c.updatedAt = Date.now();
    return c;
  });
  await log(actor.leader, "case.reopen", caseId);
  return result;
}

/* ---------- Compatibility: log_care_event and older care records ---------- */

const LEGACY_TYPE: Record<string, CaseType> = { hospital: "hospital", prayer: "prayer" };
const LEGACY_CONTACT: Record<string, ContactKind | undefined> = { visit: "visit", call: "call", text: "text", hospital: "visit", prayer: undefined, other: undefined };

/**
 * The old `log_care_event` shape: one contact with an optional follow-up. It now lands on the person's
 * open case held by this leader, or opens one.
 */
export async function logCareEvent(
  actor: CareActor,
  input: { personId: string; kind: "visit" | "call" | "hospital" | "prayer" | "text" | "other"; followUp?: string; due?: string },
  conversationId?: string,
) {
  checkNote(input.followUp);
  const book = await loadCare(actor.leader.churchId);
  const existing = book.cases.find((c) => c.status !== "closed" && c.subject.personId === input.personId && isMine(actor.viewer, c.assigneeId));
  const contactKind = LEGACY_CONTACT[input.kind];
  const date = today();
  if (existing) {
    if (contactKind) return logContact(actor, existing.id, { kind: contactKind, date, nextStep: input.followUp, due: input.due }, conversationId);
    if (input.followUp) return updateCase(actor, existing.id, { nextStep: input.followUp, due: input.due });
    return existing;
  }
  return openCase(
    actor,
    {
      personId: input.personId,
      type: LEGACY_TYPE[input.kind] ?? "other",
      assignee: "me",
      nextStep: input.followUp,
      due: input.due,
      contact: contactKind ? { kind: contactKind, date } : undefined,
    },
    "barnabas",
    conversationId,
  );
}

/** Folds this leader's older `log_care_event` records into cases, once each. The old records are left in place. */
export async function absorbLegacyCare(leader: Leader) {
  const events = await listCare(leader);
  if (!events.length) return 0;
  const doneKey = careKey(leader.churchId, `legacy:${leader.leaderId}`);
  const done = new Set((await getJSON<string[]>(doneKey)) ?? []);
  const fresh = events.filter((e) => !done.has(e.id));
  if (!fresh.length) return 0;
  const self = leaderMemberId(leader.leaderId);
  await updateCare(leader.churchId, ["cases"], (book) => {
    for (const e of fresh) {
      if (book.cases.some((c) => c.legacyId === e.id)) continue;
      const kind = LEGACY_CONTACT[e.kind];
      const date = new Date(e.createdAt).toISOString().slice(0, 10);
      book.cases.push({
        id: newId("case"),
        subject: { kind: "person", personId: e.personId, name: e.personName },
        type: LEGACY_TYPE[e.kind] ?? "other",
        status: e.done ? "closed" : e.followUp ? "follow_up" : kind ? "active" : "assigned",
        confidential: false,
        assigneeId: self,
        nextStep: e.followUp ? { text: e.followUp, due: e.due } : undefined,
        contacts: kind ? [{ id: newId("ct"), kind, date, byId: self, byName: leader.name, at: e.createdAt }] : [],
        openedById: self,
        openedByName: leader.name,
        openedAt: e.createdAt,
        updatedAt: e.createdAt,
        closedAt: e.done ? e.createdAt : undefined,
        source: "legacy",
        legacyId: e.id,
      });
    }
  });
  await setJSON(doneKey, [...done, ...fresh.map((e) => e.id)].slice(-1000));
  await log(leader, "legacy.absorb", `${fresh.length} earlier care records`);
  return fresh.length;
}

/* ---------- Prayer requests ---------- */

export const PrayerInput = z.object({
  personId: z.string().max(40).optional(),
  name: z.string().trim().max(100).optional(),
  request: z.string().trim().min(3).max(500),
  shareable: z.boolean().default(false),
});

export async function addPrayer(actor: CareActor, input: z.input<typeof PrayerInput>, conversationId?: string) {
  const v = PrayerInput.parse(input);
  checkNote(v.request);
  let name = v.name?.trim() ?? "";
  if (v.personId) {
    const p = await churchData().getPerson(v.personId);
    if (!p) fail(`No one with id ${v.personId} is in the directory.`);
    name = p!.name;
  }
  if (!name) fail("Who is the request for?");
  const prayer: PrayerRequest = {
    id: newId("pr"),
    personId: v.personId,
    name,
    request: v.request,
    shareable: v.shareable,
    prayedCount: 0,
    prayedBy: [],
    createdById: actor.self.id,
    createdByName: actor.self.name,
    createdAt: Date.now(),
  };
  await updateCare(actor.leader.churchId, ["prayers"], (book) => {
    book.prayers.push(prayer);
  });
  await log(actor.leader, "prayer.add", `${prayer.id}${v.shareable ? " shareable" : " private"}`, conversationId);
  return prayer;
}

export async function prayedFor(actor: CareActor, id: string) {
  const result = await updateCare(actor.leader.churchId, ["prayers"], (book) => {
    const p = book.prayers.find((x) => x.id === id) ?? fail("That prayer request doesn't exist anymore.");
    if (!canSeePrayer(actor.viewer, p)) fail("That request isn't one you can see.");
    p.prayedCount += 1;
    if (!p.prayedBy.includes(actor.self.id)) p.prayedBy.push(actor.self.id);
    return p;
  });
  await log(actor.leader, "prayer.prayed", id);
  return result;
}

export async function answerPrayer(actor: CareActor, id: string, date: string, note?: string) {
  ISO.parse(date);
  const text = Note.optional().parse(note);
  checkNote(text);
  const result = await updateCare(actor.leader.churchId, ["prayers"], (book) => {
    const p = book.prayers.find((x) => x.id === id) ?? fail("That prayer request doesn't exist anymore.");
    if (!canSeePrayer(actor.viewer, p)) fail("That request isn't one you can see.");
    p.answered = { date, note: text || undefined };
    return p;
  });
  await log(actor.leader, "prayer.answered", id);
  return result;
}

/* ---------- Discipleship pathway and classes ---------- */

function needAssign(actor: CareActor) {
  if (!can(actor.viewer.access, "care.assign")) fail("Pastors, deacons and staff keep the pathway and classes. Ask one of them to update it.");
}

function pathwayFor(book: CareBook, key: string, name: string, ids: { personId?: string; guestId?: string }) {
  let p = book.pathways.find((x) => x.key === key);
  if (!p) {
    p = { key, name, ...ids, steps: {}, updatedAt: Date.now() };
    book.pathways.push(p);
  }
  return p;
}

async function resolvePathwayKey(book: CareBook, key: string): Promise<{ name: string; personId?: string; guestId?: string }> {
  const existing = book.pathways.find((p) => p.key === key);
  if (existing) return existing;
  const guest = book.guests.find((g) => g.id === key);
  if (guest) return { name: guest.name, guestId: guest.id };
  const person = await churchData().getPerson(key);
  if (person) return { name: person.name, personId: person.id };
  return fail("Pick someone from the directory or a guest card.");
}

export const StepInput = z.object({ key: z.string().min(1).max(60), step: z.enum(PATHWAY_STEPS), date: ISO.nullable() });

export async function setPathwayStep(actor: CareActor, input: z.input<typeof StepInput>) {
  needAssign(actor);
  const v = StepInput.parse(input);
  const book = await loadCare(actor.leader.churchId);
  const who = await resolvePathwayKey(book, v.key);
  const result = await updateCare(actor.leader.churchId, ["pathways"], (b) => {
    const p = pathwayFor(b, v.key, who.name, { personId: who.personId, guestId: who.guestId });
    if (v.date) p.steps[v.step] = v.date;
    else delete p.steps[v.step];
    p.updatedAt = Date.now();
    return p;
  });
  await log(actor.leader, "pathway.step", `${v.key} ${v.step} ${v.date ?? "cleared"}`);
  return result;
}

export const ClassInput = z.object({
  kind: z.enum(CLASS_KINDS),
  name: z.string().trim().min(1).max(80),
  teacherId: z.string().max(80).optional(),
  sessions: z.array(z.object({ date: ISO, time: z.string().max(20).optional(), topic: z.string().trim().min(1).max(120) })).min(1).max(12),
});

export async function addClass(actor: CareActor, input: z.input<typeof ClassInput>) {
  needAssign(actor);
  const v = ClassInput.parse(input);
  const cls = {
    id: newId("class"),
    kind: v.kind,
    name: v.name,
    teacherId: v.teacherId ? member(actor, v.teacherId).id : undefined,
    teacherName: v.teacherId ? member(actor, v.teacherId).name : undefined,
    sessions: v.sessions.map((s) => ({ id: newId("ses"), ...s })).sort((a, b) => a.date.localeCompare(b.date)),
    enrollees: [],
    attendance: {},
    createdAt: Date.now(),
  };
  await updateCare(actor.leader.churchId, ["classes"], (book) => {
    book.classes.push(cls);
  });
  await log(actor.leader, "class.add", `${cls.id} ${v.kind}`);
  return cls;
}

export async function enroll(actor: CareActor, classId: string, key: string) {
  needAssign(actor);
  const book = await loadCare(actor.leader.churchId);
  const who = await resolvePathwayKey(book, key);
  const result = await updateCare(actor.leader.churchId, ["classes", "pathways"], (b) => {
    const cls = b.classes.find((c) => c.id === classId) ?? fail("That class doesn't exist anymore.");
    if (cls.enrollees.some((e) => e.key === key)) fail(`${who.name} is already enrolled.`);
    cls.enrollees.push({ key, name: who.name, enrolledAt: today() });
    pathwayFor(b, key, who.name, { personId: who.personId, guestId: who.guestId });
    return cls;
  });
  await log(actor.leader, "class.enroll", `${classId} ${key}`);
  return result;
}

export async function markAttendance(actor: CareActor, classId: string, sessionId: string, key: string, present: boolean) {
  needAssign(actor);
  const result = await updateCare(actor.leader.churchId, ["classes"], (b) => {
    const cls = b.classes.find((c) => c.id === classId) ?? fail("That class doesn't exist anymore.");
    if (!cls.sessions.some((s) => s.id === sessionId)) fail("That session isn't part of the class.");
    if (!cls.enrollees.some((e) => e.key === key)) fail("Enroll them first.");
    const list = new Set(cls.attendance[sessionId] ?? []);
    if (present) list.add(key);
    else list.delete(key);
    cls.attendance[sessionId] = [...list];
    return cls;
  });
  await log(actor.leader, "class.attendance", `${classId} ${sessionId} ${key} ${present ? "present" : "absent"}`);
  return result;
}

/** Marks an enrollee as having finished the class, which records that pathway step. */
export async function completeClass(actor: CareActor, classId: string, key: string, date: string) {
  needAssign(actor);
  ISO.parse(date);
  const result = await updateCare(actor.leader.churchId, ["classes", "pathways"], (b) => {
    const cls = b.classes.find((c) => c.id === classId) ?? fail("That class doesn't exist anymore.");
    const e = cls.enrollees.find((x) => x.key === key) ?? fail("They aren't enrolled in this class.");
    e.completedAt = date;
    const p = pathwayFor(b, key, e.name, {});
    p.steps[CLASS_STEP[cls.kind]] = date;
    p.updatedAt = Date.now();
    return cls;
  });
  await log(actor.leader, "class.complete", `${classId} ${key}`);
  return result;
}

/* ---------- Guests ---------- */

export const GuestInput = z.object({
  name: z.string().trim().min(1, "Add a name.").max(100),
  email: z.string().trim().email("Check the email address.").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).regex(/^[0-9 ()+.\-]*$/, "Use digits for the phone number.").optional(),
  howHeard: z.string().trim().max(200).optional(),
  kidsAges: z.string().trim().max(100).optional(),
  prayerRequest: z.string().trim().max(500).optional(),
  prayerShareable: z.boolean().optional(),
  interests: z.array(z.enum(GUEST_INTERESTS)).max(GUEST_INTERESTS.length).default([]),
  visitDate: ISO.optional(),
});

type DraftOwner = { leader: Leader; memberId: string } | null;

async function leaderFor(churchId: string, m: TeamMember | undefined): Promise<DraftOwner> {
  if (!m?.leaderId) return null;
  const r = await getLeaderRecord(churchId, m.leaderId);
  return r ? { leader: { churchId, leaderId: r.leaderId, name: r.name, email: r.email, role: r.role }, memberId: m.id } : null;
}

/**
 * Records a guest card and makes its follow-up tasks: a thank-you drafted into a leader's review queue
 * (nothing is sent), a welcome call, and after a second visit a Discover Faith invitation.
 * `actor` is null when a guest fills in the public form themselves.
 */
export async function recordGuest(
  churchId: string,
  actor: CareActor | null,
  input: z.input<typeof GuestInput>,
  members: TeamMember[],
  conversationId?: string,
) {
  const v = GuestInput.parse(input);
  for (const t of [v.howHeard, v.kidsAges]) {
    const p = noteProblem(t);
    if (p) fail(p);
  }
  if (v.prayerRequest && noteProblem(v.prayerRequest)) {
    fail(
      actor
        ? (noteProblem(v.prayerRequest) as string)
        : "To protect your privacy, we don't keep health, family or money details online. Write something short like \"for my family\", and a pastor will be glad to talk with you in person.",
    );
  }
  const now = Date.now();
  const visit = v.visitDate ?? today();
  const book = await loadCare(churchId);
  const { member: assignee, next } = pickAssignee(members, book.rotation);
  if (!assignee) fail("There's no one on the shepherding team to follow up yet.");

  // The thank-you draft goes to whoever follows up, if they've signed in; otherwise to the leader recording it,
  // otherwise to a signed-in pastor.
  const owner =
    (await leaderFor(churchId, assignee!)) ??
    (actor ? { leader: actor.leader, memberId: actor.self.id } : null) ??
    (await leaderFor(churchId, members.find((m) => m.role === "pastor" && !m.placeholder)));

  const card: GuestCard = {
    id: newId("guest"),
    name: v.name,
    email: v.email || undefined,
    phone: v.phone || undefined,
    howHeard: v.howHeard || undefined,
    kidsAges: v.kidsAges || undefined,
    interests: v.interests,
    visits: [visit],
    assigneeId: assignee!.id,
    tasks: [],
    source: actor ? "leader" : "self",
    createdById: actor?.self.id,
    createdAt: now,
  };
  card.tasks = initialTasks(card, assignee!.id, now);
  const thanks = card.tasks.find((t) => t.kind === "thank_you")!;
  thanks.draftText = thankYouText(card, config.churchName, owner?.leader.name ?? assignee!.name);

  let prayer: PrayerRequest | undefined;
  if (v.prayerRequest) {
    prayer = {
      id: newId("pr"),
      name: v.name,
      request: v.prayerRequest,
      shareable: Boolean(v.prayerShareable),
      prayedCount: 0,
      prayedBy: [],
      createdById: actor?.self.id ?? assignee!.id,
      createdByName: actor?.self.name ?? `${v.name} (guest card)`,
      createdAt: now,
      guestId: card.id,
    };
    card.prayerRequestId = prayer.id;
  }

  if (owner && (card.email || card.phone)) {
    const draft: Draft = {
      id: newId("draft"),
      leaderId: owner.leader.leaderId,
      conversationId: conversationId ?? `guest:${card.id}`,
      channel: card.phone ? "sms" : "email",
      kind: "care",
      subject: card.phone ? undefined : "Thank you for visiting",
      baseText: thanks.draftText,
      recipients: [{ personId: card.id, name: card.name, language: "en", text: thanks.draftText, phone: card.phone, email: card.email }],
      status: "needs_review",
      createdAt: now,
    };
    await saveDraft(owner.leader, draft);
    thanks.draftId = draft.id;
    thanks.draftOwnerId = owner.memberId;
    await audit(owner.leader, { action: "draft.create", detail: `${draft.id} thank-you to guest ${card.id}`, conversationId });
  }

  await updateCare(churchId, ["guests", "pathways", "prayers", "rotation"], (b) => {
    b.guests.push(card);
    b.rotation = next;
    if (prayer) b.prayers.push(prayer);
    const p: Pathway = { key: card.id, guestId: card.id, name: card.name, steps: { first_visit: visit }, visits: 1, updatedAt: now };
    b.pathways.push(p);
  });
  const auditor = actor?.leader ?? owner?.leader;
  if (auditor) await audit(auditor, { action: actor ? "care.guest.record" : "care.guest.self_record", detail: `${card.id} -> ${assignee!.id}`, conversationId });
  return card;
}

/** Records another Sunday visit. A second visit moves them along: ready for Discover Faith, with an invite task. */
export async function recordVisit(actor: CareActor, guestId: string, date: string) {
  ISO.parse(date);
  const result = await updateCare(actor.leader.churchId, ["guests", "pathways"], (b) => {
    const g = b.guests.find((x) => x.id === guestId) ?? fail("That guest card doesn't exist anymore.");
    if (g.visits.includes(date)) fail(`A visit on ${date} is already recorded.`);
    g.visits = [...g.visits, date].sort();
    g.tasks.push(...visitTasks(g, g.assigneeId, Date.now()));
    const p = pathwayFor(b, g.id, g.name, { guestId: g.id });
    p.visits = g.visits.length;
    p.steps.first_visit ??= g.visits[0];
    p.updatedAt = Date.now();
    return g;
  });
  await log(actor.leader, "guest.visit", `${guestId} ${date}`);
  return result;
}

export async function completeGuestTask(actor: CareActor, guestId: string, taskId: string) {
  const result = await updateCare(actor.leader.churchId, ["guests"], (b) => {
    const g = b.guests.find((x) => x.id === guestId) ?? fail("That guest card doesn't exist anymore.");
    const t = g.tasks.find((x) => x.id === taskId) ?? fail("That task doesn't exist anymore.");
    if (!isMine(actor.viewer, t.assigneeId) && !can(actor.viewer.access, "care.assign")) fail("This task belongs to someone else.");
    t.doneAt = Date.now();
    t.doneById = actor.self.id;
    if (t.kind === "thank_you" || t.kind === "call") g.contactedAt ??= t.doneAt;
    return g;
  });
  await log(actor.leader, "guest.task", `${guestId} ${taskId}`);
  return result;
}

export async function reassignGuest(actor: CareActor, guestId: string, assigneeId: string) {
  if (!can(actor.viewer.access, "care.assign")) fail("Your role can't reassign guest follow-up.");
  const m = member(actor, assigneeId);
  const result = await updateCare(actor.leader.churchId, ["guests"], (b) => {
    const g = b.guests.find((x) => x.id === guestId) ?? fail("That guest card doesn't exist anymore.");
    g.assigneeId = m.id;
    for (const t of g.tasks) if (!t.doneAt) t.assigneeId = m.id;
    return g;
  });
  await log(actor.leader, "guest.assign", `${guestId} -> ${m.id}`);
  return result;
}

/** Makes the thank-you draft for a guest task that has none yet, in this leader's review queue. */
export async function draftThankYou(actor: CareActor, guestId: string, taskId: string) {
  const book = await loadCare(actor.leader.churchId);
  const g = book.guests.find((x) => x.id === guestId) ?? fail("That guest card doesn't exist anymore.");
  const t = g.tasks.find((x) => x.id === taskId && x.kind === "thank_you") ?? fail("That isn't a thank-you task.");
  if (t.draftId) fail("There's already a draft for this. It's in Drafts.");
  if (!g.email && !g.phone) fail("Add a phone number or email to the guest card first.");
  const text = thankYouText(g, config.churchName, actor.self.name);
  const draft: Draft = {
    id: newId("draft"),
    leaderId: actor.leader.leaderId,
    conversationId: `guest:${g.id}`,
    channel: g.phone ? "sms" : "email",
    kind: "care",
    subject: g.phone ? undefined : "Thank you for visiting",
    baseText: text,
    recipients: [{ personId: g.id, name: g.name, language: "en", text, phone: g.phone, email: g.email }],
    status: "needs_review",
    createdAt: Date.now(),
  };
  await saveDraft(actor.leader, draft);
  await updateCare(actor.leader.churchId, ["guests"], (b) => {
    const task = b.guests.find((x) => x.id === guestId)?.tasks.find((x) => x.id === taskId);
    if (task) {
      task.draftId = draft.id;
      task.draftOwnerId = actor.self.id;
      task.draftText = text;
    }
  });
  await log(actor.leader, "guest.draft", `${guestId} ${draft.id}`);
  return draft;
}

/* ---------- Rest (private) ---------- */

export async function logDayOff(leader: Leader, date: string, note?: string) {
  ISO.parse(date);
  if (date > today()) fail("Log a day off on the day, or after. To plan one, add a Rest / sabbath event to your calendar.");
  const text = Note.optional().parse(note);
  checkNote(text);
  const days = await listRest(leader.churchId, leader.leaderId);
  if (days.some((d) => d.date === date)) fail("That day is already logged.");
  await saveRest(leader.churchId, leader.leaderId, [...days, { date, note: text || undefined, at: Date.now() }]);
  await log(leader, "rest.log", date);
}

export async function removeDayOff(leader: Leader, date: string) {
  const days = await listRest(leader.churchId, leader.leaderId);
  await saveRest(leader.churchId, leader.leaderId, days.filter((d) => d.date !== date));
  await log(leader, "rest.remove", date);
}

/* ---------- Demo ---------- */

export async function clearDemoCare(actor: CareActor) {
  if (!can(actor.viewer.access, "care.view_all")) fail("Only a pastor can clear the demo care data.");
  const book = await loadCare(actor.leader.churchId);
  if (!book.meta.demo) fail("There's no demo care data to clear.");
  await resetCare(actor.leader.churchId);
  // Seeded days off are cleared from the pastor's own log too; logged ones stay.
  const days = await listRest(actor.leader.churchId, actor.leader.leaderId);
  await saveRest(actor.leader.churchId, actor.leader.leaderId, days.filter((d) => !d.demo));
  await log(actor.leader, "demo.clear", "Cleared demo care data");
}

export { memberName };
