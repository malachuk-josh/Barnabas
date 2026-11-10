import type { Metadata } from "next";
import Link from "next/link";
import { requirePageLeader } from "@/components/AppShell";
import { OpsFrame, SERVICES_TABS } from "@/components/ops/OpsFrame";
import { PlanEditor } from "@/components/ops/ServicesViews";
import { addDays, friendlyDate, lastSunday, today } from "@/lib/dates";
import { GATHERINGS } from "@/lib/ops/gatherings";
import { wordHref } from "@/lib/services/scripture";
import { loadServices, servicesActor } from "@/lib/services/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order of service · Barnabas" };

const tileNum = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
const tileMonth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const [actor, book] = await Promise.all([servicesActor(leader), loadServices(leader.churchId)]);
  const first = addDays(lastSunday(today()), 7);
  const sundays = Array.from({ length: 8 }, (_, i) => addDays(first, 7 * i));
  const q = await searchParams;
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) && new Date(`${q.date}T00:00:00Z`).getUTCDay() === 0 ? q.date : sundays[0];
  const preach = book.rotation.find((r) => r.date === date);
  const worship = GATHERINGS.filter((g) => g.worship);
  const plans = worship.map((g) => ({ g, plan: book.plans.find((p) => p.date === date && p.gathering === g.key) }));
  const preachHref = wordHref(preach?.passage ?? null);
  return (
    <OpsFrame profile={profile} eyebrow="Services" title={`Order of service: ${friendlyDate(date)}`} intro={preach ? <>Preaching: <strong>{preach.preacher}</strong>{preach.passage ? <> from {preachHref ? <Link href={preachHref}>{preach.passage}</Link> : preach.passage}</> : null}{preach.title ? `, "${preach.title}"` : ""}.</> : "No one is on the rotation for this Sunday yet."} tabs={SERVICES_TABS}>
      <nav className="date-tiles" aria-label="Sunday">
        {sundays.map((d) => {
          const planned = worship.filter((g) => book.plans.some((p) => p.date === d && p.gathering === g.key && p.items.length)).length;
          return (
            <Link key={d} className="date-tile-link" href={`/services/plan?date=${d}`} aria-current={d === date ? "page" : undefined}>
              <small>Sun</small>
              <strong>{tileNum(d)}</strong>
              <span className="date-tile-month">{tileMonth(d)}</span>
              <span className={`date-tile-open${planned === worship.length ? " is-full" : ""}`}>{planned === worship.length ? "Planned" : planned ? `${planned} of ${worship.length}` : "Not yet"}</span>
            </Link>
          );
        })}
      </nav>
      <div className="fin-grid-2">
        {plans.map(({ g, plan }, i) => {
          const other = plans[1 - i];
          return <PlanEditor key={`${date}-${g.key}-${plan?.updatedAt ?? 0}`} date={date} gathering={g.key} label={g.label} items={plan?.items ?? []} planner={actor.planner} otherGathering={{ key: other.g.key, label: other.g.label, planned: Boolean(other.plan?.items.length) }} />;
        })}
      </div>
      <p className="fin-source" style={{ marginTop: 14 }}>
        Orders of service in Barnabas. Scripture links open the passage in The Word.
      </p>
    </OpsFrame>
  );
}
