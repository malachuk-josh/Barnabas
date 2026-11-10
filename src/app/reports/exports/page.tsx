import { requirePageLeader } from "@/components/AppShell";
import { ReportsFrame } from "@/components/reports/ReportsFrame";
import { canExport, EXPORT_INFO, EXPORT_KINDS } from "@/lib/exports";
import { accessFor } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function ExportsPage() {
  const { leader, profile } = await requirePageLeader();
  const access = await accessFor(leader);
  return (
    <ReportsFrame profile={profile} title="Exports" intro="Your church's data as CSV, for a spreadsheet, the board or another system. Each download is recorded in the audit log.">
      <ul className="export-list">
        {EXPORT_KINDS.map((k) => {
          const info = EXPORT_INFO[k];
          const ok = canExport(access, k);
          return (
            <li key={k} className={ok ? undefined : "is-locked"}>
              <span className="export-file" aria-hidden="true">
                CSV
              </span>
              <div className="export-text">
                <h2>{info.label}</h2>
                <p className="small muted">{info.description}</p>
              </div>
              {ok ? (
                <a className="btn btn-sm" href={`/api/export/${k}`} download>
                  Download
                </a>
              ) : (
                <span className="small muted export-locked">Not in your role</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="small muted export-foot">Every report on How we&apos;re doing also has its own CSV download.</p>
    </ReportsFrame>
  );
}
