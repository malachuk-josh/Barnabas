import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { accessFor } from "../team";
import { can, checkinMayUse, isCheckinOnly, type Access, type Permission } from "./roles";
import { currentLeader, type Leader } from "./session";

/** For API routes: returns the leader or a 401 response. */
export async function requireLeader(): Promise<Leader | NextResponse> {
  const leader = await currentLeader();
  if (!leader) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!(await pathAllowed(await accessFor(leader)))) {
    return NextResponse.json({ error: "Your role is kids check-in only." }, { status: 403 });
  }
  return leader;
}

/** The request path the middleware passed along ("" outside a request). */
export async function requestPath(): Promise<string> {
  try {
    return (await headers()).get("x-barnabas-path") ?? "";
  } catch {
    return "";
  }
}

/** False when a check-in-only volunteer asks for anything outside the check-in station. */
export async function pathAllowed(access: Access): Promise<boolean> {
  if (!isCheckinOnly(access)) return true;
  return checkinMayUse(await requestPath());
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
