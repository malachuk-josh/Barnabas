"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { KIND_LABELS, SERMON_STATUSES, SERMON_STATUS_LABELS, type Devotional, type DevotionalDay, type JournalEntry, type OutlinePoint, type Sermon, type Setlist, type Song } from "@/lib/journal/types";
import { wordHref } from "@/lib/services/scripture";
import { KindMark } from "./JournalList";
import { EntryView } from "./EntryView";
import { Markdown, RefLink } from "./Rich";

export type Sunday = { date: string; label: string; preacher?: string; seriesId?: string; seriesTitle?: string };
export type EditorProps = {
  entry: JournalEntry;
  mine: boolean;
  canSend: boolean;
  sundays: Sunday[];
  series: { id: string; title: string }[];
  services: { key: string; label: string }[];
  translation: string;
};

type Draft = Pick<JournalEntry, "title" | "tags" | "body" | "sermon" | "devotional" | "setlist">;
type SaveState = "saved" | "saving" | "dirty" | "error";

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
const move = <T,>(list: T[], i: number, d: number): T[] => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

async function post(id: string, body: unknown) {
  const res = await fetch(`/api/journal/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

/* ---------- Small fields ---------- */

function Text({ id, label, value, onChange, placeholder, area, rows, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean; rows?: number; hint?: React.ReactNode }) {
  return (
    <div className="field jr-field">
      <label htmlFor={id}>{label}</label>
      {area ? <textarea id={id} className="jr-textarea" rows={rows ?? 3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /> : <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
      {hint}
    </div>
  );
}

/** A list typed as text (references separated by semicolons, lines for questions), kept as typed while editing. */
function ListInput({ id, label, value, onChange, sep, placeholder, area }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void; sep: "lines" | "semicolons"; placeholder?: string; area?: boolean }) {
  const join = (v: string[]) => v.join(sep === "lines" ? "\n" : "; ");
  const [raw, setRaw] = useState(() => join(value));
  const parse = (s: string) => s.split(sep === "lines" ? "\n" : /[;\n]/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="field jr-field">
      <label htmlFor={id}>{label}</label>
      {area ? (
        <textarea id={id} className="jr-textarea" rows={3} value={raw} placeholder={placeholder} onChange={(e) => (setRaw(e.target.value), onChange(parse(e.target.value)))} />
      ) : (
        <input id={id} type="text" value={raw} placeholder={placeholder} onChange={(e) => (setRaw(e.target.value), onChange(parse(e.target.value)))} />
      )}
      {sep === "semicolons" && value.some((v) => wordHref(v)) && (
        <span className="jr-refs small">
          {value.map((v, i) => (
            <RefLink key={i} refText={v} />
          ))}
        </span>
      )}
    </div>
  );
}

function RefInput({ id, label, value, onChange }: { id: string; label: string; value?: string; onChange: (v: string | undefined) => void }) {
  const href = value ? wordHref(value) : null;
  return (
    <div className="field jr-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value ?? ""} placeholder="e.g. Philippians 2:5-11" maxLength={80} onChange={(e) => onChange(e.target.value || undefined)} />
      {href && (
        <Link className="small jr-ref" href={href}>
          Read {value} in The Word
        </Link>
      )}
    </div>
  );
}

function ItemControls({ label, i, n, onMove, onRemove }: { label: string; i: number; n: number; onMove: (d: number) => void; onRemove: () => void }) {
  return (
    <div className="jr-item-controls">
      <button className="icon-btn" type="button" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button className="icon-btn" type="button" aria-label={`Move ${label} down`} disabled={i === n - 1} onClick={() => onMove(1)}>
        ↓
      </button>
      <button className="fin-x" type="button" aria-label={`Remove ${label}`} onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

/* ---------- Sermon ---------- */

function SermonForm({ s, set, sundays, series, entryId, onLinked }: { s: Sermon; set: (s: Sermon) => void; sundays: Sunday[]; series: EditorProps["series"]; entryId: string; onLinked: (s: Sermon, msg: string) => void }) {
  const point = (i: number, p: Partial<OutlinePoint>) => set({ ...s, outline: s.outline.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const [date, setDate] = useState(s.preachDate ?? "");
  const [seriesId, setSeriesId] = useState(s.seriesId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const linked = sundays.find((x) => x.date === s.preachDate);
  const linkedSeries = series.find((x) => x.id === s.seriesId);
  return (
    <>
      <section className="jr-section">
        <div className="jr-grid-2">
          <ListInput id="s-passages" label="Passages" sep="semicolons" value={s.passages} onChange={(passages) => set({ ...s, passages })} placeholder="Philippians 2:1-11; John 13:1-17" />
          <div className="field jr-field">
            <label htmlFor="s-status">Status</label>
            <select id="s-status" value={s.status} onChange={(e) => set({ ...s, status: e.target.value as Sermon["status"] })}>
              {SERMON_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {SERMON_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Text id="s-big" label="Big idea" area rows={2} value={s.bigIdea} onChange={(bigIdea) => set({ ...s, bigIdea })} placeholder="The one sentence you want everyone to carry home" />
      </section>

      <section className="jr-section" data-no-pull>
        <div className="jr-section-head">
          <h2>Outline</h2>
          <span className="small muted">{s.outline.length} point{s.outline.length === 1 ? "" : "s"}</span>
        </div>
        <ol className="jr-items">
          {s.outline.map((p, i) => (
            <li key={p.id} className="jr-item">
              <div className="jr-item-head">
                <span className="jr-num">{i + 1}</span>
                <ItemControls label={`point ${i + 1}`} i={i} n={s.outline.length} onMove={(d) => set({ ...s, outline: move(s.outline, i, d) })} onRemove={() => set({ ...s, outline: s.outline.filter((x) => x.id !== p.id) })} />
              </div>
              <Text id={`${p.id}-t`} label="Point" value={p.text} onChange={(text) => point(i, { text })} />
              <ListInput id={`${p.id}-sub`} label="Sub-points (one per line)" sep="lines" area value={p.subpoints} onChange={(subpoints) => point(i, { subpoints })} />
              <RefInput id={`${p.id}-ref`} label="Scripture" value={p.scripture} onChange={(scripture) => point(i, { scripture, quote: scripture === p.scripture ? p.quote : undefined })} />
              {p.quote && <blockquote className="jr-quote">{p.quote}</blockquote>}
            </li>
          ))}
        </ol>
        <button className="btn" type="button" onClick={() => set({ ...s, outline: [...s.outline, { id: rid("pt"), text: "", subpoints: [] }] })}>
          Add a point
        </button>
      </section>

      <section className="jr-section">
        <Text id="s-ill" label="Illustrations" area value={s.illustrations} onChange={(illustrations) => set({ ...s, illustrations })} />
        <Text id="s-app" label="Application" area value={s.application} onChange={(application) => set({ ...s, application })} />
        <Text id="s-close" label="Closing" area value={s.closing} onChange={(closing) => set({ ...s, closing })} />
      </section>

      <section className="jr-section">
        <div className="jr-section-head">
          <h2>Preaching date</h2>
        </div>
        {s.preachDate ? (
          <p className="small">
            Linked to <strong>{linked?.label ?? s.preachDate}</strong>
            {linked?.preacher ? `, ${linked.preacher} preaching` : ""}
            {linkedSeries ? `, in the series “${linkedSeries.title}”` : ""}. <Link href={`/services/plan?date=${s.preachDate}`}>Order of service</Link>
          </p>
        ) : (
          <p className="small muted">Link this sermon to a Sunday on the preaching rotation and a sermon series in Services. Services itself doesn&apos;t change.</p>
        )}
        <div className="jr-grid-2">
          <div className="field jr-field">
            <label htmlFor="s-date">Sunday</label>
            <select id="s-date" value={date} onChange={(e) => setDate(e.target.value)}>
              <option value="">Not linked</option>
              {s.preachDate && !sundays.some((x) => x.date === s.preachDate) && <option value={s.preachDate}>{s.preachDate}</option>}
              {sundays.map((x) => (
                <option key={x.date} value={x.date}>
                  {x.label}
                  {x.preacher ? ` · ${x.preacher}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field jr-field">
            <label htmlFor="s-series">Sermon series</label>
            <select id="s-series" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              <option value="">{series.length ? "None" : "No series in Services yet"}</option>
              {series.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        {err && (
          <p className="notice notice-danger small" role="alert">
            {err}
          </p>
        )}
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={busy || (date === (s.preachDate ?? "") && seriesId === (s.seriesId ?? ""))}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const e = (await post(entryId, { action: "link-preaching", link: { date: date || null, seriesId: seriesId || null } })) as JournalEntry;
                setSeriesId(e.sermon?.seriesId ?? "");
                onLinked(e.sermon!, date ? "Linked to the preaching date." : "Unlinked.");
              } catch (x) {
                setErr((x as Error).message);
              }
              setBusy(false);
            }}
          >
            Link to preaching date
          </button>
        </div>
      </section>
    </>
  );
}

/* ---------- Devotional ---------- */

function DevotionalForm({ d, set }: { d: Devotional; set: (d: Devotional) => void }) {
  const day = (i: number, p: Partial<DevotionalDay>) => set({ ...d, days: d.days.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <>
      <section className="jr-section">
        <ListInput id="d-passages" label="Passages" sep="semicolons" value={d.passages} onChange={(passages) => set({ ...d, passages })} placeholder="Psalm 23; John 10:1-18" />
      </section>
      <section className="jr-section" data-no-pull>
        <div className="jr-section-head">
          <h2>Days</h2>
          <span className="small muted">{d.days.length} day{d.days.length === 1 ? "" : "s"}</span>
        </div>
        <ol className="jr-items">
          {d.days.map((x, i) => (
            <li key={x.id} className="jr-item">
              <div className="jr-item-head">
                <span className="jr-num">Day {i + 1}</span>
                <ItemControls label={`day ${i + 1}`} i={i} n={d.days.length} onMove={(m) => set({ ...d, days: move(d.days, i, m) })} onRemove={() => set({ ...d, days: d.days.filter((y) => y.id !== x.id) })} />
              </div>
              <div className="jr-grid-2">
                <Text id={`${x.id}-t`} label="Title" value={x.title} onChange={(title) => day(i, { title })} />
                <RefInput id={`${x.id}-p`} label="Passage" value={x.passage} onChange={(passage) => day(i, { passage, passageText: passage === x.passage ? x.passageText : undefined })} />
              </div>
              {x.passageText && <blockquote className="jr-quote">{x.passageText}</blockquote>}
              <Text id={`${x.id}-r`} label="Reflection" area rows={4} value={x.reflection} onChange={(reflection) => day(i, { reflection })} />
              <ListInput id={`${x.id}-q`} label="Questions (one per line)" sep="lines" area value={x.questions} onChange={(questions) => day(i, { questions })} />
              <Text id={`${x.id}-pr`} label="Prayer prompt" area rows={2} value={x.prayer} onChange={(prayer) => day(i, { prayer })} />
            </li>
          ))}
        </ol>
        <button className="btn" type="button" onClick={() => set({ ...d, days: [...d.days, { id: rid("day"), title: "", reflection: "", questions: [], prayer: "" }] })}>
          Add a day
        </button>
      </section>
    </>
  );
}

/* ---------- Setlist ---------- */

function SetlistForm({ l, set, sundays, services }: { l: Setlist; set: (l: Setlist) => void; sundays: Sunday[]; services: EditorProps["services"] }) {
  const song = (i: number, p: Partial<Song>) => set({ ...l, songs: l.songs.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <>
      <section className="jr-section">
        <div className="jr-grid-2">
          <div className="field jr-field">
            <label htmlFor="l-date">Service date</label>
            <select id="l-date" value={l.serviceDate ?? ""} onChange={(e) => set({ ...l, serviceDate: e.target.value || undefined })}>
              <option value="">Not set</option>
              {l.serviceDate && !sundays.some((x) => x.date === l.serviceDate) && <option value={l.serviceDate}>{l.serviceDate}</option>}
              {sundays.map((x) => (
                <option key={x.date} value={x.date}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field jr-field">
            <label htmlFor="l-g">Gathering</label>
            <select id="l-g" value={l.gathering ?? ""} onChange={(e) => set({ ...l, gathering: (e.target.value || undefined) as Setlist["gathering"] })}>
              <option value="">Not set</option>
              {services.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Text id="l-theme" label="Theme" value={l.theme} onChange={(theme) => set({ ...l, theme })} placeholder="e.g. The Good Shepherd" />
      </section>
      <section className="jr-section" data-no-pull>
        <div className="jr-section-head">
          <h2>Songs</h2>
          <span className="small muted">{l.songs.length} song{l.songs.length === 1 ? "" : "s"}</span>
        </div>
        <ol className="jr-items">
          {l.songs.map((x, i) => (
            <li key={x.id} className="jr-item">
              <div className="jr-item-head">
                <span className="jr-num">{i + 1}</span>
                <ItemControls label={x.title || `song ${i + 1}`} i={i} n={l.songs.length} onMove={(m) => set({ ...l, songs: move(l.songs, i, m) })} onRemove={() => set({ ...l, songs: l.songs.filter((y) => y.id !== x.id) })} />
              </div>
              <div className="jr-grid-2">
                <Text id={`${x.id}-t`} label="Song" value={x.title} onChange={(title) => song(i, { title })} />
                <Text id={`${x.id}-a`} label="Author or artist" value={x.artist} onChange={(artist) => song(i, { artist })} />
              </div>
              <div className="jr-grid-4">
                <Text id={`${x.id}-k`} label="Key" value={x.key} onChange={(key) => song(i, { key: key.slice(0, 12) })} />
                <div className="field jr-field">
                  <label htmlFor={`${x.id}-bpm`}>BPM</label>
                  <input id={`${x.id}-bpm`} type="number" inputMode="numeric" min={20} max={300} value={x.bpm ?? ""} onChange={(e) => song(i, { bpm: e.target.value ? Math.max(20, Math.min(300, Math.round(Number(e.target.value)))) || undefined : undefined })} />
                </div>
                <Text id={`${x.id}-ts`} label="Time" value={x.timeSignature} placeholder="4/4" onChange={(timeSignature) => song(i, { timeSignature: timeSignature.slice(0, 8) })} />
                <Text id={`${x.id}-c`} label="CCLI #" value={x.ccli} onChange={(ccli) => song(i, { ccli: ccli.slice(0, 20) })} />
              </div>
              <div className="jr-grid-2">
                <Text id={`${x.id}-l`} label="Who leads" value={x.leader} onChange={(leader) => song(i, { leader })} />
                <RefInput id={`${x.id}-s`} label="Scripture tie-in" value={x.scripture} onChange={(scripture) => song(i, { scripture })} />
              </div>
              <Text id={`${x.id}-ar`} label="Arrangement and flow" area rows={2} value={x.arrangement} placeholder="V1 C V2 C B C C" onChange={(arrangement) => song(i, { arrangement })} />
              {i < l.songs.length - 1 && <Text id={`${x.id}-tr`} label="Transition to the next song" area rows={2} value={x.transition} onChange={(transition) => song(i, { transition })} />}
            </li>
          ))}
        </ol>
        <button className="btn" type="button" onClick={() => set({ ...l, songs: [...l.songs, { id: rid("song"), title: "", artist: "", key: "", timeSignature: "", ccli: "", arrangement: "", leader: "", transition: "" }] })}>
          Add a song
        </button>
      </section>
    </>
  );
}

/* ---------- Confirm dialog ---------- */

function Confirm({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: { title: string; children: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button, select")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);
  return (
    <div className="jr-modal-backdrop" onClick={onCancel}>
      <div className="jr-modal" role="dialog" aria-modal="true" aria-labelledby="jr-modal-title" ref={ref} onClick={(e) => e.stopPropagation()} data-no-pull>
        <h2 id="jr-modal-title">{title}</h2>
        {children}
        <div className="row jr-modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- The editor ---------- */

export function JournalEditor(props: EditorProps) {
  const { entry, mine, canSend, sundays, series, services } = props;
  if (!mine) return <SharedView {...props} />;
  return <OwnEditor key={entry.id} {...props} entry={entry} canSend={canSend} sundays={sundays} series={series} services={services} />;
}

function SharedView({ entry }: EditorProps) {
  return (
    <div className="jr-page">
      <div className="jr-head">
        <Link href="/journal" className="small jr-back">
          ← Journal
        </Link>
        <p className="notice small">
          Shared with the leadership team by <strong>{entry.ownerName}</strong>. You can read it; only {entry.ownerName.split(" ")[0]} can change it.
        </p>
      </div>
      <EntryView entry={entry} />
      {(entry.kind === "setlist" || entry.kind === "devotional") && (
        <div className="row no-print">
          <button className="btn" type="button" onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}
    </div>
  );
}

function OwnEditor({ entry, canSend, sundays, series, services, translation }: EditorProps) {
  const router = useRouter();
  const [meta, setMeta] = useState({ pinned: entry.pinned, shared: entry.shared, archivedAt: entry.archivedAt, sentTo: entry.setlist?.sentTo });
  const [draft, setDraft] = useState<Draft>({ title: entry.title, tags: entry.tags, body: entry.body, sermon: entry.sermon, devotional: entry.devotional, setlist: entry.setlist });
  const [save, setSave] = useState<SaveState>("saved");
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "delete" | "send" | "share">(null);
  const [busy, setBusy] = useState(false);
  const [tagText, setTagText] = useState(entry.tags.map((t) => `#${t}`).join(" "));
  const latest = useRef(draft);
  const pending = useRef(false);
  latest.current = draft;

  const flush = useCallback(async (keepalive = false) => {
    if (!pending.current) return;
    pending.current = false;
    setSave("saving");
    const d = latest.current;
    const body = { title: d.title, tags: d.tags, body: d.body, sermon: d.sermon, devotional: d.devotional, setlist: d.setlist ? (({ sentTo: _s, ...rest }) => rest)(d.setlist) : undefined };
    try {
      const res = await fetch(`/api/journal/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Couldn't save. Your changes are still here; keep typing and it will try again.");
        setSave("error");
        pending.current = true;
        return;
      }
      setError(null);
      setSave(pending.current ? "dirty" : "saved");
    } catch {
      setSave("error");
      pending.current = true;
    }
  }, [entry.id]);

  useEffect(() => {
    if (!pending.current) return;
    const t = setTimeout(() => void flush(), 900);
    return () => clearTimeout(t);
  }, [draft, flush]);

  useEffect(() => {
    const away = () => void flush(true);
    const hidden = () => document.visibilityState === "hidden" && away();
    window.addEventListener("pagehide", away);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", away);
      document.removeEventListener("visibilitychange", hidden);
      away();
    };
  }, [flush]);

  const change = (p: Partial<Draft>) => {
    pending.current = true;
    setSave("dirty");
    setDraft((d) => ({ ...d, ...p }));
  };

  async function act(body: unknown, after: (out: JournalEntry) => React.ReactNode) {
    setBusy(true);
    setError(null);
    try {
      await flush();
      const out = await post(entry.id, body);
      setNotice(after(out as JournalEntry));
      return out;
    } catch (x) {
      setError((x as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const [target, setTarget] = useState({ date: entry.setlist?.serviceDate ?? sundays[0]?.date ?? "", gathering: entry.setlist?.gathering ?? services[0]?.key ?? "" });
  const songCount = draft.setlist?.songs.filter((s) => s.title.trim()).length ?? 0;
  const printable = entry.kind === "setlist" || entry.kind === "devotional";
  const statusText = save === "saved" ? "Saved" : save === "saving" ? "Saving…" : save === "dirty" ? "Editing…" : "Not saved yet";
  const current: JournalEntry = { ...entry, ...draft, ...meta, setlist: draft.setlist ? { ...draft.setlist, sentTo: meta.sentTo } : undefined };

  return (
    <div className="jr-page">
      <div className="jr-editor">
        <div className="jr-head">
          <div className="jr-head-row">
            <Link href="/journal" className="small jr-back">
              ← Journal
            </Link>
            <span className={`jr-save jr-save-${save}`} role="status" aria-live="polite">
              {statusText}
            </span>
          </div>
          <div className="jr-head-row">
            <KindMark kind={entry.kind} />
            {meta.shared && <span className="jr-flag">Shared with the leadership team</span>}
            {meta.archivedAt && <span className="jr-flag">Archived</span>}
          </div>
          <label className="sr-only" htmlFor="jr-title">
            Title
          </label>
          <input id="jr-title" type="text" className="jr-title" value={draft.title} maxLength={120} placeholder={`${KIND_LABELS[entry.kind]} title`} onChange={(e) => change({ title: e.target.value })} />
          <div className="field jr-field">
            <label htmlFor="jr-tags" className="sr-only">
              Tags
            </label>
            <input
              id="jr-tags"
              type="text"
              className="jr-tags-input"
              value={tagText}
              placeholder="#tags, separated by spaces"
              onChange={(e) => {
                setTagText(e.target.value);
                change({ tags: [...new Set(e.target.value.split(/[\s,]+/).map((t) => t.replace(/^#/, "").toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 12) });
              }}
            />
          </div>
        </div>

        <div className="jr-actions row" role="toolbar" aria-label="Entry actions">
          <button className="btn btn-sm" type="button" aria-pressed={meta.pinned} disabled={busy} onClick={() => void act({ action: "pin", pinned: !meta.pinned }, (e) => (setMeta((m) => ({ ...m, pinned: e.pinned })), e.pinned ? "Pinned to the top of your journal." : "Unpinned."))}>
            {meta.pinned ? "Unpin" : "Pin"}
          </button>
          <button className="btn btn-sm" type="button" aria-pressed={meta.shared} disabled={busy} onClick={() => (meta.shared ? void act({ action: "share", shared: false }, (e) => (setMeta((m) => ({ ...m, shared: e.shared })), "Private again: only you can see it.")) : setDialog("share"))}>
            {meta.shared ? "Stop sharing" : "Share with the leadership team"}
          </button>
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void act({ action: "duplicate" }, (e) => (router.push(`/journal/${e.id}`), "Copied. Opening the copy…"))}>
            Duplicate
          </button>
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void act({ action: "archive", archived: !meta.archivedAt }, (e) => (setMeta((m) => ({ ...m, archivedAt: e.archivedAt })), e.archivedAt ? "Archived. Find it under Archived in your journal." : "Back in your journal."))}>
            {meta.archivedAt ? "Unarchive" : "Archive"}
          </button>
          {printable && (
            <button className="btn btn-sm" type="button" onClick={() => void flush().then(() => window.print())}>
              Print
            </button>
          )}
          <button className="btn btn-sm btn-danger" type="button" disabled={busy} onClick={() => setDialog("delete")}>
            Delete
          </button>
        </div>

        {entry.kind === "setlist" && canSend && (
          <div className="jr-send no-print">
            <button className="btn btn-primary" type="button" disabled={busy || !songCount} onClick={() => (setTarget({ date: draft.setlist?.serviceDate ?? target.date, gathering: draft.setlist?.gathering ?? target.gathering }), setDialog("send"))}>
              Send to order of service
            </button>
            <span className="small muted">
              {meta.sentTo ? (
                <>
                  Sent to the {services.find((g) => g.key === meta.sentTo!.gathering)?.label ?? meta.sentTo.gathering} on {sundays.find((s) => s.date === meta.sentTo!.date)?.label ?? meta.sentTo.date}. Sending again updates those songs.{" "}
                  <Link href={`/services/plan?date=${meta.sentTo.date}`}>Open it</Link>
                </>
              ) : songCount ? (
                "Adds these songs to that Sunday's order of service in Services."
              ) : (
                "Add a song first."
              )}
            </span>
          </div>
        )}

        {error && (
          <p className="notice notice-danger small" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice success small" role="status">
            {notice}
          </p>
        )}

        {entry.kind === "sermon" && draft.sermon && <SermonForm s={draft.sermon} set={(sermon) => change({ sermon })} sundays={sundays} series={series} entryId={entry.id} onLinked={(s, msg) => (setDraft((d) => ({ ...d, sermon: { ...d.sermon!, preachDate: s.preachDate, seriesId: s.seriesId } })), setNotice(msg))} />}
        {entry.kind === "devotional" && draft.devotional && <DevotionalForm d={draft.devotional} set={(devotional) => change({ devotional })} />}
        {entry.kind === "setlist" && draft.setlist && <SetlistForm l={draft.setlist} set={(setlist) => change({ setlist })} sundays={sundays} services={services} />}

        <section className="jr-section" data-no-pull>
          <div className="jr-section-head">
            <h2>{entry.kind === "note" ? "Note" : "Notes"}</h2>
            <div className="jr-tabs" role="tablist" aria-label="Notes view">
              <button type="button" role="tab" aria-selected={!preview} onClick={() => setPreview(false)}>
                Write
              </button>
              <button type="button" role="tab" aria-selected={preview} onClick={() => setPreview(true)}>
                Preview
              </button>
            </div>
          </div>
          {preview ? (
            <div className="jr-preview">{draft.body.trim() ? <Markdown text={draft.body} /> : <p className="muted small">Nothing written yet.</p>}</div>
          ) : (
            <>
              <label className="sr-only" htmlFor="jr-body">
                {entry.kind === "note" ? "Note" : "Notes"}
              </label>
              <textarea id="jr-body" className="jr-body" value={draft.body} rows={entry.kind === "note" ? 14 : 6} placeholder={entry.kind === "note" ? "Write freely. **bold**, *italic*, # headings, - lists and > quotes work. Scripture references like John 3:16 link to The Word." : "Anything else: research, quotes, ideas for later."} onChange={(e) => change({ body: e.target.value })} />
            </>
          )}
          <p className="small muted">Scripture quoted by Barnabas is in your translation ({translation}), with its reference.</p>
        </section>
      </div>

      {printable && (
        <div className="jr-print" aria-hidden="true">
          <EntryView entry={current} print />
        </div>
      )}

      {dialog === "delete" && (
        <Confirm
          title="Delete this entry?"
          confirmLabel="Delete for good"
          danger
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            pending.current = false;
            const res = await fetch(`/api/journal/${entry.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
            setBusy(false);
            if (!res.ok) {
              setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete it.");
              return setDialog(null);
            }
            router.push("/journal");
            router.refresh();
          }}
        >
          <p className="small">
            &ldquo;{draft.title}&rdquo; will be gone for good{meta.shared ? ", including for the leaders you shared it with" : ""}. If you might want it later, archive it instead.
          </p>
        </Confirm>
      )}

      {dialog === "share" && (
        <Confirm
          title="Share with the leadership team?"
          confirmLabel="Share"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            await act({ action: "share", shared: true }, (e) => (setMeta((m) => ({ ...m, shared: e.shared })), "Shared. Your co-laborers on the leadership team can read it under Shared with me."));
            setDialog(null);
          }}
        >
          <p className="small">Other signed-in leaders will be able to read &ldquo;{draft.title}&rdquo;. They can&apos;t change it, and you can stop sharing any time.</p>
        </Confirm>
      )}

      {dialog === "send" && (
        <Confirm
          title="Send to the order of service?"
          confirmLabel={meta.sentTo ? "Update the order of service" : "Add the songs"}
          busy={busy || !target.date || !target.gathering}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const out = (await act({ action: "send-to-service", target, confirm: true }, () => null)) as { entry: JournalEntry; started: boolean; songs: number } | null;
            if (out) {
              setMeta((m) => ({ ...m, sentTo: out.entry.setlist?.sentTo }));
              setDraft((d) => ({ ...d, setlist: d.setlist ? { ...d.setlist, serviceDate: target.date, gathering: target.gathering as Setlist["gathering"] } : d.setlist }));
              setNotice(
                <>
                  {out.songs} song{out.songs === 1 ? "" : "s"} in the order of service{out.started ? ", started from the usual order" : ""}. <Link href={`/services/plan?date=${target.date}`}>Open it in Services</Link>
                </>,
              );
            }
            setDialog(null);
          }}
        >
          <div className="jr-grid-2">
            <div className="field jr-field">
              <label htmlFor="send-date">Sunday</label>
              <select id="send-date" value={target.date} onChange={(e) => setTarget((t) => ({ ...t, date: e.target.value }))}>
                {target.date && !sundays.some((x) => x.date === target.date) && <option value={target.date}>{target.date}</option>}
                {sundays.map((x) => (
                  <option key={x.date} value={x.date}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field jr-field">
              <label htmlFor="send-g">Service</label>
              <select id="send-g" value={target.gathering} onChange={(e) => setTarget((t) => ({ ...t, gathering: e.target.value }))}>
                {services.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="small">
            Adds {songCount} song{songCount === 1 ? "" : "s"} to that order of service, with who leads, key, tempo and CCLI in each song&apos;s notes. If there&apos;s no order yet, it starts from the usual one. {meta.sentTo ? "Sending again updates the songs it sent before; it doesn't add them twice." : ""}
          </p>
        </Confirm>
      )}
    </div>
  );
}
