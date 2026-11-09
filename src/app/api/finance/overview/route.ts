import { isResponse, requirePermission } from "@/lib/auth/require";
import { today } from "@/lib/dates";
import { respond } from "@/lib/finance/http";
import { loadBooks } from "@/lib/finance/store";
import { financeOverview } from "@/lib/finance/views";

export const runtime = "nodejs";

export async function GET() {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  return respond(async () => ({ overview: financeOverview(await loadBooks(leader.churchId), today()) }));
}
