import { EmptyState } from "@/components/EmptyState";
import type { Section } from "@/lib/reports/types";
import { ReportChart } from "./ReportChart";
import { VerseNote } from "@/components/VerseNote";

/** One report card: headline numbers, the chart, its plain-language summary, the table view and a CSV download. */
export function ReportSection({ section }: { section: Section }) {
  if (!section.allowed) {
    return (
      <section className="fin-card report-card report-locked" aria-labelledby={`r-${section.id}`}>
        <h2 id={`r-${section.id}`}>{section.title}</h2>
        <p className="small muted">{section.locked}</p>
      </section>
    );
  }
  return (
    <section className="fin-card report-card" aria-labelledby={`r-${section.id}`} id={section.id}>
      <div className="fin-card-head">
        <h2 id={`r-${section.id}`}>{section.title}</h2>
        {!section.empty && (
          <a className="btn btn-sm" href={`/api/reports/csv?section=${section.id}`} download>
            Download CSV
          </a>
        )}
      </div>
      {section.verse && <VerseNote verse={section.verse} />}
      {section.empty ? (
        <EmptyState compact title={section.empty.title} actions={section.empty.actions.map((a, i) => ({ ...a, primary: i === 0 }))}>
          {section.empty.text}
        </EmptyState>
      ) : (
        <>
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
          {section.chart && <ReportChart chart={section.chart} />}
          {section.extra && <ReportChart chart={section.extra} />}
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
        </>
      )}
      <p className="fin-source">{section.source}</p>
    </section>
  );
}
