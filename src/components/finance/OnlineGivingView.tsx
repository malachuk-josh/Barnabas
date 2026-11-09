"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dollars, wholeDollars } from "@/lib/finance/money";
import type { OnlineGivingView as View } from "@/lib/stripe/view";

const EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "invoice.paid", "charge.refunded", "charge.dispute.created", "charge.dispute.closed", "payout.paid"];

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function post(body: unknown) {
  const res = await fetch("/api/finance/online", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

function SetupSteps({ webhookUrl, status }: { webhookUrl: string; status: View["status"] }) {
  return (
    <ol className="fin-steps">
      <li>
        Create or open the church&apos;s Stripe account at <strong>dashboard.stripe.com</strong> as a nonprofit (business type &ldquo;Nonprofit organization&rdquo;), with the church&apos;s EIN and bank account, and finish verification.
      </li>
      <li>
        Start in <strong>test mode</strong> (the toggle at the top of the dashboard). Under Developers → API keys, copy the <strong>secret key</strong> (<code>sk_test_…</code>) into Vercel → Settings → Environment Variables as <code>STRIPE_SECRET_KEY</code>. Barnabas never needs the publishable key: payments are entered on Stripe&apos;s own Checkout page.
      </li>
      <li>
        Under Developers → Webhooks, add an endpoint at <code>{webhookUrl}</code> and select these events: {EVENTS.map((e, i) => (
          <span key={e}>
            <code>{e}</code>
            {i < EVENTS.length - 1 ? ", " : "."}
          </span>
        ))}{" "}
        Copy its signing secret (<code>whsec_…</code>) into <code>STRIPE_WEBHOOK_SECRET</code>{status.webhook ? " (done)" : ""}.
      </li>
      <li>Under Settings → Payment methods, turn on cards, Apple Pay, Google Pay and ACH Direct Debit (US bank account). Under Settings → Emails, turn on receipts for successful payments.</li>
      <li>
        Under Settings → Billing → Customer portal, allow customers to cancel subscriptions and update payment methods, and turn on the login link. Paste that link into <code>STRIPE_PORTAL_LOGIN_URL</code>{status.portalLogin ? " (done)" : ""} so givers can change or cancel a recurring gift.
      </li>
      <li>Redeploy, then open the funds below for online giving and make a test gift with card 4242 4242 4242 4242. When it shows up here, switch the dashboard to live mode and repeat steps 2 and 3 with the live keys.</li>
      <li>Ask Stripe support for the nonprofit discounted rate, with the church&apos;s 501(c)(3) determination letter (or proof the church is a 501(c)(3) organization).</li>
    </ol>
  );
}

export function OnlineGivingView({ view, canEdit, canSeeDonors, webhookUrl }: { view: View; canEdit: boolean; canSeeDonors: boolean; webhookUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { status } = view;

  async function act(body: unknown, done?: (json: Record<string, unknown>) => void) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const json = await post(body);
      done?.(json);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const openFunds = view.funds.filter((f) => f.online);

  return (
    <div className="fin-stack">
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      {note && (
        <div className="notice" role="status">
          {note}
        </div>
      )}

      {!status.connected ? (
        <section className="fin-card">
          <div className="fin-card-head">
            <h2>Stripe not connected</h2>
            <span className="badge">Not connected</span>
          </div>
          {status.keyLooksWrong && <p className="notice notice-danger">STRIPE_SECRET_KEY is set but isn&apos;t a Stripe secret key. It should start with sk_test_ or sk_live_ (a publishable pk_ key won&apos;t work).</p>}
          <p className="muted small">Until Stripe is connected, the website&apos;s Give page shows the church&apos;s giving link (or &ldquo;coming soon&rdquo;), paid events are paid at the door, and online and ACH gifts are recorded by hand in Giving. To connect:</p>
          <SetupSteps webhookUrl={webhookUrl} status={status} />
        </section>
      ) : (
        !status.webhook && (
          <section className="fin-card">
            <h2>Almost there: add the webhook</h2>
            <p className="notice">Stripe is connected, but STRIPE_WEBHOOK_SECRET isn&apos;t set, so gifts made online aren&apos;t recorded here yet.</p>
            <SetupSteps webhookUrl={webhookUrl} status={status} />
          </section>
        )
      )}

      <div className="fin-grid">
        <section className="fin-card">
          <span className="label">Given online in {view.asOf.slice(0, 4)}</span>
          <div className="fin-stat">{wholeDollars(view.year.gross)}</div>
          <span className="small muted">
            {view.year.count} {view.year.count === 1 ? "gift" : "gifts"} ({view.year.recurringCount} recurring). Card and wallets {wholeDollars(view.year.card)}, bank (ACH) {wholeDollars(view.year.ach)}.
          </span>
          <p className="fin-source">Online gift records dated January 1 to today; the gross each giver paid.</p>
        </section>
        <section className="fin-card">
          <span className="label">Fees and net this year</span>
          <div className="fin-sub">
            <span>Processing fees</span>
            <span>{dollars(view.year.fees)}</span>
          </div>
          <div className="fin-sub">
            <span>Covered by givers</span>
            <span>{dollars(view.year.coveredFees)}</span>
          </div>
          <div className="fin-sub">
            <span>Refunded</span>
            <span>{dollars(view.year.refunded)}</span>
          </div>
          <div className="fin-sub">
            <span>
              <strong>Net to the church</strong>
            </span>
            <span>{dollars(view.year.net)}</span>
          </div>
          {view.year.disputed > 0 && <span className="small fin-flag">{view.year.disputed} disputed (chargeback) — see the Stripe dashboard.</span>}
          <p className="fin-source">Stripe&apos;s fee on each payment, from its balance transaction.</p>
        </section>
        <section className="fin-card">
          <span className="label">This month</span>
          <div className="fin-stat">{wholeDollars(view.month.gross)}</div>
          <span className="small muted">
            {view.month.count} {view.month.count === 1 ? "gift" : "gifts"}, {dollars(view.month.fees)} in fees.
          </span>
          <span className="label">Stripe balance in the books</span>
          <div className="fin-stat fin-stat-sm">{dollars(view.stripeBalance)}</div>
          <p className="fin-source">The Stripe balance clearing account: online gifts and event payments, less fees, refunds and payouts. It should match the dashboard&apos;s balance.</p>
        </section>
      </div>

      <section className="fin-card">
        <h2>Funds open for online giving</h2>
        <p className="muted small">Givers choose from these on the website&apos;s Give page and in the member app. {openFunds.length ? "" : "No fund is open yet, so the give form says online giving is being set up."}</p>
        <div>
          {view.funds.map((f) => (
            <div className="fin-fund-toggle" key={f.id}>
              <span>
                <strong>{f.name}</strong> <span className="small muted">{f.restricted ? "Restricted" : "Unrestricted"}</span>
              </span>
              {canEdit ? (
                <label className="check">
                  <input type="checkbox" checked={f.online} disabled={busy} onChange={(e) => void act({ action: "fund-online", fundId: f.id, online: e.target.checked })} />
                  Open online
                </label>
              ) : (
                <span className="small">{f.online ? "Open online" : "Not online"}</span>
              )}
            </div>
          ))}
        </div>
        {!canEdit && <p className="small muted">The pastor or treasurer opens funds for online giving.</p>}
      </section>

      <section className="fin-card">
        <div className="fin-card-head">
          <h2>Stripe payouts</h2>
          {canEdit && status.connected && (
            <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "refresh-payouts" }, (j) => setNote(`Fetched ${j.fetched} payouts from Stripe; ${j.recorded} new in the books.`))}>
              {busy ? "Checking…" : "Fetch from Stripe"}
            </button>
          )}
        </div>
        <p className="muted small">
          Each payout is posted as a transfer from the Stripe balance to the bank. When you import the bank statement, the matching deposit is flagged as this payout and skipped, so it&apos;s never counted as gifts twice.
        </p>
        {view.payouts.length === 0 ? (
          <p className="muted small">No payouts yet. They appear here as Stripe pays out (usually two business days after a gift).</p>
        ) : (
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Arrives</th>
                  <th className="num">Gross</th>
                  <th className="num">Fees</th>
                  <th className="num">Refunds</th>
                  <th className="num">Net payout</th>
                  <th>Books</th>
                </tr>
              </thead>
              <tbody>
                {view.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">
                      {shortDate(p.arrivalDate)}
                      <div className="small muted">
                        {p.count} payment{p.count === 1 ? "" : "s"}
                        {p.status !== "paid" ? ` · ${p.status}` : ""}
                      </div>
                    </td>
                    <td className="num">{dollars(p.gross)}</td>
                    <td className="num">{dollars(p.fees)}</td>
                    <td className="num">{dollars(p.refunds)}</td>
                    <td className="num">
                      <strong>{dollars(p.amount)}</strong>
                    </td>
                    <td className="small">{p.inBooks ? (p.cleared ? "In the books, cleared" : "In the books") : p.status === "paid" ? "Not yet" : "Waiting"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canSeeDonors && view.gifts && (
        <section className="fin-card">
          <h2>Recent online gifts</h2>
          {view.gifts.length === 0 ? (
            <p className="muted small">No online gifts yet. They appear here, and in Giving and each giver&apos;s statement, as Stripe reports them.</p>
          ) : (
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Giver</th>
                    <th>Fund</th>
                    <th className="num">Gross</th>
                    <th className="num">Fee</th>
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {view.gifts.map((g) => (
                    <tr key={g.id} className={g.reversal ? "muted-row" : undefined}>
                      <td className="nowrap">{shortDate(g.date)}</td>
                      <td className="wide">
                        {g.personId ? <Link href={`/people/${g.personId}`}>{g.donorName}</Link> : g.donorName}
                        {g.reversal && <span className="badge">Refund</span>}
                        {g.recurring && <span className="badge">Recurring</span>}
                        {g.method === "ach" && <span className="badge">Bank</span>}
                        {g.disputed && <span className="badge badge-test">Disputed</span>}
                        {g.testMode && <span className="badge badge-test">Test</span>}
                      </td>
                      <td>{g.fund}</td>
                      <td className="num">{dollars(g.amount)}</td>
                      <td className="num">{g.reversal ? "" : dollars(g.fee)}</td>
                      <td className="num">{dollars(g.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">Refunds are made in the Stripe dashboard; the reversing entry appears here and in the books on its own.</p>
        </section>
      )}

      {canSeeDonors && view.review && view.review.length > 0 && (
        <section className="fin-card">
          <h2>New givers to review</h2>
          <p className="muted small">No one in People had these givers&apos; email addresses, so each was added with just a name and email. If it&apos;s someone you know under another email, merge them in People. Barnabas never merges on a name alone.</p>
          <ul className="fin-review">
            {view.review.map((p) => (
              <li key={p.id} className="fin-fund-toggle">
                <span>
                  <Link href={`/people/${p.id}`}>{p.name}</Link> <span className="small muted">{p.email}</span>
                  {p.possibleMatches.length > 0 && (
                    <span className="small">
                      {" "}
                      · Same name as{" "}
                      {p.possibleMatches.map((m, i) => (
                        <span key={m.id}>
                          <Link href={`/people/${m.id}`}>{m.name}</Link>
                          {i < p.possibleMatches.length - 1 ? ", " : ""}
                        </span>
                      ))}{" "}
                      (<Link href="/people/duplicates">review duplicates</Link>)
                    </span>
                  )}
                </span>
                {canEdit && (
                  <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "reviewed", personId: p.id })}>
                    Looks right
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && canSeeDonors && (
        <section className="fin-card">
          <h2>Thank-you notes</h2>
          <p className="muted small">Stripe emails each giver a receipt (turn it on in the Stripe dashboard). Barnabas can also draft a personal thank-you email for each online gift into your Drafts, for you to read and send. Nothing is sent without a leader tapping Send.</p>
          <label className="check">
            <input type="checkbox" checked={view.thankYou.on} disabled={busy} onChange={(e) => void act({ action: "thank-you", on: e.target.checked })} />
            Draft a thank-you for each online gift{view.thankYou.on && view.thankYou.leaderName ? ` (into ${view.thankYou.leaderName}'s Drafts)` : ""}
          </label>
        </section>
      )}
    </div>
  );
}
