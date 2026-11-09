import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { accessFor } from "../team";
import { can, isCheckinOnly, levelMayUse, type Access, type Permission } from "./roles";
import { currentLeader, type Leader } from "./session";

/** For API routes: returns the leader or a 401 response. */
export async function requireLeader(): Promise<Leader | NextResponse> {
  const leader = await currentLeader();
  if (!leader) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const access = await accessFor(leader);
  if (access.removed) return NextResponse.json({ error: "You no longer have access to Barnabas. Ask your church administrator." }, { status: 401 });
  if (!(await pathAllowed(access))) {
    return NextResponse.json({ error: isCheckinOnly(access) ? "Your role is kids check-in only." : "Your access level doesn't include this. Ask your church administrator if you need it." }, { status: 403 });
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

/** False when someone at the Team or Member level (or check-in only) asks for something outside their features. */
export async function pathAllowed(access: Access): Promise<boolean> {
  const path = await requestPath();
  // Outside a request (tests, jobs) there is no path to check.
  if (!path) return !isCheckinOnly(access);
  return levelMayUse(access, path);
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
