import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { addDays, today } from "@/lib/dates";
import { isoParam, rawBody, respond } from "@/lib/finance/http";
import { accountBalance, fundBalances, inRange } from "@/lib/finance/ledger";
import { AccountInput, FundInput, TxnInput, addAccount, addFund, addTransaction, deleteTransaction, setCleared } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";

export const runtime = "nodejs";

/** Chart of accounts, funds with balances, bank balances and transactions. No donor names: deposits are totals by fund. */
export async function GET(request: Request) {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  const params = new URL(request.url).searchParams;
  const to = isoParam(params.get("to"), today());
  const from = isoParam(params.get("from"), addDays(to, -90));
  return respond(async () => {
    const books = await loadBooks(leader.churchId);
    return {
      accounts: books.chart.accounts,
      funds: fundBalances(books.chart, books.transactions, to).map((f) => ({ ...f.fund, balance: f.balance, income: f.income, expenses: f.expenses })),
      banks: books.chart.accounts.filter((a) => a.bank).map((a) => ({ id: a.id, name: a.name, balance: accountBalance(a, books.transactions, { asOf: to }), cleared: accountBalance(a, books.transactions, { asOf: to, clearedOnly: true }) })),
      transactions: books.transactions.filter((t) => inRange(t.date, from, to)).reverse(),
      from,
      to,
      demo: books.meta.demo,
    };
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add-transaction"), transaction: TxnInput }),
  z.object({ action: z.literal("delete-transaction"), id: z.string().min(1).max(60) }),
  z.object({ action: z.literal("set-cleared"), ids: z.array(z.string().max(60)).min(1).max(2000), cleared: z.boolean() }),
  z.object({ action: z.literal("add-account"), account: AccountInput }),
  z.object({ action: z.literal("add-fund"), fund: FundInput }),
]);

export async function POST(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => {
    const input = Action.parse(await rawBody(request));
    switch (input.action) {
      case "add-transaction":
        return { transaction: await addTransaction(leader, input.transaction) };
      case "delete-transaction":
        return { transaction: await deleteTransaction(leader, input.id) };
      case "set-cleared":
        return { changed: await setCleared(leader, input.ids, input.cleared) };
      case "add-account":
        return { account: await addAccount(leader, input.account) };
      case "add-fund":
        return { fund: await addFund(leader, input.fund) };
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  });
}
