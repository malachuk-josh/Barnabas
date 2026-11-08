"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/Mark";

export default function SignIn() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        role: form.get("role"),
        code: form.get("code"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Sign-in didn't work. Try again.");
    }
  }

  return (
    <div className="signin">
      <form className="card" onSubmit={onSubmit}>
        <h1>
          <Mark />
          Barnabas
        </h1>
        <p className="muted">Encouragement that remembers. Sign in with the access code your church gave you.</p>
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="role">Your role (optional)</label>
          <input id="role" name="role" type="text" placeholder="e.g. Associate pastor, Kids ministry director" />
        </div>
        <div className="field">
          <label htmlFor="code">Church access code</label>
          <input id="code" name="code" type="password" autoComplete="off" required />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
