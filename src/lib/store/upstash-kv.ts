import { Redis } from "@upstash/redis";
import type { KV } from "./types";

/** Upstash Redis over REST: works well from Vercel serverless functions. */
export class UpstashKV implements KV {
  private redis: Redis;

  constructor(url: string, token: string) {
    // automaticDeserialization off: we always store strings and parse JSON ourselves.
    this.redis = new Redis({ url, token, automaticDeserialization: false });
  }

  async get(key: string) {
    const value = await this.redis.get<string>(key);
    return value ?? null;
  }

  async set(key: string, value: string, options?: { ttlSeconds?: number }) {
    if (options?.ttlSeconds) await this.redis.set(key, value, { ex: options.ttlSeconds });
    else await this.redis.set(key, value);
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    const result = await this.redis.set(key, value, { nx: true, px: ttlMs });
    return result === "OK";
  }

  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }

  async sadd(key: string, ...members: string[]) {
    if (members.length) await this.redis.sadd(key, members[0], ...members.slice(1));
  }

  async srem(key: string, ...members: string[]) {
    if (members.length) await this.redis.srem(key, ...members);
  }

  async smembers(key: string) {
    return (await this.redis.smembers(key)) as string[];
  }

  async expire(key: string, ttlSeconds: number) {
    await this.redis.expire(key, ttlSeconds);
  }
}
