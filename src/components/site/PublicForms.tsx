"use client";

import { useState } from "react";
import { GuestFields, type GuestForm } from "@/components/care/GuestsView";

/**
 * The website's and member app's public forms. Each posts to /api/s/{form}, carries a honeypot field
 * people never see, and shows only whether it worked.
 */

async function send(form: string, body: unknown): Promise<string | null> {
  const res = await fetch(`/api/s/${form}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? "Something went wrong. Please try again in a moment.";
}

function Honeypot({ id, value, set }: { id: string; value: string; set: (v: string) => void }) {
  return (
    <div className="cs-hp" aria-hidden="true">
      <label htmlFor={id}>Website</label>
      <input id={id} type="text" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );
}

function Problem({ error }: { error: string | null }) {
  return error ? (
    <p className="cs-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function ContactForm({ blockId, page }: { blockId?: string; page?: string }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const id = (k: string) => `c-${blockId ?? "x"}-${k}`;
  if (done)
    return (
      <p className="cs-success" role="status">
        Thank you, {f.name.split(/\s+/)[0] || "friend"}. Your message is on its way, and someone will get back to you soon.
      </p>
    );
  return (
    <form
      className="cs-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const err = await send("contact", { ...f, blockId, page });
        setBusy(false);
        if (err) setError(err);
        else setDone(true);
      }}
    >
      <div className="cs-field">
        <label htmlFor={id("name")}>Your name</label>
        <input id={id("name")} required maxLength={100} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="cs-row">
        <div className="cs-field">
          <label htmlFor={id("email")}>Email</label>
          <input id={id("email")} type="email" maxLength={200} autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="cs-field">
          <label htmlFor={id("phone")}>Phone</label>
          <input id={id("phone")} type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
      </div>
      <div className="cs-field">
        <label htmlFor={id("msg")}>Message</label>
        <textarea id={id("msg")} required maxLength={2000} rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </div>
      <Honeypot id={id("website")} value={f.website} set={(website) => setF({ ...f, website })} />
      <p className="cs-small cs-muted">Add an email or phone number so we can reply. We use it only to answer you.</p>
      <Problem error={error} />
      <button className="cs-btn cs-btn-primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

export function PrayerForm() {
  const [f, setF] = useState({ name: "", request: "", shareable: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p className="cs-success" role="status">
        Thank you. Your request has gone to our shepherding team, and we&apos;re praying with you.
      </p>
    );
  return (
    <form
      className="cs-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const err = await send("prayer", f);
        setBusy(false);
        if (err) setError(err);
        else setDone(true);
      }}
    >
      <div className="cs-field">
        <label htmlFor="p-name">Your name</label>
        <input id="p-name" required maxLength={100} autoComplete="given-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="cs-field">
        <label htmlFor="p-request">How can we pray for you?</label>
        <textarea id="p-request" required maxLength={500} rows={4} value={f.request} onChange={(e) => setF({ ...f, request: e.target.value })} />
      </div>
      <label className="cs-check">
        <input type="checkbox" checked={f.shareable} onChange={(e) => setF({ ...f, shareable: e.target.checked })} />
        It&apos;s OK to share this with the church&apos;s prayer team
      </label>
      <Honeypot id="p-website" value={f.website} set={(website) => setF({ ...f, website })} />
      <p className="cs-small cs-muted">Unless you tick the box, only the pastors see your request. Please keep health, family and money details for a conversation in person.</p>
      <Problem error={error} />
      <button className="cs-btn cs-btn-primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send prayer request"}
      </button>
    </form>
  );
}

/** The Care guest card (the same fields and flow as /welcome), sent through the website. */
export function GuestCardForm() {
  const [f, setF] = useState<GuestForm & { website: string }>({ name: "", email: "", phone: "", howHeard: "", kidsAges: "", prayerRequest: "", prayerShareable: false, interests: [], website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p className="cs-success" role="status">
        Thank you, {f.name.split(/\s+/)[0] || "friend"}! We&apos;re so glad you&apos;re planning to visit. Someone from the church will be in touch.
      </p>
    );
  return (
    <form
      className="cs-form cs-guest"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const err = await send("guest", f);
        setBusy(false);
        if (err) setError(err);
        else setDone(true);
      }}
    >
      <GuestFields f={f} setF={setF} publicForm />
      <Honeypot id="g-website" value={f.website} set={(website) => setF({ ...f, website })} />
      <p className="cs-small cs-muted">We use this only to welcome you and follow up. We don&apos;t share it.</p>
      <Problem error={error} />
      <button className="cs-btn cs-btn-primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send my guest card"}
      </button>
    </form>
  );
}
