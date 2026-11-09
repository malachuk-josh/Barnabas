import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { myChildCare } from "@/lib/kids/parents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Child care for a parent: only the families where one of the guardians' emails is the signed-in
 * person's, each child's first name and today's status, and who "Message the kids team" goes to.
 */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  try {
    return NextResponse.json(await myChildCare(leader));
  } catch (err) {
    console.error("[barnabas] child care request failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}
