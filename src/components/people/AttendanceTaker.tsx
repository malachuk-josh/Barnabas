"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { GATHERINGS, type GatheringKey } from "@/lib/ops/gatherings";
import { peoplePost } from "./client";

type Entry = { personId: string; date: string; kind: "worship" | "group"; gathering?: string; groupId?: string };

/** Take attendance for a gathering or a group on a date: tick who was there, save, and the list replaces what was recorded. */
export function AttendanceTaker({ people, groups, entries, canTake, defaultDate }: { people: { id: string; name: string }[]; groups: { id: string; name: string; memberIds: string[] }[]; entries: Entry[]; canTake: boolean; defaultDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [target, setTarget] = useState<string>("sun-1045");
  const [q, setQ] = useState("");
  const isGroup = target.startsWith("grp:");
  const groupId = isGroup ? target.slice(4) : undefined;
  const recorded = useMemo(() => new Set(entries.filter((e) => e.date === date && (isGroup ? e.groupId === groupId : e.kind === "worship" && e.gathering === target)).map((e) => e.personId)), [entries, date, target, isGroup, groupId]);
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const current = ticked ?? recorded;
  const pool = isGroup ? people.filter((p) => groups.find((g) => g.id === groupId)?.memberIds.includes(p.id)) : people;
  const shown = pool.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const [msg, setMsg] = useState<string | null>(null);

  if (!people.length) return <EmptyState title="No one to take attendance for yet" actions={[{ label: "Move your church to Barnabas", href: "/people/import", primary: true }]}>Once people are in the directory, tick who was at each service or group here. Attendance feeds the reports and the weariness watch.</EmptyState>;

  async function save() {
    setMsg(null);
    try {
      const r = await peoplePost<{ present: number }>({ action: "attendance", attendance: { date, kind: isGroup ? "group" : "worship", gathering: isGroup ? undefined : (target as GatheringKey), groupId, presentIds: [...current] } });
      setMsg(`Saved: ${r.present} present.`);
      setTicked(null);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <div className="stack" style={{ gap: 14 }} data-no-pull>
      <div className="fin-form-row">
        <div className="field"><label htmlFor="att-date">Date</label><input id="att-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setTicked(null); }} /></div>
        <div className="field">
          <label htmlFor="att-target">Service or group</label>
          <select id="att-target" value={target} onChange={(e) => { setTarget(e.target.value); setTicked(null); }}>
            <optgroup label="Gatherings">{GATHERINGS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</optgroup>
            {groups.length > 0 && <optgroup label="Groups">{groups.map((g) => <option key={g.id} value={`grp:${g.id}`}>{g.name}</option>)}</optgroup>}
          </select>
        </div>
        <div className="field"><label htmlFor="att-q">Find</label><input id="att-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <p className="small tabular" role="status">{current.size} marked present{recorded.size ? ` (${recorded.size} saved)` : ""}</p>
      <ul className="att-list">
        {shown.map((p) => (
          <li key={p.id}>
            <label className="row">
              <input type="checkbox" disabled={!canTake} checked={current.has(p.id)} onChange={(e) => { const next = new Set(current); if (e.target.checked) next.add(p.id); else next.delete(p.id); setTicked(next); }} />
              {p.name}
            </label>
          </li>
        ))}
      </ul>
      {canTake ? (
        <div className="row"><button type="button" className="btn btn-primary" onClick={() => void save()}>Save attendance</button>{msg && <span className="small" role="status">{msg}</span>}</div>
      ) : (
        <p className="small muted">Pastors, deacons and staff take attendance.</p>
      )}
    </div>
  );
}
