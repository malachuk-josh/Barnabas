"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomField } from "@/lib/people/types";
import { peoplePost } from "./client";

const KINDS = { text: "Text", date: "Date", yesno: "Yes / no", choice: "Choice" } as const;

export function FieldsEditor({ fields }: { fields: CustomField[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<keyof typeof KINDS>("text");
  const [options, setOptions] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function add() {
    setErr(null);
    try {
      await peoplePost({ action: "field", field: { label, kind, options: kind === "choice" ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined } });
      setLabel("");
      setOptions("");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="fin-grid-2">
      <section className="fin-card">
        <h2>Fields</h2>
        {fields.length === 0 ? <p className="small muted">None yet. Add fields your church tracks that Barnabas doesn&apos;t have a place for (T-shirt size, baptism date, spiritual gifts class).</p> : (
          <ul className="list">
            {fields.map((f) => (
              <li key={f.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{f.label} <span className="badge">{KINDS[f.kind]}</span>{f.options && <span className="small muted"> {f.options.join(", ")}</span>}</span>
                <button type="button" className="btn btn-sm" onClick={async () => { await peoplePost({ action: "field-remove", id: f.id }).catch((e) => setErr(e.message)); router.refresh(); }}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="fin-card fin-form" data-no-pull>
        <h2>Add a field</h2>
        <div className="field"><label htmlFor="fld-l">Label</label><input id="fld-l" type="text" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} /></div>
        <div className="field"><label htmlFor="fld-k">Kind</label><select id="fld-k" value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KINDS)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {kind === "choice" && <div className="field"><label htmlFor="fld-o">Choices (comma-separated)</label><input id="fld-o" type="text" value={options} onChange={(e) => setOptions(e.target.value)} /></div>}
        <div><button type="button" className="btn btn-primary" disabled={!label.trim()} onClick={() => void add()}>Add field</button></div>
        {err && <p className="error small">{err}</p>}
        <p className="small muted">Removing a field removes its values from everyone. The migration tool can also keep any extra columns as fields.</p>
      </section>
    </div>
  );
}
