"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { wordHref } from "@/lib/services/scripture";
import { ITEM_KINDS, ITEM_LABELS, type ItemKind, type SermonSeries, type ServiceItem } from "@/lib/services/types";
import { localToday, shortDate, Status, useOps } from "./client";

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
            <li key={r.date}>
              <div className="ops-rot-head">
                <strong>{shortDate(r.date)}</strong>
                {r.preacher ? <span>{r.preacher}</span> : <span className="muted">No one yet</span>}
              </div>
              <div className="small muted ops-rot-meta">
                {r.series && <span className="care-type">{r.series.title}</span>}
                {r.title && <span>{r.title}</span>}
                {r.passage && (r.passageHref ? <Link href={r.passageHref}>{r.passage}</Link> : <span>{r.passage}</span>)}
                <Link href={`/services/plan?date=${r.date}`}>{r.plans.length ? `Order of service (${r.plans.length === 2 ? "both services" : "one service"})` : "Plan the service"}</Link>
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
                ) : (
                  <button
                    className="linklike small"
                    type="button"
                    onClick={() => {
                      setEditing(r.date);
                      setF({ preacher: r.preacher ?? "", passage: r.passage ?? "", title: r.title ?? "", seriesId: "" });
                    }}
                  >
                    {r.preacher ? "Change" : "Add preacher"}
                  </button>
                ))}
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
let keySeq = 0;
const k = () => `i${keySeq++}`;

export function PlanEditor({ date, gathering, label, items, planner, otherGathering }: { date: string; gathering: string; label: string; items: ServiceItem[]; planner: boolean; otherGathering: { key: string; label: string; planned: boolean } }) {
  const ops = useOps("services");
  const [list, setList] = useState<EditItem[]>(() => items.map((i) => ({ ...i, key: k() })));
  const [dirty, setDirty] = useState(false);
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
            <button className="btn btn-primary" type="button" disabled={ops.busy} onClick={() => void ops.act<{ items: ServiceItem[] }>({ action: "plan-start", date, gathering }, (o) => { setList(o.items.map((i) => ({ ...i, key: k() }))); setDirty(false); return "Outlined from the usual order. Adjust anything below."; })}>
              Start from the usual order
            </button>
            {otherGathering.planned && (
              <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act<{ items: ServiceItem[] }>({ action: "plan-copy", date, from: otherGathering.key, to: gathering }, (o) => { setList(o.items.map((i) => ({ ...i, key: k() }))); setDirty(false); return `Copied from the ${otherGathering.label}.`; })}>
                Copy the {otherGathering.label}
              </button>
            )}
            <button className="btn" type="button" onClick={() => set([{ key: k(), kind: "welcome", title: "Welcome", minutes: 3 }])}>
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
        <h2>{label}</h2>
        <span className="pill pill-ok">{total} minutes</span>
      </div>
      <Status error={ops.error} notice={ops.notice} />
      <ol className="ops-order">
        {list.map((it, i) => (
          <li key={it.key} className={`ops-item ops-item-${it.kind}`}>
            {planner ? (
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
      {planner && (
        <div className="row">
          <button className="btn" type="button" onClick={() => set([...list, { key: k(), kind: "song", title: "Song", minutes: 4 }])}>
            Add an item
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={ops.busy || !dirty}
            onClick={() => void ops.act({ action: "plan", plan: { date, gathering, items: list.map(({ key: _k, ...x }) => ({ ...x, person: x.person || undefined, passage: x.passage || undefined, notes: x.notes || undefined })) } }, () => { setDirty(false); return "Order of service saved."; })}
          >
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      )}
    </section>
  );
}
