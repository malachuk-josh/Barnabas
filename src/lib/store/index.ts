import { isProduction } from "../config";
import { MemoryKV } from "./memory-kv";
import type { KV } from "./types";

export type { KV } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __barnabasKV: KV | undefined;
}

function createKV(): KV {
  const restUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (restUrl && restToken) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UpstashKV } = require("./upstash-kv") as typeof import("./upstash-kv");
    return new UpstashKV(restUrl, restToken);
  }
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeRedisKV } = require("./node-redis-kv") as typeof import("./node-redis-kv");
    return new NodeRedisKV(redisUrl);
  }
  if (isProduction && process.env.BARNABAS_ALLOW_MEMORY_STORE !== "true") {
    throw new Error(
      "No Redis configured. Add Upstash Redis from the Vercel Marketplace (KV_REST_API_URL and KV_REST_API_TOKEN) or set REDIS_URL.",
    );
  }
  console.warn("[barnabas] No Redis configured: using in-memory storage. Data will not persist.");
  return new MemoryKV();
}

/** The process-wide store. Tests can replace it with setKV(). */
export function kv(): KV {
  if (!globalThis.__barnabasKV) globalThis.__barnabasKV = createKV();
  return globalThis.__barnabasKV;
}

export function setKV(store: KV) {
  globalThis.__barnabasKV = store;
}

export function now(): number {
  return Date.now();
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await kv().get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setJSON(key: string, value: unknown, options?: { ttlSeconds?: number }) {
  await kv().set(key, JSON.stringify(value), options);
}

/** A short-lived lock so two turns of one conversation never run at once. */
export async function withLock<T>(key: string, fn: () => Promise<T>, waitMs = 15000): Promise<T> {
  const token = Math.random().toString(36).slice(2);
  const deadline = Date.now() + waitMs;
  while (!(await kv().setIfAbsent(key, token, 120_000))) {
    if (Date.now() > deadline) throw new Error("This conversation is busy. Try again in a moment.");
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    return await fn();
  } finally {
    if ((await kv().get(key)) === token) await kv().del(key);
  }
}
