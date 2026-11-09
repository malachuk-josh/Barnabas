import { requirePageLeader } from "@/components/AppShell";
import { DraftReportButton } from "@/components/reports/DraftReportButton";
import { ReportsFrame } from "@/components/reports/ReportsFrame";
import { config } from "@/lib/config";
import { today } from "@/lib/dates";
import { monthLabel } from "@/lib/finance/giving";
import { numbersBlock } from "@/lib/reports/monthly";
import { buildReports, monthlyNarrative } from "@/lib/reports/service";

export const dynamic = "force-dynamic";

export default async function MonthlyReportPage() {
  const { leader, profile } = await requirePageLeader();
  const { sections } = await buildReports(leader);
  const month = monthLabel(today().slice(0, 7), "long");
  const text = monthlyNarrative(sections, month, config.churchName.replace(/\s*\(demo\)\s*$/i, ""));
  const numbers = numbersBlock(sections);
  return (
    <ReportsFrame profile={profile} title="Monthly ministry report" intro="A short narrative of the month from the numbers you can see, for the deacons, the board or your own notes. It goes to your Drafts first.">
      <div className="report-grid report-grid-1">
        <section className="fin-card stack">
          <h2>Preview for {month}</h2>
          <pre className="report-preview">{numbers ? `${text}\n\n${numbers}` : text}</pre>
          <DraftReportButton />
          <p className="small muted">Or ask Barnabas: &ldquo;Write up this month&apos;s ministry report.&rdquo; It writes the narrative in its own words from these same totals, and the exact numbers are added underneath. Individual giving, care notes and anything about children are never included.</p>
        </section>
      </div>
    </ReportsFrame>
  );
}
