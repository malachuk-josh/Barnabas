"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ImportPanel } from "./ImportPanel";

type State = {
  credentials: boolean;
  connection: { organization?: string; includeServices: boolean; lastSyncAt?: number; lastResult?: { people: number; households: number; teams: number; plans: number; requests: number; ms: number }; lastError?: string } | null;
  people: number;
  imported: number;
  households: number;
  teams: number;
  syncedAt: number | null;
};

const when = (ms?: number | null) => (ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

/** Settings → Church database (admins): connect Planning Center, sync, and import people from ChurchTrac. */
export function ChurchDataSettings({ canImportGiving }: { canImportGiving: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState(true);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/chms/planning-center");
    if (res.ok) setState(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "connect" | "sync" | "disconnect", extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    const res = await fetch("/api/chms/planning-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    setConfirmDisconnect(false);
    if (res.ok) setState(json);
    else {
      setError(json.error ?? "That didn't work.");
      void load();
    }
  }

  const c = state?.connection;
  return (
    <section className="card stack settings-data" aria-labelledby="chms-title" id="church-database">
      <div>
        <h2 id="chms-title">Church database</h2>
        <p className="muted small">
          {state && state.people > 0
            ? `${state.people} people from your church are connected${state.imported ? ` (${state.imported} imported from a file)` : ""}. Barnabas uses them instead of the demo directory.`
            : "Barnabas is showing Mount Greylock's demo leaders and schedule. Connect Planning Center or import your people from ChurchTrac."}
        </p>
      </div>

      <div className="fin-card stack" style={{ gap: 10 }}>
        <div className="fin-card-head">
          <h3>Planning Center</h3>
          {c ? <span className="badge badge-ok">Connected{c.organization ? ` · ${c.organization}` : ""}</span> : <span className="badge">Not connected</span>}
        </div>
        {!state ? (
          <p className="muted small">Loading…</p>
        ) : !state.credentials && !c ? (
          <ol className="setup-steps small">
            <li>
              Sign in at <a href="https://api.planningcenteronline.com/oauth/applications">api.planningcenteronline.com/oauth/applications</a> as a Planning Center administrator (People access is needed; Services for teams and plans).
            </li>
            <li>Under Personal Access Tokens, choose New personal access token. Copy the Application ID and Secret.</li>
            <li>
              In Vercel, set <code>PCO_APP_ID</code> and <code>PCO_SECRET</code>, redeploy, and come back here to connect. See the <a href="https://developer.planning.center/docs/#/overview/authentication">Planning Center API docs</a>.
            </li>
          </ol>
        ) : c ? (
          <>
            <p className="small tabular">
              Last sync: {when(c.lastSyncAt)}
              {c.lastResult && ` · ${c.lastResult.people} people, ${c.lastResult.households} households${c.includeServices ? `, ${c.lastResult.teams} teams, ${c.lastResult.plans} plans` : ""} (${c.lastResult.requests} requests, ${Math.round(c.lastResult.ms / 1000)} s)`}
            </p>
            {c.lastError && <p className="error small">{c.lastError}</p>}
            <div className="row">
              <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={() => void act("sync")}>
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
              {confirmDisconnect ? (
                <span className="row">
                  <button className="btn btn-danger" type="button" onClick={() => void act("disconnect", { removePeople: true })}>Disconnect and remove its people</button>
                  <button className="btn" type="button" onClick={() => void act("disconnect", { removePeople: false })}>Disconnect, keep the last sync</button>
                  <button className="btn" type="button" onClick={() => setConfirmDisconnect(false)}>Cancel</button>
                </span>
              ) : (
                <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
              )}
            </div>
            <p className="small muted">Syncs read people, emails, phones and households{c.includeServices ? ", plus Services teams and the last twelve weeks of plans" : ""}. Planning Center allows 100 requests every 20 seconds; Barnabas paces itself and waits when asked.</p>
          </>
        ) : (
          <>
            <p className="small">The token is set on the server. Connecting checks it with Planning Center and runs the first sync.</p>
            <label className="row small">
              <input type="checkbox" checked={services} onChange={(e) => setServices(e.target.checked)} /> Also read Services teams and plans for the serving radar
            </label>
            <div className="row">
              <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={() => void act("connect", { includeServices: services })}>
                {busy === "connect" ? "Connecting…" : "Connect Planning Center"}
              </button>
            </div>
          </>
        )}
        {error && <p className="error small" role="alert">{error}</p>}
      </div>

      <ImportPanel
        kind="people"
        title="Import people from ChurchTrac"
        sample={"First Name,Last Name,Email,Mobile Phone,Family\nJordan,Example,jordan@example.org,413-555-0100,Example Family"}
        intro={
          <>
            In ChurchTrac, open People, choose Export (CSV), and pick it here. Other spreadsheets work too: Barnabas matches the columns (names, email, phone, family). Someone already here is updated, not added twice, matched by email or by phone and name.
          </>
        }
      />
      {canImportGiving && (
        <ImportPanel
          kind="giving"
          title="Import giving from ChurchTrac"
          sample={"Date,Name,Amount,Fund,Payment Type,Check #\n11/02/2026,Jordan Example,50.00,General,Check,1042"}
          intro={
            <>
              In ChurchTrac, open Contributions, export the date range as CSV, and pick it here. Each date becomes one deposit in Finance; funds are matched by name. A gift already imported is skipped, so overlapping exports never count twice.
            </>
          }
        />
      )}
      <p className="small muted">
        Download people, rosters, registrations and giving summaries from <Link href="/reports/exports">Reports → Exports</Link>.
      </p>
    </section>
  );
}
