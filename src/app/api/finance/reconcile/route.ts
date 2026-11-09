import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { rawBody, respond } from "@/lib/finance/http";
import { reconcileState } from "@/lib/finance/reconcile";
import { ReconInput, finishReconciliation, startReconciliation } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  const bankId = new URL(request.url).searchParams.get("bank");
  return respond(async () => {
    const books = await loadBooks(leader.churchId);
    const account = books.chart.accounts.find((a) => a.bank && (!bankId || a.id === bankId));
    if (!account) return { reconciliation: null, history: [] };
    const open = books.reconciliations.find((r) => r.bankAccountId === account.id && r.status === "open") ?? null;
    const history = books.reconciliations.filter((r) => r.bankAccountId === account.id && r.status === "finished").sort((a, b) => b.statementDate.localeCompare(a.statementDate));
    return {
      account,
      reconciliation: open,
      state: open ? reconcileState(account, books.transactions, open) : null,
      history,
    };
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), ...ReconInput.shape }),
  z.object({ action: z.literal("finish"), id: z.string().min(1).max(60) }),
]);

export async function POST(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => {
    const input = Action.parse(await rawBody(request));
    if (input.action === "start") return { reconciliation: await startReconciliation(leader, input) };
    if (input.action === "finish") return await finishReconciliation(leader, input.id);
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  });
}
