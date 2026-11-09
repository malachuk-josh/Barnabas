// Who a Word API request is from. Communion answered this with Clerk or a
// signed guest cookie (its lib/auth.ts); in Barnabas it is the signed-in
// leader, and nobody else. The middleware already turns away unsigned
// requests to /api/*; this is the check each route makes for itself.

import { currentLeader, type Leader } from "@/lib/auth/session";

/** The id The Word files a leader's notes and bookmarks under. */
export function wordUserId(leader: Pick<Leader, "churchId" | "leaderId">): string {
  return `${leader.churchId}:${leader.leaderId}`;
}

/**
 * The signed-in leader's Word id, or null. Takes the request only to keep
 * Communion's call sites as they were; the session cookie is what counts.
 */
export async function getUserId(_req?: Request): Promise<string | null> {
  const leader = await currentLeader();
  return leader ? wordUserId(leader) : null;
}
