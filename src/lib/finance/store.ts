import { config } from "../config";
import { today } from "../dates";
import { getJSON, kv, setJSON, withLock } from "../store";
import { defaultChart } from "./chart";
import { seedDemoBooks } from "./demo";
import type { Books, Budget, Chart, FinanceMeta, Gift, Missions, Reconciliation, Recurring, Transaction } from "./types";

/**
 * Redis layout, per church:
 *   fin:{church}:meta              FinanceMeta (demo flag, books start date)
 *   fin:{church}:chart             accounts and funds
 *   fin:{church}:txns:{yyyy}       transactions dated in that year
 *   fin:{church}:gifts:{yyyy}      gift records dated in that year
 *   fin:{church}:years             set of years with transactions or gifts
 *   fin:{church}:budget:{yyyy}     that fiscal year's budget
 *   fin:{church}:budget-years      set of budget years
 *   fin:{church}:recurring         recurring givers
 *   fin:{church}:recon             bank reconciliations
 *   fin:{church}:missions          partners, pledges and campaigns
 */
const k = (church: string, part: string) => `fin:${church}:${part}`;

export type Part = "meta" | "chart" | "transactions" | "gifts" | "recurring" | "budgets" | "reconciliations" | "missions";

const emptyMissions = (): Missions => ({ partners: [], pledges: [], campaigns: [] });

async function readBooks(church: string): Promise<Books | null> {
  const meta = await getJSON<FinanceMeta>(k(church, "meta"));
  if (!meta) return null;
  const [chart, years, budgetYears, recurring, recon, missions] = await Promise.all([
    getJSON<Chart>(k(church, "chart")),
    kv().smembers(k(church, "years")),
    kv().smembers(k(church, "budget-years")),
    getJSON<Recurring[]>(k(church, "recurring")),
    getJSON<Reconciliation[]>(k(church, "recon")),
    getJSON<Missions>(k(church, "missions")),
  ]);
  const sortedYears = years.sort();
  const [txnLists, giftLists, budgets] = await Promise.all([
    Promise.all(sortedYears.map((y) => getJSON<Transaction[]>(k(church, `txns:${y}`)))),
    Promise.all(sortedYears.map((y) => getJSON<Gift[]>(k(church, `gifts:${y}`)))),
    Promise.all(budgetYears.map((y) => getJSON<Budget>(k(church, `budget:${y}`)))),
  ]);
  return {
    meta,
    chart: chart ?? defaultChart(),
    transactions: txnLists.flatMap((x) => x ?? []).sort(byDate),
    gifts: giftLists.flatMap((x) => x ?? []).sort(byDate),
    recurring: recurring ?? [],
    budgets: budgets.filter((b): b is Budget => Boolean(b)).sort((a, b) => a.year - b.year),
    reconciliations: recon ?? [],
    missions: { ...emptyMissions(), ...(missions ?? {}) },
  };
}

const byDate = (a: { date: string; createdAt: number }, b: { date: string; createdAt: number }) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;

function byYear<T extends { date: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const y = item.date.slice(0, 4);
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(item);
  }
  return map;
}

async function writeParts(church: string, books: Books, parts: Part[]) {
  const set = new Set(parts);
  const writes: Promise<unknown>[] = [];
  if (set.has("meta")) writes.push(setJSON(k(church, "meta"), books.meta));
  if (set.has("chart")) writes.push(setJSON(k(church, "chart"), books.chart));
  if (set.has("recurring")) writes.push(setJSON(k(church, "recurring"), books.recurring));
  if (set.has("reconciliations")) writes.push(setJSON(k(church, "recon"), books.reconciliations));
  if (set.has("missions")) writes.push(setJSON(k(church, "missions"), books.missions));
  if (set.has("transactions") || set.has("gifts")) {
    const known = new Set(await kv().smembers(k(church, "years")));
    const txns = byYear(books.transactions);
    const gifts = byYear(books.gifts);
    const years = new Set([...known, ...txns.keys(), ...gifts.keys()]);
    for (const y of years) {
      if (set.has("transactions")) writes.push(setJSON(k(church, `txns:${y}`), txns.get(y) ?? []));
      if (set.has("gifts")) writes.push(setJSON(k(church, `gifts:${y}`), gifts.get(y) ?? []));
    }
    const fresh = [...years].filter((y) => !known.has(y));
    if (fresh.length) writes.push(kv().sadd(k(church, "years"), ...fresh));
  }
  if (set.has("budgets")) {
    const known = await kv().smembers(k(church, "budget-years"));
    const keep = new Set(books.budgets.map((b) => String(b.year)));
    for (const b of books.budgets) writes.push(setJSON(k(church, `budget:${b.year}`), b));
    const gone = known.filter((y) => !keep.has(y));
    if (gone.length) {
      writes.push(kv().del(...gone.map((y) => k(church, `budget:${y}`))));
      writes.push(kv().srem(k(church, "budget-years"), ...gone));
    }
    if (keep.size) writes.push(kv().sadd(k(church, "budget-years"), ...keep));
  }
  await Promise.all(writes);
}

export function emptyBooks(startDate = `${today().slice(0, 4)}-01-01`): Books {
  return {
    meta: { demo: false, startDate, createdAt: Date.now() },
    chart: defaultChart(),
    transactions: [],
    gifts: [],
    recurring: [],
    budgets: [],
    reconciliations: [],
    missions: emptyMissions(),
  };
}

const ALL_PARTS: Part[] = ["meta", "chart", "transactions", "gifts", "recurring", "budgets", "reconciliations", "missions"];

/**
 * The church's books. The first time the demo church's finance area is opened (and only while it
 * has no finance data at all), it is filled with a labeled demo dataset.
 */
export async function loadBooks(church: string): Promise<Books> {
  const existing = await readBooks(church);
  if (existing) return existing;
  return withLock(k(church, "seed-lock"), async () => {
    const again = await readBooks(church);
    if (again) return again;
    const books = church === config.churchId ? await seedDemoBooks() : emptyBooks();
    await writeParts(church, books, ALL_PARTS);
    return books;
  }, 30_000);
}

/**
 * Change the books under a per-church lock so two writers never overwrite each other.
 * `fn` mutates the books and returns a result; the named parts are saved.
 */
export async function updateBooks<T>(church: string, parts: Part[], fn: (books: Books) => T | Promise<T>): Promise<T> {
  await loadBooks(church);
  return withLock(k(church, "lock"), async () => {
    const books = (await readBooks(church))!;
    const result = await fn(books);
    await writeParts(church, books, parts);
    return result;
  });
}

/** Removes every finance record for the church and starts empty books (no demo data comes back). */
export async function resetBooks(church: string): Promise<Books> {
  return withLock(k(church, "lock"), async () => {
    const [years, budgetYears] = await Promise.all([kv().smembers(k(church, "years")), kv().smembers(k(church, "budget-years"))]);
    await kv().del(
      ...years.flatMap((y) => [k(church, `txns:${y}`), k(church, `gifts:${y}`)]),
      ...budgetYears.map((y) => k(church, `budget:${y}`)),
      k(church, "years"),
      k(church, "budget-years"),
      k(church, "recurring"),
      k(church, "recon"),
      k(church, "missions"),
      k(church, "chart"),
    );
    const books = emptyBooks();
    books.meta.clearedAt = Date.now();
    await writeParts(church, books, ALL_PARTS);
    return books;
  });
}
