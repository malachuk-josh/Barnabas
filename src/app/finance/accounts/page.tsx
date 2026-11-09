import type { Metadata } from "next";
import { FinanceFrame, NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { LedgerView } from "@/components/finance/LedgerView";
import { addDays, today } from "@/lib/dates";
import { accountBalance, fundBalances, inRange } from "@/lib/finance/ledger";
import { reconcileState } from "@/lib/finance/reconcile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Funds and ledger · Finance · Barnabas" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const VIEWS = ["transactions", "funds", "reconcile", "import"] as const;

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ view?: string; from?: string; to?: string }> }) {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const params = await searchParams;
  const asOf = today();
  const to = params.to && ISO.test(params.to) ? params.to : asOf;
  const from = params.from && ISO.test(params.from) ? params.from : addDays(to, -60);
  const view = (VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as (typeof VIEWS)[number]) : "transactions";
  const { chart, transactions, reconciliations, missions } = ctx.books;
  const banks = chart.accounts.filter((a) => a.bank && !a.archived);
  const checking = banks[0];
  const open = checking ? reconciliations.find((r) => r.bankAccountId === checking.id && r.status === "open") ?? null : null;
  const state = checking && open ? reconcileState(checking, transactions, open) : null;
  const lastFinished = checking ? reconciliations.filter((r) => r.bankAccountId === checking.id && r.status === "finished").sort((a, b) => b.statementDate.localeCompare(a.statementDate))[0] ?? null : null;

  return (
    <FinanceFrame ctx={ctx} eyebrow="Finance" title="Funds and ledger" intro="Fund accounting, kept simple: every transaction is split into lines, and each line says what the money was for and whose money it is.">
      <LedgerView
        view={view}
        from={from}
        to={to}
        today={asOf}
        canEdit={ctx.canEdit}
        accounts={chart.accounts}
        funds={fundBalances(chart, transactions, asOf).map((f) => ({ ...f.fund, balance: f.balance, income: f.income, expenses: f.expenses }))}
        banks={banks.map((a) => ({ id: a.id, name: a.name, balance: accountBalance(a, transactions, { asOf }), cleared: accountBalance(a, transactions, { asOf, clearedOnly: true }) }))}
        liabilities={chart.accounts.filter((a) => a.type === "liability").map((a) => ({ id: a.id, name: a.name, balance: accountBalance(a, transactions, { asOf }) }))}
        transactions={transactions.filter((t) => inRange(t.date, from, to)).reverse()}
        reconcile={{
          bankAccountId: checking?.id ?? "",
          bankName: checking?.name ?? "",
          open,
          state: state && { clearedBalance: state.clearedBalance, statementBalance: state.statementBalance, difference: state.difference, canFinish: state.canFinish, clearedCount: state.clearedCount },
          openTransactions: state ? state.open : [],
          lastFinished,
        }}
        partners={missions.partners.map((p) => ({ id: p.id, name: p.name }))}
        startDate={ctx.books.meta.startDate}
      />
    </FinanceFrame>
  );
}
