import { requirePageLeader } from "@/components/AppShell";
import { ReportsFrame } from "@/components/reports/ReportsFrame";
import { ReportSection, ReportWaiting } from "@/components/reports/ReportSection";
import { friendlyDate } from "@/lib/dates";
import { buildReports } from "@/lib/reports/service";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { leader, profile } = await requirePageLeader();
  const { sections, asOf } = await buildReports(leader);
  const shown = sections.filter((s) => s.allowed);
  const withData = shown.filter((s) => !s.empty);
  const waiting = shown.filter((s) => s.empty);
  const locked = sections.filter((s) => !s.allowed);
  return (
    <ReportsFrame profile={profile} title="How we're doing" intro={<>As of {friendlyDate(asOf)}. Totals only: names stay where they belong.</>}>
      {withData.length > 0 && (
        <nav className="report-glance" aria-label="At a glance">
          {withData.map((s) => {
            const lead = s.stats[0];
            return (
              <a key={s.id} href={`#${s.id}`} className={lead?.tone ? `tone-${lead.tone}` : undefined}>
                <span className="report-glance-title">{s.title}</span>
                <strong className="tabular">{lead?.value ?? "See report"}</strong>
                {lead && <span className="small muted">{lead.label}</span>}
              </a>
            );
          })}
        </nav>
      )}
      <div className="report-list">
        {withData.map((s) => (
          <ReportSection key={s.id} section={s} />
        ))}
      </div>
      {waiting.length > 0 && (
        <section className="report-waiting-group" aria-labelledby="report-waiting-h">
          <h2 id="report-waiting-h">{withData.length ? "Not counting yet" : "Getting started"}</h2>
          <p className="small muted">These reports fill in on their own once there&apos;s something to count.</p>
          <div className="report-waiting-grid">
            {waiting.map((s) => (
              <ReportWaiting key={s.id} section={s} />
            ))}
          </div>
        </section>
      )}
      {locked.length > 0 && <p className="small muted report-locked-note">Not shown for your role: {locked.map((s) => s.title.toLowerCase()).join(", ")}.</p>}
    </ReportsFrame>
  );
}
