"use client";

import { useState } from "react";
import type { FormField } from "@/lib/events/types";
import { RegistrationFields, type RegForm } from "./EventsViews";

/** The public registration form. It says only how it went; nothing about anyone else. */
export function PublicRegistration({ token, fields, maxParty, full, payOnline = false }: { token: string; fields: FormField[]; maxParty: number; full: boolean; payOnline?: boolean }) {
  const [form, setForm] = useState<RegForm & { website: string }>({ name: "", email: "", phone: "", partySize: 1, answers: {}, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { status: string; paymentDue?: number }>(null);
  const [redirecting, setRedirecting] = useState(false);

  if (redirecting) {
    return (
      <div className="stack" role="status">
        <h2>Taking you to secure payment…</h2>
        <p className="small muted">Your spot is held for 60 minutes while you pay on Stripe&apos;s page. Card and bank details are entered there, never here.</p>
      </div>
    );
  }

  if (done) {
    const first = form.name.split(/\s+/)[0] || "friend";
    return (
      <div className="stack" role="status">
        <h2>{done.status === "waitlisted" ? `You're on the waitlist, ${first}.` : `You're registered, ${first}!`}</h2>
        <p>{done.status === "waitlisted" ? "The event is full right now. If a spot opens up, you'll move up in the order you signed up, and someone from the church will let you know." : "We're so glad you're coming. See you there!"}</p>
        {done.paymentDue ? <p className="small muted">The cost (${(done.paymentDue / 100).toFixed(0)}) is paid at the event.</p> : null}
      </div>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!form.email && !form.phone) {
          setError("Add an email or a phone number so we can reach you.");
          return;
        }
        setBusy(true);
        setError(null);
        const answers = Object.fromEntries(Object.entries(form.answers).filter(([, v]) => v !== ""));
        const res = await fetch(`/api/register/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, answers }) });
        setBusy(false);
        const json = await res.json().catch(() => ({}));
        if (res.ok && typeof json.checkoutUrl === "string" && json.checkoutUrl.startsWith("https://")) {
          setRedirecting(true);
          window.location.assign(json.checkoutUrl);
        } else if (res.ok) setDone({ status: json.status, paymentDue: json.paymentDue });
        else setError(json.error ?? "Something went wrong. Please try again, or contact the church.");
      }}
    >
      {full && <p className="notice small">This event is full. You can still join the waitlist.</p>}
      <RegistrationFields fields={fields} maxParty={maxParty} form={form} setForm={(f) => setForm({ ...form, ...f })} idPrefix="reg" />
      <div className="care-hp" aria-hidden="true">
        <label htmlFor="reg-website">Website</label>
        <input id="reg-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      </div>
      <p className="small muted">We use this only for this event. We don&apos;t share it.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : full ? "Join the waitlist" : payOnline ? "Register and pay" : "Register"}
      </button>
    </form>
  );
}
