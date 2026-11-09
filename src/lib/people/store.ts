import { DemoChurch } from "../chms/demo";
import { bookStore } from "../store/book";
import type { PeopleBook, PersonRecord } from "./types";

/**
 * Redis layout, per church:
 *   ppl:{church}:meta, people, households, groups, attendance, notes, fields, imports
 * Every church starts empty: the demo church has no made-up congregation, so the directory falls back to
 * its published leaders (the demo adapter) until real people are added or imported.
 */
export const PARTS = ["meta", "people", "households", "groups", "attendance", "notes", "fields", "imports"] as const;

export const emptyPeople = (): PeopleBook => ({ meta: { demo: false, createdAt: Date.now() }, people: [], households: [], groups: [], attendance: [], notes: [], fields: [], imports: [] });

const store = bookStore<PeopleBook>({ prefix: "ppl", parts: PARTS, empty: emptyPeople });

/** The ids the Serve rosters already use for the leaders who serve, so those links keep working. */
const LEADER_IDS: Record<string, string> = { "Aaron Malachuk": "p19", "Travis Willette": "p20", "Micah Hayre": "p21" };
export const LEADERSHIP_FIELD_ID = "fld-leadership-role";
export const LEADERSHIP_GROUP_ID = "grp-leadership";

const slugOf = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Puts the church's published leadership team in the directory, once: names and their leadership role
 * only (no contact details or anything else made up), plus a "Leadership team" group. A leader already in
 * the directory under the same name is marked as leadership instead of added again. If the church later
 * archives or removes them, they aren't added back.
 */
export function addLeadership(book: PeopleBook, leaders: { name: string; title: string }[], now = Date.now()): boolean {
  if (book.meta.leadersAddedAt || !leaders.length) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const ids: string[] = [];
  if (!book.fields.some((f) => f.id === LEADERSHIP_FIELD_ID)) {
    book.fields.push({ id: LEADERSHIP_FIELD_ID, label: "Leadership role", kind: "text", createdAt: now });
  }
  for (const l of leaders) {
    const parts = l.name.trim().split(/\s+/);
    const firstName = parts[0]!;
    const lastName = parts.slice(1).join(" ");
    const existing = book.people.find((p) => norm(`${p.firstName} ${p.lastName}`) === norm(l.name));
    if (existing) {
      existing.leadership = true;
      existing.custom = { ...existing.custom, [LEADERSHIP_FIELD_ID]: existing.custom[LEADERSHIP_FIELD_ID] || l.title };
      existing.updatedAt = now;
      ids.push(existing.id);
      continue;
    }
    const id = LEADER_IDS[l.name] ?? `ldr-${slugOf(l.name)}`;
    if (book.people.some((p) => p.id === id)) continue;
    const person: PersonRecord = { id, firstName, lastName, status: "member", language: "en", leadership: true, custom: { [LEADERSHIP_FIELD_ID]: l.title }, createdAt: now, updatedAt: now };
    book.people.push(person);
    ids.push(id);
  }
  if (!book.groups.some((g) => g.id === LEADERSHIP_GROUP_ID)) {
    book.groups.push({ id: LEADERSHIP_GROUP_ID, name: "Leadership team", kind: "ministry", description: "The church's pastors, deacons and worship leaders", leaderIds: [], memberIds: ids, createdAt: now });
  }
  book.meta.leadersAddedAt = now;
  return true;
}

/** The church's People database, with its published leaders added the first time it's opened. */
export async function loadPeople(church: string): Promise<PeopleBook> {
  const book = await store.load(church);
  if (book.meta.leadersAddedAt || process.env.BARNABAS_SKIP_LEADER_SEED === "1") return book;
  const leaders = await new DemoChurch().leadership();
  return store.update(church, ["meta", "people", "groups", "fields"], (b) => {
    addLeadership(b, leaders);
    return b;
  });
}
export const updatePeople = store.update;
