import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { draftMonthlyReport, ReportError } from "@/lib/reports/monthly";

export const runtime = "nodejs";

/** Drafts this month's ministry report into the leader's Drafts queue. */
export async function POST() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  try {
    const draft = await draftMonthlyReport(leader);
    return NextResponse.json({ draftId: draft.id });
  } catch (err) {
    if (err instanceof ReportError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
