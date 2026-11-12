import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { PrintButton } from "@/components/finance/PrintButton";
import { config } from "@/lib/config";
import { today } from "@/lib/dates";
import { contributionStatement, donorSummaries, type Statement } from "@/lib/finance/giving";
import { dollars } from "@/lib/finance/money";
import { METHOD_LABELS, type Fund } from "@/lib/finance/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contribution statement · Barnabas" };

const anchor = (key: string) => `statement-${key.replace(/[^a-z0-9]+/gi, "-")}`;
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function StatementSheet({ s, funds, issued, demo }: { s: Statement; funds: Fund[]; issued: string; demo: boolean }) {
  const fundName = (id: string) => funds.find((f) => f.id === id)?.name ?? id;
  return (
    <article id={anchor(s.donorKey)} className="fin-print fin-page-break stmt-sheet" aria-label={`Contribution statement for ${s.donorName}`}>
      <header className="fin-print-head">
        <div>
          <h1>{config.churchName}</h1>
          <p className="muted">Contribution statement for {s.year}</p>
        </div>
        <div className="small" style={{ textAlign: "right" }}>
          <div>Issued {longDate(issued)}</div>
          {demo && <span className="fin-badge-demo">Demo data</span>}
        </div>
      </header>
      <div className="stmt-top">
        <div className="stmt-to">
          <span className="stmt-to-label">Prepared for</span>
          <strong className="stmt-to-name">{s.donorName}</strong>
        </div>
        <div className="stmt-total">
          <span className="stmt-to-label">Total contributions</span>
          <strong>{dollars(s.total)}</strong>
          <span className="small muted">
            {s.gifts.length} {s.gifts.length === 1 ? "gift" : "gifts"} in {s.year}
          </span>
        </div>
      </div>
      <div className="fin-letter">
        <p>
          Thank you for your faithful generosity to {config.churchName} during {s.year}. Your gifts carry the gospel to our neighbors and the nations, care for people in need, and keep this church family serving together.
        </p>
        <p>
          This statement lists the contributions we received from you between January 1 and {issued < `${s.year}-12-31` ? `${longDate(issued)} (the year isn't over yet)` : `December 31, ${s.year}`}, totaling <strong>{dollars(s.total)}</strong>.
        </p>
        <p>
          <strong>No goods or services were provided in exchange for these contributions, other than intangible religious benefits.</strong> Please keep this statement for your tax records. If anything here doesn&apos;t match your records,
          please contact the church treasurer. For questions about how your gifts affect your taxes, please talk with your tax advisor.
        </p>
      </div>
      <h2>Summary by fund</h2>
      <div className="fin-table-wrap">
        <table className="fin-table stmt-funds">
          <tbody>
            {s.byFund.map((f) => (
              <tr key={f.fund.id}>
                <td>{f.fund.name}</td>
                <td className="num">{dollars(f.total)}</td>
              </tr>
            ))}
            <tr className="fin-total">
              <td>Total contributions</td>
              <td className="num">{dollars(s.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>Contributions received</h2>
      <div className="fin-table-wrap">
        <table className="fin-table stmt-gifts">
          <thead>
            <tr>
              <th>Date</th>
              <th>Fund</th>
              <th>Method</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.gifts.map((g) => (
              <tr key={g.id}>
                <td className="nowrap">{longDate(g.date)}</td>
                <td>{fundName(g.fundId)}</td>
                <td>
                  {METHOD_LABELS[g.method]}
                  {g.checkNumber ? ` #${g.checkNumber}` : ""}
                </td>
                <td className="num">{dollars(g.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fin-signature">
        <span>Church treasurer</span>
      </div>
    </article>
  );
}

export default async function StatementPage({ searchParams }: { searchParams: Promise<{ year?: string; donor?: string; all?: string }> }) {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const params = await searchParams;
  const year = Number(params.year) || Number(today().slice(0, 4)) - 1;
  if (!ctx.canSeeDonors) {
    return (
      <AppShell profile={ctx.profile}>
        <div className="page-head">
          <div>
            <span className="eyebrow">Giving</span>
            <h1>Statements are confidential</h1>
            <p className="muted">Contribution statements show individual giving, so only the pastor and treasurer can open them.</p>
          </div>
        </div>
      </AppShell>
    );
  }
  const keys = params.all ? donorSummaries(ctx.books.gifts, year).filter((d) => d.total > 0).map((d) => d.key) : params.donor ? [params.donor] : [];
  const statements = keys.map((k) => contributionStatement(ctx.books!.gifts, ctx.books!.chart.funds, k, year)).filter((s): s is Statement => Boolean(s));
  const issued = today();
  const thisYear = Number(today().slice(0, 4));
  const grand = statements.reduce((a, x) => a + x.total, 0);
  const yearHref = (y: number) => `/finance/giving/statement?year=${y}${params.all ? "&all=1" : params.donor ? `&donor=${encodeURIComponent(params.donor)}` : ""}`;
  return (
    <AppShell profile={ctx.profile}>
      <div className="page-head no-print">
        <div>
          <span className="eyebrow">Giving · Contribution statements</span>
          <h1>{statements.length === 1 ? `Statement for ${statements[0].donorName}` : statements.length ? `${statements.length} contribution statements` : "Contribution statements"}</h1>
          <p className="muted">Print, or save as PDF from the print dialog. Each statement starts on a new page.</p>
          <nav className="stmt-years" aria-label="Year">
            <Link className="btn btn-sm btn-quiet" href={yearHref(year - 1)} aria-label={`Statements for ${year - 1}`}>
              ‹ {year - 1}
            </Link>
            <strong>{year}</strong>
            {year < thisYear && (
              <Link className="btn btn-sm btn-quiet" href={yearHref(year + 1)} aria-label={`Statements for ${year + 1}`}>
                {year + 1} ›
              </Link>
            )}
          </nav>
        </div>
        <div className="row">
          <Link className="btn" href="/finance/giving">
            Back to Giving
          </Link>
          {statements.length > 0 && <PrintButton label={statements.length > 1 ? "Print all" : "Print statement"} />}
        </div>
      </div>
      {statements.length === 0 ? (
        <EmptyState title={`No statements for ${year}`} actions={[{ label: "Back to Giving", href: "/finance/giving" }]}>
          {params.all ? `No named giver has gifts recorded in ${year}. Offering lines without a name (the plate, an online payout) count in the totals but don't get a statement.` : `No gifts were recorded for this giver in ${year}.`}
        </EmptyState>
      ) : (
        <div className="fin-stack">
          {statements.length > 1 && (
            <section className="fin-card stmt-contents no-print" aria-labelledby="stmt-contents-h">
              <div className="fin-card-head">
                <h2 id="stmt-contents-h">In this batch</h2>
                <span className="small muted">
                  {statements.length} givers · {dollars(grand)} in all
                </span>
              </div>
              <ol>
                {statements.map((x) => (
                  <li key={x.donorKey}>
                    <a href={`#${anchor(x.donorKey)}`}>{x.donorName}</a>
                    <span className="stmt-contents-amt">{dollars(x.total)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {statements.map((s) => (
            <StatementSheet key={s.donorKey} s={s} funds={ctx.books!.chart.funds} issued={issued} demo={ctx.books!.meta.demo} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
