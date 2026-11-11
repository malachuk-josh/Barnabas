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
  // The preview shows the draft's first line as its title, and the numbers without their own heading line.
  const [heading, ...body] = text.split("\n");
  const numberLines = numbers ? numbers.split("\n").slice(1) : [];
  return (
    <ReportsFrame profile={profile} title="Monthly ministry report" intro="A short narrative of the month from the numbers you can see, for the deacons, the board or your own notes.">
      <div className="report-monthly">
        <article className="report-letter" aria-labelledby="report-letter-h">
          <h2 id="report-letter-h" className="report-letter-eyebrow">
            Preview for {month}
          </h2>
          <h3 className="report-letter-title">{heading}</h3>
          <div className="report-letter-text">{body.join("\n").trim()}</div>
          {numberLines.length > 0 && (
            <>
              <h3>The numbers</h3>
              <ul className="report-letter-numbers">
                {numberLines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
        </article>
        <aside className="report-monthly-side">
          <section className="fin-card">
            <h2>Send it on</h2>
            <p className="small muted">Drafting puts it in your Drafts, addressed to you. Read it over, then send or forward it.</p>
            <DraftReportButton />
          </section>
          <section className="fin-card">
            <h2>Or ask Barnabas</h2>
            <p className="small">&ldquo;Write up this month&apos;s ministry report.&rdquo;</p>
            <p className="small muted">It writes the narrative in its own words from these same totals, and the exact numbers are added underneath.</p>
          </section>
          <p className="small muted report-monthly-privacy">Individual giving, care notes and anything about children are never included.</p>
        </aside>
      </div>
    </ReportsFrame>
  );
}
