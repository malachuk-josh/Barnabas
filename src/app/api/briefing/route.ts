import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { briefing } from "@/lib/engine/briefing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const date = new URL(request.url).searchParams.get("date");
  const result = await briefing(leader, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined);
  return NextResponse.json(result);
}
