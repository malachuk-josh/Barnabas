import { NextResponse } from "next/server";
import { accessFor } from "../team";
import { can, type Access, type Permission } from "./roles";
import { currentLeader, type Leader } from "./session";

/** For API routes: returns the leader or a 401 response. */
export async function requireLeader(): Promise<Leader | NextResponse> {
  const leader = await currentLeader();
  if (!leader) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return leader;
}

export type PermittedLeader = Leader & { access: Access };

/** For API routes: the leader, if their role allows `permission`; otherwise a 401 or 403 response. */
export async function requirePermission(permission: Permission): Promise<PermittedLeader | NextResponse> {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const access = await accessFor(leader);
  if (!can(access, permission)) {
    return NextResponse.json({ error: "Your role doesn't include this. Ask your church administrator if you need it." }, { status: 403 });
  }
  return { ...leader, access };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
