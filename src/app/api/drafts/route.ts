import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { listDrafts } from "@/lib/data/records";

export const runtime = "nodejs";

export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return NextResponse.json({ drafts: await listDrafts(leader) });
}
