"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { lastSunday } from "@/lib/dates";
import { dollars, parseMoney } from "@/lib/finance/money";
import { GIFT_METHODS, METHOD_LABELS, type Gift, type GiftMethod } from "@/lib/finance/types";

type Donor = { key: string; personId?: string; name: string; total: number; count: number; lastGift: string; previousTotal: number };
type RecentGift = { id: string; date: string; donorName: string; amount: number; fundId: string; method: GiftMethod };
type Recurring = { id: string; donorName: string; amount: number; fundId: string; method: GiftMethod; frequency: string; active: boolean; lastRecorded?: string };
type Opt = { id: string; name: string };

type Props = {
  canEdit: boolean;
  canSeeDonors: boolean;
  today: string;
  year: number;
  people: Opt[];
  funds: Opt[];
  banks: Opt[];
  donors: Donor[];
  recentGifts: RecentGift[];
  recurring: Recurring[];
  dueCount: number;
};

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function post(body: unknown) {
  const res = await fetch("/api/finance/giving", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

export function GivingView(props: Props) {
  if (!props.canSeeDonors) {
    return (
      <p className="fin-note">
        Who gave what is kept between the pastor and the treasurer. You&apos;re seeing totals and trends, which is everything the deacons and board need for oversight.
      </p>
    );
  }
  return (
    <>
      {props.canEdit && <GiftEntry {...props} />}
      <DonorList {...props} />
      <RecurringList {...props} />
      <RecentGifts {...props} />
    </>
  );
}

type Row = { donor: string; date: string; amount: string; fundId: string; method: GiftMethod; checkNumber: string };

function GiftEntry({ today, people, funds, banks }: Props) {
  const router = useRouter();
  const sunday = lastSunday(today);
  const blank = (): Row => ({ donor: "", date: sunday, amount: "", fundId: funds[0]?.id ?? "general", method: "check", checkNumber: "" });
  const [depositDate, setDepositDate] = useState(today);
  const [bankAccountId, setBank] = useState(banks[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.donor.trim() || r.amount.trim());
  const total = filled.reduce((a, r) => a + (parseMoney(r.amount) ?? 0), 0);
  const byFund = funds.map((f) => ({ ...f, total: filled.filter((r) => r.fundId === f.id).reduce((a, r) => a + (parseMoney(r.amount) ?? 0), 0) })).filter((f) => f.total);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!filled.length) return setMessage({ ok: false, text: "Add at least one gift." });
    const bad = filled.findIndex((r) => !r.donor.trim() || !parseMoney(r.amount) || parseMoney(r.amount)! <= 0);
    if (bad >= 0) return setMessage({ ok: false, text: `Gift ${bad + 1} needs a donor and an amount.` });
    setBusy(true);
    setMessage(null);
    try {
      const json = await post({
        action: "record",
        depositDate,
        bankAccountId,
        description: filled.length > 1 ? `Sunday offering deposit, ${filled[0].date}` : undefined,
        gifts: filled.map((r) => {
          const person = people.find((p) => p.name.toLowerCase() === r.donor.trim().toLowerCase());
          return { date: r.date, personId: person?.id, donorName: person ? undefined : r.donor.trim(), amount: parseMoney(r.amount)!, fundId: r.fundId, method: r.method, checkNumber: r.checkNumber || undefined };
        }),
      });
      setMessage({ ok: true, text: `Recorded ${json.recorded} gift${json.recorded === 1 ? "" : "s"} totaling ${dollars(json.total)}, as one deposit in the ledger.` });
      setRows([blank(), blank(), blank()]);
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't record those gifts." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fin-card fin-form" onSubmit={save}>
      <div className="fin-card-head">
        <h2>Record gifts</h2>
        <span className="small muted">One gift, or a whole Sunday&apos;s offering as a batch</span>
      </div>
      <div className="fin-form-row">
        <div className="field">
          <label htmlFor="dep-date">Deposit date</label>
          <input id="dep-date" type="date" required value={depositDate} onChange={(e) => setDepositDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="dep-bank">Deposited to</label>
          <select id="dep-bank" value={bankAccountId} onChange={(e) => setBank(e.target.value)}>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <datalist id="people-list">
        {people.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Donor</th>
              <th>Gift date</th>
              <th>Amount</th>
              <th>Fund</th>
              <th>Method</th>
              <th>Check #</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const known = people.some((p) => p.name.toLowerCase() === r.donor.trim().toLowerCase());
              return (
                <tr key={i}>
                  <td className="wide">
                    <input type="text" list="people-list" aria-label={`Gift ${i + 1} donor`} placeholder="Name from the directory, or a new name" value={r.donor} maxLength={100} onChange={(e) => set(i, { donor: e.target.value })} />
                    {r.donor.trim() && !known && <div className="small muted">New name: not in the directory</div>}
                  </td>
                  <td>
                    <input type="date" aria-label={`Gift ${i + 1} date`} value={r.date} onChange={(e) => set(i, { date: e.target.value })} />
                  </td>
                  <td>
                    <input className="fin-amount" type="text" inputMode="decimal" aria-label={`Gift ${i + 1} amount`} placeholder="0.00" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`Gift ${i + 1} fund`} value={r.fundId} onChange={(e) => set(i, { fundId: e.target.value })}>
                      {funds.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Gift ${i + 1} method`} value={r.method} onChange={(e) => set(i, { method: e.target.value as GiftMethod })}>
                      {GIFT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="text" aria-label={`Gift ${i + 1} check number`} style={{ width: 90 }} value={r.checkNumber} disabled={r.method !== "check"} maxLength={20} onChange={(e) => set(i, { checkNumber: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="fin-x" aria-label={`Remove gift ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
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
        <button className="btn" type="button" onClick={() => setRows((rs) => [...rs, ...Array.from({ length: 5 }, blank)])}>
          Add 5 rows
        </button>
        <span className="small muted" style={{ marginLeft: "auto" }}>
          {filled.length} gift{filled.length === 1 ? "" : "s"}, {dollars(total)}
          {byFund.length > 1 ? ` (${byFund.map((f) => `${f.name} ${dollars(f.total)}`).join(", ")})` : ""}
        </span>
      </div>
      {message && (
        <p className={`notice ${message.ok ? "success" : "notice-danger"}`} role="status">
          {message.text}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Recording…" : filled.length > 1 ? "Record batch" : "Record gift"}
        </button>
        <span className="small muted">Gifts post to the ledger as one deposit, with a line for each fund.</span>
      </div>
    </form>
  );
}

function DonorList({ donors, year, funds }: Props) {
  const [query, setQuery] = useState("");
  const [statementYear, setStatementYear] = useState(year);
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, Gift[] | "loading" | "none">>({});
  const [limit, setLimit] = useState(15);
  const shown = donors.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function toggle(key: string) {
    if (open === key) return setOpen(null);
    setOpen(key);
    if (history[`${key}:${statementYear}`]) return;
    setHistory((h) => ({ ...h, [`${key}:${statementYear}`]: "loading" }));
    const res = await fetch(`/api/finance/statements?year=${statementYear}&donor=${encodeURIComponent(key)}`);
    const json = await res.json().catch(() => ({}));
    setHistory((h) => ({ ...h, [`${key}:${statementYear}`]: res.ok ? json.statement.gifts : "none" }));
  }

  return (
    <section className="fin-card">
      <div className="fin-card-head">
        <h2>Donors</h2>
        <div className="row">
          <label className="small muted" htmlFor="st-year">
            Statements for
          </label>
          <select id="st-year" style={{ width: "auto" }} value={statementYear} onChange={(e) => setStatementYear(Number(e.target.value))}>
            <option value={year}>{year}</option>
            <option value={year - 1}>{year - 1}</option>
          </select>
          <Link className="btn" href={`/finance/giving/statement?year=${statementYear}&all=1`}>
            Print all statements
          </Link>
        </div>
      </div>
      <p className="small muted">Confidential. Totals for {year} with {year - 1} for comparison. Open a donor for their gift history.</p>
      <input type="text" aria-label="Find a donor" placeholder="Find a donor" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Donor</th>
              <th className="num">{year}</th>
              <th className="num">{year - 1}</th>
              <th className="num">Gifts</th>
              <th>Last gift</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((d) => {
              const h = history[`${d.key}:${statementYear}`];
              return [
                <tr key={d.key}>
                  <td className="wide">
                    <button type="button" className="linklike" aria-expanded={open === d.key} onClick={() => void toggle(d.key)}>
                      {d.name}
                    </button>
                    {!d.personId && <span className="badge">not in directory</span>}
                  </td>
                  <td className="num">{dollars(d.total)}</td>
                  <td className="num">{dollars(d.previousTotal)}</td>
                  <td className="num">{d.count}</td>
                  <td className="nowrap">{d.lastGift ? shortDate(d.lastGift) : ""}</td>
                  <td className="nowrap">
                    <Link href={`/finance/giving/statement?year=${statementYear}&donor=${encodeURIComponent(d.key)}`}>Statement</Link>
                  </td>
                </tr>,
                open === d.key && (
                  <tr key={`${d.key}-h`}>
                    <td colSpan={6}>
                      {h === "loading" || !h ? (
                        <span className="muted small">Loading…</span>
                      ) : h === "none" ? (
                        <span className="muted small">No gifts in {statementYear}.</span>
                      ) : (
                        <ul className="list small" style={{ gap: 4 }}>
                          {h.slice(-24).reverse().map((g) => (
                            <li key={g.id}>
                              {shortDate(g.date)}: {dollars(g.amount)}, {funds.find((f) => f.id === g.fundId)?.name ?? g.fundId}, {METHOD_LABELS[g.method].toLowerCase()}
                              {g.checkNumber ? ` #${g.checkNumber}` : ""}
                            </li>
                          ))}
                          {h.length > 24 && <li className="muted">and {h.length - 24} earlier gifts (see the statement)</li>}
                        </ul>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button className="btn" type="button" onClick={() => setLimit((l) => l + 50)}>
          Show more donors ({shown.length - limit})
        </button>
      )}
    </section>
  );
}

function RecurringList({ recurring, canEdit, funds, people, today, dueCount }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ donor: "", amount: "", fundId: funds[0]?.id ?? "general", method: "ach" as GiftMethod, frequency: "monthly", startDate: today });
  const fundName = (id: string) => funds.find((f) => f.id === id)?.name ?? id;

  async function act(body: unknown, after?: (json: { recorded?: number; total?: number }) => void) {
    setError(null);
    try {
      const json = await post(body);
      after?.(json);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  return (
    <section className="fin-card">
      <div className="fin-card-head">
        <h2>Recurring givers</h2>
        {canEdit && (
          <button
            className="btn btn-primary"
            type="button"
            disabled={!dueCount}
            onClick={() => void act({ action: "record-due" }, (j) => setNotice(`Recorded ${j.recorded} recurring gifts, ${dollars(j.total ?? 0)}.`))}
          >
            {dueCount ? `Record ${dueCount} gift${dueCount === 1 ? "" : "s"} that came due` : "Nothing due"}
          </button>
        )}
      </div>
      <p className="small muted">Online and ACH givers on a schedule. When the payout arrives, record what came due as one deposit.</p>
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Donor</th>
              <th className="num">Amount</th>
              <th>How often</th>
              <th>Fund</th>
              <th>Method</th>
              <th>Last recorded</th>
              {canEdit && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {recurring.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No recurring givers yet.
                </td>
              </tr>
            )}
            {recurring.map((r) => (
              <tr key={r.id} className={r.active ? "" : "muted-row"}>
                <td className="wide">{r.donorName}</td>
                <td className="num">{dollars(r.amount)}</td>
                <td>{r.frequency === "biweekly" ? "Every two weeks" : r.frequency === "weekly" ? "Weekly" : "Monthly"}</td>
                <td>{fundName(r.fundId)}</td>
                <td>{METHOD_LABELS[r.method]}</td>
                <td className="nowrap">{r.lastRecorded ? shortDate(r.lastRecorded) : "Not yet"}</td>
                {canEdit && (
                  <td>
                    <button className="btn" type="button" onClick={() => void act({ action: "set-recurring", id: r.id, active: !r.active })}>
                      {r.active ? "Pause" : "Resume"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form
          className="fin-form-row"
          onSubmit={(e) => {
            e.preventDefault();
            const amount = parseMoney(form.amount);
            if (!amount || amount <= 0) return setError("Enter the recurring amount.");
            const person = people.find((p) => p.name.toLowerCase() === form.donor.trim().toLowerCase());
            void act(
              { action: "add-recurring", recurring: { personId: person?.id, donorName: person ? undefined : form.donor.trim(), amount, fundId: form.fundId, method: form.method, frequency: form.frequency, startDate: form.startDate } },
              () => setForm({ ...form, donor: "", amount: "" }),
            );
          }}
        >
          <div className="field">
            <label htmlFor="rec-donor">Donor</label>
            <input id="rec-donor" type="text" list="people-list" required value={form.donor} onChange={(e) => setForm({ ...form, donor: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rec-amount">Amount</label>
            <input id="rec-amount" type="text" inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="rec-freq">How often</label>
            <select id="rec-freq" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every two weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rec-fund">Fund</label>
            <select id="rec-fund" value={form.fundId} onChange={(e) => setForm({ ...form, fundId: e.target.value })}>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rec-method">Method</label>
            <select id="rec-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as GiftMethod })}>
              {GIFT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rec-start">First gift</label>
            <input id="rec-start" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <button className="btn" type="submit">
            Add recurring giver
          </button>
        </form>
      )}
    </section>
  );
}

function RecentGifts({ recentGifts, canEdit, funds }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const fundName = (id: string) => funds.find((f) => f.id === id)?.name ?? id;
  return (
    <section className="fin-card">
      <h2>Recent gifts</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Donor</th>
              <th className="num">Amount</th>
              <th>Fund</th>
              <th>Method</th>
              {canEdit && <th aria-label="Delete" />}
            </tr>
          </thead>
          <tbody>
            {recentGifts.map((g) => (
              <tr key={g.id}>
                <td className="nowrap">{shortDate(g.date)}</td>
                <td className="wide">{g.donorName}</td>
                <td className="num">{dollars(g.amount)}</td>
                <td>{fundName(g.fundId)}</td>
                <td>{METHOD_LABELS[g.method]}</td>
                {canEdit && (
                  <td>
                    <button
                      type="button"
                      className="fin-x"
                      aria-label={`Delete gift from ${g.donorName}`}
                      onClick={async () => {
                        if (!confirm(`Delete the ${dollars(g.amount)} gift from ${g.donorName}? Its deposit is reduced to match.`)) return;
                        try {
                          await post({ action: "delete-gift", id: g.id });
                          router.refresh();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Couldn't delete it.");
                        }
                      }}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
