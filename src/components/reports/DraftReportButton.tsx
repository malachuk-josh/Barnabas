"use client";

import Link from "next/link";
import { useState } from "react";

export function DraftReportButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  async function run() {
    setState("busy");
    const res = await fetch("/api/reports/monthly", { method: "POST" });
    if (res.ok) setState("done");
    else {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't draft it.");
      setState("error");
    }
  }
  return (
    <div className="row">
      <button className="btn btn-primary" type="button" disabled={state === "busy"} onClick={() => void run()}>
        {state === "busy" ? "Drafting…" : "Draft this month's report"}
      </button>
      {state === "done" && (
        <span className="small" role="status">
          It&apos;s in <Link href="/drafts">Drafts</Link>, addressed to you. Review it, then send or forward it.
        </span>
      )}
      {state === "error" && <span className="error small">{error}</span>}
    </div>
  );
}
