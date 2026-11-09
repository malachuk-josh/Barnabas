import type { Metadata } from "next";
import { requirePageLeader } from "@/components/AppShell";
import { OpsFrame, SERVICES_TABS } from "@/components/ops/OpsFrame";
import { RotationView } from "@/components/ops/ServicesViews";
import { addDays, lastSunday, today } from "@/lib/dates";
import { wordHref } from "@/lib/services/scripture";
import { loadServices, servicesActor } from "@/lib/services/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Services · Barnabas" };

export default async function ServicesPage() {
  const { leader, profile } = await requirePageLeader();
  const [actor, book] = await Promise.all([servicesActor(leader), loadServices(leader.churchId)]);
  const first = addDays(lastSunday(today()), 7);
  const sundays = Array.from({ length: 12 }, (_, i) => addDays(first, 7 * i));
  const rows = sundays.map((date) => {
    const r = book.rotation.find((x) => x.date === date);
    const series = r?.seriesId ? book.series.find((s) => s.id === r.seriesId) : book.series.find((s) => date >= s.startDate && date <= s.endDate);
    const plans = book.plans.filter((p) => p.date === date && p.items.length).map((p) => p.gathering);
    return { date, preacher: r?.preacher ?? null, passage: r?.passage ?? null, passageHref: wordHref(r?.passage ?? null), title: r?.title ?? null, series: series ? { id: series.id, title: series.title } : null, plans };
  });
  const series = book.series.map((s) => ({ ...s, passageHref: wordHref(s.passage?.split(/[–-]/)[0] ?? null) }));
  return (
    <OpsFrame
      profile={profile}
      eyebrow="Services"
      title="Sermon and service planning"
      intro={actor.planner ? "Who preaches when, the series you're preaching through, and each Sunday's order of service. Scripture links open in The Word." : "Who preaches when and the series ahead. Pastors and staff plan services."}
      tabs={SERVICES_TABS}
      demo={book.meta.demo ? { text: <>The preaching rotation shows MGBC&apos;s pastors in their real roles: Ethan Malachuk most Sundays, Eric Malachuk sometimes. <strong>No series, passages or orders of service are made up</strong>; plan them here.</>, clear: actor.planner ? { path: "/api/services", method: "POST", body: { action: "demo-clear", confirm: "CLEAR" }, label: "Clear the demo rotation" } : undefined } : undefined}
    >
      <RotationView rows={rows} series={series} planner={actor.planner} />
    </OpsFrame>
  );
}
