"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { wordHref } from "@/lib/services/scripture";
import { ITEM_KINDS, ITEM_LABELS, type ItemKind, type SermonSeries, type ServiceItem } from "@/lib/services/types";
import { localToday, shortDate, Status, useOps } from "./client";

const tileMonth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const tileDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

type Row = { date: string; preacher: string | null; passage: string | null; passageHref: string | null; title: string | null; series: { id: string; title: string } | null; plans: string[] };

/** The next twelve Sundays: who preaches, the series and passage, and whether each service is planned. */
export function RotationView({ rows, series, planner }: { rows: Row[]; series: (SermonSeries & { passageHref: string | null })[]; planner: boolean }) {
  const ops = useOps("services");
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState({ preacher: "", passage: "", title: "", seriesId: "" });
  return (
    <div className="fin-grid-2 ops-services">
      <section className="fin-card">
        <h2>Preaching rotation</h2>
        <Status error={ops.error} notice={ops.notice} />
        <ul className="ops-rotation">
          {rows.map((r) => (
            <li key={r.date} className="rot-row">
              <span className="date-tile" aria-hidden="true">
                <small>{tileMonth(r.date)}</small>
                <strong>{tileDay(r.date)}</strong>
              </span>
              <div className="rot-main">
                <span className="sr-only">{shortDate(r.date)}: </span>
                <span className="rot-preacher">
                  {r.preacher ? (
                    <>
                      <span className="ops-avatar" aria-hidden="true">
                        {initials(r.preacher)}
                      </span>
                      <strong>{r.preacher}</strong>
                    </>
                  ) : (
                    <span className="muted">No one preaching yet</span>
                  )}
                </span>
                {(r.series || r.title || r.passage) && (
                  <span className="small muted ops-rot-meta">
                    {r.series && <span className="care-type">{r.series.title}</span>}
                    {r.title && <span>&ldquo;{r.title}&rdquo;</span>}
                    {r.passage && (r.passageHref ? <Link href={r.passageHref}>{r.passage}</Link> : <span>{r.passage}</span>)}
                  </span>
                )}
              </div>
              <div className="rot-actions">
                <Link className={`btn btn-sm${r.plans.length ? " is-planned" : ""}`} href={`/services/plan?date=${r.date}`}>
                  {r.plans.length === 2 ? "Planned" : r.plans.length === 1 ? "1 of 2 planned" : "Plan service"}
                </Link>
                {planner && editing !== r.date && (
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => {
                      setEditing(r.date);
                      setF({ preacher: r.preacher ?? "", passage: r.passage ?? "", title: r.title ?? "", seriesId: "" });
                    }}
                  >
                    {r.preacher ? "Change" : "Add preacher"}
                  </button>
                )}
              </div>
              {planner &&
                (editing === r.date ? (
                  <form
                    className="fin-form ops-rot-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void ops.act({ action: "preach", entry: { date: r.date, preacher: f.preacher, passage: f.passage || undefined, title: f.title || undefined, seriesId: f.seriesId || undefined } }, () => {
                        setEditing(null);
                        return "Saved.";
                      });
                    }}
                  >
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor={`pr-${r.date}`}>Preacher</label>
                        <input id={`pr-${r.date}`} type="text" required maxLength={80} list="preachers" value={f.preacher} onChange={(e) => setF({ ...f, preacher: e.target.value })} />
                      </div>
                      <div className="field">
                        <label htmlFor={`ps-${r.date}`}>Passage</label>
                        <input id={`ps-${r.date}`} type="text" maxLength={60} placeholder="Philippians 2:1-11" value={f.passage} onChange={(e) => setF({ ...f, passage: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor={`pt-${r.date}`}>Sermon title</label>
                        <input id={`pt-${r.date}`} type="text" maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
                      </div>
                      <div className="field">
                        <label htmlFor={`pss-${r.date}`}>Series</label>
                        <select id={`pss-${r.date}`} value={f.seriesId} onChange={(e) => setF({ ...f, seriesId: e.target.value })}>
                          <option value="">{series.length ? "By date" : "No series yet"}</option>
                          {series.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="row">
                      <button className="btn btn-primary" type="submit" disabled={ops.busy}>
                        Save
                      </button>
                      <button className="btn" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      {r.preacher && (
                        <button className="btn btn-danger" type="button" onClick={() => void ops.act({ action: "preach-clear", date: r.date }, () => { setEditing(null); })}>
                          Clear
                        </button>
                      )}
                    </div>
                  </form>
                ) : null)}
            </li>
          ))}
        </ul>
        <datalist id="preachers">
          <option value="Ethan Malachuk" />
          <option value="Eric Malachuk" />
        </datalist>
      </section>
      <div className="fin-stack">
        <section className="fin-card">
          <h2>Sermon series</h2>
          {series.length ? (
            <ul className="care-tasks">
              {series.map((s) => (
                <li key={s.id}>
                  <span>
                    <strong>{s.title}</strong>
                    <span className="small muted">
                      {shortDate(s.startDate)} to {shortDate(s.endDate)}
                      {s.passage ? " · " : ""}
                      {s.passage && (s.passageHref ? <Link href={s.passageHref}>{s.passage}</Link> : s.passage)}
                    </span>
                  </span>
                  {planner && (
                    <button className="btn btn-danger" type="button" onClick={() => void ops.act({ action: "series-remove", id: s.id })}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No sermon series planned yet" actions={planner ? [{ label: "Plan your first series", href: "#new-series", primary: true }] : []}>
              A series gathers Sundays around a book or theme, with its passage range linked into The Word.
            </EmptyState>
          )}
        </section>
        {planner && <NewSeries />}
      </div>
    </div>
  );
}

function NewSeries() {
  const ops = useOps("services");
  const [f, setF] = useState({ title: "", passage: "", startDate: localToday(), endDate: localToday(), notes: "" });
  return (
    <form
      id="new-series"
      className="fin-card fin-form"
      onSubmit={(e) => {
        e.preventDefault();
        void ops.act({ action: "series-add", series: { ...f, passage: f.passage || undefined, notes: f.notes || undefined } }, () => {
          setF({ ...f, title: "", passage: "", notes: "" });
          return "Series added. Sundays in its dates pick it up in the rotation.";
        });
      }}
    >
      <h2>Plan a series</h2>
      <Status error={ops.error} notice={ops.notice} />
      <div className="field">
        <label htmlFor="ns-title">Title</label>
        <input id="ns-title" type="text" required maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="ns-passage">Passage range</label>
        <input id="ns-passage" type="text" maxLength={60} placeholder="Philippians 1:1-4:23" value={f.passage} onChange={(e) => setF({ ...f, passage: e.target.value })} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="ns-start">First Sunday</label>
          <input id="ns-start" type="date" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ns-end">Last Sunday</label>
          <input id="ns-end" type="date" required value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </div>
      </div>
      <button className="btn btn-primary" type="submit" disabled={ops.busy}>
        Add series
      </button>
    </form>
  );
}

/* ---------- Order of service ---------- */

type EditItem = Omit<ServiceItem, "id"> & { id?: string; key: string };
// New items get keys from a counter. Items first drawn on the server use their position instead, so the
// server's HTML and the browser's first render agree (a shared counter keeps counting across requests).
let keySeq = 0;
const k = () => `i${keySeq++}`;
const keyed = (gathering: string, items: ServiceItem[]): EditItem[] => items.map((i, n) => ({ ...i, key: `${gathering}-${n}` }));

export function PlanEditor({ date, gathering, label, items, planner, otherGathering }: { date: string; gathering: string; label: string; items: ServiceItem[]; planner: boolean; otherGathering: { key: string; label: string; planned: boolean } }) {
  const ops = useOps("services");
  const [list, setList] = useState<EditItem[]>(() => keyed(gathering, items));
  const [saved, setSaved] = useState<EditItem[]>(list);
  const [dirty, setDirty] = useState(false);
  // Planners read the order like everyone else, and switch to editing when they mean to change it.
  const [editing, setEditing] = useState(false);
  const edit = planner && editing;
  const total = list.reduce((n, i) => n + (Number(i.minutes) || 0), 0);
  const set = (next: EditItem[]) => {
    setList(next);
    setDirty(true);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  if (!items.length && !list.length) {
    return (
      <section className="fin-card">
        <h2>{label}</h2>
        <Status error={ops.error} notice={ops.notice} />
        <EmptyState compact title="No order of service yet">
          {planner ? "Start from MGBC's usual order: welcome, songs, scripture, prayer, the sermon from the rotation, communion on first Sundays, offering and benediction. Then adjust it." : "Pastors and staff plan the order of service."}
        </EmptyState>
        {planner && (
          <div className="row">
            <button className="btn btn-primary" type="button" disabled={ops.busy} onClick={() => void ops.act<{ items: ServiceItem[] }>({ action: "plan-start", date, gathering }, (o) => { const next = o.items.map((i) => ({ ...i, key: k() })); setList(next); setSaved(next); setDirty(false); setEditing(true); return "Outlined from the usual order. Adjust anything below."; })}>
              Start from the usual order
            </button>
            {otherGathering.planned && (
              <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act<{ items: ServiceItem[] }>({ action: "plan-copy", date, from: otherGathering.key, to: gathering }, (o) => { const next = o.items.map((i) => ({ ...i, key: k() })); setList(next); setSaved(next); setDirty(false); setEditing(true); return `Copied from the ${otherGathering.label}.`; })}>
                Copy the {otherGathering.label}
              </button>
            )}
            <button className="btn" type="button" onClick={() => { set([{ key: k(), kind: "welcome", title: "Welcome", minutes: 3 }]); setEditing(true); }}>
              Start blank
            </button>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="fin-card">
      <div className="fin-card-head">
        <div className="plan-title">
          <h2>{label}</h2>
          <span className="small muted">
            {list.length} {list.length === 1 ? "item" : "items"} · about {total} minutes
          </span>
        </div>
        {planner && !editing && (
          <button className="btn btn-sm" type="button" onClick={() => setEditing(true)}>
            Edit order
          </button>
        )}
      </div>
      <Status error={ops.error} notice={ops.notice} />
      <ol className="ops-order">
        {list.map((it, i) => (
          <li key={it.key} className={`ops-item ops-item-${it.kind}${edit ? "" : " is-reading"}`}>
            {edit ? (
              <div className="ops-item-edit">
                <div className="ops-item-move">
                  <button className="icon-btn" type="button" aria-label={`Move ${it.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button className="icon-btn" type="button" aria-label={`Move ${it.title} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                </div>
                <div className="ops-item-fields">
                  <div className="ops-item-row">
                    <label className="sr-only" htmlFor={`${it.key}-kind`}>
                      Kind
                    </label>
                    <select id={`${it.key}-kind`} value={it.kind} onChange={(e) => set(list.map((x) => (x.key === it.key ? { ...x, kind: e.target.value as ItemKind } : x)))}>
                      {ITEM_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {ITEM_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`${it.key}-title`}>
                      Title
                    </label>
                    <input id={`${it.key}-title`} type="text" required maxLength={100} value={it.title} onChange={(e) => set(list.map((x) => (x.key === it.key ? { ...x, title: e.target.value } : x)))} />
                    <label className="sr-only" htmlFor={`${it.key}-min`}>
                      Minutes
                    </label>
                    <input id={`${it.key}-min`} className="ops-min" type="number" min={0} max={120} value={it.minutes} onChange={(e) => set(list.map((x) => (x.key === it.key ? { ...x, minutes: Number(e.target.value) || 0 } : x)))} />
                  </div>
                  <div className="ops-item-row">
                    <label className="sr-only" htmlFor={`${it.key}-who`}>
                      Who leads it
                    </label>
                    <input id={`${it.key}-who`} type="text" maxLength={80} placeholder="Who leads it" value={it.person ?? ""} onChange={(e) => set(list.map((x) => (x.key === it.key ? { ...x, person: e.target.value } : x)))} />
                    <label className="sr-only" htmlFor={`${it.key}-pass`}>
                      Scripture
                    </label>
                    <input id={`${it.key}-pass`} type="text" maxLength={60} placeholder="Scripture (optional)" value={it.passage ?? ""} onChange={(e) => set(list.map((x) => (x.key === it.key ? { ...x, passage: e.target.value } : x)))} />
                    <button className="fin-x" type="button" aria-label={`Remove ${it.title}`} onClick={() => set(list.filter((x) => x.key !== it.key))}>
                      ×
                    </button>
                  </div>
                  {it.passage && wordHref(it.passage) && (
                    <Link className="small" href={wordHref(it.passage)!}>
                      Read {it.passage} in The Word
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="ops-item-view">
                <span className="ops-item-min">{it.minutes}′</span>
                <span>
                  <strong>{it.title}</strong>
                  <span className="small muted">
                    {ITEM_LABELS[it.kind]}
                    {it.person ? ` · ${it.person}` : ""}
                    {it.passage ? " · " : ""}
                    {it.passage && (wordHref(it.passage) ? <Link href={wordHref(it.passage)!}>{it.passage}</Link> : it.passage)}
                  </span>
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
      {edit && (
        <div className="row plan-edit-bar">
          <button className="btn" type="button" onClick={() => set([...list, { key: k(), kind: "song", title: "Song", minutes: 4 }])}>
            Add an item
          </button>
          <span className="plan-edit-end">
            <button
              className="btn"
              type="button"
              disabled={ops.busy}
              onClick={() => {
                setList(saved);
                setDirty(false);
                setEditing(false);
              }}
            >
              {dirty ? "Cancel" : "Done"}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={ops.busy || !dirty}
              onClick={() => void ops.act({ action: "plan", plan: { date, gathering, items: list.map(({ key: _k, ...x }) => ({ ...x, person: x.person || undefined, passage: x.passage || undefined, notes: x.notes || undefined })) } }, () => { setSaved(list); setDirty(false); setEditing(false); return "Order of service saved."; })}
            >
              {dirty ? "Save changes" : "Saved"}
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
