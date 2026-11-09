"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { BudgetReport, BudgetRow } from "@/lib/finance/budget";
import { dollars, parseMoney, wholeDollars } from "@/lib/finance/money";
import type { BudgetLine } from "@/lib/finance/types";
import { HealthPill } from "./Health";

type Acct = { id: string; number: string; name: string; type: "asset" | "liability" | "income" | "expense"; group: string };
type EditLine = { accountId: string; amount: string; basis: "annual" | "monthly"; timing: "even" | "seasonal"; note: string };

const toEdit = (l: BudgetLine): EditLine => ({
  accountId: l.accountId,
  amount: ((l.basis === "monthly" ? l.annual / 12 : l.annual) / 100).toFixed(2).replace(/\.00$/, ""),
  basis: l.basis,
  timing: l.timing ?? "even",
  note: l.note ?? "",
});

export function BudgetEditor({
  year,
  years,
  currentYear,
  report,
  lines,
  accounts,
  canEdit,
  previousExists,
}: {
  year: number;
  years: number[];
  currentYear: number;
  report: BudgetReport & { notes: string; exists: boolean };
  lines: BudgetLine[];
  accounts: Acct[];
  canEdit: boolean;
  previousExists: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditLine[]>(() => lines.map(toEdit));
  const [notes, setNotes] = useState(report.notes);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  async function save() {
    const parsed = draft.map((l) => ({ l, cents: parseMoney(l.amount) }));
    const bad = parsed.find((p) => p.cents === null || p.cents < 0);
    if (bad) {
      setMessage({ ok: false, text: `Check the amount for ${byId.get(bad.l.accountId)?.name ?? "a line"}.` });
      return;
    }
    setBusy(true);
    const res = await fetch("/api/finance/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        notes,
        lines: parsed.map(({ l, cents }) => ({ accountId: l.accountId, annual: l.basis === "monthly" ? cents! * 12 : cents!, basis: l.basis, timing: l.timing, note: l.note.trim() || undefined })),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      setMessage({ ok: true, text: `Saved the ${year} budget.` });
      router.refresh();
    } else setMessage({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save the budget." });
  }

  async function copyFrom(from: number) {
    setBusy(true);
    const res = await fetch("/api/finance/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "copy", from, to: year }) });
    setBusy(false);
    if (res.ok) {
      setMessage({ ok: true, text: `Copied the ${from} budget into ${year}. Adjust any lines, then save.` });
      router.refresh();
    } else setMessage({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't copy the budget." });
  }

  const set = (i: number, patch: Partial<EditLine>) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const unused = accounts.filter((a) => !draft.some((l) => l.accountId === a.id));
  const rowsByGroup = groupRows(report.rows);
  const elapsedPct = Math.round(report.elapsed * 100);

  return (
    <div className="fin-stack">
      <div className="row no-print">
        <label className="small muted" htmlFor="budget-year">
          Fiscal year
        </label>
        <select id="budget-year" style={{ width: "auto" }} value={year} onChange={(e) => router.push(`/finance/budget?year=${e.target.value}`)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="small muted">
          {year === currentYear ? `${elapsedPct}% of the year has passed` : year > currentYear ? "A plan for next year" : "A past year"}
        </span>
        {canEdit && report.exists && !editing && (
          <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>
            Edit budget
          </button>
        )}
        {canEdit && !report.exists && previousExists && (
          <button className="btn btn-primary" type="button" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => void copyFrom(year - 1)}>
            Copy {year - 1} budget into {year}
          </button>
        )}
        {canEdit && !report.exists && !editing && (
          <button className="btn" type="button" onClick={() => setEditing(true)}>
            Start from scratch
          </button>
        )}
      </div>

      {message && (
        <div className={`notice ${message.ok ? "success" : "notice-danger"}`} role="status">
          {message.text}
        </div>
      )}

      {!report.exists && !editing && (
        <div className="fin-card">
          <h2>No budget for {year} yet</h2>
          <p className="muted">
            {canEdit
              ? previousExists
                ? `Copy last year's budget to start, then adjust each line.`
                : "Start from scratch: add each ministry or category with a monthly or annual amount."
              : "The treasurer or pastor sets the budget."}
          </p>
        </div>
      )}

      {(report.exists || editing) && !editing && (
        <>
          <div className="fin-grid">
            <div className="fin-card">
              <span className="label">Income so far</span>
              <div className="fin-stat fin-stat-sm">{wholeDollars(report.totals.income.actual)}</div>
              <span className="small muted">
                of {wholeDollars(report.totals.income.toDate)} budgeted to date ({wholeDollars(report.totals.income.annual)} for the year)
              </span>
            </div>
            <div className="fin-card">
              <span className="label">Expenses so far</span>
              <div className="fin-stat fin-stat-sm">{wholeDollars(report.totals.expense.actual)}</div>
              <span className="small muted">
                of {wholeDollars(report.totals.expense.toDate)} budgeted to date ({wholeDollars(report.totals.expense.annual)} for the year)
              </span>
            </div>
            <div className="fin-card">
              <span className="label">Budgeted surplus for the year</span>
              <div className="fin-stat fin-stat-sm">{wholeDollars(report.totals.income.annual - report.totals.expense.annual)}</div>
              <span className="small muted">Budgeted income less budgeted expenses</span>
            </div>
          </div>

          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="num">Budget for year</th>
                  <th className="num">Budget to date</th>
                  <th className="num">Actual</th>
                  <th className="num">Variance</th>
                  <th className="num">% spent</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {rowsByGroup.map(({ key, kind, group, rows }) => {
                  const g = report.groups.find((x) => x.group === group && x.kind === kind)!;
                  return [
                    <tr className="fin-group" key={key}>
                      <td>
                        {group}
                        {kind === "income" ? " (income)" : ""}
                      </td>
                      <td className="num">{wholeDollars(g.annual)}</td>
                      <td className="num">{wholeDollars(g.toDate)}</td>
                      <td className="num">{wholeDollars(g.actual)}</td>
                      <td className={`num ${g.variance < 0 ? "fin-down" : ""}`}>{wholeDollars(g.variance)}</td>
                      <td className="num">{g.pctUsed === null ? "–" : `${Math.round(g.pctUsed)}%`}</td>
                      <td>
                        <HealthPill health={g.health} />
                      </td>
                    </tr>,
                    ...rows.map((r) => (
                      <tr key={`${key}-${r.account.id}`}>
                        <td className="wide">
                          {r.account.number} {r.account.name}
                          {r.timing === "seasonal" && <span className="badge">seasonal</span>}
                          {!r.budgeted && <span className="badge">not budgeted</span>}
                          {r.note && <div className="small muted">{r.note}</div>}
                        </td>
                        <td className="num">{dollars(r.annual, { cents: false })}</td>
                        <td className="num">{dollars(r.toDate, { cents: false })}</td>
                        <td className="num">{dollars(r.actual, { cents: false })}</td>
                        <td className={`num ${r.variance < 0 ? "fin-down" : ""}`}>{dollars(r.variance, { cents: false })}</td>
                        <td className="num">{r.pctUsed === null ? "–" : `${Math.round(r.pctUsed)}%`}</td>
                        <td>
                          <HealthPill health={r.health} />
                        </td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
          <p className="fin-source">
            Actuals are the ledger&apos;s income and expense lines from January 1 to {report.asOf}. Budget to date is the year&apos;s budget times the share of the year that has passed ({elapsedPct}%). Variance is positive when spending is under
            budget or income is ahead of it. Seasonal lines are only judged against the whole year.
          </p>

          <section className="fin-card">
            <div className="fin-card-head">
              <h2>Plan notes</h2>
              {canEdit && <span className="small muted">Edit the budget to change these</span>}
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{report.notes || <span className="muted">No notes yet.</span>}</p>
          </section>
          {canEdit && year === currentYear && (
            <p className="small muted no-print">
              Planning ahead? <Link href={`/finance/budget?year=${year + 1}`}>Open {year + 1}</Link> to copy this budget and adjust it.
            </p>
          )}
        </>
      )}

      {editing && (
        <section className="fin-card">
          <div className="fin-card-head">
            <h2>Edit the {year} budget</h2>
            <span className="small muted">Enter each line as a monthly or an annual amount.</span>
          </div>
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Per</th>
                  <th>Timing</th>
                  <th className="num">For the year</th>
                  <th>Note</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {draft.map((l, i) => {
                  const a = byId.get(l.accountId);
                  const cents = parseMoney(l.amount);
                  return (
                    <tr key={l.accountId}>
                      <td className="wide">
                        {a ? `${a.number} ${a.name}` : l.accountId}
                        <div className="small muted">
                          {a?.group}
                          {a?.type === "income" ? " · income" : ""}
                        </div>
                      </td>
                      <td>
                        <input className="fin-amount" type="text" inputMode="decimal" aria-label={`Amount for ${a?.name}`} value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                      </td>
                      <td>
                        <select aria-label={`Per month or year for ${a?.name}`} value={l.basis} onChange={(e) => set(i, { basis: e.target.value as EditLine["basis"] })}>
                          <option value="monthly">Month</option>
                          <option value="annual">Year</option>
                        </select>
                      </td>
                      <td>
                        <select aria-label={`Timing for ${a?.name}`} value={l.timing} onChange={(e) => set(i, { timing: e.target.value as EditLine["timing"] })}>
                          <option value="even">Through the year</option>
                          <option value="seasonal">Seasonal or one-time</option>
                        </select>
                      </td>
                      <td className="num">{cents === null ? "–" : dollars(l.basis === "monthly" ? cents * 12 : cents, { cents: false })}</td>
                      <td>
                        <input type="text" aria-label={`Note for ${a?.name}`} value={l.note} maxLength={200} onChange={(e) => set(i, { note: e.target.value })} />
                      </td>
                      <td>
                        <button type="button" className="fin-x" aria-label={`Remove ${a?.name}`} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row">
            <select aria-label="Add a budget line" value={adding} style={{ maxWidth: 360 }} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Add a line…</option>
              {unused.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.number} {a.name} ({a.group})
                </option>
              ))}
            </select>
            <button
              className="btn"
              type="button"
              disabled={!adding}
              onClick={() => {
                setDraft((d) => [...d, { accountId: adding, amount: "0", basis: "annual", timing: "even", note: "" }]);
                setAdding("");
              }}
            >
              Add
            </button>
          </div>
          <div className="field">
            <label htmlFor="plan-notes">Plan notes</label>
            <textarea id="plan-notes" className="plain" maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Goals for the year, what changed from last year, decisions the board made." />
          </div>
          <div className="row">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save budget"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setDraft(lines.map(toEdit));
                setNotes(report.notes);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function groupRows(rows: BudgetRow[]) {
  const out: { key: string; kind: "income" | "expense"; group: string; rows: BudgetRow[] }[] = [];
  for (const r of rows) {
    const key = `${r.kind}:${r.group}`;
    let g = out.find((x) => x.key === key);
    if (!g) out.push((g = { key, kind: r.kind, group: r.group, rows: [] }));
    g.rows.push(r);
  }
  return out;
}
