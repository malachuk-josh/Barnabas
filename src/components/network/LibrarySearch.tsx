"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ITEM_KINDS, KIND_LABELS, type ItemKind, type SharedItem } from "@/lib/network/types";

type Result = SharedItem & { mine: boolean };

/** Short chip labels for the kind filter. */
export const KIND_CHIPS: Record<ItemKind, string> = {
  series_outline: "Sermon series",
  service_template: "Service templates",
  training_doc: "Training",
  event_idea: "Event ideas",
  prayer_need: "Prayer needs",
  mission_need: "Mission needs",
};

/** "GC" from "Grace Chapel"; used for a church's mark. */
export function churchInitials(name: string) {
  const words = name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w) && !/^(the|of|and|church)$/i.test(w));
  const picked = words.length ? words : name.split(/\s+/).filter(Boolean);
  return ((picked[0]?.[0] ?? "?") + (picked[1]?.[0] ?? "")).toUpperCase();
}

/** One shared resource as connected churches see it (the Share page previews with this too). */
export function ResourceCard({ r, open, onToggle, mine }: { r: Omit<SharedItem, "id" | "sharedAt">; open: boolean; onToggle?: () => void; mine?: boolean }) {
  return (
    <article className={`mesa-card kind-${r.kind}`}>
      <span className="mesa-kind">{KIND_LABELS[r.kind]}</span>
      <h3>{r.title}</h3>
      {r.scripture && <p className="mesa-scripture">{r.scripture}</p>}
      <p className={`mesa-body${open ? " open" : ""}`}>{r.body}</p>
      {r.tags.length > 0 && (
        <ul className="mesa-tags" aria-label="Tags">
          {r.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <footer className="mesa-card-foot">
        <span className="mesa-from">
          <span className="mesa-church-mark" aria-hidden="true">
            {churchInitials(r.churchName)}
          </span>
          <span className="small">{mine ? "Shared by your church" : r.churchName}</span>
        </span>
        {onToggle && (
          <button type="button" className="btn btn-sm btn-quiet" aria-expanded={open} onClick={onToggle}>
            {open ? "Show less" : "Read it"}
          </button>
        )}
      </footer>
    </article>
  );
}

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
    <div className="mesa-find">
      <div className="mesa-search" role="search">
        <label className="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">Search shared resources</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A series on James, greeter training, a fall outreach…" />
        </label>
        <div className="mesa-kinds" role="group" aria-label="Kind">
          <button type="button" className="filter-chip" aria-pressed={kind === ""} onClick={() => setKind("")}>
            Everything
          </button>
          {ITEM_KINDS.map((k) => (
            <button key={k} type="button" className="filter-chip" aria-pressed={kind === k} onClick={() => setKind(kind === k ? "" : k)}>
              <span className={`mesa-kind-dot kind-${k}`} aria-hidden="true" />
              {KIND_CHIPS[k]}
            </button>
          ))}
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
        <>
          <p className="small muted mesa-count" aria-live="polite">
            {results.length} {results.length === 1 ? "resource" : "resources"} from {peers} connected {peers === 1 ? "church" : "churches"}
            {results.some((r) => r.mine) ? " and yours" : ""}
          </p>
          <ul className="mesa-results">
            {results.map((r) => (
              <li key={r.id}>
                <ResourceCard r={r} mine={r.mine} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
