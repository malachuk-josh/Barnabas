import type { KV } from "./types";

type Entry = { value: string | Set<string>; expiresAt?: number };

/** In-process store for local development and tests. Data is lost on restart. */
export class MemoryKV implements KV {
  private data = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    const entry = this.live(key);
    return typeof entry?.value === "string" ? entry.value : null;
  }

  async set(key: string, value: string, options?: { ttlSeconds?: number }) {
    this.data.set(key, {
      value,
      expiresAt: options?.ttlSeconds ? Date.now() + options.ttlSeconds * 1000 : undefined,
    });
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    if (this.live(key)) return false;
    this.data.set(key, { value, expiresAt: Date.now() + ttlMs });
    return true;
  }

  async del(...keys: string[]) {
    for (const key of keys) this.data.delete(key);
  }

  async sadd(key: string, ...members: string[]) {
    const entry = this.live(key);
    const set = entry?.value instanceof Set ? entry.value : new Set<string>();
    for (const m of members) set.add(m);
    this.data.set(key, { value: set, expiresAt: entry?.expiresAt });
  }

  async srem(key: string, ...members: string[]) {
    const entry = this.live(key);
    if (!(entry?.value instanceof Set)) return;
    for (const m of members) entry.value.delete(m);
  }

  async smembers(key: string) {
    const entry = this.live(key);
    return entry?.value instanceof Set ? [...entry.value] : [];
  }

  async expire(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
  }

  async incr(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    const next = (typeof entry?.value === "string" ? Number(entry.value) || 0 : 0) + 1;
    this.data.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? Date.now() + ttlSeconds * 1000 });
    return next;
  }
}
