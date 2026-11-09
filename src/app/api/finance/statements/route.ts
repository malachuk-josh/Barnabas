import { isResponse, requirePermission } from "@/lib/auth/require";
import { today } from "@/lib/dates";
import { contributionStatement, donorSummaries } from "@/lib/finance/giving";
import { FinanceError } from "@/lib/finance/service";
import { respond } from "@/lib/finance/http";
import { loadBooks } from "@/lib/finance/store";

export const runtime = "nodejs";

/** Year-end contribution statements. Pastors and treasurers only. */
export async function GET(request: Request) {
  const leader = await requirePermission("giving.donors");
  if (isResponse(leader)) return leader;
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year")) || Number(today().slice(0, 4));
  const donor = params.get("donor");
  return respond(async () => {
    const books = await loadBooks(leader.churchId);
    if (!donor) return { year, donors: donorSummaries(books.gifts, year).filter((d) => d.total > 0).map((d) => ({ key: d.key, name: d.name, total: d.total })) };
    const statement = contributionStatement(books.gifts, books.chart.funds, donor, year);
    if (!statement) throw new FinanceError("No gifts from that donor in that year.");
    return { statement };
  });
}
