"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { dollars, parseMoney } from "@/lib/finance/money";
import type { Account, Fund, Reconciliation, Transaction } from "@/lib/finance/types";

type FundRow = Fund & { balance: number; income: number; expenses: number };
type Bank = { id: string; name: string; balance: number; cleared: number };
type ReconcileInfo = {
  bankAccountId: string;
  bankName: string;
  open: Reconciliation | null;
  state: { clearedBalance: number; statementBalance: number; difference: number; canFinish: boolean; clearedCount: number } | null;
  openTransactions: Transaction[];
  lastFinished: Reconciliation | null;
};

type Props = {
  view: "transactions" | "funds" | "reconcile" | "import";
  from: string;
  to: string;
  today: string;
  canEdit: boolean;
  accounts: Account[];
  funds: FundRow[];
  banks: Bank[];
  liabilities: { id: string; name: string; balance: number }[];
  transactions: Transaction[];
  reconcile: ReconcileInfo;
  partners: { id: string; name: string }[];
  startDate: string;
};

const VIEW_LABELS: Record<Props["view"], string> = { transactions: "Transactions", funds: "Funds and accounts", reconcile: "Reconcile", import: "Import from bank" };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

const signed = (t: Transaction) => (t.direction === "in" ? 1 : -1) * t.lines.reduce((a, l) => a + l.amount, 0);
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function LedgerView(props: Props) {
  const views = (Object.keys(VIEW_LABELS) as Props["view"][]).filter((v) => props.canEdit || v !== "import");
  return (
    <div className="fin-stack">
      <div className="seg no-print" role="group" aria-label="Ledger views" style={{ maxWidth: "100%", overflowX: "auto" }}>
        {views.map((v) => (
          <Link key={v} href={`/finance/accounts?view=${v}`} className="seg-link" aria-current={props.view === v ? "page" : undefined}>
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </div>
      {props.view === "transactions" && <TransactionsPanel {...props} />}
      {props.view === "funds" && <FundsPanel {...props} />}
      {props.view === "reconcile" && <ReconcilePanel {...props} />}
      {props.view === "import" && props.canEdit && <ImportPanel {...props} />}
    </div>
  );
}

function TransactionsPanel({ from, to, today, canEdit, accounts, funds, banks, transactions, partners }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [limit, setLimit] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState({ from, to });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "in" | "out" | "open">("all");
  const acctName = useMemo(() => new Map(accounts.map((a) => [a.id, `${a.number} ${a.name}`])), [accounts]);
  const fundName = useMemo(() => new Map(funds.map((f) => [f.id, f.name])), [funds]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      if (kind === "in" && t.direction !== "in") return false;
      if (kind === "out" && t.direction === "in") return false;
      if (kind === "open" && (t.cleared || t.reconciliationId)) return false;
      if (!needle) return true;
      const hay = [t.description, t.reference ?? "", ...t.lines.map((l) => `${acctName.get(l.accountId) ?? ""} ${fundName.get(l.fundId) ?? ""} ${l.memo ?? ""}`)].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [transactions, q, kind, acctName, fundName]);
  const monthTotals = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    for (const t of shown) {
      const k = t.date.slice(0, 7);
      const cur = m.get(k) ?? { in: 0, out: 0 };
      const a = signed(t);
      if (a > 0) cur.in += a;
      else cur.out -= a;
      m.set(k, cur);
    }
    return m;
  }, [shown]);
  const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const openCount = transactions.filter((t) => !t.cleared && !t.reconciliationId).length;

  async function act(body: unknown) {
    setError(null);
    try {
      await post("/api/finance/ledger", body);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  return (
    <>
      <div className="fin-grid">
        {banks.map((b) => (
          <div className="fin-card ledger-bank" key={b.id}>
            <span className="label">{b.name}</span>
            <div className="fin-stat fin-stat-sm">{dollars(b.balance)}</div>
            <dl className="ledger-bank-facts">
              <div>
                <dt>Cleared at the bank</dt>
                <dd>{dollars(b.cleared)}</dd>
              </div>
              <div>
                <dt>Still to clear</dt>
                <dd>{Math.abs(b.balance - b.cleared) < 0.005 ? "Nothing" : `${dollars(Math.abs(b.balance - b.cleared))} ${b.balance < b.cleared ? "going out" : "coming in"}`}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <form
        className="row no-print ledger-range"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/finance/accounts?view=transactions&from=${range.from}&to=${range.to}`);
        }}
      >
        <label className="small muted" htmlFor="from">
          From
        </label>
        <input id="from" type="date" style={{ width: "auto" }} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <label className="small muted" htmlFor="to">
          to
        </label>
        <input id="to" type="date" style={{ width: "auto" }} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <button className="btn" type="submit">
          Show
        </button>
        {canEdit && (
          <button className="btn btn-primary" type="button" style={{ marginLeft: "auto" }} onClick={() => setAdding(true)}>
            Add transaction
          </button>
        )}
      </form>
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      {adding && <TxnForm today={today} accounts={accounts} funds={funds} banks={banks} partners={partners} onClose={() => setAdding(false)} />}

      <div className="ledger-filter no-print">
        <label className="search-field">
          <span className="sr-only">Find a transaction</span>
          <input type="search" placeholder="Find a payee, account or fund" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="ledger-chips" role="group" aria-label="Show">
          {(
            [
              ["all", "Everything"],
              ["in", "Money in"],
              ["out", "Money out"],
              ["open", `Not cleared (${openCount})`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className="filter-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="fin-table-wrap">
        <table className="fin-table ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Account</th>
              <th>Fund</th>
              <th className="num">In</th>
              <th className="num">Out</th>
              <th>Cleared</th>
              {canEdit && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="muted">
                  {transactions.length ? "Nothing matches. Try another word, or show everything." : `No transactions between ${shortDate(from)} and ${shortDate(to)}.`}
                </td>
              </tr>
            )}
            {shown.slice(0, limit).flatMap((t, i, list) => {
              const amount = signed(t);
              const split = t.lines.length > 1;
              const fundsUsed = [...new Set(t.lines.map((l) => fundName.get(l.fundId) ?? l.fundId))];
              const ym = t.date.slice(0, 7);
              const mt = monthTotals.get(ym);
              const divider =
                i === 0 || list[i - 1].date.slice(0, 7) !== ym ? (
                  <tr className="ledger-month" key={`m-${ym}`}>
                    <th colSpan={canEdit ? 8 : 7} scope="colgroup">
                      <span>{monthLabel(ym)}</span>
                      {mt && (
                        <span className="small ledger-month-sum">
                          In {dollars(mt.in)} · Out {dollars(mt.out)}
                        </span>
                      )}
                    </th>
                  </tr>
                ) : null;
              return [
                divider,
                <tr key={t.id}>
                  <td className="nowrap">{shortDate(t.date)}</td>
                  <td className="wide">
                    {t.description}
                    {t.reference && <span className="badge">{t.reference}</span>}
                    {t.source === "giving" && <span className="badge">gifts</span>}
                    {t.source === "import" && <span className="badge">imported</span>}
                    {t.source === "barnabas" && <span className="badge badge-barnabas">Barnabas</span>}
                    {t.source === "stripe" && <span className="badge">Stripe</span>}
                    {split && (
                      <details className="fin-details small">
                        <summary>Split into {t.lines.length} lines</summary>
                        <ul className="list small" style={{ gap: 4 }}>
                          {t.lines.map((l, i) => (
                            <li key={i}>
                              {acctName.get(l.accountId)}, {fundName.get(l.fundId)}: {dollars(l.amount)}
                              {l.memo ? ` (${l.memo})` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {!split && t.lines[0]?.memo && <div className="small muted">{t.lines[0].memo}</div>}
                  </td>
                  <td>{split ? <span className="muted">Split</span> : acctName.get(t.lines[0]?.accountId ?? "")}</td>
                  <td>{fundsUsed.join(", ")}</td>
                  <td className="num ledger-in">{amount > 0 ? dollars(amount) : ""}</td>
                  <td className="num">{amount < 0 ? dollars(-amount) : ""}</td>
                  <td>
                    {t.reconciliationId ? (
                      <span className="small muted" title="Locked by a finished reconciliation">
                        Reconciled
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Cleared: ${t.description}`}
                        checked={t.cleared}
                        disabled={!canEdit}
                        onChange={(e) => void act({ action: "set-cleared", ids: [t.id], cleared: e.target.checked })}
                      />
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      {!t.reconciliationId && !t.giftBatchId && (
                        <button type="button" className="fin-x" aria-label={`Delete ${t.description}`} onClick={() => confirm(`Delete "${t.description}"?`) && void act({ action: "delete-transaction", id: t.id })}>
                          ×
                        </button>
                      )}
                    </td>
                  )}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button className="btn fin-more" type="button" onClick={() => setLimit((l) => l + 100)}>
          Show more ({shown.length - limit} more)
        </button>
      )}
    </>
  );
}

type LineDraft = { accountId: string; fundId: string; amount: string; memo: string; partnerId: string };

function TxnForm({ today, accounts, funds, banks, partners, onClose }: { today: string; accounts: Account[]; funds: FundRow[]; banks: Bank[]; partners: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const general = funds.find((f) => !f.restricted)?.id ?? funds[0]?.id ?? "";
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [bankAccountId, setBank] = useState(banks[0]?.id ?? "");
  const [lines, setLines] = useState<LineDraft[]>([{ accountId: "", fundId: general, amount: "", memo: "", partnerId: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choices = accounts.filter((a) => !a.archived && a.id !== bankAccountId && (direction === "out" ? a.type !== "income" : a.type !== "expense"));
  const total = lines.reduce((a, l) => a + (parseMoney(l.amount) ?? 0), 0);
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = lines.map((l) => ({ ...l, cents: parseMoney(l.amount) }));
    if (parsed.some((l) => !l.cents || l.cents <= 0)) return setError("Each line needs an amount more than zero.");
    setBusy(true);
    setError(null);
    try {
      await post("/api/finance/ledger", {
        action: "add-transaction",
        transaction: {
          date,
          description,
          reference: reference || undefined,
          bankAccountId,
          direction,
          lines: parsed.map((l) => ({ accountId: l.accountId, fundId: l.fundId, amount: l.cents!, memo: l.memo || undefined, partnerId: l.partnerId || undefined })),
        },
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fin-card fin-form" onSubmit={save}>
      <div className="fin-card-head">
        <h2>Add a transaction</h2>
        <div className="seg" role="group" aria-label="Money in or out">
          <button type="button" aria-pressed={direction === "out"} onClick={() => setDirection("out")}>
            Money out
          </button>
          <button type="button" aria-pressed={direction === "in"} onClick={() => setDirection("in")}>
            Money in
          </button>
        </div>
      </div>
      <div className="fin-form-row">
        <div className="field">
          <label htmlFor="t-date">Date</label>
          <input id="t-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor="t-desc">Description</label>
          <input id="t-desc" type="text" required maxLength={160} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={direction === "out" ? "e.g. National Grid electric" : "e.g. Facility rental, Smith wedding"} />
        </div>
        <div className="field">
          <label htmlFor="t-bank">{direction === "out" ? "Paid from" : "Deposited to"}</label>
          <select id="t-bank" value={bankAccountId} onChange={(e) => setBank(e.target.value)}>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-ref">Check or reference</label>
          <input id="t-ref" type="text" maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="fin-lines">
        <span className="label">Lines</span>
        {lines.map((l, i) => {
          const acct = accounts.find((a) => a.id === l.accountId);
          return (
            <div className="fin-line" key={i}>
              <select
                aria-label={`Line ${i + 1} account`}
                required
                value={l.accountId}
                onChange={(e) => {
                  const a = accounts.find((x) => x.id === e.target.value);
                  setLine(i, { accountId: e.target.value, fundId: a?.defaultFundId ?? l.fundId });
                }}
              >
                <option value="">Account…</option>
                {choices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.number} {a.name}
                  </option>
                ))}
              </select>
              <select aria-label={`Line ${i + 1} fund`} value={l.fundId} onChange={(e) => setLine(i, { fundId: e.target.value })}>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input aria-label={`Line ${i + 1} amount`} type="text" inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
              {acct?.number === "5100" && partners.length ? (
                <select aria-label={`Line ${i + 1} missions partner`} value={l.partnerId} onChange={(e) => setLine(i, { partnerId: e.target.value, memo: partners.find((p) => p.id === e.target.value)?.name ?? l.memo })}>
                  <option value="">Partner…</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input aria-label={`Line ${i + 1} memo`} type="text" placeholder="Memo (optional)" maxLength={160} value={l.memo} onChange={(e) => setLine(i, { memo: e.target.value })} />
              )}
              <button type="button" className="fin-x" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          );
        })}
        <div className="row">
          <button className="btn" type="button" onClick={() => setLines((ls) => [...ls, { accountId: "", fundId: general, amount: "", memo: "", partnerId: "" }])}>
            Split: add a line
          </button>
          <span className="small muted" style={{ marginLeft: "auto" }}>
            Total {dollars(total)}
          </span>
        </div>
      </div>
      {lines.some((l) => accounts.find((a) => a.id === l.accountId)?.payroll) && <PayrollNote />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save transaction"}
        </button>
        <button className="btn" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PayrollNote() {
  return (
    <p className="fin-note">
      <strong>Payroll runs through your payroll provider</strong> (such as Gusto), which calculates pay, withholding and payroll taxes and files the forms. Here, record each payroll as expense lines (salaries, housing allowance, employer
      taxes) so the budget and reports stay accurate. Barnabas doesn&apos;t calculate pay.
    </p>
  );
}

function FundsPanel({ canEdit, accounts, funds, liabilities, startDate }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [acct, setAcct] = useState({ number: "", name: "", type: "expense" as Account["type"], group: "" });
  const [fund, setFund] = useState({ name: "", restricted: true, description: "" });
  const types: { type: Account["type"]; label: string }[] = [
    { type: "asset", label: "Assets" },
    { type: "liability", label: "Liabilities" },
    { type: "income", label: "Income" },
    { type: "expense", label: "Expenses" },
  ];
  const restrictedTotal = funds.filter((f) => f.restricted).reduce((a, f) => a + f.balance, 0);

  async function act(body: unknown, reset: () => void) {
    setError(null);
    try {
      await post("/api/finance/ledger", body);
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  return (
    <>
      <section className="fin-card">
        <div className="fin-card-head">
          <h2>Funds</h2>
          <span className="small muted">Restricted funds total {dollars(restrictedTotal)}</span>
        </div>
        <p className="muted small">Restricted gifts stay with the purpose they were given for. Each fund&apos;s balance is its opening balance on {shortDate(startDate)}, plus its income, less its expenses.</p>
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Fund</th>
                <th>Kind</th>
                <th className="num">Opening</th>
                <th className="num">Income</th>
                <th className="num">Expenses</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.id}>
                  <td className="wide">
                    <strong>{f.name}</strong>
                    {f.description && <div className="small muted">{f.description}</div>}
                  </td>
                  <td>{f.restricted ? "Restricted" : "Unrestricted"}</td>
                  <td className="num">{dollars(f.openingBalance)}</td>
                  <td className="num">{dollars(f.income)}</td>
                  <td className="num">{dollars(f.expenses)}</td>
                  <td className={`num ${f.balance < 0 ? "fin-down" : ""}`}>
                    <strong>{dollars(f.balance)}</strong>
                  </td>
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
              void act({ action: "add-fund", fund: { name: fund.name, restricted: fund.restricted, description: fund.description || undefined } }, () => setFund({ name: "", restricted: true, description: "" }));
            }}
          >
            <div className="field">
              <label htmlFor="fund-name">New fund</label>
              <input id="fund-name" type="text" required maxLength={60} value={fund.name} onChange={(e) => setFund({ ...fund, name: e.target.value })} placeholder="e.g. Youth camp scholarships" />
            </div>
            <div className="field">
              <label htmlFor="fund-desc">Purpose</label>
              <input id="fund-desc" type="text" maxLength={300} value={fund.description} onChange={(e) => setFund({ ...fund, description: e.target.value })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={fund.restricted} onChange={(e) => setFund({ ...fund, restricted: e.target.checked })} />
              Restricted
            </label>
            <button className="btn" type="submit">
              Add fund
            </button>
          </form>
        )}
      </section>

      <PayrollNote />

      <section className="fin-card">
        <h2>Chart of accounts</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Account</th>
                <th>Category</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {types.map(({ type, label }) => [
                <tr className="fin-group" key={type}>
                  <td colSpan={4}>{label}</td>
                </tr>,
                ...accounts
                  .filter((a) => a.type === type)
                  .map((a) => (
                    <tr key={a.id}>
                      <td className="nowrap">{a.number}</td>
                      <td className="wide">
                        {a.name}
                        {a.bank && <span className="badge">bank</span>}
                        {a.payroll && <span className="badge">payroll</span>}
                        {a.defaultFundId && <span className="badge">{funds.find((f) => f.id === a.defaultFundId)?.name}</span>}
                      </td>
                      <td>{a.group}</td>
                      <td className="num">{type === "liability" ? dollars(liabilities.find((l) => l.id === a.id)?.balance ?? 0) : type === "asset" ? "" : ""}</td>
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <form
            className="fin-form-row"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "add-account", account: { ...acct, bank: acct.type === "asset" } }, () => setAcct({ number: "", name: "", type: "expense", group: "" }));
            }}
          >
            <div className="field">
              <label htmlFor="acct-number">Number</label>
              <input id="acct-number" type="text" inputMode="numeric" required pattern="\d{3,6}" value={acct.number} onChange={(e) => setAcct({ ...acct, number: e.target.value })} placeholder="5450" />
            </div>
            <div className="field">
              <label htmlFor="acct-name">Name</label>
              <input id="acct-name" type="text" required maxLength={80} value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} placeholder="Women's ministry" />
            </div>
            <div className="field">
              <label htmlFor="acct-type">Type</label>
              <select id="acct-type" value={acct.type} onChange={(e) => setAcct({ ...acct, type: e.target.value as Account["type"] })}>
                <option value="asset">Asset (bank account)</option>
                <option value="liability">Liability</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="acct-group">Category</label>
              <input id="acct-group" type="text" required maxLength={60} list="acct-groups" value={acct.group} onChange={(e) => setAcct({ ...acct, group: e.target.value })} placeholder="Ministries" />
              <datalist id="acct-groups">
                {[...new Set(accounts.map((a) => a.group))].map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <button className="btn" type="submit">
              Add account
            </button>
          </form>
        )}
      </section>
    </>
  );
}

function ReconcilePanel({ canEdit, reconcile, today }: Props) {
  const router = useRouter();
  const { open, state, openTransactions, lastFinished } = reconcile;
  const [statementDate, setStatementDate] = useState(open?.statementDate ?? today);
  const [statementBalance, setStatementBalance] = useState(open ? (open.statementBalance / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await post(url, body);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="fin-card">
        <div className="fin-card-head">
          <h2>Reconcile {reconcile.bankName}</h2>
          {lastFinished && <span className="small muted">Last reconciled through {shortDate(lastFinished.statementDate)}</span>}
        </div>
        <p className="muted small">Enter the ending date and balance from the bank statement, then tick each transaction that appears on it. When the difference is zero, finish to lock those transactions.</p>
        {canEdit && (
          <form
            className="fin-form-row"
            onSubmit={(e) => {
              e.preventDefault();
              const cents = parseMoney(statementBalance);
              if (cents === null) return setError("Enter the statement's ending balance.");
              void act("/api/finance/reconcile", { action: "start", bankAccountId: reconcile.bankAccountId, statementDate, statementBalance: cents });
            }}
          >
            <div className="field">
              <label htmlFor="st-date">Statement ending date</label>
              <input id="st-date" type="date" required value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="st-bal">Statement ending balance</label>
              <input id="st-bal" type="text" inputMode="decimal" required value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} placeholder="0.00" />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {open ? "Update statement" : "Start reconciling"}
            </button>
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {state && (
          <div className="fin-grid">
            <div>
              <span className="label">Statement balance</span>
              <div className="fin-stat fin-stat-sm">{dollars(state.statementBalance)}</div>
            </div>
            <div>
              <span className="label">Cleared in the books</span>
              <div className="fin-stat fin-stat-sm">{dollars(state.clearedBalance)}</div>
              <span className="small muted">{state.clearedCount} cleared transactions, with the opening balance</span>
            </div>
            <div>
              <span className="label">Difference</span>
              <div className={`fin-stat fin-stat-sm ${state.difference === 0 ? "fin-up" : "fin-down"}`}>{dollars(state.difference)}</div>
              <span className="small muted">{state.difference === 0 ? "The books agree with the bank." : "Tick what cleared, or check the statement balance."}</span>
            </div>
          </div>
        )}
        {open && state && canEdit && (
          <div className="row">
            <button className="btn btn-primary" type="button" disabled={!state.canFinish || busy} onClick={() => void act("/api/finance/reconcile", { action: "finish", id: open.id })}>
              Finish reconciliation
            </button>
            <button className="btn" type="button" disabled={busy || !openTransactions.some((t) => !t.cleared)} onClick={() => void act("/api/finance/ledger", { action: "set-cleared", ids: openTransactions.filter((t) => !t.cleared).map((t) => t.id), cleared: true })}>
              Tick all
            </button>
          </div>
        )}
      </section>
      {open && (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Cleared</th>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Deposit</th>
                <th className="num">Payment</th>
              </tr>
            </thead>
            <tbody>
              {openTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Nothing to reconcile up to {shortDate(open.statementDate)}.
                  </td>
                </tr>
              )}
              {openTransactions.map((t) => {
                const amount = (t.bankAccountId === reconcile.bankAccountId ? 1 : -1) * signed(t);
                return (
                  <tr key={t.id} className={t.cleared ? "" : "muted-row"}>
                    <td>
                      <input type="checkbox" aria-label={`Cleared: ${t.description}`} checked={t.cleared} disabled={!canEdit || busy} onChange={(e) => void act("/api/finance/ledger", { action: "set-cleared", ids: [t.id], cleared: e.target.checked })} />
                    </td>
                    <td className="nowrap">{shortDate(t.date)}</td>
                    <td className="wide">
                      {t.description}
                      {t.reference && <span className="badge">{t.reference}</span>}
                    </td>
                    <td className="num">{amount > 0 ? dollars(amount) : ""}</td>
                    <td className="num">{amount < 0 ? dollars(-amount) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

type PreviewRow = { row: number; date: string | null; description: string; amount: number | null; reference?: string; problem?: string; accountId: string; fundId: string; duplicate: boolean; alreadyImported?: boolean; giftDeposit?: boolean; payoutDeposit?: boolean; importKey?: string; keep: boolean };

function ImportPanel({ accounts, funds, banks }: Props) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [bankAccountId, setBank] = useState(banks[0]?.id ?? "");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usable = accounts.filter((a) => !a.archived && a.id !== bankAccountId);

  async function preview() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const json = await post("/api/finance/import", { action: "preview", csv, bankAccountId });
      setRows((json.rows as Omit<PreviewRow, "keep">[]).map((r) => ({ ...r, keep: !r.problem && !r.duplicate && !r.alreadyImported })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    const kept = (rows ?? []).filter((r) => r.keep);
    if (kept.some((r) => !r.accountId)) return setError("Pick an account for every row you're importing.");
    setBusy(true);
    setError(null);
    try {
      const json = await post("/api/finance/import", {
        action: "commit",
        bankAccountId,
        skipDuplicates: false,
        rows: kept.map((r) => ({ date: r.date, description: r.description, amount: r.amount, reference: r.reference, accountId: r.accountId, fundId: r.fundId, importKey: r.importKey })),
      });
      setDone(`Imported ${json.added} transaction${json.added === 1 ? "" : "s"}. They're marked cleared, since the bank has them.${json.alreadyImported ? ` ${json.alreadyImported} ${json.alreadyImported === 1 ? "was" : "were"} already imported from an earlier file and skipped.` : ""}`);
      setRows(null);
      setCsv("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import.");
    } finally {
      setBusy(false);
    }
  }

  const setRow = (i: number, patch: Partial<PreviewRow>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      <section className="fin-card fin-form">
        <h2>Import bank transactions</h2>
        <p className="muted small">
          Download a CSV from your bank&apos;s website and choose it here, or paste it. Barnabas reads the date, description and amount (or debit and credit) columns, suggests an account for each row, and flags anything already in the books.
          Gift deposits are usually entered in Giving; skip them here so they aren&apos;t counted twice.
        </p>
        <div className="fin-form-row">
          <div className="field">
            <label htmlFor="imp-bank">Bank account</label>
            <select id="imp-bank" value={bankAccountId} onChange={(e) => setBank(e.target.value)}>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="imp-file">CSV file</label>
            <input
              id="imp-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="imp-text">Or paste the CSV</label>
          <textarea id="imp-text" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"Date,Description,Amount\n11/03/2026,NATIONAL GRID,-182.40"} />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="button" disabled={!csv.trim() || busy} onClick={() => void preview()}>
            Preview
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="notice success" role="status">
            {done}
          </p>
        )}
      </section>
      {rows && (
        <>
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Import</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>Account</th>
                  <th>Fund</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.row} className={r.keep ? "" : "muted-row"}>
                    <td>
                      <input type="checkbox" aria-label={`Import row ${r.row}`} checked={r.keep} disabled={Boolean(r.problem) || Boolean(r.alreadyImported)} onChange={(e) => setRow(i, { keep: e.target.checked })} />
                    </td>
                    <td className="nowrap">{r.date ?? "?"}</td>
                    <td className="wide">
                      {r.description || <span className="muted">(none)</span>}
                      {r.problem && <div className="small error">Row {r.row}: {r.problem}</div>}
                      {r.alreadyImported ? (
                        <div className="small muted">Already imported from an earlier file; it won&apos;t be added again</div>
                      ) : r.payoutDeposit ? (
                        <div className="small muted">Looks like a Stripe payout already in the books (online gifts are counted from Stripe, not from this deposit)</div>
                      ) : r.giftDeposit ? (
                        <div className="small muted">Looks like an offering deposit already entered in Giving</div>
                      ) : (
                        r.duplicate && <div className="small muted">Looks like it&apos;s already in the books</div>
                      )}
                    </td>
                    <td className="num">{r.amount === null ? "?" : dollars(r.amount)}</td>
                    <td>
                      <select aria-label={`Account for row ${r.row}`} value={r.accountId} disabled={!r.keep} onChange={(e) => setRow(i, { accountId: e.target.value, fundId: accounts.find((a) => a.id === e.target.value)?.defaultFundId ?? r.fundId })}>
                        <option value="">Choose…</option>
                        {usable
                          .filter((a) => ((r.amount ?? 0) >= 0 ? a.type !== "expense" : a.type !== "income"))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.number} {a.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <select aria-label={`Fund for row ${r.row}`} value={r.fundId} disabled={!r.keep} onChange={(e) => setRow(i, { fundId: e.target.value })}>
                        {funds.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="button" disabled={busy || !rows.some((r) => r.keep)} onClick={() => void commit()}>
              Import {rows.filter((r) => r.keep).length} rows
            </button>
            <button className="btn" type="button" onClick={() => setRows(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  );
}
