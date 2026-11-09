"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Shown on every Finance view while the demo dataset is loaded. Pastors and treasurers can clear it. */
export function DemoBanner({ canClear }: { canClear: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/finance/demo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "CLEAR" }) });
    setBusy(false);
    if (res.ok) {
      setAsking(false);
      router.refresh();
    } else setError((await res.json().catch(() => ({}))).error ?? "Couldn't clear the demo data.");
  }

  return (
    <div className="fin-demo no-print" role="note">
      <span className="fin-badge-demo">Demo data</span>
      <span>
        These numbers are <strong>made up</strong> so you can try Finance. Giving is recorded as anonymous offering lines with no donor attached, and the missions partners are fictional.
      </span>
      {canClear &&
        (asking ? (
          <span className="row" style={{ marginLeft: "auto" }}>
            <span>Remove all demo finance data and start with empty books?</span>
            <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void clear()}>
              {busy ? "Clearing…" : "Yes, clear it"}
            </button>
            <button className="btn" type="button" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button className="btn" type="button" onClick={() => setAsking(true)}>
            Clear demo data and start fresh
          </button>
        ))}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
