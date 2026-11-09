"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HOUSEHOLD_ROLES, MEMBER_LABELS, MEMBER_STATUSES, ROLE_LABELS, type CustomField, type PersonRecord } from "@/lib/people/types";
import { peoplePost } from "./client";

type Household = { id: string; name: string };

/** Add or edit a person: name, contact, dates, membership, household and the church's custom fields. */
export function PersonForm({ person, households, fields }: { person?: PersonRecord; households: Household[]; fields: CustomField[] }) {
  const router = useRouter();
  const [v, setV] = useState({
    firstName: person?.firstName ?? "",
    lastName: person?.lastName ?? "",
    nickname: person?.nickname ?? "",
    email: person?.email ?? "",
    phone: person?.phone ?? "",
    homePhone: person?.homePhone ?? "",
    street: person?.address?.street ?? "",
    city: person?.address?.city ?? "",
    state: person?.address?.state ?? "",
    zip: person?.address?.zip ?? "",
    birthdate: person?.birthdate ?? "",
    anniversary: person?.anniversary ?? "",
    status: person?.status ?? "regular",
    membershipDate: person?.membershipDate ?? "",
    householdId: person?.householdId ?? "",
    newHousehold: "",
    householdRole: person?.householdRole ?? "",
    language: person?.language ?? "en",
    custom: { ...(person?.custom ?? {}) } as Record<string, string>,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await peoplePost<{ id: string }>({
        action: "person",
        id: person?.id,
        person: {
          firstName: v.firstName, lastName: v.lastName, nickname: v.nickname, email: v.email, phone: v.phone, homePhone: v.homePhone,
          address: { street: v.street, city: v.city, state: v.state, zip: v.zip },
          birthdate: v.birthdate, anniversary: v.anniversary, status: v.status, membershipDate: v.membershipDate,
          householdId: v.householdId === "__new" ? "" : v.householdId, newHousehold: v.householdId === "__new" ? v.newHousehold : "",
          householdRole: v.householdRole || undefined, language: v.language, custom: v.custom,
        },
      });
      router.push(`/people/${r.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const text = (k: keyof typeof v, label: string, type = "text", extra: Record<string, unknown> = {}) => (
    <div className="field">
      <label htmlFor={`pf-${k}`}>{label}</label>
      <input id={`pf-${k}`} type={type} value={v[k] as string} onChange={set(k)} {...extra} />
    </div>
  );

  return (
    <form className="fin-card fin-form ppl-form" onSubmit={save} data-no-pull>
      <div className="fin-form-row">
        {text("firstName", "First name", "text", { required: true, autoComplete: "off" })}
        {text("lastName", "Last name")}
        {text("nickname", "Goes by")}
      </div>
      <div className="fin-form-row">
        {text("email", "Email", "email")}
        {text("phone", "Mobile phone", "tel")}
        {text("homePhone", "Home phone", "tel")}
      </div>
      <div className="fin-form-row">
        {text("street", "Street")}
        {text("city", "City")}
        {text("state", "State")}
        {text("zip", "ZIP")}
      </div>
      <div className="fin-form-row">
        {text("birthdate", "Birthdate", "date")}
        {text("anniversary", "Anniversary", "date")}
        <div className="field">
          <label htmlFor="pf-status">Status</label>
          <select id="pf-status" value={v.status} onChange={set("status")}>
            {MEMBER_STATUSES.map((s) => <option key={s} value={s}>{MEMBER_LABELS[s]}</option>)}
          </select>
        </div>
        {text("membershipDate", "Member since", "date")}
      </div>
      <div className="fin-form-row">
        <div className="field">
          <label htmlFor="pf-hh">Household</label>
          <select id="pf-hh" value={v.householdId} onChange={set("householdId")}>
            <option value="">No household</option>
            {households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            <option value="__new">New household…</option>
          </select>
        </div>
        {v.householdId === "__new" && text("newHousehold", "New household name", "text", { required: true, placeholder: `${v.lastName || "Their"} household` })}
        <div className="field">
          <label htmlFor="pf-role">Place in household</label>
          <select id="pf-role" value={v.householdRole} onChange={set("householdRole")}>
            <option value="">–</option>
            {HOUSEHOLD_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-lang">Reads messages in</label>
          <select id="pf-lang" value={v.language} onChange={set("language")}>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="ko">Korean</option>
          </select>
        </div>
      </div>
      {fields.length > 0 && (
        <div className="fin-form-row">
          {fields.map((f) => (
            <div className="field" key={f.id}>
              <label htmlFor={`pf-c-${f.id}`}>{f.label}</label>
              {f.kind === "choice" || f.kind === "yesno" ? (
                <select id={`pf-c-${f.id}`} value={v.custom[f.id] ?? ""} onChange={(e) => setV({ ...v, custom: { ...v.custom, [f.id]: e.target.value } })}>
                  <option value="">–</option>
                  {(f.kind === "yesno" ? ["Yes", "No"] : f.options ?? []).map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input id={`pf-c-${f.id}`} type={f.kind === "date" ? "date" : "text"} value={v.custom[f.id] ?? ""} onChange={(e) => setV({ ...v, custom: { ...v.custom, [f.id]: e.target.value } })} />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : person ? "Save changes" : "Add to the directory"}</button>
        <button className="btn" type="button" onClick={() => router.back()}>Cancel</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
