"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type DemoClear = { path: string; method?: "DELETE" | "POST"; body?: unknown; label: string };

/** Shown while an area holds its labeled demo data; whoever may clear it gets the button. */
export function OpsDemoBanner({ text, clear }: { text: React.ReactNode; clear?: DemoClear }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (!clear) return;
    setBusy(true);
    setError(null);
    const res = await fetch(clear.path, { method: clear.method ?? "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clear.body ?? { confirm: "CLEAR" }) });
    setBusy(false);
    if (res.ok) {
      setAsking(false);
      router.refresh();
    } else setError((await res.json().catch(() => ({}))).error ?? "Couldn't clear the demo data.");
  }
  return (
    <div className="fin-demo" role="note">
      <span className="fin-badge-demo">Demo data</span>
      <span>{text}</span>
      {clear &&
        (asking ? (
          <span className="row" style={{ marginLeft: "auto" }}>
            <span>{clear.label}?</span>
            <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void run()}>
              {busy ? "Clearing…" : "Yes, clear it"}
            </button>
            <button className="btn" type="button" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button className="btn" type="button" onClick={() => setAsking(true)}>
            {clear.label}
          </button>
        ))}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
