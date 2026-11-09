"use client";

import { useEffect, useState } from "react";
import { KNOW_EVENT } from "./NavLinks";

const DISMISS_KEY = "barnabas.know.dismissedAt";
const DISMISS_DAYS = 14;

/** "Let Barnabas get to know you": progress, and a one-tap start to a getting-to-know-you conversation. */
export function KnowCard({ answered, total }: { answered: number; total: number }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      setHidden(Date.now() - at < DISMISS_DAYS * 86_400_000);
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden || answered >= total) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private browsing: hide for now only
    }
    setHidden(true);
  };
  return (
    <section className="card know-card" aria-label="Let Barnabas get to know you">
      <div className="know-card-text">
        <strong>{answered === 0 ? "Let Barnabas get to know you" : "Barnabas is getting to know you"}</strong>
        <span className="small muted">
          {answered === 0
            ? "A few questions about your calling and ministry help him help you. Takes about five minutes."
            : `He knows ${answered} of ${total} things about your ministry so far. A few minutes now helps him help you.`}
        </span>
        <span className="know-meter" aria-hidden="true">
          <span style={{ width: `${Math.round((answered / total) * 100)}%` }} />
        </span>
      </div>
      <div className="row know-card-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.dispatchEvent(new Event(KNOW_EVENT))}>
          {answered === 0 ? "Start" : "Continue"}
        </button>
        <button type="button" className="btn" onClick={dismiss}>
          Not now
        </button>
      </div>
    </section>
  );
}
