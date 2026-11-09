import { setKV } from "@/lib/store";
import { MemoryKV } from "@/lib/store/memory-kv";
import type { Leader } from "@/lib/auth/session";

export function freshStore() {
  const store = new MemoryKV();
  setKV(store);
  return store;
}

export const leader: Leader = { churchId: "demo", leaderId: "leader1", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };

/**
 * A session cookie value for `who`, as sign-in would issue it: the leader record exists (so the session
 * check in currentLeader passes) and the token carries the record's session version.
 */
export async function sessionFor(who: Leader = leader): Promise<string> {
  const { recordSignIn } = await import("@/lib/team");
  const { signSession } = await import("@/lib/auth/session");
  const record = await recordSignIn(who);
  return signSession({ ...who, sv: record.sessionVersion ?? 0 });
}
