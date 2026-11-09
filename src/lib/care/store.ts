import { config } from "../config";
import { getJSON, setJSON, withLock } from "../store";
import type { CareBook, CareMeta, RestDay } from "./types";

/**
 * Redis layout, per church:
 *   pcare:{church}:meta         CareMeta (demo flag)
 *   pcare:{church}:cases        shepherding cases with their contact timelines
 *   pcare:{church}:prayers      prayer requests
 *   pcare:{church}:pathways     discipleship pathway per person or guest
 *   pcare:{church}:classes      Discover Faith and membership classes
 *   pcare:{church}:guests       guest cards and their follow-up tasks
 *   pcare:{church}:links        public guest-card links
 *   pcare:{church}:rotation     guest follow-up rotation index
 *   pcare:{church}:rest:{id}    one leader's days off (private to them)
 *   pcare:{church}:legacy:{id}  log_care_event records already folded into cases
 *   welcome:{sha256(token)}     public link lookup -> { churchId, linkId }
 */
export const careKey = (church: string, part: string) => `pcare:${church}:${part}`;

export type CarePart = "meta" | "cases" | "prayers" | "pathways" | "classes" | "guests" | "links" | "rotation";
const LIST_PARTS = ["cases", "prayers", "pathways", "classes", "guests", "links"] as const;
export const ALL_CARE_PARTS: CarePart[] = ["meta", ...LIST_PARTS, "rotation"];

export function emptyCareBook(): CareBook {
  return { meta: { demo: false, createdAt: Date.now() }, cases: [], prayers: [], pathways: [], classes: [], guests: [], links: [], rotation: 0 };
}

async function readBook(church: string): Promise<CareBook | null> {
  const meta = await getJSON<CareMeta>(careKey(church, "meta"));
  if (!meta) return null;
  const [cases, prayers, pathways, classes, guests, links, rotation] = await Promise.all([
    ...LIST_PARTS.map((p) => getJSON<unknown[]>(careKey(church, p))),
    getJSON<number>(careKey(church, "rotation")),
  ]);
  return {
    meta,
    cases: (cases ?? []) as CareBook["cases"],
    prayers: (prayers ?? []) as CareBook["prayers"],
    pathways: (pathways ?? []) as CareBook["pathways"],
    classes: (classes ?? []) as CareBook["classes"],
    guests: (guests ?? []) as CareBook["guests"],
    links: (links ?? []) as CareBook["links"],
    rotation: typeof rotation === "number" ? rotation : 0,
  };
}

async function writeParts(church: string, book: CareBook, parts: CarePart[]) {
  await Promise.all(parts.map((p) => setJSON(careKey(church, p), book[p])));
}

/**
 * The church's care records. The demo church gets a labeled demo dataset the first time Care is
 * opened, only while it has no care records at all. `seed` builds it (kept separate so tests and the
 * store don't pull in the demo module's church lookups unless needed).
 */
export async function loadCare(church: string): Promise<CareBook> {
  const existing = await readBook(church);
  if (existing) return existing;
  return withLock(careKey(church, "seed-lock"), async () => {
    const again = await readBook(church);
    if (again) return again;
    let book = emptyCareBook();
    if (church === config.churchId) {
      const { seedDemoCare } = await import("./demo");
      book = await seedDemoCare(church);
    }
    await writeParts(church, book, ALL_CARE_PARTS);
    return book;
  }, 30_000);
}

/** Change the records under a per-church lock; `fn` mutates the book and the named parts are saved. */
export async function updateCare<T>(church: string, parts: CarePart[], fn: (book: CareBook) => T | Promise<T>): Promise<T> {
  await loadCare(church);
  return withLock(careKey(church, "lock"), async () => {
    const book = (await readBook(church))!;
    const result = await fn(book);
    await writeParts(church, book, parts);
    return result;
  });
}

/** Removes every shared care record (not leaders' private rest logs) and starts empty. */
export async function resetCare(church: string): Promise<CareBook> {
  return withLock(careKey(church, "lock"), async () => {
    const book = emptyCareBook();
    book.meta.clearedAt = Date.now();
    const old = await readBook(church);
    // Public links survive a demo clear only if a leader made them.
    book.links = old?.links ?? [];
    await writeParts(church, book, ALL_CARE_PARTS);
    return book;
  });
}

/* ---------- Private rest log ---------- */

const restKey = (church: string, leaderId: string) => careKey(church, `rest:${leaderId}`);

export async function listRest(church: string, leaderId: string) {
  return (await getJSON<RestDay[]>(restKey(church, leaderId))) ?? [];
}

export async function saveRest(church: string, leaderId: string, days: RestDay[]) {
  const unique = new Map(days.map((d) => [d.date, d]));
  await setJSON(restKey(church, leaderId), [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-400));
}

export function careLeaderKeys(church: string, leaderId: string) {
  return [restKey(church, leaderId), careKey(church, `legacy:${leaderId}`)];
}

