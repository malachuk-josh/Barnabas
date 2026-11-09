import type { Metadata } from "next";
import { FinanceFrame, NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { PrintButton } from "@/components/finance/PrintButton";
import { TrendChart } from "@/components/finance/TrendChart";
import { config } from "@/lib/config";
import { today } from "@/lib/dates";
import { lastMonths, monthLabel, monthlyTrend } from "@/lib/finance/giving";
import { dollars, percent } from "@/lib/finance/money";
import { METHOD_LABELS, type GiftMethod } from "@/lib/finance/types";
import { monthlyReport } from "@/lib/finance/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports · Finance · Barnabas" };

const d0 = (c: number) => dollars(c, { cents: false });
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; report?: string }> }) {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const asOf = today();
  const params = await searchParams;
  const months = lastMonths(asOf, 13).reverse();
  const month = params.month && months.includes(params.month) ? params.month : months[0];
  const kind = params.report === "giving" ? "giving" : "monthly";
  const r = monthlyReport(ctx.books, month, asOf);
  const trend = monthlyTrend(ctx.books.gifts, lastMonths(r.through, 12));
  const elapsed = Math.round((Number(r.through.slice(5, 7)) / 12) * 100);

  return (
    <FinanceFrame ctx={ctx} eyebrow="Finance" title="Reports" intro="Ready for the deacons or the board: totals and categories only, no donor names.">
      <form className="row no-print" method="get" style={{ marginBottom: 18 }}>
        <label className="small muted" htmlFor="report">
          Report
        </label>
        <select id="report" name="report" defaultValue={kind} style={{ width: "auto" }}>
          <option value="monthly">Monthly finance report</option>
          <option value="giving">Giving report</option>
        </select>
        <label className="small muted" htmlFor="month">
          Month
        </label>
        <select id="month" name="month" defaultValue={month} style={{ width: "auto" }}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, "long")}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Show
        </button>
        <span style={{ marginLeft: "auto" }}>
          <PrintButton label="Print report" />
        </span>
      </form>

      <article className="fin-print">
        <header className="fin-print-head">
          <div>
            <h1>{kind === "giving" ? "Giving report" : "Monthly finance report"}</h1>
            <p className="muted">
              {config.churchName} · {r.label}
              {r.through < `${month}-28` ? `, through ${longDate(r.through)}` : ""}
            </p>
          </div>
          <div className="small" style={{ textAlign: "right" }}>
            Prepared {longDate(asOf)}
            {r.demo && (
              <div>
                <span className="fin-badge-demo">Demo data</span>
              </div>
            )}
          </div>
        </header>

        {kind === "monthly" ? (
          <>
            <section className="fin-letter">
              <p>
                In {r.label}, the church received <strong>{d0(r.totals.income.monthActual)}</strong> and spent <strong>{d0(r.totals.expense.monthActual)}</strong>. For the year to date, income is {d0(r.totals.income.ytdActual)} against{" "}
                {d0(r.totals.income.ytdBudget)} budgeted, and expenses are {d0(r.totals.expense.ytdActual)} against {d0(r.totals.expense.ytdBudget)} budgeted.
              </p>
            </section>

            <h2>Income and expenses by category</h2>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Month actual</th>
                    <th className="num">Month budget</th>
                    <th className="num">Year to date</th>
                    <th className="num">YTD budget</th>
                    <th className="num">Annual budget</th>
                    <th className="num">% of annual</th>
                  </tr>
                </thead>
                <tbody>
                  {(["income", "expense"] as const).map((k) => [
                    <tr className="fin-group" key={k}>
                      <td colSpan={7}>{k === "income" ? "Income" : "Expenses"}</td>
                    </tr>,
                    ...r.groups
                      .filter((g) => g.kind === k)
                      .map((g) => (
                        <tr key={`${k}-${g.group}`}>
                          <td className="wide">{g.group}</td>
                          <td className="num">{d0(g.monthActual)}</td>
                          <td className="num">{d0(g.monthBudget)}</td>
                          <td className="num">{d0(g.actual)}</td>
                          <td className="num">{d0(g.toDate)}</td>
                          <td className="num">{d0(g.annual)}</td>
                          <td className="num">{g.pctUsed === null ? "–" : `${Math.round(g.pctUsed)}%`}</td>
                        </tr>
                      )),
                    <tr className="fin-total" key={`${k}-total`}>
                      <td>Total {k === "income" ? "income" : "expenses"}</td>
                      <td className="num">{d0(r.totals[k].monthActual)}</td>
                      <td className="num">{d0(r.totals[k].monthBudget)}</td>
                      <td className="num">{d0(r.totals[k].ytdActual)}</td>
                      <td className="num">{d0(r.totals[k].ytdBudget)}</td>
                      <td className="num">{d0(r.totals[k].annual)}</td>
                      <td className="num">{r.totals[k].annual ? `${Math.round(percent(r.totals[k].ytdActual, r.totals[k].annual)!)}%` : "–"}</td>
                    </tr>,
                  ])}
                  <tr className="fin-total">
                    <td>Net (income less expenses)</td>
                    <td className="num">{d0(r.totals.income.monthActual - r.totals.expense.monthActual)}</td>
                    <td className="num">{d0(r.totals.income.monthBudget - r.totals.expense.monthBudget)}</td>
                    <td className="num">{d0(r.totals.income.ytdActual - r.totals.expense.ytdActual)}</td>
                    <td className="num">{d0(r.totals.income.ytdBudget - r.totals.expense.ytdBudget)}</td>
                    <td className="num">{d0(r.totals.income.annual - r.totals.expense.annual)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="small muted">Month budget is one twelfth of the annual budget. Year-to-date budget follows the share of the year that has passed. About {elapsed}% of the year is complete at the end of {r.label}.</p>

            <h2>Fund balances</h2>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th className="num">Start of month</th>
                    <th className="num">Income</th>
                    <th className="num">Expenses</th>
                    <th className="num">End of month</th>
                  </tr>
                </thead>
                <tbody>
                  {r.funds.map((f) => (
                    <tr key={f.name}>
                      <td className="wide">
                        {f.name}
                        {f.restricted ? " (restricted)" : ""}
                      </td>
                      <td className="num">{dollars(f.opening)}</td>
                      <td className="num">{dollars(f.income)}</td>
                      <td className="num">{dollars(f.expenses)}</td>
                      <td className="num">
                        <strong>{dollars(f.closing)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2>Missions</h2>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <tbody>
                  {r.missions.campaigns.map((c) => (
                    <tr key={c.name}>
                      <td className="wide">{c.name}</td>
                      <td>
                        {d0(c.received)} received of {d0(c.pledged)} pledged (goal {d0(c.goal)})
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>Support paid to partners this year</td>
                    <td>
                      {d0(r.missions.partnersPaid)} of {d0(r.missions.partnersCommitted)} committed
                    </td>
                  </tr>
                  <tr>
                    <td>Missions fund balance</td>
                    <td>{dollars(r.missions.fundBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <section className="fin-letter">
              <p>
                In {r.label}, {r.giving.givers} givers gave <strong>{dollars(r.giving.total)}</strong> in {r.giving.count} gifts, compared with {dollars(r.giving.lastYear)} in {monthLabel(`${Number(month.slice(0, 4)) - 1}${month.slice(4)}`, "long")}.
              </p>
            </section>
            <h2>By fund</h2>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <tbody>
                  {r.giving.byFund.map((f) => (
                    <tr key={f.name}>
                      <td className="wide">{f.name}</td>
                      <td className="num">{dollars(f.total)}</td>
                    </tr>
                  ))}
                  <tr className="fin-total">
                    <td>Total</td>
                    <td className="num">{dollars(r.giving.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h2>By method</h2>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <tbody>
                  {(Object.keys(r.giving.byMethod) as GiftMethod[]).map((m) => (
                    <tr key={m}>
                      <td className="wide">{METHOD_LABELS[m]}</td>
                      <td className="num">{dollars(r.giving.byMethod[m])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2>The last twelve months</h2>
            <TrendChart points={trend} title="Giving by month for the twelve months ending this report" highlight={month} />
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Given</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((p) => (
                    <tr key={p.month}>
                      <td>{monthLabel(p.month, "long")}</td>
                      <td className="num">{dollars(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="small muted">Totals come from the church&apos;s ledger and gift records in Barnabas. Individual giving is not shown in this report.</p>
      </article>
    </FinanceFrame>
  );
}
