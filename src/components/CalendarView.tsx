"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDaysIso, time12, todayIn } from "@/lib/calendar/time";
import { EVENT_KINDS, type CalendarEvent, type EventKind, type OutsideEvent } from "@/lib/calendar/types";
import { ChevronLeft, ChevronRight } from "./icons";

type Item =
  | { kind: "mine"; event: CalendarEvent; date: string; start?: string; end?: string; allDay: boolean; title: string; source: "barnabas" }
  | { kind: "outside"; event: OutsideEvent; date: string; start?: string; end?: string; allDay: boolean; title: string; source: OutsideEvent["source"] };

type Data = { events: CalendarEvent[]; outside: OutsideEvent[]; problems: string[]; today: string };

const SOURCE_LABEL: Record<Item["source"], string> = { barnabas: "Barnabas", google: "Google", microsoft: "Outlook", church: "Church" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function shiftMonth(first: string, delta: number) {
  const [y, m] = first.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

function gridStart(first: string) {
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay();
  return addDaysIso(first, -dow);
}

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function monthTitle(first: string) {
  return new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function whenText(i: { allDay: boolean; start?: string; end?: string }) {
  if (i.allDay || !i.start) return "All day";
  return i.end ? `${time12(i.start)} – ${time12(i.end)}` : time12(i.start);
}

function sortItems(a: Item, b: Item) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (a.start ?? "").localeCompare(b.start ?? "");
}

type Draft = { id?: string; title: string; date: string; start: string; end: string; allDay: boolean; location: string; notes: string; kind: EventKind };

function emptyDraft(date: string): Draft {
  return { title: "", date, start: "09:00", end: "10:00", allDay: false, location: "", notes: "", kind: "meeting" };
}

export type Suggestion = { id: string; title: string; date: string; kind: "visit" | "rest"; reason: string; href: string };

export function CalendarView({ timezone, suggestions = [] }: { timezone: string; suggestions?: Suggestion[] }) {
  const initialToday = todayIn(timezone);
  const [month, setMonth] = useState(monthStart(initialToday));
  const [selected, setSelected] = useState(initialToday);
  // On phones the selected day's events sit above the month; bring them into view when a day is tapped.
  const dayPanel = useRef<HTMLElement | null>(null);
  const pickDay = (date: string) => {
    setSelected(date);
    const el = dayPanel.current;
    if (el && window.matchMedia("(max-width: 1100px)").matches && el.getBoundingClientRect().top < 64) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const [view, setView] = useState<"month" | "agenda">("month");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<OutsideEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const today = data?.today ?? initialToday;
  const range = useMemo(() => {
    if (view === "agenda") return { from: today, to: addDaysIso(today, 45) };
    const start = gridStart(month);
    return { from: start, to: addDaysIso(start, 41) };
  }, [view, month, today]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events?from=${range.from}&to=${range.to}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't load your calendar.");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your calendar.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Item[]>();
    const add = (item: Item) => map.set(item.date, [...(map.get(item.date) ?? []), item]);
    for (const e of data?.events ?? []) add({ kind: "mine", event: e, date: e.date, start: e.start, end: e.end, allDay: e.allDay, title: e.title, source: "barnabas" });
    for (const e of data?.outside ?? []) add({ kind: "outside", event: e, date: e.date, start: e.start, end: e.end, allDay: e.allDay, title: e.title, source: e.source });
    for (const list of map.values()) list.sort(sortItems);
    return map;
  }, [data]);

  function openItem(item: Item) {
    setFormError(null);
    setConfirmDelete(false);
    if (item.kind === "mine") {
      const e = item.event;
      setEditing({ id: e.id, title: e.title, date: e.date, start: e.start ?? "09:00", end: e.end ?? "10:00", allDay: e.allDay, location: e.location ?? "", notes: e.notes ?? "", kind: e.kind });
    } else {
      setViewing(item.event);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    const body = {
      title: editing.title,
      date: editing.date,
      allDay: editing.allDay,
      start: editing.allDay ? undefined : editing.start,
      end: editing.allDay ? undefined : editing.end,
      location: editing.location || undefined,
      notes: editing.notes || undefined,
      kind: editing.kind,
    };
    const res = await fetch(editing.id ? `/api/calendar/events/${editing.id}` : "/api/calendar/events", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError((await res.json().catch(() => ({}))).error ?? "Couldn't save the event.");
      return;
    }
    setSelected(editing.date);
    setEditing(null);
    await load();
  }

  async function remove() {
    if (!editing?.id) return;
    setSaving(true);
    const res = await fetch(`/api/calendar/events/${editing.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setFormError("Couldn't delete the event.");
      return;
    }
    setEditing(null);
    await load();
  }

  const selectedItems = byDate.get(selected) ?? [];
  const mine = editing?.id ? data?.events.find((e) => e.id === editing.id) : undefined;
  const agendaDates = [...byDate.keys()].filter((d) => d >= today).sort();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Time zone: {timezone.replace(/_/g, " ")}</span>
          <h1>Calendar</h1>
          <p className="muted">Your Barnabas calendar, with your connected calendars and church events alongside. Barnabas can add and change events when you ask.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => { setFormError(null); setConfirmDelete(false); setEditing(emptyDraft(selected)); }}>
          New event
        </button>
      </div>

      {suggestions.length > 0 && (
        <section className="card care-suggest" aria-label="Suggestions from Shepherding" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Suggestions from Shepherding</h2>
            <span className="small muted">Not on your calendar unless you add them</span>
          </div>
          <ul className="care-suggest-list">
            {suggestions.map((s) => (
              <li key={s.id} className={`src-${s.kind === "rest" ? "church" : "barnabas"}`}>
                <span>
                  <strong>{s.title}</strong>
                  <small className="muted">
                    {longDate(s.date)} · {s.reason} · <Link href={s.href}>{s.kind === "rest" ? "Your care load" : "Open the need"}</Link>
                  </small>
                </span>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setConfirmDelete(false);
                    setEditing({ ...emptyDraft(s.date), title: s.title, kind: s.kind, allDay: s.kind === "rest" });
                  }}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.problems.length > 0 && (
        <div className="notice" role="status" style={{ marginBottom: 16 }}>
          {data.problems.join(" ")} <Link href="/settings#calendars">Calendar settings</Link>
        </div>
      )}
      {error && (
        <div className="notice notice-danger" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="cal-layout">
        <div>
          <div className="cal-toolbar">
            <h2>{view === "month" ? monthTitle(month) : "Upcoming"}</h2>
            {view === "month" && (
              <>
                <button className="icon-btn" type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
                  <ChevronLeft />
                </button>
                <button className="btn" type="button" onClick={() => { setMonth(monthStart(today)); setSelected(today); }}>
                  Today
                </button>
                <button className="icon-btn" type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
                  <ChevronRight />
                </button>
              </>
            )}
            <div className="seg" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>
                Month
              </button>
              <button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")}>
                Agenda
              </button>
            </div>
          </div>

          {view === "month" ? (
            <div className="month" aria-busy={loading}>
              <div className="month-head">
                {WEEKDAYS.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="month-grid">
                {Array.from({ length: 42 }, (_, i) => addDaysIso(gridStart(month), i)).map((date) => {
                  const items = byDate.get(date) ?? [];
                  const classes = ["day", date.slice(0, 7) !== month.slice(0, 7) ? "other-month" : "", date === today ? "today" : ""].join(" ");
                  return (
                    <button
                      key={date}
                      type="button"
                      className={classes}
                      aria-pressed={date === selected}
                      aria-label={`${longDate(date)}, ${items.length} event${items.length === 1 ? "" : "s"}`}
                      onClick={() => pickDay(date)}
                      onDoubleClick={() => { setFormError(null); setEditing(emptyDraft(date)); }}
                    >
                      <span className="num">{Number(date.slice(8))}</span>
                      {items.slice(0, 3).map((it) => (
                        <span key={`${it.kind}-${it.kind === "mine" ? it.event.id : it.event.id}`} className={`chip src-${it.source}`}>
                          {!it.allDay && it.start ? `${time12(it.start).replace(":00", "").replace(" ", "").toLowerCase()} ` : ""}
                          {it.title}
                        </span>
                      ))}
                      {items.length > 3 && <span className="more">+{items.length - 3} more</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="agenda" aria-busy={loading}>
              {!loading && agendaDates.length === 0 && <div className="card muted">Nothing scheduled in the next six weeks.</div>}
              {agendaDates.map((date) => (
                <div key={date} className="agenda-day">
                  <h3>{date === today ? `Today, ${longDate(date)}` : longDate(date)}</h3>
                  <div className="agenda">
                    {(byDate.get(date) ?? []).map((it) => (
                      <EventRow key={`${it.kind}-${it.event.id}`} item={it} onOpen={() => openItem(it)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="legend">
            {(["barnabas", "google", "microsoft", "church"] as const).map((s) => (
              <span key={s} className={`src-${s}`}>
                <i /> {SOURCE_LABEL[s]}
              </span>
            ))}
          </div>
        </div>

        {view === "month" && (
          <aside ref={dayPanel} className="card stack cal-day-panel" aria-label={`Events on ${longDate(selected)}`}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "1.2rem" }}>{selected === today ? "Today" : longDate(selected)}</h2>
              <button className="btn" type="button" onClick={() => { setFormError(null); setEditing(emptyDraft(selected)); }}>
                Add
              </button>
            </div>
            {selected === today && <p className="small muted">{longDate(selected)}</p>}
            {selectedItems.length === 0 && <p className="muted">Nothing scheduled. Ask Barnabas to plan something, or add it here.</p>}
            <div className="agenda">
              {selectedItems.map((it) => (
                <EventRow key={`${it.kind}-${it.event.id}`} item={it} onOpen={() => openItem(it)} />
              ))}
            </div>
          </aside>
        )}
      </div>

      {editing && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="event-title" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="sheet" onSubmit={save}>
            <h2 id="event-title">{editing.id ? "Edit event" : "New event"}</h2>
            {mine && (
              <p className="small muted">
                {mine.createdBy === "barnabas" ? "Added by Barnabas" : "Added by you"}
                {mine.external && Object.keys(mine.external).length > 0 ? ` · Synced to ${Object.keys(mine.external).map((k) => (k === "google" ? "Google" : "Outlook")).join(" and ")}` : ""}
              </p>
            )}
            {mine?.syncError && <div className="notice small">{mine.syncError}</div>}
            <div className="field">
              <label htmlFor="ev-title">Title</label>
              <input id="ev-title" type="text" required maxLength={120} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} autoFocus />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="ev-date">Date</label>
                <input id="ev-date" type="date" required value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ev-kind">Type</label>
                <select id="ev-kind" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as EventKind })}>
                  {EVENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="check">
              <input id="ev-allday" type="checkbox" checked={editing.allDay} onChange={(e) => setEditing({ ...editing, allDay: e.target.checked })} />
              All day
            </label>
            {!editing.allDay && (
              <div className="form-row">
                <div className="field">
                  <label htmlFor="ev-start">Starts</label>
                  <input id="ev-start" type="time" required value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="ev-end">Ends</label>
                  <input id="ev-end" type="time" required value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} />
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="ev-location">Location</label>
              <input id="ev-location" type="text" maxLength={200} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ev-notes">Private notes</label>
              <textarea id="ev-notes" className="plain" maxLength={1000} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              <span className="small muted">Notes stay in Barnabas. Connected calendars get the title, time and place only.</span>
            </div>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="btn" type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
              {editing.id &&
                (confirmDelete ? (
                  <div className="row">
                    <span className="small">Delete this event?</span>
                    <button className="btn btn-danger" type="button" onClick={() => void remove()} disabled={saving}>
                      Delete
                    </button>
                    <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                ))}
            </div>
          </form>
        </div>
      )}

      {viewing && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="view-title" onClick={(e) => e.target === e.currentTarget && setViewing(null)}>
          <div className="sheet">
            <span className="eyebrow">From {SOURCE_LABEL[viewing.source]}</span>
            <h2 id="view-title">{viewing.title}</h2>
            <p>
              {longDate(viewing.date)} · {whenText(viewing)}
            </p>
            {viewing.location && <p className="muted">{viewing.location}</p>}
            {viewing.registration && (
              <p className="row">
                <span className="pill pill-ok">{viewing.registration.status}</span>
                <a className="btn" href={viewing.registration.href}>
                  Registrations
                </a>
              </p>
            )}
            <p className="small muted">
              {viewing.source === "church"
                ? "This is on the church calendar. Change it in your church database."
                : `This event lives in ${SOURCE_LABEL[viewing.source]}. Edit it there; Barnabas shows it so it can plan around it.`}
            </p>
            <div>
              <button className="btn" type="button" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EventRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  return (
    <button type="button" className={`event-row src-${item.source}`} onClick={onOpen}>
      <span className="when">{whenText(item)}</span>
      <span className="what">
        <strong>
          {item.title}
          {item.kind === "mine" && item.event.createdBy === "barnabas" && <span className="badge badge-barnabas">Barnabas</span>}
          {item.kind === "outside" && <span className="badge">{SOURCE_LABEL[item.source]}</span>}
          {item.kind === "outside" && item.event.registration && <span className="badge badge-barnabas">Registration</span>}
        </strong>
        {item.kind === "outside" && item.event.registration && <span className="small muted">{item.event.registration.status}</span>}
        {item.kind === "mine" && item.event.location && <span className="small muted">{item.event.location}</span>}
        {item.kind === "outside" && item.event.location && <span className="small muted">{item.event.location}</span>}
      </span>
    </button>
  );
}
