import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { bankRows, detectColumns, findDuplicate, parseCsv, suggestAccount } from "@/lib/finance/csv";
import { rawBody, respond } from "@/lib/finance/http";
import { FinanceError, ImportInput, importTransactions } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";

export const runtime = "nodejs";

const Preview = z.object({
  action: z.literal("preview"),
  csv: z.string().min(1).max(2_000_000),
  bankAccountId: z.string().min(1).max(40),
  columns: z.object({ date: z.number().int(), description: z.number().int(), amount: z.number().int().optional(), debit: z.number().int().optional(), credit: z.number().int().optional(), reference: z.number().int().optional() }).optional(),
});

const Commit = z.object({ action: z.literal("commit"), ...ImportInput.shape });

/** Preview reads the CSV and suggests an account for each row; commit adds the rows the treasurer kept. */
export async function POST(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => {
    const raw = await rawBody(request);
    if (raw.action === "commit") return await importTransactions(leader, Commit.parse(raw));
    const input = Preview.parse(raw);
    const table = parseCsv(input.csv);
    if (table.length < 2) throw new FinanceError("That file has no rows to import.");
    const columns = input.columns ?? detectColumns(table[0]);
    if (!columns) throw new FinanceError("Couldn't find the date, description and amount columns. Choose them below.");
    const books = await loadBooks(leader.churchId);
    const general = books.chart.funds.find((f) => !f.restricted) ?? books.chart.funds[0];
    const rows = bankRows(table, columns).map((r) => {
      const direction = (r.amount ?? 0) >= 0 ? "in" : "out";
      const account = r.problem ? null : suggestAccount(books.chart, r.description, direction);
      return {
        ...r,
        accountId: account?.id ?? "",
        fundId: account?.defaultFundId ?? general?.id ?? "",
        duplicate: Boolean(r.date && r.amount !== null && findDuplicate(books.transactions, input.bankAccountId, r.date, r.amount)),
      };
    });
    return { header: table[0], columns, rows };
  });
}
