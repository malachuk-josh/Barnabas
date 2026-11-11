"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark } from "@/components/Mark";

type Invite = { token: string; valid: boolean; firstName?: string; email?: string; church?: string };

export default function SignIn() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);

  // An invite link (/signin?invite=...) greets them, fills in their email and needs no access code.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j: Omit<Invite, "token">) => {
        setInvite({ token, ...j });
        if (j.valid && j.email) setEmail(j.email);
      })
      .catch(() => setInvite({ token, valid: false }));
  }, []);

  const useInvite = Boolean(invite?.valid);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code: useInvite ? "" : form.get("code"),
        ...(useInvite ? { invite: invite!.token } : {}),
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
        {useInvite ? (
          <p className="muted">
            Welcome{invite?.firstName ? `, ${invite.firstName}` : ""}! You&apos;ve been invited to Barnabas{invite?.church ? ` at ${invite.church}` : ""}. Your invitation lets you in, no access code needed.
          </p>
        ) : (
          <p className="muted">Encouragement that remembers. Sign in with your email and the access code your church gave you.</p>
        )}
        {invite && !invite.valid && (
          <p className="error" role="alert">
            This invitation has expired or was replaced by a newer one. Ask your church administrator for a new one, or sign in with the church access code.
          </p>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {!useInvite && (
          <div className="field">
            <label htmlFor="code">Church access code</label>
            <input id="code" name="code" type="password" autoComplete="off" required />
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : useInvite ? "Accept and sign in" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
