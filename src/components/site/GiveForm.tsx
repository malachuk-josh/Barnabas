"use client";

import { useEffect, useId, useState } from "react";
import { VERSES } from "@/lib/language";

/**
 * The website's and member app's give form (when Stripe is connected). The giver picks a fund, an amount and
 * how often, and may cover the processing fee; then they go to Stripe's hosted Checkout page, where card,
 * bank (ACH), Apple Pay and Google Pay details are entered. Nothing about payment is typed here.
 */

type Fund = { id: string; name: string; description?: string };
type Frequency = "once" | "weekly" | "biweekly" | "monthly";

const FREQS: { id: Frequency; label: string }[] = [
  { id: "once", label: "One time" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every two weeks" },
  { id: "monthly", label: "Monthly" },
];
const PRESETS = [25, 50, 100, 250];
const MIN = 1_00;
const MAX = 25_000_00;

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

function toCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function GiveForm({ href, funds, feePercent, feeFixedCents, portalLoginUrl, buttonLabel }: { href: string; funds: Fund[]; feePercent: number; feeFixedCents: number; portalLoginUrl?: string | null; buttonLabel?: string }) {
  const uid = useId().replace(/:/g, "");
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [amountText, setAmountText] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [cover, setCover] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [back, setBack] = useState<null | { kind: "thanks" | "cancelled"; sessionId?: string }>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get("gift");
    if (g === "thanks" || g === "cancelled") setBack({ kind: g, sessionId: q.get("recurring") === "1" ? (q.get("session_id") ?? undefined) : undefined });
  }, []);

  const amount = toCents(amountText);
  const fee = cover && amount ? Math.ceil((amount + feeFixedCents) / (1 - feePercent / 100)) - amount : 0;

  async function manage(sessionId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`${href}/portal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, returnPath: window.location.pathname }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok && typeof json.url === "string") window.location.assign(json.url);
    else {
      setBusy(false);
      setError(json.error ?? "We couldn't open that just now. Please try again.");
    }
  }

  if (!funds.length) return <p className="cs-notice">Online giving is being set up. Please check back soon.</p>;

  if (back?.kind === "thanks") {
    return (
      <div className="cs-give-done" role="status">
        <p className="cs-success">Thank you for your gift! A receipt is on its way to your email. If you gave from a bank account, it can take a few days to clear.</p>
        <div className="cs-buttons">
          {back.sessionId && (
            <button type="button" className="cs-btn cs-btn-secondary cs-btn-small" disabled={busy} onClick={() => void manage(back.sessionId!)}>
              Manage a recurring gift
            </button>
          )}
          <button type="button" className="cs-btn cs-btn-secondary cs-btn-small" onClick={() => { window.history.replaceState(null, "", window.location.pathname); setBack(null); }}>
            Give again
          </button>
        </div>
        {error && <p className="cs-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="cs-form cs-give-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (amount === null) return setError("Enter an amount, like 50 or 50.00.");
        if (amount < MIN) return setError(`The smallest online gift is ${money(MIN)}.`);
        if (amount > MAX) return setError(`Online gifts are up to ${money(MAX)}. For a larger gift, please contact the church office.`);
        setBusy(true);
        const res = await fetch(href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fundId, amount, frequency, coverFee: cover, returnPath: window.location.pathname, website }) });
        const json = await res.json().catch(() => ({}));
        if (res.ok && typeof json.url === "string" && json.url.startsWith("https://")) {
          window.location.assign(json.url);
          return;
        }
        setBusy(false);
        setError(json.error ?? "Something went wrong. Please try again in a moment.");
      }}
    >
      {back?.kind === "cancelled" && <p className="cs-notice">No gift was made. You can try again whenever you&apos;re ready.</p>}
      <fieldset className="cs-give-funds">
        <legend>Give to</legend>
        {funds.map((f) => (
          <label key={f.id} className="cs-check cs-give-choice">
            <input type="radio" name={`${uid}-fund`} value={f.id} checked={fundId === f.id} onChange={() => setFundId(f.id)} />
            <span>
              <strong>{f.name}</strong>
              {f.description && <span className="cs-muted cs-small cs-give-desc">{f.description}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="cs-field">
        <label htmlFor={`${uid}-amount`}>Amount</label>
        <div className="cs-give-presets" role="group" aria-label="Suggested amounts">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`cs-give-chip${amount === p * 100 ? " is-on" : ""}`} aria-pressed={amount === p * 100} onClick={() => setAmountText(String(p))}>
              ${p}
            </button>
          ))}
        </div>
        <div className="cs-give-amount">
          <span aria-hidden="true">$</span>
          <input id={`${uid}-amount`} type="text" inputMode="decimal" autoComplete="off" placeholder="Other amount" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </div>
      </div>

      <fieldset className="cs-give-freq">
        <legend>How often</legend>
        {FREQS.map((f) => (
          <label key={f.id} className="cs-check">
            <input type="radio" name={`${uid}-freq`} value={f.id} checked={frequency === f.id} onChange={() => setFrequency(f.id)} />
            {f.label}
          </label>
        ))}
      </fieldset>

      <label className="cs-check">
        <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />
        <span>
          Add {fee ? money(fee) : "the processing fee"} so the church receives the full {amount ? money(amount) : "amount"}
        </span>
      </label>

      <div className="cs-hp" aria-hidden="true">
        <label htmlFor={`${uid}-website`}>Website</label>
        <input id={`${uid}-website`} type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {error && (
        <p className="cs-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="cs-btn cs-btn-primary" type="submit" disabled={busy}>
          {busy ? "Opening secure checkout…" : amount && amount >= MIN ? `${buttonLabel || "Give"} ${money(amount + fee)}${frequency === "once" ? "" : ` ${FREQS.find((f) => f.id === frequency)!.label.toLowerCase()}`}` : buttonLabel || "Give online"}
        </button>
      </div>
      <p className="cs-muted cs-small">
        You&apos;ll finish on Stripe&apos;s secure page with a card, bank account, Apple Pay or Google Pay. Your gift appears on your year-end giving statement.
        {portalLoginUrl && (
          <>
            {" "}
            <a href={portalLoginUrl} rel="noopener noreferrer">
              Change or cancel a recurring gift
            </a>
            .
          </>
        )}
      </p>
      <blockquote className="cs-give-verse">
        &ldquo;{VERSES.giving.text}&rdquo;
        <cite>{VERSES.giving.reference} (KJV)</cite>
      </blockquote>
    </form>
  );
}
