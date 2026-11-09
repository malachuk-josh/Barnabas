import type { Metadata } from "next";
import { FinanceFrame, NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { GivingView } from "@/components/finance/GivingView";
import { TrendChart } from "@/components/finance/TrendChart";
import { churchData } from "@/lib/chms";
import { today } from "@/lib/dates";
import { dueOccurrences } from "@/lib/finance/giving";
import { wholeDollars } from "@/lib/finance/money";
import { METHOD_LABELS, type GiftMethod } from "@/lib/finance/types";
import { givingSummary, sameDayLastYear } from "@/lib/finance/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Giving · Finance · Barnabas" };

export default async function GivingPage() {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const asOf = today();
  const year = Number(asOf.slice(0, 4));
  const summary = givingSummary(ctx.books, ctx.access, `${year}-01-01`, asOf);
  const lastYear = givingSummary(ctx.books, { role: "deacon", admin: false }, `${year - 1}-01-01`, sameDayLastYear(asOf));
  const people = ctx.canSeeDonors ? (await churchData().listPeople()).map((p) => ({ id: p.id, name: p.name })) : [];
  const dueCount = ctx.canEdit ? ctx.books.recurring.reduce((a, r) => a + dueOccurrences(r, asOf).length, 0) : 0;

  return (
    <FinanceFrame
      ctx={ctx}
      eyebrow="Finance"
      title="Giving"
      intro={ctx.canSeeDonors ? "Gift records, Sunday batches, recurring givers, donor history and year-end statements." : "Church-wide giving totals and trends. Individual giving is visible only to the pastor and treasurer."}
    >
      <div className="fin-stack">
        <div className="fin-grid">
          <section className="fin-card">
            <span className="label">Given in {year} so far</span>
            <div className="fin-stat">{wholeDollars(summary.total)}</div>
            <span className="small muted">
              {summary.count} gifts from {summary.givers} givers. By this day last year: {wholeDollars(lastYear.total)}.
            </span>
            <p className="fin-source">Every gift record dated January 1 to today, all funds.</p>
          </section>
          <section className="fin-card">
            <span className="label">By fund</span>
            {summary.byFund.map((f) => (
              <div className="fin-sub" key={f.fundId}>
                <span>{f.name}</span>
                <span>{wholeDollars(f.total)}</span>
              </div>
            ))}
          </section>
          <section className="fin-card">
            <span className="label">By method</span>
            {(Object.keys(summary.byMethod) as GiftMethod[]).map((m) => (
              <div className="fin-sub" key={m}>
                <span>{METHOD_LABELS[m]}</span>
                <span>{wholeDollars(summary.byMethod[m])}</span>
              </div>
            ))}
          </section>
        </div>

        <section className="fin-card">
          <h2>Giving trends</h2>
          <TrendChart points={summary.trend} title="Monthly giving for the last 13 months" highlight={asOf.slice(0, 7)} />
          <p className="fin-source">Gift records by month, all funds. The first bar is the same month last year; the brass bar is this month so far.</p>
        </section>

        <GivingView
          canEdit={ctx.canEdit}
          canSeeDonors={ctx.canSeeDonors}
          today={asOf}
          year={year}
          people={people}
          funds={ctx.books.chart.funds.map((f) => ({ id: f.id, name: f.name }))}
          banks={ctx.books.chart.accounts.filter((a) => a.bank && !a.archived).map((a) => ({ id: a.id, name: a.name }))}
          donors={summary.donors ?? []}
          recentGifts={summary.recentGifts ?? []}
          recurring={summary.recurring ?? []}
          dueCount={dueCount}
        />

        <section className="fin-card fin-disabled" aria-disabled="true">
          <div className="fin-card-head">
            <h2>Online giving: connect Stripe (coming soon)</h2>
            <button className="btn" type="button" disabled>
              Connect Stripe
            </button>
          </div>
          <p className="muted small">Online gifts will come in on their own once this is ready. Until then, record online and ACH gifts here, or set them up as recurring givers.</p>
        </section>
      </div>
    </FinanceFrame>
  );
}
