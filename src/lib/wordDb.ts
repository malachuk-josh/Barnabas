// The Word's storage, on Barnabas's store (src/lib/store).
//
// Communion kept notes, bookmarks, collections and Ask counters in Redis
// hashes through its own lib/db.ts. Barnabas's KV is strings and sets, so a
// hash is kept here as one JSON object per key — field -> string value —
// with the same small surface Communion's routes call (hgetall, hset, hdel,
// hincrby, sets, expire, del). Every key is under "word:".
//
// A hash write is a read-modify-write rather than Redis's atomic HSET. The
// routes that use it write one person's own data, a request at a time, so
// the only race left is two tabs saving at the same instant — the last wins,
// as it would for a whole-document save.

import { getJSON, kv, setJSON } from "@/lib/store";

export const WORD_PREFIX = "word:";

type Hash = Record<string, string>;

export interface WordKV {
  hgetall(key: string): Promise<Hash | null>;
  hset(key: string, value: Record<string, string | number>): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  /** add to a numeric field, starting from 0, and return the new value */
  hincrby(key: string, field: string, by: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

async function read(key: string): Promise<Hash> {
  const value = await getJSON<Hash>(key);
  return value && typeof value === "object" ? value : {};
}

/** A write replaces the key, expiry included: call expire() after it. */
async function write(key: string, hash: Hash): Promise<void> {
  if (Object.keys(hash).length === 0) await kv().del(key);
  else await setJSON(key, hash);
}

const store: WordKV = {
  async hgetall(key) {
    const hash = await read(key);
    return Object.keys(hash).length === 0 ? null : hash;
  },
  async hset(key, value) {
    const hash = await read(key);
    for (const [field, v] of Object.entries(value)) hash[field] = String(v);
    await write(key, hash);
  },
  async hdel(key, field) {
    const hash = await read(key);
    if (!(field in hash)) return;
    delete hash[field];
    await write(key, hash);
  },
  async hincrby(key, field, by) {
    const hash = await read(key);
    const next = (Number(hash[field]) || 0) + by;
    hash[field] = String(next);
    await write(key, hash);
    return next;
  },
  async sadd(key, member) {
    await kv().sadd(key, member);
  },
  async srem(key, member) {
    await kv().srem(key, member);
  },
  async smembers(key) {
    return kv().smembers(key);
  },
  async expire(key, seconds) {
    await kv().expire(key, seconds);
  },
  async del(key) {
    await kv().del(key);
  },
};

/** Communion's db(), on Barnabas's store. */
export function db(): WordKV {
  return store;
}

const user = (userId: string) => `${WORD_PREFIX}user:${userId}`;

export const keys = {
  userNotes: (userId: string, bookNr: number) => `${user(userId)}:notes:${bookNr}`,
  userBookmarks: (userId: string) => `${user(userId)}:bookmarks`,
  userCollections: (userId: string) => `${user(userId)}:collections`,
  /** which default collections have been planted (lib/defaultCollections) */
  userSeeds: (userId: string) => `${user(userId)}:seeds`,
  /** one UTC day of one leader's questions to Ask (lib/ask) */
  askDay: (day: string, userId: string) => `${WORD_PREFIX}ask:${day}:${userId}`,
};
