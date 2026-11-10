import Link from "next/link";
import type { Section } from "@/lib/reports/types";
import { ReportChart } from "./ReportChart";
import { VerseNote } from "@/components/VerseNote";

/**
 * One report with data: the summary and headline numbers beside its charts, then the table view and the source.
 * Sections with no data yet use ReportWaiting instead.
 */
export function ReportSection({ section }: { section: Section }) {
  const charts = [section.chart, section.extra].filter((c): c is NonNullable<typeof c> => Boolean(c));
  return (
    <section className="fin-card report-card" aria-labelledby={`r-${section.id}`} id={section.id}>
      <div className="report-card-head">
        <div className="report-card-title">
          <h2 id={`r-${section.id}`}>{section.title}</h2>
          {section.verse && <VerseNote verse={section.verse} short />}
        </div>
        <a className="btn btn-sm btn-quiet" href={`/api/reports/csv?section=${section.id}`} download>
          Download CSV
        </a>
      </div>
      <div className={`report-body${charts.length ? "" : " no-chart"}`}>
        <div className="report-text">
          <p className="report-summary">{section.summary}</p>
          {section.stats.length > 0 && (
            <dl className="report-stats">
              {section.stats.map((s) => (
                <div key={s.label} className={s.tone ? `tone-${s.tone}` : undefined}>
                  <dt>{s.label}</dt>
                  <dd className="tabular">{s.value}</dd>
                  {s.note && <dd className="small muted">{s.note}</dd>}
                </div>
              ))}
            </dl>
          )}
        </div>
        {charts.length > 0 && (
          <div className="report-charts">
            {charts.map((c) => (
              <ReportChart key={c.title} chart={c} />
            ))}
          </div>
        )}
      </div>
      <details className="report-table">
        <summary>Show the numbers as a table</summary>
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                {section.table.header.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={typeof c === "number" ? "num" : undefined}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="fin-source">{section.source}</p>
    </section>
  );
}

/** A report that has nothing to count yet: what it will show, and the first step. */
export function ReportWaiting({ section }: { section: Section }) {
  if (!section.empty) return null;
  return (
    <section className="report-waiting" aria-labelledby={`r-${section.id}`} id={section.id}>
      <h3 id={`r-${section.id}`}>{section.title}</h3>
      <p className="small muted">{section.empty.text}</p>
      {section.empty.actions.length > 0 && (
        <div className="report-waiting-actions">
          {section.empty.actions.map((a, i) => (
            <Link key={a.href + a.label} href={a.href} className={`btn btn-sm${i === 0 ? " btn-primary" : ""}`}>
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
