"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type System = "churchtrac" | "planning_center" | "csv";
type FileKind = "people" | "groups" | "attendance" | "giving";
type Row = { row: number; label: string; action: "add" | "update" | "same" | "skip"; reason?: string; detail?: string };
type Result = { batchId?: string; dryRun: boolean; header: string[]; columns: Record<string, number | undefined>; counts: Record<string, number>; skipped: { reason: string; count: number }[]; rows: Row[]; extras?: { newFunds: string[]; deposits: number; total: number } };
export type LogEntry = { id: string; system: System; file: FileKind; fileName?: string; at: number; byName: string; counts: Record<string, number>; skipped: { reason: string; count: number }[]; created: Record<string, number>; undoneAt?: number; undoneBy?: string };

const SYSTEM_LABEL: Record<System, string> = { churchtrac: "ChurchTrac", planning_center: "Planning Center", csv: "Another spreadsheet" };
const FILE_LABEL: Record<FileKind, string> = { people: "People and households", groups: "Groups", attendance: "Attendance", giving: "Giving history" };
const ACTION: Record<Row["action"], string> = { add: "New", update: "Update", same: "Already here", skip: "Skipped" };

const FIELDS: Record<FileKind, Record<string, string>> = {
  people: { firstName: "First name", lastName: "Last name", fullName: "Full name", nickname: "Nickname", email: "Email", phone: "Mobile phone", homePhone: "Home phone", street: "Street", city: "City", state: "State", zip: "ZIP", birthdate: "Birthdate", anniversary: "Anniversary", status: "Member status", membershipDate: "Membership date", household: "Household / family", householdRole: "Family position", language: "Language", groups: "Groups", externalId: "Their ID" },
  groups: { group: "Group", fullName: "Full name", firstName: "First name", lastName: "Last name", email: "Email", role: "Role in group" },
  attendance: { date: "Date", fullName: "Full name", firstName: "First name", lastName: "Last name", email: "Email", event: "Service, event or group", present: "Present?" },
  giving: { date: "Date", donor: "Giver (full name)", firstName: "First name", lastName: "Last name", email: "Email", amount: "Amount", fund: "Fund", method: "Method", check: "Check number" },
};

/** Where each file comes from, in each system's own words. ChurchTrac's steps follow its help center (People and Giving reports). */
const STEPS: Record<System, Record<FileKind, React.ReactNode>> = {
  churchtrac: {
    people: (
      <ol className="setup-steps small">
        <li>In ChurchTrac, open the <strong>People</strong> screen and its <strong>Reports</strong> tab.</li>
        <li>Pick a report that lists everyone with their details: <strong>Member Directory</strong> works, or make one under <strong>Setup → Custom Reports</strong> with name, family, email, mobile phone, address, birthdate, anniversary, member status, membership date and groups.</li>
        <li>Include everyone: choose a Smart List of all people.</li>
        <li>Choose <strong>View Report</strong>, then <strong>Export to CSV</strong> (next to View Report).</li>
      </ol>
    ),
    groups: (
      <ol className="setup-steps small">
        <li>Easiest: add the <strong>Groups</strong> field to the custom People report above, and Barnabas makes each group and its members from that column, in the same step.</li>
        <li>Or upload a roster with a group column and a name (or email) column, one row per person per group. ChurchTrac&apos;s help center doesn&apos;t document a separate group-roster export, so a custom report or a spreadsheet is the way.</li>
      </ol>
    ),
    attendance: (
      <ol className="setup-steps small">
        <li>In ChurchTrac, open the Events/Attendance screen, its <strong>Reports</strong> tab, and <strong>Attendance Reports</strong>.</li>
        <li>Choose the start and end dates, the report and the groups, then view it.</li>
        <li>If <strong>Export to CSV</strong> appears next to View Report, use it. ChurchTrac documents attendance reports as print or PDF, so if there&apos;s no CSV, ask ChurchTrac support for an attendance export, or bring over the most recent weeks as a spreadsheet with Date, Name and Service columns.</li>
      </ol>
    ),
    giving: (
      <ol className="setup-steps small">
        <li>In ChurchTrac, open the <strong>Giving</strong> screen and its <strong>Reports</strong> tab.</li>
        <li>Pick the date range at the top (all the years you want to keep; you can do one year at a time).</li>
        <li>Choose a report that lists each contribution with its date, giver, amount and fund (not a totals report such as the Giving History Report), and run it as <strong>CSV</strong>.</li>
      </ol>
    ),
  },
  planning_center: {
    people: (
      <ol className="setup-steps small">
        <li>In Planning Center <strong>People</strong>, open the People page and choose <strong>Actions → Import &amp; Export CSV</strong>.</li>
        <li>Choose <strong>Start Export</strong>, then <strong>Generate and send CSV</strong>. Planning Center emails a download link (good for 48 hours) with every profile and its household.</li>
      </ol>
    ),
    groups: (
      <ol className="setup-steps small">
        <li>Export each group&apos;s member list from Planning Center Groups as CSV, or one list of everyone with a group column. Barnabas needs a group column and a name or email column.</li>
      </ol>
    ),
    attendance: (
      <ol className="setup-steps small">
        <li>Export check-ins or group attendance as CSV with a date, a name (or email) and the event or group.</li>
      </ol>
    ),
    giving: (
      <ol className="setup-steps small">
        <li>In Planning Center <strong>Giving</strong>, open <strong>Donations → Reports</strong> and the <strong>By donation</strong> tab.</li>
        <li>Set the date filter, then select the download arrow to export the donations as CSV.</li>
      </ol>
    ),
  },
  csv: {
    people: <p className="small">Any spreadsheet with a row per person: first and last name at least; email, mobile, address, birthdays, member status and family help.</p>,
    groups: <p className="small">A row per person per group, with Group and Name (or Email) columns.</p>,
    attendance: <p className="small">A row per person per service, with Date, Name (or Email) and Service or Group columns.</p>,
    giving: <p className="small">A row per gift, with Date, Giver, Amount, and Fund and Method if you have them.</p>,
  },
};

/** Reads a .csv as text, or the first sheet of an .xlsx/.xls as CSV, in the browser (the server only ever sees CSV). */
async function readFile(f: File): Promise<string> {
  if (/\.(xlsx|xlsm|xls)$/i.test(f.name)) {
    const { xlsxToCsv } = await import("@/lib/migrate/xlsx");
    return xlsxToCsv(await f.arrayBuffer());
  }
  return f.text();
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function MigrationWizard({ log, canGiving, peopleCount }: { log: LogEntry[]; canGiving: boolean; peopleCount: number }) {
  const router = useRouter();
  const [system, setSystem] = useState<System>("churchtrac");
  const [file, setFile] = useState<FileKind | null>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string>();
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState(false);
  const [preview, setPreview] = useState<Result | null>(null);
  const [dry, setDry] = useState<Result | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);

  const files: FileKind[] = canGiving ? ["people", "groups", "attendance", "giving"] : ["people", "groups", "attendance"];
  const doneFor = (k: FileKind) => log.filter((l) => l.file === k && !l.undoneAt).length;

  async function call(action: "preview" | "dryrun" | "commit", map = mapping, body = csv, ex = extra) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/people/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, system, file, csv: body, fileName, mapping: Object.keys(map).length ? map : undefined, extraAsCustom: ex }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That didn't work.");
      return json as Result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function choose(f: File) {
    setError(null);
    setDone(null);
    setDry(null);
    try {
      const text = await readFile(f);
      setCsv(text);
      setFileName(f.name);
      setMapping({});
      const r = await call("preview", {}, text);
      setPreview(r);
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file.");
    }
  }

  async function remap(field: string, col: number) {
    const next = { ...mapping, [field]: col };
    setMapping(next);
    setDry(null);
    const r = await call("preview", next);
    if (r) setPreview(r);
  }

  async function commit() {
    const r = await call("commit");
    if (!r) return;
    setDone(`Imported ${FILE_LABEL[file!].toLowerCase()}: ${r.counts.add} new, ${r.counts.update} updated, ${r.counts.same} already here, ${r.counts.skip} skipped.${r.extras ? ` ${r.extras.deposits} deposits, ${money(r.extras.total)}${r.extras.newFunds.length ? `; new funds: ${r.extras.newFunds.join(", ")}` : ""}.` : ""} It's in the import log below, where you can undo it.`);
    setPreview(null);
    setDry(null);
    setCsv("");
    setFile(null);
    router.refresh();
  }

  async function undo(id: string) {
    setError(null);
    const res = await fetch("/api/people/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo", batchId: id }) });
    const json = await res.json().catch(() => ({}));
    setUndoing(null);
    if (!res.ok) setError(json.error ?? "Couldn't undo it.");
    else {
      setDone("Undone. Everything that import added is gone, and what it changed is back as it was.");
      router.refresh();
    }
  }

  const c = preview?.counts;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="fin-card stack migrate-step" aria-labelledby="mig-1">
        <h2 id="mig-1"><span className="step-num">1</span> Where is your church coming from?</h2>
        <div className="segmented" role="radiogroup" aria-label="Where you're moving from">
          {(Object.keys(SYSTEM_LABEL) as System[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={system === s} className={system === s ? "on" : ""} onClick={() => { setSystem(s); setPreview(null); setFile(null); }}>
              {SYSTEM_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="small muted">Bring the files over in this order: people first (everything else is matched to them), then groups, attendance and giving. Each file is previewed before anything is saved, and every import can be undone.</p>
      </section>

      <section className="fin-card stack migrate-step" aria-labelledby="mig-2">
        <h2 id="mig-2"><span className="step-num">2</span> Export each file and bring it in</h2>
        <ul className="migrate-files">
          {files.map((k, i) => (
            <li key={k} className={`migrate-file${file === k ? " open" : ""}`}>
              <div className="fin-card-head">
                <h3>
                  {i + 1}. {FILE_LABEL[k]}
                  {doneFor(k) > 0 && <span className="badge badge-ok">Imported</span>}
                </h3>
                <button type="button" className={`btn btn-sm${file === k ? "" : " btn-primary"}`} disabled={k !== "people" && peopleCount === 0} onClick={() => { setFile(file === k ? null : k); setPreview(null); setDry(null); setCsv(""); setDone(null); setError(null); }}>
                  {file === k ? "Close" : doneFor(k) ? "Import another file" : "Start"}
                </button>
              </div>
              {k !== "people" && peopleCount === 0 && <p className="small muted">Bring people in first; this file is matched to them.</p>}
              {file === k && (
                <div className="stack" style={{ gap: 12 }} data-no-pull>
                  <div>
                    <h4 className="setup-h">How to export it from {SYSTEM_LABEL[system]}</h4>
                    {STEPS[system][k]}
                  </div>
                  <div className="field">
                    <label htmlFor={`mig-file-${k}`}>Your file (.csv or .xlsx)</label>
                    <input id={`mig-file-${k}`} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); }} />
                  </div>
                  {busy && !preview && <p className="small muted">Reading…</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="notice success" role="status">{done}</p>}
      </section>

      {preview && c && file && (
        <section className="fin-card stack migrate-step" aria-labelledby="mig-3" data-no-pull>
          <h2 id="mig-3"><span className="step-num">3</span> Check it, then import</h2>
          <p className="small muted">{fileName}: Barnabas matched these columns from the header row. Change any that are wrong and the preview updates.</p>
          <div className="map-grid">
            {Object.entries(FIELDS[file]).map(([field, label]) => (
              <div className="field" key={field}>
                <label htmlFor={`map-${field}`}>{label}</label>
                <select id={`map-${field}`} value={mapping[field] ?? preview.columns[field] ?? -1} onChange={(e) => void remap(field, Number(e.target.value))}>
                  <option value={-1}>(not in this file)</option>
                  {preview.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          {file === "people" && (
            <label className="row small">
              <input type="checkbox" checked={extra} onChange={async (e) => { setExtra(e.target.checked); const r = await call("preview", mapping, csv, e.target.checked); if (r) setPreview(r); }} />
              Keep the other columns as custom fields
            </label>
          )}
          <dl className="report-stats">
            <div><dt>Rows</dt><dd className="tabular">{c.total}</dd></div>
            <div className="tone-ok"><dt>New</dt><dd className="tabular">{c.add}</dd></div>
            <div><dt>Updates</dt><dd className="tabular">{c.update}</dd></div>
            <div><dt>Already here</dt><dd className="tabular">{c.same}</dd></div>
            <div className={c.skip ? "tone-watch" : ""}><dt>Skipped</dt><dd className="tabular">{c.skip}</dd></div>
          </dl>
          {preview.skipped.length > 0 && (
            <div>
              <h4 className="setup-h">Why rows were skipped</h4>
              <ul className="small migrate-reasons">{preview.skipped.map((s) => <li key={s.reason}><span className="tabular">{s.count}</span> {s.reason}</li>)}</ul>
            </div>
          )}
          {preview.extras && (preview.extras.newFunds.length > 0 || preview.extras.total > 0) && (
            <p className="small">{preview.extras.deposits} deposits, {money(preview.extras.total)}.{preview.extras.newFunds.length > 0 && ` New funds will be created: ${preview.extras.newFunds.join(", ")}.`}</p>
          )}
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead><tr><th>Row</th><th>Record</th><th>Will be</th><th>Note</th></tr></thead>
              <tbody>
                {preview.rows.slice(0, 60).map((r) => (
                  <tr key={r.row} className={r.action === "skip" || r.action === "same" ? "muted-row" : ""}>
                    <td className="tabular">{r.row}</td>
                    <td>{r.label}</td>
                    <td className="nowrap">{ACTION[r.action]}</td>
                    <td className="small">{r.reason ?? r.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 60 && <p className="small muted">Showing the first 60 rows of {c.total}.</p>}
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={async () => setDry(await call("dryrun"))}>Dry run</button>
            <button type="button" className="btn btn-primary" disabled={busy || !(c.add + c.update)} onClick={() => void commit()}>{busy ? "Working…" : `Import ${c.add + c.update} ${c.add + c.update === 1 ? "record" : "records"}`}</button>
          </div>
          {dry && <p className="notice small tabular" role="status">Dry run, nothing saved: {dry.counts.add} would be added, {dry.counts.update} updated, {dry.counts.same} are already here and {dry.counts.skip} would be skipped. Running the same file again later changes nothing.</p>}
        </section>
      )}

      <section className="fin-card stack" aria-labelledby="mig-log">
        <h2 id="mig-log">Import log</h2>
        {log.length === 0 ? <p className="small muted">Nothing imported yet.</p> : (
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead><tr><th>When</th><th>File</th><th>Result</th><th>By</th><th></th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className={l.undoneAt ? "muted-row" : ""}>
                    <td className="nowrap tabular">{new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td>{FILE_LABEL[l.file]} from {SYSTEM_LABEL[l.system]}{l.fileName && <div className="small muted">{l.fileName}</div>}</td>
                    <td className="small tabular">{l.counts.add} new, {l.counts.update} updated, {l.counts.skip} skipped{l.undoneAt && <div>Undone by {l.undoneBy}</div>}</td>
                    <td>{l.byName}</td>
                    <td>
                      {!l.undoneAt && (undoing === l.id ? (
                        <span className="row"><button type="button" className="btn btn-sm btn-danger" onClick={() => void undo(l.id)}>Yes, undo</button><button type="button" className="btn btn-sm" onClick={() => setUndoing(null)}>Keep</button></span>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => setUndoing(l.id)}>Undo</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
