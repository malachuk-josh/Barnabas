import type { Metadata } from "next";
import { BudgetEditor } from "@/components/finance/BudgetEditor";
import { FinanceFrame, NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { today } from "@/lib/dates";
import { budgetView } from "@/lib/finance/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Budget · Finance · Barnabas" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const asOf = today();
  const current = Number(asOf.slice(0, 4));
  const requested = Number((await searchParams).year);
  const year = Number.isInteger(requested) && requested > 2000 && requested < 2100 ? requested : current;
  const view = budgetView(ctx.books, year, asOf);
  const years = [...new Set([...view.years, current, current + 1, year])].sort();
  const budget = ctx.books.budgets.find((b) => b.year === year);
  return (
    <FinanceFrame ctx={ctx} eyebrow="Finance" title="Budget and plans" intro="The annual budget by ministry and category, with actuals from the ledger. Each line is compared with the share of the year that has passed.">
      <BudgetEditor
        key={year}
        year={year}
        years={years}
        currentYear={current}
        report={view}
        lines={budget?.lines ?? []}
        accounts={ctx.books.chart.accounts.filter((a) => (a.type === "income" || a.type === "expense") && !a.archived).map((a) => ({ id: a.id, number: a.number, name: a.name, type: a.type, group: a.group }))}
        canEdit={ctx.canEdit}
        previousExists={ctx.books.budgets.some((b) => b.year === year - 1)}
      />
    </FinanceFrame>
  );
}
