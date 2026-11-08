import { setKV } from "@/lib/store";
import { MemoryKV } from "@/lib/store/memory-kv";
import type { Leader } from "@/lib/auth/session";

export function freshStore() {
  const store = new MemoryKV();
  setKV(store);
  return store;
}

export const leader: Leader = { churchId: "demo", leaderId: "leader1", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
