"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Shown on every Care view while the demo records are loaded. Pastors can clear them. */
export function CareDemoBanner({ canClear }: { canClear: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/care/demo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "CLEAR" }) });
    setBusy(false);
    if (res.ok) {
      setAsking(false);
      router.refresh();
    } else setError((await res.json().catch(() => ({}))).error ?? "Couldn't clear the demo data.");
  }

  return (
    <div className="fin-demo" role="note">
      <span className="fin-badge-demo">Demo data</span>
      <span>
        Only the example classes are seeded, taught by MGBC&apos;s pastors. <strong>No one&apos;s shepherding records are made up</strong>: needs, prayer requests and guests start empty.
      </span>
      {canClear &&
        (asking ? (
          <span className="row" style={{ marginLeft: "auto" }}>
            <span>Remove all demo shepherding records and start empty?</span>
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
