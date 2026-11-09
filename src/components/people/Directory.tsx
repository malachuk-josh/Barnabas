"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPhone } from "@/lib/messages/phone";
import { MEMBER_LABELS, MEMBER_STATUSES, type MemberStatus } from "@/lib/people/types";

export type Row = {
  id: string;
  name: string;
  lastName: string;
  status: MemberStatus;
  household: { id: string; name: string } | null;
  groups: { name: string }[];
  contact: { email?: string; phone?: string } | null;
  archived: boolean;
  /** Last time present at worship or a group (yyyy-mm-dd), if ever recorded. */
  lastSeen: string | null;
  /** A member or regular not seen in six weeks while the church is taking attendance. */
  missed: boolean;
};

/** Short plural labels for the filter chips. */
const FILTER_LABELS: Record<MemberStatus, string> = { member: "Members", regular: "Regulars", visitor: "Visitors", child: "Children", inactive: "Inactive", deceased: "Deceased" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "Nov 1" this year, "Nov 1, 2025" before. */
function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: "UTC" });
}

function letterOf(r: Row) {
  const c = (r.lastName || r.name).trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/** The directory: search, status chips with counts, and rows grouped A–Z by last name. Contact details only for roles that see them. */
export function Directory({ people, showContacts, showLastSeen }: { people: Row[]; showContacts: boolean; showLastSeen: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<MemberStatus | "missed" | "">("");

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of people) c.set(p.status, (c.get(p.status) ?? 0) + 1);
    return c;
  }, [people]);
  const missedCount = people.filter((p) => p.missed).length;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people.filter(
      (p) =>
        (!status || (status === "missed" ? p.missed : p.status === status)) &&
        (!t || `${p.name} ${p.household?.name ?? ""} ${p.contact?.email ?? ""} ${p.contact?.phone ?? ""}`.toLowerCase().includes(t)),
    );
  }, [people, q, status]);

  // A–Z sections, in the order the server sorted them (last name, first name).
  const sections = useMemo(() => {
    const out: { letter: string; rows: Row[] }[] = [];
    for (const r of shown) {
      const l = letterOf(r);
      if (out.at(-1)?.letter !== l) out.push({ letter: l, rows: [] });
      out.at(-1)!.rows.push(r);
    }
    return out;
  }, [shown]);

  const cols = 3 + (showContacts ? 1 : 0) + (showLastSeen ? 1 : 0);
  const chip = (value: typeof status, label: string, n: number) => (
    <button key={value || "all"} type="button" className="filter-chip" aria-pressed={status === value} onClick={() => setStatus(value)}>
      {label}
      <span className="filter-count">{n}</span>
    </button>
  );

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="ppl-tools">
        <label className="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">Search people</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={showContacts ? "Search name, household, email or phone" : "Search name or household"} />
        </label>
        <div className="care-chips" role="group" aria-label="Show">
          {chip("", "Everyone", people.length)}
          {MEMBER_STATUSES.filter((s) => counts.get(s)).map((s) => chip(s, FILTER_LABELS[s], counts.get(s)!))}
          {missedCount > 0 && chip("missed", "Missed lately", missedCount)}
        </div>
      </div>

      <p className="small muted tabular" role="status">
        {shown.length === people.length ? `${people.length} ${people.length === 1 ? "person" : "people"}` : `${shown.length} of ${people.length} people`}
      </p>

      {shown.length > 0 ? (
        <div className="ppl-list">
          <table className="ppl-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                {showContacts && <th scope="col">Contact</th>}
                <th scope="col">Groups</th>
                {showLastSeen && (
                  <th scope="col" className="num">
                    Last here
                  </th>
                )}
              </tr>
            </thead>
            {sections.map((s) => (
              <tbody key={s.letter}>
                <tr className="ppl-letter">
                  <th scope="rowgroup" colSpan={cols}>
                    {s.letter}
                  </th>
                </tr>
                {s.rows.map((p) => (
                  <tr key={p.id}>
                    <td className="ppl-who">
                      <Link href={`/people/${p.id}`}>
                        <span className={`ppl-avatar${p.missed ? " is-missed" : ""}`} aria-hidden="true">
                          {initials(p.name)}
                        </span>
                        <span className="ppl-name">
                          <strong>{p.name}</strong>
                          {p.household && <span className="small muted ppl-house">{p.household.name}</span>}
                          <span className="small muted ppl-sub">{[p.household?.name, MEMBER_LABELS[p.status]].filter(Boolean).join(" · ")}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="ppl-status">
                      <span className={`status-tag status-${p.status}`}>{MEMBER_LABELS[p.status]}</span>
                      {p.missed && <span className="status-tag status-missed">Missed lately</span>}
                    </td>
                    {showContacts && (
                      <td className="small ppl-contact">
                        {p.contact?.phone && <div className="nowrap">{formatPhone(p.contact.phone)}</div>}
                        {p.contact?.email && <div className="ppl-email">{p.contact.email}</div>}
                      </td>
                    )}
                    <td className="small ppl-groups">{p.groups.length ? p.groups.map((g) => g.name).join(", ") : <span className="muted">–</span>}</td>
                    {showLastSeen && (
                      <td className="small num ppl-seen">
                        {p.lastSeen ? (
                          <>
                            <span className="ppl-seen-label">Last here </span>
                            {shortDate(p.lastSeen)}
                          </>
                        ) : (
                          <span className="muted">–</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <p className="muted">No one matches. Try another name or show everyone.</p>
      )}
    </div>
  );
}
