"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ITEM_KINDS, KIND_LABELS, type ItemKind, type SharedItem } from "@/lib/network/types";

type Result = SharedItem & { mine: boolean };

export function LibrarySearch({ peers }: { peers: number }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ItemKind | "">("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/network?q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ""}`);
      if (res.ok) setResults((await res.json()).results);
    }, 200);
    return () => clearTimeout(t);
  }, [q, kind]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="mesa-search" role="search">
        <div className="field">
          <label htmlFor="mesa-q">Search shared resources</label>
          <input id="mesa-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A series on James, greeter training, a fall outreach…" />
        </div>
        <div className="field">
          <label htmlFor="mesa-kind">Kind</label>
          <select id="mesa-kind" value={kind} onChange={(e) => setKind(e.target.value as ItemKind | "")}>
            <option value="">Everything</option>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {results === null ? (
        <p className="muted">Loading…</p>
      ) : results.length === 0 ? (
        peers === 0 ? (
          <EmptyState title="No connected churches yet" actions={[{ label: "Connect with a church", href: "/network/connections", primary: true }, { label: "Share something", href: "/network/share" }]}>
            Mesa connects churches that use Barnabas, by invitation, with an administrator at each church saying yes. Once you&apos;re connected, their sermon series, service templates, training and event ideas show up here, and yours show up for them.
          </EmptyState>
        ) : (
          <EmptyState compact title={q ? `Nothing matches "${q}"` : "Nothing shared yet"}>
            {q ? "Try a book of the Bible, a ministry or a season." : "Connected churches haven't shared anything yet."}
          </EmptyState>
        )
      ) : (
        <ul className="mesa-results">
          {results.map((r) => (
            <li key={r.id} className="fin-card">
              <div className="fin-card-head">
                <span className="label">{KIND_LABELS[r.kind]}</span>
                <span className="small muted">{r.mine ? "Shared by your church" : r.churchName}</span>
              </div>
              <h3>{r.title}</h3>
              {r.scripture && <p className="small">{r.scripture}</p>}
              <p className={`mesa-body${open === r.id ? " open" : ""}`}>{r.body}</p>
              <div className="row">
                <button type="button" className="btn btn-sm" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? "Show less" : "Read it"}
                </button>
                {r.tags.map((t) => (
                  <span key={t} className="badge" style={{ marginLeft: 0 }}>
                    {t}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
