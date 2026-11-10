import type { Metadata } from "next";
import Link from "next/link";
import { FinanceFrame, NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { HealthPill, Meter } from "@/components/finance/Health";
import { TrendChart } from "@/components/finance/TrendChart";
import { today } from "@/lib/dates";
import { lastMonths, monthlyTrend } from "@/lib/finance/giving";
import { percent, wholeDollars } from "@/lib/finance/money";
import { financeOverview } from "@/lib/finance/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finance · Barnabas" };

/** A figure's source, one tap away: the number leads, how it's counted stays on the card. */
function SourceNote({ children }: { children: React.ReactNode }) {
  return (
    <details className="fin-source-fold">
      <summary>How this is counted</summary>
      <p className="fin-source">{children}</p>
    </details>
  );
}

function Change({ now, then }: { now: number; then: number }) {
  if (!then) return null;
  const p = percent(now - then, then)!;
  return (
    <span className={p >= 0 ? "fin-up" : "fin-down"}>
      {p >= 0 ? "Up" : "Down"} {Math.abs(p).toFixed(0)}%
    </span>
  );
}

export default async function FinanceOverviewPage() {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const asOf = today();
  const o = financeOverview(ctx.books, asOf);
  const trend = monthlyTrend(ctx.books.gifts, lastMonths(asOf, 13));
  const camp = o.missions.campaign;

  return (
    <FinanceFrame ctx={ctx} eyebrow="Finance" title="Overview" intro={`Where things stand for ${o.year}, through ${new Date(`${asOf}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}.`}>
      <div className="fin-stack">
        <div className="fin-grid fin-overview-stats">
          <section className="fin-card">
            <span className="label">Year to date</span>
            <div className="fin-stat">{wholeDollars(o.ytd.net)}</div>
            <span className="muted small">{o.ytd.net >= 0 ? "more came in than went out" : "more went out than came in"}</span>
            <div className="fin-sub">
              <span>Income</span>
              <span>{wholeDollars(o.ytd.income)}</span>
            </div>
            <div className="fin-sub">
              <span>Expenses</span>
              <span>{wholeDollars(o.ytd.expenses)}</span>
            </div>
            <SourceNote>{o.ytd.source}</SourceNote>
          </section>

          <section className="fin-card">
            <span className="label">{o.generalFund.name}</span>
            <div className="fin-stat">{wholeDollars(o.generalFund.balance)}</div>
            <span className="muted small">unrestricted, for day-to-day ministry</span>
            {o.restrictedFunds.map((f) => (
              <div className="fin-sub" key={f.id}>
                <span>{f.name} (restricted)</span>
                <span>{wholeDollars(f.balance)}</span>
              </div>
            ))}
            <SourceNote>{o.generalFund.source} Restricted funds are tracked the same way, each on its own.</SourceNote>
          </section>

          <section className="fin-card">
            <span className="label">Giving in {o.giving.monthLabel}</span>
            <div className="fin-stat">{wholeDollars(o.giving.monthToDate)}</div>
            <span className="muted small">
              so far, vs {wholeDollars(o.giving.lastYearSamePeriod)} by this day last year <Change now={o.giving.monthToDate} then={o.giving.lastYearSamePeriod} />
            </span>
            <div className="fin-sub">
              <span>All of {o.giving.monthLabel.replace(/\d{4}/, String(o.year - 1))}</span>
              <span>{wholeDollars(o.giving.lastYearMonth)}</span>
            </div>
            <SourceNote>{o.giving.source}</SourceNote>
          </section>

          <section className="fin-card">
            <span className="label">Missions</span>
            {camp ? (
              <>
                <div className="fin-stat">{wholeDollars(camp.received)}</div>
                <span className="muted small">
                  given toward {camp.name}, of {wholeDollars(camp.pledged)} pledged
                </span>
                <Meter used={percent(camp.received, camp.pledged || camp.goal)} elapsed={Math.min(1, o.budgetHealth.elapsed)} health="on_track" label={`${percent(camp.received, camp.pledged || camp.goal)}% of pledges received`} />
                <div className="fin-sub">
                  <span>Goal</span>
                  <span>{wholeDollars(camp.goal)}</span>
                </div>
              </>
            ) : (
              <div className="fin-stat">{wholeDollars(o.missions.fundBalance)}</div>
            )}
            <div className="fin-sub">
              <span>Paid to {o.missions.partnerCount} partners this year</span>
              <span>
                {wholeDollars(o.missions.paidToPartners)} of {wholeDollars(o.missions.committedToPartners)}
              </span>
            </div>
            <SourceNote>{o.missions.source}</SourceNote>
          </section>
        </div>

        <div className="fin-grid-2">
          <section className="fin-card">
            <div className="fin-card-head">
              <h2>Budget health by ministry</h2>
              <Link href="/finance/budget" className="small">
                Open the budget
              </Link>
            </div>
            {o.budgetHealth.hasBudget ? (
              <div>
                {o.budgetHealth.groups.map((g) => (
                  <div className="fin-health-row" key={g.group}>
                    <strong>{g.group}</strong>
                    <HealthPill health={g.health} />
                    <Meter used={g.pctUsed} elapsed={o.budgetHealth.elapsed} health={g.health} label={`${g.pctUsed ?? 0}% of the year's budget spent`} />
                    <small>
                      {wholeDollars(g.actual)} of {wholeDollars(g.annual)} ({g.pctUsed ?? 0}% spent, {Math.round(o.budgetHealth.elapsed * 100)}% of the year gone)
                    </small>
                  </div>
                ))}
                {o.budgetHealth.income.map((g) => (
                  <div className="fin-health-row" key={`in-${g.group}`}>
                    <strong>{g.group} (income)</strong>
                    <HealthPill health={g.health} />
                    <Meter used={g.pctUsed} elapsed={o.budgetHealth.elapsed} health={g.health} label={`${g.pctUsed ?? 0}% of the year's income budget received`} />
                    <small>
                      {wholeDollars(g.actual)} of {wholeDollars(g.annual)} received ({g.pctUsed ?? 0}%)
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                There&apos;s no budget for {o.year} yet. <Link href="/finance/budget">Set one up</Link>.
              </p>
            )}
            <p className="fin-source">{o.budgetHealth.source} The brass tick marks how much of the year has passed.</p>
          </section>

          <section className="fin-card">
            <div className="fin-card-head">
              <h2>Giving by month</h2>
              <Link href="/finance/giving" className="small">
                Giving details
              </Link>
            </div>
            <TrendChart points={trend} title="Giving by month, all funds" highlight={asOf.slice(0, 7)} />
            <div className="fin-legend">
              <span>
                <i style={{ background: "var(--accent)" }} />
                Monthly giving
              </span>
              <span>
                <i style={{ background: "var(--brass)" }} />
                This month so far
              </span>
              <span>
                <i style={{ background: "var(--sea-glass)" }} />
                Same month last year
              </span>
            </div>
            <p className="fin-source">Every gift record for the last 13 months, all funds, by the date of the gift.</p>
            {o.bankAccounts.map((b) => (
              <div className="fin-sub" key={b.id}>
                <span>{b.name}</span>
                <span>{wholeDollars(b.balance)}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </FinanceFrame>
  );
}
