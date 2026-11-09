import { bookStore } from "../store/book";
import type { PeopleBook } from "./types";

/**
 * Redis layout, per church:
 *   ppl:{church}:meta, people, households, groups, attendance, notes, fields, imports
 * Every church starts empty: the demo church has no made-up congregation, so the directory falls back to
 * its published leaders (the demo adapter) until real people are added or imported.
 */
export const PARTS = ["meta", "people", "households", "groups", "attendance", "notes", "fields", "imports"] as const;

export const emptyPeople = (): PeopleBook => ({ meta: { demo: false, createdAt: Date.now() }, people: [], households: [], groups: [], attendance: [], notes: [], fields: [], imports: [] });

const store = bookStore<PeopleBook>({ prefix: "ppl", parts: PARTS, empty: emptyPeople });

export const loadPeople = store.load;
export const updatePeople = store.update;
