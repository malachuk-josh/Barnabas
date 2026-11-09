import { requirePageLeader } from "@/components/AppShell";
import { ReportsFrame } from "@/components/reports/ReportsFrame";
import { ReportSection } from "@/components/reports/ReportSection";
import { friendlyDate } from "@/lib/dates";
import { buildReports } from "@/lib/reports/service";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { leader, profile } = await requirePageLeader();
  const { sections, asOf } = await buildReports(leader);
  const shown = sections.filter((s) => s.allowed);
  const locked = sections.filter((s) => !s.allowed);
  return (
    <ReportsFrame profile={profile} title="How we're doing" intro={<>Attendance, giving, volunteers, care, guests, events and kids, as of {friendlyDate(asOf)}. Totals only: names stay where they belong.</>}>
      <nav className="report-jump" aria-label="Jump to a report">
        {shown.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.title}
          </a>
        ))}
      </nav>
      <div className="report-grid">
        {shown.map((s) => (
          <ReportSection key={s.id} section={s} />
        ))}
      </div>
      {locked.length > 0 && (
        <p className="small muted" style={{ marginTop: 18 }}>
          Not shown for your role: {locked.map((s) => s.title.toLowerCase()).join(", ")}.
        </p>
      )}
    </ReportsFrame>
  );
}
