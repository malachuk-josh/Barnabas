"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { Household } from "@/lib/kids/types";
import { Status, useOps } from "./client";

type Draft = {
  name: string;
  guardians: { name: string; phone: string; relationship: string }[];
  children: { id?: string; firstName: string; lastName: string; birthdate: string; grade: string; allergies: string; medical: string; roomId: string }[];
  pickups: { name: string; relationship: string }[];
  notes: string;
};

const blank = (): Draft => ({ name: "", guardians: [{ name: "", phone: "", relationship: "Parent" }], children: [{ firstName: "", lastName: "", birthdate: "", grade: "", allergies: "", medical: "", roomId: "" }], pickups: [], notes: "" });
const fromHousehold = (h: Household): Draft => ({
  name: h.name,
  guardians: h.guardians.map((g) => ({ name: g.name, phone: g.phone ?? "", relationship: g.relationship ?? "" })),
  children: h.children.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, birthdate: c.birthdate ?? "", grade: c.grade ?? "", allergies: c.allergies ?? "", medical: c.medical ?? "", roomId: c.roomId ?? "" })),
  pickups: h.pickups.map((p) => ({ name: p.name, relationship: p.relationship ?? "" })),
  notes: h.notes ?? "",
});

export function FamiliesView({ families, rooms, admin }: { families: Household[]; rooms: { id: string; name: string }[]; admin: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = families.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()) || f.children.some((c) => c.firstName.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="fin-grid-2">
      <section className="fin-card">
        <div className="fin-card-head">
          <h2>On file</h2>
          <span className="small muted">
            {families.length} famil{families.length === 1 ? "y" : "ies"}, {families.reduce((n, f) => n + f.children.length, 0)} children
          </span>
        </div>
        {families.length === 0 ? (
          <EmptyState title="No families yet" actions={admin ? [{ label: "Add your first family", href: "#new-family", primary: true }] : []}>
            Add a family once and check-in is a quick search after that. Importing from ChurchTrac or Planning Center comes when the church database is connected; for now, add families by hand or at the desk on Sunday.
          </EmptyState>
        ) : (
          <>
            <label className="sr-only" htmlFor="fam-find">
              Find a family
            </label>
            <input id="fam-find" type="text" placeholder="Find a family" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="care-tasks">
              {shown.map((f) => (
                <li key={f.id}>
                  <span>
                    <strong>{f.name}</strong>
                    <span className="small muted">
                      {f.children.map((c) => c.firstName).join(", ") || "No children yet"} · {f.guardians.map((g) => g.name).join(", ")}
                    </span>
                    {f.children.some((c) => c.allergies) && <span className="kids-allergy">Allergy on file</span>}
                  </span>
                  {admin && (
                    <button className="btn" type="button" onClick={() => setEditing(editing === f.id ? null : f.id)}>
                      {editing === f.id ? "Close" : "Edit"}
                    </button>
                  )}
                  {editing === f.id && (
                    <div style={{ flexBasis: "100%" }}>
                      <FamilyForm key={f.id} id={f.id} initial={fromHousehold(f)} rooms={rooms} onDone={() => setEditing(null)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {admin && (
        <section className="fin-card" id="new-family">
          <h2>Add a family</h2>
          <FamilyForm initial={blank()} rooms={rooms} />
        </section>
      )}
    </div>
  );
}

function FamilyForm({ id, initial, rooms, onDone }: { id?: string; initial: Draft; rooms: { id: string; name: string }[]; onDone?: () => void }) {
  const ops = useOps("kids");
  const [f, setF] = useState<Draft>(initial);
  const pre = id ?? "new";
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const family = {
      name: f.name,
      guardians: f.guardians.filter((g) => g.name.trim()).map((g) => ({ name: g.name, phone: g.phone || undefined, relationship: g.relationship || undefined })),
      children: f.children.filter((c) => c.firstName.trim()).map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName || f.name, birthdate: c.birthdate || undefined, grade: c.grade || undefined, allergies: c.allergies || undefined, medical: c.medical || undefined, roomId: c.roomId || undefined })),
      pickups: f.pickups.filter((p) => p.name.trim()).map((p) => ({ name: p.name, relationship: p.relationship || undefined })),
      notes: f.notes || undefined,
    };
    void ops.act({ action: "family-save", id, family }, () => {
      if (!id) setF(blank());
      onDone?.();
      return id ? "Saved." : "Family added. They're ready to check in.";
    });
  };
  return (
    <form className="fin-form" onSubmit={save}>
      <Status error={ops.error} notice={ops.notice} />
      <div className="field">
        <label htmlFor={`${pre}-name`}>Family last name</label>
        <input id={`${pre}-name`} type="text" required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <h3>Parents and guardians</h3>
      {f.guardians.map((g, i) => (
        <div key={i} className="kids-row">
          <label className="sr-only" htmlFor={`${pre}-g${i}`}>
            Guardian name
          </label>
          <input id={`${pre}-g${i}`} type="text" placeholder="Name" maxLength={80} value={g.name} onChange={(e) => setF({ ...f, guardians: f.guardians.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
          <label className="sr-only" htmlFor={`${pre}-gp${i}`}>
            Phone
          </label>
          <input id={`${pre}-gp${i}`} type="tel" placeholder="Phone" maxLength={40} value={g.phone} onChange={(e) => setF({ ...f, guardians: f.guardians.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)) })} />
          <label className="sr-only" htmlFor={`${pre}-gr${i}`}>
            Relationship
          </label>
          <input id={`${pre}-gr${i}`} type="text" placeholder="Relationship" maxLength={30} value={g.relationship} onChange={(e) => setF({ ...f, guardians: f.guardians.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)) })} />
        </div>
      ))}
      {f.guardians.length < 4 && (
        <button className="btn" type="button" onClick={() => setF({ ...f, guardians: [...f.guardians, { name: "", phone: "", relationship: "" }] })}>
          Add a guardian
        </button>
      )}
      <h3>Children</h3>
      {f.children.map((c, i) => {
        const set = (patch: Partial<Draft["children"][number]>) => setF({ ...f, children: f.children.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
        return (
          <fieldset key={i} className="kids-child-edit">
            <legend>{c.firstName || `Child ${i + 1}`}</legend>
            <div className="form-row">
              <div className="field">
                <label htmlFor={`${pre}-c${i}-first`}>First name</label>
                <input id={`${pre}-c${i}-first`} type="text" maxLength={40} value={c.firstName} onChange={(e) => set({ firstName: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`${pre}-c${i}-last`}>Last name</label>
                <input id={`${pre}-c${i}-last`} type="text" maxLength={40} placeholder={f.name} value={c.lastName} onChange={(e) => set({ lastName: e.target.value })} />
              </div>
            </div>
            <div className="fin-form-row">
              <div className="field">
                <label htmlFor={`${pre}-c${i}-bd`}>Birthday</label>
                <input id={`${pre}-c${i}-bd`} type="date" value={c.birthdate} onChange={(e) => set({ birthdate: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`${pre}-c${i}-grade`}>Grade</label>
                <input id={`${pre}-c${i}-grade`} type="text" maxLength={20} value={c.grade} onChange={(e) => set({ grade: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`${pre}-c${i}-room`}>Usual room</label>
                <select id={`${pre}-c${i}-room`} value={c.roomId} onChange={(e) => set({ roomId: e.target.value })}>
                  <option value="">Choose at check-in</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${pre}-c${i}-all`}>Allergies (printed on the label)</label>
              <input id={`${pre}-c${i}-all`} type="text" maxLength={120} value={c.allergies} onChange={(e) => set({ allergies: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${pre}-c${i}-med`}>Medical notes (kids admins only, never printed)</label>
              <input id={`${pre}-c${i}-med`} type="text" maxLength={300} value={c.medical} onChange={(e) => set({ medical: e.target.value })} />
            </div>
          </fieldset>
        );
      })}
      <button className="btn" type="button" onClick={() => setF({ ...f, children: [...f.children, { firstName: "", lastName: "", birthdate: "", grade: "", allergies: "", medical: "", roomId: "" }] })}>
        Add a child
      </button>
      <h3>Also allowed to pick up</h3>
      {f.pickups.map((p, i) => (
        <div key={i} className="kids-row">
          <label className="sr-only" htmlFor={`${pre}-p${i}`}>
            Name
          </label>
          <input id={`${pre}-p${i}`} type="text" placeholder="Name" maxLength={80} value={p.name} onChange={(e) => setF({ ...f, pickups: f.pickups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
          <label className="sr-only" htmlFor={`${pre}-pr${i}`}>
            Relationship
          </label>
          <input id={`${pre}-pr${i}`} type="text" placeholder="Relationship" maxLength={30} value={p.relationship} onChange={(e) => setF({ ...f, pickups: f.pickups.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)) })} />
          <button className="fin-x" type="button" aria-label="Remove" onClick={() => setF({ ...f, pickups: f.pickups.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button className="btn" type="button" onClick={() => setF({ ...f, pickups: [...f.pickups, { name: "", relationship: "" }] })}>
        Add someone
      </button>
      <button className="btn btn-primary" type="submit" disabled={ops.busy}>
        {id ? "Save family" : "Add family"}
      </button>
    </form>
  );
}
