"use client";

import { useState } from "react";
import { GuestFields, type GuestForm } from "./GuestsView";

/** The public guest card. It says only whether it worked; it never shows anything from the church's records. */
export function WelcomeForm({ token }: { token: string }) {
  const [f, setF] = useState<GuestForm & { website: string }>({ name: "", email: "", phone: "", howHeard: "", kidsAges: "", prayerRequest: "", prayerShareable: false, interests: [], website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="stack" role="status">
        <h2>Thank you, {f.name.split(/\s+/)[0] || "friend"}!</h2>
        <p>We&apos;re so glad you came. Someone from the church will be in touch this week.</p>
      </div>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/welcome/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
        setBusy(false);
        if (res.ok) setDone(true);
        else setError((await res.json().catch(() => ({}))).error ?? "Something went wrong. Please hand your card to a greeter.");
      }}
    >
      <GuestFields f={f} setF={setF} publicForm />
      <div className="care-hp" aria-hidden="true">
        <label htmlFor="g-website">Website</label>
        <input id="g-website" type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      </div>
      <p className="small muted">We use this only to welcome you and follow up. We don&apos;t share it.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send my card"}
      </button>
    </form>
  );
}
