import { NextResponse } from "next/server";
import { AdminError } from "./admin";
import { isResponse, requirePermission, type PermittedLeader } from "./require";

/** Every /api/admin route starts here: owners only (403 for everyone else, admins included). */
export async function requireOwner(): Promise<PermittedLeader | NextResponse> {
  const leader = await requirePermission("users.manage");
  if (isResponse(leader)) {
    if (leader.status === 403) return NextResponse.json({ error: "Only the owner can use the Admin console." }, { status: 403 });
    return leader;
  }
  return leader;
}

export function adminFailure(err: unknown) {
  if (err instanceof AdminError) return NextResponse.json({ error: err.message }, { status: err.status });
  throw err;
}

export const LEADER_ID_RE = /^[a-f0-9]{8,64}$/;
