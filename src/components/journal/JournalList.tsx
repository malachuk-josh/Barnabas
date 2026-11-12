"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { JOURNAL_KINDS, KIND_HINTS, KIND_LABELS, type JournalKind, type JournalSummary } from "@/lib/journal/types";
import { VERSES } from "@/lib/language";

type Row = Omit<JournalSummary, "haystack">;
type Filter = "mine" | "pinned" | "shared" | "archived";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "mine", label: "All" },
  { id: "pinned", label: "Pinned" },
  { id: "shared", label: "Shared with me" },
  { id: "archived", label: "Archived" },
];

const when = (ms: number) => {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
};

export function KindMark({ kind }: { kind: JournalKind }) {
  return <span className={`jr-kind jr-kind-${kind}`}>{KIND_LABELS[kind]}</span>;
}

/** The "New" menu: one of the four kinds, created and opened. */
export function NewMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  async function create(kind: JournalKind) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", entry: { kind } }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "That didn't work.");
    router.push(`/journal/${json.id}`);
  }
  return (
    <div className="jr-new" ref={ref}>
      <button type="button" className="btn btn-primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={busy}>
        + New
      </button>
      {open && (
        <div className="jr-new-menu" role="menu">
          {JOURNAL_KINDS.map((k) => (
            <button key={k} type="button" role="menuitem" onClick={() => void create(k)} disabled={busy}>
              <KindMark kind={k} />
              <span className="small muted">{KIND_HINTS[k]}</span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="notice notice-danger small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function JournalList({ initial, tags: initialTags, me }: { initial: Row[]; tags: string[]; me: string }) {
  const [rows, setRows] = useState(initial);
  const [tags, setTags] = useState(initialTags);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<JournalKind | "">("");
  const [tag, setTag] = useState("");
  const [filter, setFilter] = useState<Filter>("mine");
  const [loading, setLoading] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (kind) sp.set("kind", kind);
      if (tag) sp.set("tag", tag);
      if (filter !== "mine") sp.set("filter", filter);
      try {
        const res = await fetch(`/api/journal?${sp}`, { signal: ctl.signal });
        const json = await res.json();
        if (res.ok) {
          setRows(json.entries);
          setTags(json.tags);
        }
      } catch {
        /* a newer search replaced this one */
      }
      setLoading(false);
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, kind, tag, filter]);

  const searching = Boolean(q.trim() || kind || tag || filter !== "mine");
  return (
    <div className="jr-list-wrap">
      <div className="jr-toolbar">
        <label className="search-field jr-search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">Search your journal</span>
          <input id="jr-search" type="search" placeholder="Search titles, notes and tags" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {tags.length > 0 && (
          <>
            <label className="sr-only" htmlFor="jr-tag">
              Tag
            </label>
            <select id="jr-tag" className="jr-tag-select" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Every tag</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </>
        )}
        <nav className="jr-show" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-current={filter === f.id ? "page" : undefined} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="jr-kinds" role="group" aria-label="Kind">
        <button type="button" className="filter-chip" aria-pressed={kind === ""} onClick={() => setKind("")}>
          Every kind
        </button>
        {JOURNAL_KINDS.map((k) => (
          <button key={k} type="button" className="filter-chip" aria-pressed={kind === k} onClick={() => setKind(kind === k ? "" : k)}>
            <span className={`jr-dot jr-dot-${k}`} aria-hidden="true" />
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        {loading ? "Searching" : `${rows.length} entries`}
      </p>
      {rows.length === 0 ? (
        <div className="empty-state jr-empty" role="status">
          <div className="empty-body">
            <strong>{searching ? "Nothing matches" : filter === "shared" ? "Nothing shared with you yet" : "Your journal is ready"}</strong>
            {searching ? (
              <p className="muted small">Try other words, or clear a filter.</p>
            ) : (
              <>
                <p className="term-verse">
                  &ldquo;{VERSES.journal.text}&rdquo; <cite>{VERSES.journal.reference}</cite>
                </p>
                <p className="muted small">Jot a quick note, or build out a sermon, a devotional guide or a worship setlist. You can also tell Barnabas &ldquo;journal this.&rdquo;</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <ul className="jr-cards">
          {rows.map((r) => (
            <li key={`${r.ownerId}:${r.id}`}>
              <Link href={`/journal/${r.id}`} className={`jr-card jr-card-${r.kind}`}>
                <span className="jr-card-top">
                  <KindMark kind={r.kind} />
                  {r.pinned && r.ownerId === me && <span className="jr-flag">Pinned</span>}
                  {r.shared && r.ownerId === me && <span className="jr-flag">Shared</span>}
                  <span className="jr-date">{when(r.updatedAt)}</span>
                </span>
                <strong className="jr-card-title">{r.title}</strong>
                {r.detail && <span className="small muted">{r.detail}</span>}
                {r.snippet && <span className="jr-snippet">{r.snippet}</span>}
                <span className="jr-card-foot">
                  {r.ownerId !== me && <span className="small muted">From {r.ownerName}</span>}
                  {r.tags.slice(0, 4).map((t) => (
                    <span key={t} className="jr-tag">
                      #{t}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
