"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPhone } from "@/lib/messages/phone";
import { MEMBER_LABELS, type MemberStatus } from "@/lib/people/types";

export type Row = { id: string; name: string; status: MemberStatus; household: { id: string; name: string } | null; groups: { name: string }[]; contact: { email?: string; phone?: string } | null; archived: boolean };

/** The directory list with search and a status filter. Contact columns appear only for roles that see them. */
export function Directory({ people, showContacts }: { people: Row[]; showContacts: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<MemberStatus | "">("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people.filter((p) => (!status || p.status === status) && (!t || `${p.name} ${p.household?.name ?? ""} ${p.contact?.email ?? ""}`.toLowerCase().includes(t)));
  }, [people, q, status]);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="mesa-search" role="search">
        <div className="field">
          <label htmlFor="ppl-q">Search</label>
          <input id="ppl-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, household or email" />
        </div>
        <div className="field">
          <label htmlFor="ppl-status">Status</label>
          <select id="ppl-status" value={status} onChange={(e) => setStatus(e.target.value as MemberStatus | "")}>
            <option value="">Everyone</option>
            {Object.entries(MEMBER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="small muted tabular" role="status">
        {shown.length} of {people.length} {people.length === 1 ? "person" : "people"}
      </p>
      <div className="fin-table-wrap">
        <table className="fin-table ppl-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Household</th>
              <th scope="col">Status</th>
              {showContacts && <th scope="col">Contact</th>}
              <th scope="col">Groups</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/people/${p.id}`}>
                    <strong>{p.name}</strong>
                  </Link>
                </td>
                <td>{p.household?.name ?? <span className="muted">–</span>}</td>
                <td className="nowrap">{MEMBER_LABELS[p.status]}</td>
                {showContacts && (
                  <td className="small">
                    {p.contact?.phone && <div className="nowrap">{formatPhone(p.contact.phone)}</div>}
                    {p.contact?.email && <div className="ppl-email">{p.contact.email}</div>}
                  </td>
                )}
                <td className="small">{p.groups.map((g) => g.name).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
