import { isResponse, requirePermission } from "@/lib/auth/require";
import { today } from "@/lib/dates";
import { respond } from "@/lib/finance/http";
import { loadBooks } from "@/lib/finance/store";
import { monthlyReport } from "@/lib/finance/views";

export const runtime = "nodejs";

/** The monthly report for the deacons or board: aggregates only. */
export async function GET(request: Request) {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  const param = new URL(request.url).searchParams.get("month");
  const month = param && /^\d{4}-\d{2}$/.test(param) ? param : today().slice(0, 7);
  return respond(async () => ({ report: monthlyReport(await loadBooks(leader.churchId), month, today()) }));
}
