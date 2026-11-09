/**
 * The small key-value surface Barnabas needs. Three implementations:
 * Upstash REST (Vercel Marketplace), node-redis (REDIS_URL) and in-memory (local dev and tests).
 */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void>;
  /** Set only if the key does not exist. Returns true when the value was written. */
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  sadd(key: string, ...members: string[]): Promise<void>;
  srem(key: string, ...members: string[]): Promise<void>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  /** Add one to a counter and return the new value. The first increment starts the expiry window. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}
