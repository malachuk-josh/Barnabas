"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { peoplePost } from "./client";

type P = { id: string; name: string; email?: string; phone?: string; household?: string; status: string };

/** Likely duplicates side by side; merging keeps one record, fills its gaps from the other, and moves every link over. */
export function Duplicates({ sets }: { sets: { reason: string; people: P[] }[] }) {
  const router = useRouter();
  const [keep, setKeep] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  if (!sets.length) return <EmptyState title="No duplicates found">Barnabas looks for people with the same email, the same mobile number or the same name. After an import, check back here.</EmptyState>;
  async function merge(i: number) {
    const set = sets[i];
    const k = keep[i] ?? set.people[0].id;
    setErr(null);
    try {
      for (const p of set.people) if (p.id !== k) await peoplePost({ action: "merge", keepId: k, dropId: p.id });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      {err && <p className="error" role="alert">{err}</p>}
      {sets.map((s, i) => (
        <section key={s.people.map((p) => p.id).join()} className="fin-card stack" data-no-pull>
          <span className="label">{s.reason}</span>
          <fieldset className="ppl-merge">
            <legend className="small">Keep which record?</legend>
            {s.people.map((p) => (
              <label key={p.id} className="ppl-merge-opt">
                <input type="radio" name={`keep-${i}`} checked={(keep[i] ?? s.people[0].id) === p.id} onChange={() => setKeep({ ...keep, [i]: p.id })} />
                <span>
                  <Link href={`/people/${p.id}`}><strong>{p.name}</strong></Link>
                  <span className="small muted"> {[p.email, p.phone, p.household, p.status].filter(Boolean).join(" · ")}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="small muted">Merging fills blanks on the kept record from the other, moves groups, attendance and notes, and points care, serving and giving at the kept record.</p>
          <div><button type="button" className="btn btn-primary btn-sm" onClick={() => void merge(i)}>Merge into the one I picked</button></div>
        </section>
      ))}
    </div>
  );
}
