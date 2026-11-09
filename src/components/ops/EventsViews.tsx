"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FIELD_KINDS, FIELD_LABELS, type FieldKind, type FormField, type RegEvent, type Registration } from "@/lib/events/types";
import { localToday, money, opsApi, Status, useOps } from "./client";

type ChurchEvent = { id: string; title: string; date: string; time: string; endTime?: string; location: string; description?: string };
type FieldDraft = { key: string; id?: string; label: string; kind: FieldKind; required: boolean; options: string };
let seq = 0;
const key = () => `f${seq++}`;

function toDraft(f: FormField): FieldDraft {
  return { key: key(), id: f.id, label: f.label, kind: f.kind, required: f.required, options: (f.options ?? []).join(", ") };
}

/** Create an event (optionally from the church calendar) or edit one: details, capacity, waitlist and the form. */
export function EventForm({ churchEvents = [], event }: { churchEvents?: ChurchEvent[]; event?: RegEvent }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [f, setF] = useState({
    title: event?.title ?? "",
    date: event?.date ?? localToday(),
    time: event?.time ?? "",
    endTime: event?.endTime ?? "",
    location: event?.location ?? "",
    description: event?.description ?? "",
    capacity: event?.capacity ? String(event.capacity) : "",
    waitlist: event?.waitlist ?? true,
    open: event?.open ?? true,
    maxParty: String(event?.maxParty ?? 1),
    price: event?.priceCents ? String(event.priceCents / 100) : "",
    churchEventId: event?.churchEventId,
  });
  const [fields, setFields] = useState<FieldDraft[]>(() => (event?.fields ?? []).map(toDraft));
  const setField = (k: string, patch: Partial<FieldDraft>) => setFields(fields.map((x) => (x.key === k ? { ...x, ...patch } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      title: f.title,
      date: f.date,
      time: f.time || undefined,
      endTime: f.endTime || undefined,
      location: f.location,
      description: f.description || undefined,
      churchEventId: f.churchEventId,
      capacity: f.capacity ? Number(f.capacity) : null,
      waitlist: f.waitlist,
      open: f.open,
      maxParty: Number(f.maxParty) || 1,
      priceCents: f.price ? Math.round(Number(f.price) * 100) : null,
      fields: fields.map((x) => ({ id: x.id, label: x.label, kind: x.kind, required: x.required, options: x.kind === "choice" ? x.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined })),
    };
    try {
      const out = await opsApi<RegEvent | { event: RegEvent }>("events", event ? { action: "update", id: event.id, event: payload } : { action: "create", event: payload });
      const id = "event" in out ? out.event.id : out.id;
      router.push(`/events/${id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={event ? "edit-event" : "new-event"} className="fin-card fin-form" onSubmit={submit}>
      <h2>{event ? "Event details and form" : "Create an event"}</h2>
      <Status error={error} />
      {!event && churchEvents.length > 0 && (
        <div className="field">
          <label htmlFor="ev-from">Start from the church calendar</label>
          <select
            id="ev-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              const c = churchEvents.find((x) => x.id === e.target.value);
              if (c) setF({ ...f, title: c.title, date: c.date, time: c.time, endTime: c.endTime ?? "", location: c.location, description: c.description ?? "", churchEventId: c.id });
              else setF({ ...f, churchEventId: undefined });
            }}
          >
            <option value="">A new event</option>
            {churchEvents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.date})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="ev-title">Title</label>
        <input id="ev-title" type="text" required maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="fin-form-row">
        <div className="field">
          <label htmlFor="ev-date">Date</label>
          <input id="ev-date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ev-time">Starts</label>
          <input id="ev-time" type="text" placeholder="6:00 PM" maxLength={8} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ev-end">Ends</label>
          <input id="ev-end" type="text" placeholder="8:00 PM" maxLength={8} value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ev-loc">Where</label>
        <input id="ev-loc" type="text" required maxLength={160} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="ev-desc">Description</label>
        <textarea id="ev-desc" className="plain" maxLength={800} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <div className="fin-form-row">
        <div className="field">
          <label htmlFor="ev-cap">Capacity (people)</label>
          <input id="ev-cap" type="number" min={1} max={5000} placeholder="No limit" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ev-party">Up to per registration</label>
          <input id="ev-party" type="number" min={1} max={20} value={f.maxParty} onChange={(e) => setF({ ...f, maxParty: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ev-price">Cost per person ($)</label>
          <input id="ev-price" type="number" min={0} step="1" placeholder="Free" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={f.waitlist} onChange={(e) => setF({ ...f, waitlist: e.target.checked })} />
          Keep a waitlist when full
        </label>
        <label className="check">
          <input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} />
          Registration open
        </label>
      </div>
      {f.price && <p className="small muted ops-seam">Payment isn&apos;t collected online yet. Registrations are marked as due and you mark them paid at the door. (Stripe will plug in here.)</p>}
      <h3>Registration questions</h3>
      <p className="small muted">Name and an email or phone are always asked. Add your own questions:</p>
      {fields.map((x) => (
        <div key={x.key} className="ops-field-edit">
          <label className="sr-only" htmlFor={`${x.key}-label`}>
            Question
          </label>
          <input id={`${x.key}-label`} type="text" required maxLength={80} placeholder="Question" value={x.label} onChange={(e) => setField(x.key, { label: e.target.value })} />
          <label className="sr-only" htmlFor={`${x.key}-kind`}>
            Answer type
          </label>
          <select id={`${x.key}-kind`} value={x.kind} onChange={(e) => setField(x.key, { kind: e.target.value as FieldKind })}>
            {FIELD_KINDS.map((k) => (
              <option key={k} value={k}>
                {FIELD_LABELS[k]}
              </option>
            ))}
          </select>
          <label className="check small">
            <input type="checkbox" checked={x.required} onChange={(e) => setField(x.key, { required: e.target.checked })} />
            Required
          </label>
          <button className="fin-x" type="button" aria-label={`Remove ${x.label || "question"}`} onClick={() => setFields(fields.filter((y) => y.key !== x.key))}>
            ×
          </button>
          {x.kind === "choice" && (
            <>
              <label className="sr-only" htmlFor={`${x.key}-opts`}>
                Choices
              </label>
              <input id={`${x.key}-opts`} className="ops-field-opts" type="text" placeholder="Choices, separated by commas" value={x.options} onChange={(e) => setField(x.key, { options: e.target.value })} />
            </>
          )}
        </div>
      ))}
      <div className="row">
        <button className="btn" type="button" onClick={() => setFields([...fields, { key: key(), label: "", kind: "text", required: false, options: "" }])}>
          Add a question
        </button>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : event ? "Save event" : "Create event"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Attendees and check-in ---------- */

type Reg = Registration;

export function Attendees({ event, registrations, origin }: { event: RegEvent; registrations: Reg[]; origin: string }) {
  const ops = useOps("events");
  const [filter, setFilter] = useState<"registered" | "waitlisted" | "cancelled">("registered");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const shown = useMemo(() => registrations.filter((r) => r.status === filter && (!q || r.name.toLowerCase().includes(q.toLowerCase()))), [registrations, filter, q]);
  const link = `${origin}/register/${event.token}`;
  const n = (s: Reg["status"]) => registrations.filter((r) => r.status === s).length;
  return (
    <div className="fin-stack">
      <section className="fin-card">
        <h2>Public registration link</h2>
        <p className="small muted">Anyone with this link can register, no sign-in needed. It never shows who else registered. Make a new link to turn this one off.</p>
        <div className="copy-row">
          <label className="sr-only" htmlFor="reg-link">
            Registration link
          </label>
          <input id="reg-link" type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button
            className="btn"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="row">
          <a className="btn" href={`/register/${event.token}`} target="_blank" rel="noreferrer">
            Open the page
          </a>
          <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "new-link", id: event.id }, () => "New link made. The old one no longer works.")}>
            Make a new link
          </button>
        </div>
      </section>
      <section className="fin-card">
        <div className="fin-card-head">
          <h2>Attendees</h2>
          <span className="row">
            <a className="btn" href={`/api/events/${event.id}?format=csv`}>
              Download CSV
            </a>
            <button className="btn" type="button" onClick={() => setAdding((a) => !a)}>
              {adding ? "Close" : "Add someone"}
            </button>
          </span>
        </div>
        <Status error={ops.error} notice={ops.notice} />
        {adding && <AddRegistration event={event} onDone={() => setAdding(false)} />}
        <div className="row">
          <div className="seg" role="group" aria-label="Show">
            {(["registered", "waitlisted", "cancelled"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
                {s === "registered" ? "Registered" : s === "waitlisted" ? "Waitlist" : "Cancelled"} ({n(s)})
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="att-find">
            Find someone
          </label>
          <input id="att-find" type="text" placeholder="Find someone" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        </div>
        {registrations.length === 0 ? (
          <EmptyState compact title="No one has registered yet" actions={[{ label: "Open the registration page", href: `/register/${event.token}` }]}>
            Share the link above in your announcements or a text, or add someone yourself. Registrations show up here as they come in.
          </EmptyState>
        ) : shown.length === 0 ? (
          <p className="muted small">No one here.</p>
        ) : (
          <ul className="ops-attendees">
            {shown.map((r) => (
              <li key={r.id} className={r.checkedInAt ? "checked" : ""}>
                <span className="ops-att-who">
                  <strong>{r.name}</strong>
                  {r.partySize > 1 && <span className="badge">Party of {r.partySize}</span>}
                  {r.payment.status === "due" && <span className="badge ops-due">{money(r.payment.amountCents)} due</span>}
                  {r.payment.status === "paid" && <span className="badge">Paid</span>}
                  <span className="small muted">
                    {[r.email, r.phone].filter(Boolean).join(" · ")}
                    {event.fields.length ? " · " : ""}
                    {event.fields
                      .filter((f) => r.answers[f.id] !== undefined)
                      .map((f) => `${f.label}: ${typeof r.answers[f.id] === "boolean" ? (r.answers[f.id] ? "Yes" : "No") : r.answers[f.id]}`)
                      .join(" · ")}
                  </span>
                </span>
                <span className="ops-slot-actions">
                  {r.status === "registered" && (
                    <button className={`btn${r.checkedInAt ? "" : " btn-primary"}`} type="button" disabled={ops.busy} aria-pressed={Boolean(r.checkedInAt)} onClick={() => void ops.act({ action: "checkin", id: r.id, present: !r.checkedInAt })}>
                      {r.checkedInAt ? "Checked in ✓" : "Check in"}
                    </button>
                  )}
                  {r.payment.status === "due" && (
                    <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "payment", id: r.id, status: "paid" })}>
                      Mark paid
                    </button>
                  )}
                  {r.status === "waitlisted" && (
                    <button className="btn" type="button" disabled={ops.busy} onClick={() => void ops.act({ action: "admit", id: r.id }, () => `${r.name} is registered.`)}>
                      Move up
                    </button>
                  )}
                  {r.status !== "cancelled" && (
                    <button className="btn btn-danger" type="button" disabled={ops.busy} onClick={() => void ops.act<{ promoted: Reg[] }>({ action: "cancel", id: r.id }, (o) => (o.promoted?.length ? `Cancelled. ${o.promoted.map((p) => p.name).join(" and ")} moved up from the waitlist.` : "Cancelled."))}>
                      Cancel
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddRegistration({ event, onDone }: { event: RegEvent; onDone: () => void }) {
  const ops = useOps("events");
  const [form, setForm] = useState<RegForm>({ name: "", email: "", phone: "", partySize: 1, answers: {} });
  return (
    <form
      className="fin-form ops-add-reg"
      onSubmit={(e) => {
        e.preventDefault();
        void ops.act<Reg>({ action: "register", id: event.id, registration: { ...form, email: form.email || undefined, phone: form.phone || undefined } }, (r) => {
          onDone();
          return r.status === "waitlisted" ? `${r.name} is on the waitlist.` : `${r.name} is registered.`;
        });
      }}
    >
      <Status error={ops.error} />
      <RegistrationFields fields={event.fields} maxParty={event.maxParty} form={form} setForm={setForm} idPrefix="add" />
      <button className="btn btn-primary" type="submit" disabled={ops.busy}>
        Register them
      </button>
    </form>
  );
}

export type RegForm = { name: string; email: string; phone: string; partySize: number; answers: Record<string, string | number | boolean> };

/** The registration form's fields, shared by the public page and leaders adding someone. */
export function RegistrationFields({ fields, maxParty, form, setForm, idPrefix }: { fields: FormField[]; maxParty: number; form: RegForm; setForm: (f: RegForm) => void; idPrefix: string }) {
  const set = (id: string, v: string | number | boolean) => setForm({ ...form, answers: { ...form.answers, [id]: v } });
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input id={`${idPrefix}-name`} type="text" required maxLength={100} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`${idPrefix}-email`}>Email</label>
          <input id={`${idPrefix}-email`} type="email" maxLength={200} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-phone`}>Phone</label>
          <input id={`${idPrefix}-phone`} type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      {maxParty > 1 && (
        <div className="field">
          <label htmlFor={`${idPrefix}-party`}>How many people (including you)</label>
          <input id={`${idPrefix}-party`} type="number" min={1} max={maxParty} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) || 1 })} />
        </div>
      )}
      {fields.map((f) => {
        const id = `${idPrefix}-${f.id}`;
        const label = (
          <label htmlFor={id}>
            {f.label}
            {f.required ? "" : " (optional)"}
          </label>
        );
        if (f.kind === "yesno")
          return (
            <fieldset key={f.id} className="ops-yesno">
              <legend>
                {f.label}
                {f.required ? "" : " (optional)"}
              </legend>
              {[true, false].map((v) => (
                <label key={String(v)} className="check">
                  <input type="radio" name={id} required={f.required} checked={form.answers[f.id] === v} onChange={() => set(f.id, v)} />
                  {v ? "Yes" : "No"}
                </label>
              ))}
            </fieldset>
          );
        if (f.kind === "choice")
          return (
            <div key={f.id} className="field">
              {label}
              <select id={id} required={f.required} value={String(form.answers[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)}>
                <option value="">Choose…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        if (f.kind === "number")
          return (
            <div key={f.id} className="field">
              {label}
              <input id={id} type="number" required={f.required} min={f.min} max={f.max} value={String(form.answers[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          );
        return (
          <div key={f.id} className="field">
            {label}
            <input id={id} type="text" required={f.required} maxLength={300} value={String(form.answers[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
          </div>
        );
      })}
    </>
  );
}
