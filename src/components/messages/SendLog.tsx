"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "../EmptyState";

type Row = { id: string; name: string; channel: "sms" | "email"; to: string | null; status: string; error?: string; approvedByName: string; createdAt: number; updatedAt: number };
type Log = { scope: "all" | "own"; optOuts: { phones: number; emails: number }; deliveries: Row[] };

const LABEL: Record<string, string> = { sending: "Sending", queued: "Accepted", sent: "Sent", delivered: "Delivered", failed: "Failed", undelivered: "Undelivered", bounced: "Bounced", complained: "Marked as spam", opted_out: "Opted out", no_contact: "No contact on file" };
const fmt = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function SendLog() {
  const [log, setLog] = useState<Log | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | "problems">("all");
  useEffect(() => {
    fetch("/api/messages/log")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setLog)
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <p className="muted">Couldn&apos;t load the send log.</p>;
  if (!log) return <p className="muted">Loading…</p>;
  const rows = log.deliveries.filter((d) => filter === "all" || ["failed", "undelivered", "bounced", "complained", "opted_out", "no_contact"].includes(d.status));
  const count = (s: string[]) => log.deliveries.filter((d) => s.includes(d.status)).length;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <dl className="fact-strip send-stats">
        <div>
          <dt>Sent</dt>
          <dd className="tabular">{count(["queued", "sent", "delivered"])}</dd>
          <dd className="small muted">{count(["delivered"])} confirmed delivered</dd>
        </div>
        <div className={count(["failed", "undelivered", "bounced", "complained", "opted_out", "no_contact"]) ? "is-warn" : undefined}>
          <dt>Didn&apos;t go out</dt>
          <dd className="tabular">{count(["failed", "undelivered", "bounced", "complained", "opted_out", "no_contact"])}</dd>
          <dd className="small muted">Failed, bounced, opted out or no contact</dd>
        </div>
        <div>
          <dt>Do-not-contact lists</dt>
          <dd className="tabular">{log.optOuts.phones + log.optOuts.emails}</dd>
          <dd className="small muted">
            {log.optOuts.phones} replied STOP · {log.optOuts.emails} unsubscribed or bounced
          </dd>
        </div>
      </dl>
      {log.deliveries.length === 0 ? (
        <EmptyState title="Nothing has been sent yet" actions={[{ label: "Open drafts", href: "/drafts", primary: true }]}>
          When you tap Send on a draft, each person it goes to shows up here with what the carrier or mail server reported.
        </EmptyState>
      ) : (
        <>
          <div className="row" role="group" aria-label="Show">
            <button type="button" className={`btn${filter === "all" ? " btn-primary" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              Everything
            </button>
            <button type="button" className={`btn${filter === "problems" ? " btn-primary" : ""}`} aria-pressed={filter === "problems"} onClick={() => setFilter("problems")}>
              Only problems
            </button>
          </div>
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>To</th>
                  <th>How</th>
                  <th>Status</th>
                  <th>Approved by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="nowrap tabular">{fmt(d.createdAt)}</td>
                    <td>
                      {d.name}
                      <br />
                      <span className="small muted">{d.to ?? "no contact"}</span>
                    </td>
                    <td>{d.channel === "sms" ? "Text" : "Email"}</td>
                    <td>
                      <span className={`send-status send-${d.status}`}>{LABEL[d.status] ?? d.status}</span>
                      {d.error && <div className="small muted">{d.error}</div>}
                    </td>
                    <td>{d.approvedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
