import { requirePageLeader } from "@/components/AppShell";
import { ReportsFrame } from "@/components/reports/ReportsFrame";
import { canExport, EXPORT_INFO, EXPORT_KINDS } from "@/lib/exports";
import { accessFor } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function ExportsPage() {
  const { leader, profile } = await requirePageLeader();
  const access = await accessFor(leader);
  return (
    <ReportsFrame profile={profile} title="Exports" intro="Download your church's data as CSV for a spreadsheet, the board or another system. Each download is recorded in the audit log.">
      <div className="fin-grid">
        {EXPORT_KINDS.map((k) => {
          const info = EXPORT_INFO[k];
          const ok = canExport(access, k);
          return (
            <section key={k} className="fin-card">
              <h2 style={{ fontSize: "1.1rem" }}>{info.label}</h2>
              <p className="small muted">{info.description}</p>
              {ok ? (
                <a className="btn" href={`/api/export/${k}`} download>
                  Download CSV
                </a>
              ) : (
                <p className="small muted">Your role doesn&apos;t include this one.</p>
              )}
            </section>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>Every chart on the Reports page also has its own CSV download.</p>
    </ReportsFrame>
  );
}
