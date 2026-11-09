import { createClient } from "redis";
import type { KV } from "./types";

function connect(url: string) {
  const client = createClient({ url });
  client.on("error", (err) => console.error("[barnabas] redis error", err));
  return client.connect().then(() => client);
}

type Client = Awaited<ReturnType<typeof connect>>;

/** Redis over TCP (REDIS_URL). Reuses one connection per server instance. */
export class NodeRedisKV implements KV {
  private clientPromise: Promise<Client>;

  constructor(url: string) {
    this.clientPromise = connect(url);
  }

  private async c() {
    return this.clientPromise;
  }

  async get(key: string) {
    return (await (await this.c()).get(key)) ?? null;
  }

  async set(key: string, value: string, options?: { ttlSeconds?: number }) {
    const client = await this.c();
    if (options?.ttlSeconds) await client.set(key, value, { EX: options.ttlSeconds });
    else await client.set(key, value);
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    const result = await (await this.c()).set(key, value, { NX: true, PX: ttlMs });
    return result === "OK";
  }

  async del(...keys: string[]) {
    if (keys.length) await (await this.c()).del(keys);
  }

  async sadd(key: string, ...members: string[]) {
    if (members.length) await (await this.c()).sAdd(key, members);
  }

  async srem(key: string, ...members: string[]) {
    if (members.length) await (await this.c()).sRem(key, members);
  }

  async smembers(key: string) {
    return (await (await this.c()).sMembers(key)) as string[];
  }

  async expire(key: string, ttlSeconds: number) {
    await (await this.c()).expire(key, ttlSeconds);
  }

  async incr(key: string, ttlSeconds: number) {
    const client = await this.c();
    const n = await client.incr(key);
    if (n === 1) await client.expire(key, ttlSeconds);
    return n;
  }
}
