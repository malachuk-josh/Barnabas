import { NextResponse } from "next/server";
import { currentLeader, type Leader } from "./session";

/** For API routes: returns the leader or a 401 response. */
export async function requireLeader(): Promise<Leader | NextResponse> {
  const leader = await currentLeader();
  if (!leader) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return leader;
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
