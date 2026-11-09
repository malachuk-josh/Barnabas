"use client";

import { useEffect, useState } from "react";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/auth/roles";

type Member = { leaderId: string; name: string; email: string; title: string; role: Role; admin: boolean; lastSignedInAt: number };

/** Settings → Team: admins set each leader's role. Only leaders who have signed in appear. */
export function TeamSettings({ myLeaderId }: { myLeaderId: string }) {
  const [team, setTeam] = useState<Member[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setTeam(j.leaders))
      .catch(() => setMessage({ ok: false, text: "Couldn't load the team." }));
  }, []);

  async function setRole(m: Member, role: Role) {
    setBusy(m.leaderId);
    setMessage(null);
    const res = await fetch("/api/team", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaderId: m.leaderId, role }) });
    setBusy(null);
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setTeam(json.leaders);
      setMessage({ ok: true, text: `${m.name} is now ${ROLE_LABELS[role].toLowerCase()}. It applies the next time they open a page.` });
    } else setMessage({ ok: false, text: json.error ?? "Couldn't change that role." });
  }

  return (
    <section id="team" className="card">
      <h2>Team</h2>
      <p className="muted">
        Leaders appear here after they sign in for the first time, starting as leader. Roles decide who sees church finances:
      </p>
      <ul className="list small" style={{ gap: 4 }}>
        {ROLES.map((r) => (
          <li key={r}>
            <span>
              <strong>{ROLE_LABELS[r]}</strong>: {ROLE_DESCRIPTIONS[r]}
            </span>
          </li>
        ))}
      </ul>
      {message && (
        <div className={`notice ${message.ok ? "success" : "notice-danger"}`} role="status">
          {message.text}
        </div>
      )}
      {!team && !message && <p className="muted">Loading…</p>}
      <div>
        {team?.map((m) => (
          <div className="team-row" key={m.leaderId}>
            <div className="who">
              <strong>
                {m.name}
                {m.leaderId === myLeaderId ? " (you)" : ""}
                {m.admin && <span className="badge">admin</span>}
              </strong>
              <span className="small muted">
                {m.email}
                {m.title ? ` · ${m.title}` : ""}
              </span>
            </div>
            <select aria-label={`Role for ${m.name}`} value={m.role} disabled={busy === m.leaderId} onChange={(e) => void setRole(m, e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="small muted">Administrators are set with BARNABAS_ADMIN_EMAILS on the server.</p>
    </section>
  );
}
