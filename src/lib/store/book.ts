import { getJSON, setJSON, withLock } from "./index";

/**
 * A per-church "book": a handful of JSON parts under one Redis prefix (`{prefix}:{church}:{part}`),
 * seeded once on first access and changed under a per-church lock. Operations (serve, services,
 * events, kids) each keep one; the shape follows the Care store.
 */
export type BookSpec<B extends { meta: { demo: boolean; createdAt: number } }> = {
  prefix: string;
  parts: readonly (keyof B & string)[];
  empty: () => B;
  /** Builds the first book for a church (the demo church gets its labeled seed here). */
  seed?: (church: string) => Promise<B | null>;
};

export const bookKey = (prefix: string, church: string, part: string) => `${prefix}:${church}:${part}`;

export function bookStore<B extends { meta: { demo: boolean; createdAt: number; clearedAt?: number } }>(spec: BookSpec<B>) {
  const key = (church: string, part: string) => bookKey(spec.prefix, church, part);

  async function read(church: string): Promise<B | null> {
    const meta = await getJSON<B["meta"]>(key(church, "meta"));
    if (!meta) return null;
    const empty = spec.empty();
    const values = await Promise.all(spec.parts.map((p) => getJSON<unknown>(key(church, p))));
    const book = { ...empty, meta } as B;
    spec.parts.forEach((p, i) => {
      if (p !== "meta" && values[i] !== null) (book as Record<string, unknown>)[p] = values[i];
    });
    return book;
  }

  async function write(church: string, book: B, parts: readonly (keyof B & string)[]) {
    await Promise.all(parts.map((p) => setJSON(key(church, p), book[p])));
  }

  async function load(church: string): Promise<B> {
    const existing = await read(church);
    if (existing) return existing;
    return withLock(key(church, "seed-lock"), async () => {
      const again = await read(church);
      if (again) return again;
      const book = (spec.seed ? await spec.seed(church) : null) ?? spec.empty();
      await write(church, book, spec.parts);
      return book;
    }, 30_000);
  }

  /** Change the book under the church's lock; `fn` mutates it and the named parts are saved. */
  async function update<T>(church: string, parts: readonly (keyof B & string)[], fn: (book: B) => T | Promise<T>): Promise<T> {
    await load(church);
    return withLock(key(church, "lock"), async () => {
      const book = (await read(church))!;
      const result = await fn(book);
      await write(church, book, parts);
      return result;
    });
  }

  /** Starts empty (clearing the demo data), keeping the parts named in `keep`. */
  async function reset(church: string, keep: readonly (keyof B & string)[] = []): Promise<B> {
    return withLock(key(church, "lock"), async () => {
      const old = await read(church);
      const book = spec.empty();
      book.meta.clearedAt = Date.now();
      for (const p of keep) if (old) (book as Record<string, unknown>)[p] = old[p];
      await write(church, book, spec.parts);
      return book;
    });
  }

  return { load, update, reset, key };
}
