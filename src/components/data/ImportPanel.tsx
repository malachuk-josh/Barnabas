"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Counts = Record<string, number>;
type Row = Record<string, unknown> & { row: number; problem?: string; note?: string };
type Preview = { header: string[]; columns: Record<string, number | undefined>; counts: Counts; rows: Row[] };

export type ImportKind = "people" | "giving";

const PEOPLE_LABELS: Record<string, string> = { firstName: "First name", lastName: "Last name", fullName: "Full name", email: "Email", phone: "Phone", household: "Household / family", language: "Preferred language" };
const GIVING_LABELS: Record<string, string> = { date: "Date", donor: "Giver (full name)", firstName: "First name", lastName: "Last name", amount: "Amount", fund: "Fund", method: "Method", check: "Check number" };
const ACTION: Record<string, string> = { add: "New", update: "Update", same: "No change", duplicate: "Repeat in file", skip: "Skipped" };

const money = (cents: unknown) => (typeof cents === "number" ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "?");

/**
 * Import from a CSV in three steps: preview (with the columns Barnabas matched, each changeable), a dry run
 * (exact counts, nothing saved), then import.
 */
export function ImportPanel({ kind, title, intro, sample }: { kind: ImportKind; title: string; intro: React.ReactNode; sample: string }) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [dry, setDry] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labels = kind === "people" ? PEOPLE_LABELS : GIVING_LABELS;

  async function call(action: "preview" | "dryrun" | "commit", map = mapping) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chms/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, action, csv, mapping: Object.keys(map).length ? map : undefined }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That didn't work.");
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(map = mapping) {
    setDone(null);
    setDry(null);
    const json = await call("preview", map);
    if (json) setPreview(json);
  }

  async function runDry() {
    const json = await call("dryrun");
    if (json) setDry(kind === "people" ? json.counts : { add: json.add, alreadyImported: json.alreadyImported, deposits: json.deposits, total: json.total });
  }

  async function commit() {
    const json = await call("commit");
    if (!json) return;
    setDone(
      kind === "people"
        ? `Imported: ${json.added} new, ${json.updated} updated.${json.protected ? ` ${json.protected} came from Planning Center and were left as they are.` : ""}`
        : `Imported ${json.add} gift${json.add === 1 ? "" : "s"} in ${json.deposits} deposit${json.deposits === 1 ? "" : "s"} (${money(json.total)}).${json.alreadyImported ? ` ${json.alreadyImported} were already in the books and skipped.` : ""}`,
    );
    setPreview(null);
    setDry(null);
    setCsv("");
    router.refresh();
  }

  const c = preview?.counts;
  const willAdd = kind === "people" ? (c ? c.add + c.update : 0) : c?.add ?? 0;

  return (
    <section className="fin-card fin-form import-panel" data-no-pull>
      <h3>{title}</h3>
      <p className="small muted">{intro}</p>
      <div className="field">
        <label htmlFor={`imp-${kind}-file`}>CSV file</label>
        <input
          id={`imp-${kind}-file`}
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsv(await f.text());
              setPreview(null);
            }
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`imp-${kind}-text`}>Or paste it</label>
        <textarea id={`imp-${kind}-text`} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} placeholder={sample} style={{ minHeight: 90 }} />
      </div>
      <div className="row">
        <button className="btn btn-primary" type="button" disabled={!csv.trim() || busy} onClick={() => { setMapping({}); void runPreview({}); }}>
          Preview
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="notice success" role="status">{done}</p>}
      {preview && c && (
        <div className="stack" style={{ gap: 14 }}>
          <div>
            <h4 className="setup-h">Columns</h4>
            <p className="small muted">Barnabas matched these from the header row. Change any that are wrong.</p>
            <div className="map-grid">
              {Object.entries(labels).map(([field, label]) => (
                <div className="field" key={field}>
                  <label htmlFor={`map-${kind}-${field}`}>{label}</label>
                  <select
                    id={`map-${kind}-${field}`}
                    value={mapping[field] ?? preview.columns[field] ?? -1}
                    onChange={(e) => {
                      const next = { ...mapping, [field]: Number(e.target.value) };
                      setMapping(next);
                      void runPreview(next);
                    }}
                  >
                    <option value={-1}>(none)</option>
                    {preview.header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <p className="small tabular" role="status">
            {kind === "people"
              ? `${c.total} rows: ${c.add} new, ${c.update} to update, ${c.same} unchanged, ${c.duplicate} repeated in the file, ${c.skip} skipped. ${c.households} households.`
              : `${c.total} rows: ${c.add} to import, ${c.alreadyImported} already in the books, ${c.problems} with problems${c.unmatchedFunds ? `, ${c.unmatchedFunds} going to General because the fund wasn't found` : ""}. ${c.linkedToDirectory} matched to someone in the directory.`}
          </p>
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                {kind === "people" ? (
                  <tr><th>Row</th><th>Name</th><th>Email</th><th>Phone</th><th>Household</th><th>Will</th></tr>
                ) : (
                  <tr><th>Row</th><th>Date</th><th>Giver</th><th className="num">Amount</th><th>Fund</th><th>Method</th><th>Will</th></tr>
                )}
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r) =>
                  kind === "people" ? (
                    <tr key={r.row} className={r.action === "add" || r.action === "update" ? "" : "muted-row"}>
                      <td className="tabular">{r.row}</td>
                      <td>{String(r.name || "")}{r.matchedName && r.matchedName !== r.name ? <div className="small muted">was {String(r.matchedName)}</div> : null}</td>
                      <td>{String(r.email ?? "")}</td>
                      <td className="nowrap">{String(r.phone ?? "")}</td>
                      <td>{String(r.household ?? "")}</td>
                      <td>{ACTION[String(r.action)]}{r.problem && <div className="small muted">{r.problem}</div>}</td>
                    </tr>
                  ) : (
                    <tr key={r.row} className={r.problem || r.alreadyImported ? "muted-row" : ""}>
                      <td className="tabular">{r.row}</td>
                      <td className="nowrap">{String(r.date ?? "?")}</td>
                      <td>{String(r.donorName)}</td>
                      <td className="num">{money(r.amount)}</td>
                      <td>{String(r.fundName)}{r.note && <div className="small muted">{r.note}</div>}</td>
                      <td>{String(r.method)}</td>
                      <td>{r.problem ? <span className="small">{r.problem}</span> : r.alreadyImported ? "Already in" : "Import"}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 50 && <p className="small muted">Showing the first 50 rows.</p>}
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={() => void runDry()}>
              Dry run
            </button>
            <button className="btn btn-primary" type="button" disabled={busy || !willAdd} onClick={() => void commit()}>
              {busy ? "Working…" : `Import ${willAdd}`}
            </button>
          </div>
          {dry && (
            <p className="notice small tabular" role="status">
              Dry run, nothing saved:{" "}
              {kind === "people"
                ? `${dry.add} would be added and ${dry.update} updated; ${dry.same} are unchanged and ${dry.duplicate} repeat in the file.`
                : `${dry.add} gifts in ${dry.deposits} deposits (${money(dry.total)}) would be added; ${dry.alreadyImported} are already in the books.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
