import { DemoChurch } from "../chms/demo";
import type { AttendanceRecord, ChurchData, Person } from "../chms/types";
import type { PeopleBook, PersonRecord } from "./types";

/** "Sam" for Samuel with a nickname, the full display name otherwise. */
export const firstNameOf = (p: Pick<PersonRecord, "firstName" | "nickname">) => p.nickname?.trim() || p.firstName;
export const displayName = (p: Pick<PersonRecord, "firstName" | "lastName" | "nickname">) => [firstNameOf(p), p.lastName].filter(Boolean).join(" ").trim();

export const isActive = (p: PersonRecord) => !p.archivedAt && !p.mergedInto;

/** Follows merges, so a shepherding case or a gift that pointed at a duplicate finds the person it was merged into. */
export function resolvePerson(book: PeopleBook, id: string): PersonRecord | null {
  let p = book.people.find((x) => x.id === id) ?? null;
  for (let i = 0; p?.mergedInto && i < 10; i++) p = book.people.find((x) => x.id === p!.mergedInto) ?? p;
  return p;
}

export function toPerson(book: PeopleBook, p: PersonRecord): Person {
  const household = p.householdId ? book.households.find((h) => h.id === p.householdId) : undefined;
  const group = book.groups.find((g) => !g.archivedAt && g.kind === "small_group" && g.memberIds.includes(p.id));
  return {
    id: p.id,
    name: displayName(p),
    firstName: firstNameOf(p),
    household: household?.name,
    language: p.language,
    phone: p.phone,
    email: p.email,
    smallGroup: group?.name,
    leadership: p.leadership || undefined,
  };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The native adapter: Barnabas's own People database as the church's ChurchData. Care, Serve, the radar,
 * Finance donors and every Barnabas tool read these people. Serving comes from Serve's rosters (which the
 * radar merges in); leadership and the weekly schedule stay as the church published them.
 */
export class NativeChurch implements ChurchData {
  readonly source = "native";
  constructor(private readonly book: PeopleBook, private readonly base: ChurchData = new DemoChurch()) {}

  leadership() {
    return this.base.leadership();
  }
  async listPeople() {
    return this.book.people.filter(isActive).map((p) => toPerson(this.book, p));
  }
  async getPerson(id: string) {
    const p = resolvePerson(this.book, id);
    return p ? toPerson(this.book, p) : null;
  }
  async findPeople(query: string) {
    const words = norm(query.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return this.book.people.filter((p) => isActive(p) && words.every((w) => norm(`${displayName(p)} ${p.firstName}`).includes(w))).map((p) => toPerson(this.book, p));
  }
  teams() {
    return this.base.teams();
  }
  async serving() {
    return [];
  }
  async attendance(sinceISO: string): Promise<AttendanceRecord[]> {
    return this.book.attendance.filter((a) => a.date >= sinceISO).map((a) => ({ personId: resolvePerson(this.book, a.personId)?.id ?? a.personId, date: a.date, kind: a.kind, present: a.present }));
  }
  async rosters() {
    return [];
  }
  events(fromISO: string, toISO: string) {
    return this.base.events(fromISO, toISO);
  }
}
