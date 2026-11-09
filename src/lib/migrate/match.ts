import { normalizeEmail, normalizePhone } from "../messages/phone";
import { displayName } from "../people/native";
import type { PeopleBook, PersonRecord } from "../people/types";

export const norm = (s: string | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** "Kim, Sarah" → ["Sarah", "Kim"]; "Sarah Kim" → ["Sarah", "Kim"]. */
export function splitName(full: string): [string, string] {
  const t = full.replace(/\s+/g, " ").trim();
  if (/^[^,]+,\s*[^,]+$/.test(t)) {
    const [last, first] = t.split(/,\s*/);
    return [first, last];
  }
  const parts = t.split(" ");
  return parts.length > 1 ? [parts.slice(0, -1).join(" "), parts[parts.length - 1]] : [t, ""];
}

/** A stable key for a person row: their ID in the old system, else email, else mobile and name, else name and household. */
export function personKey(system: string, r: { externalId?: string; email?: string; phone?: string; firstName: string; lastName: string; household?: string }) {
  if (r.externalId) return `${system}:id:${r.externalId.trim().toLowerCase()}`;
  if (r.email) return `e:${r.email}`;
  if (r.phone) return `p:${r.phone}:${norm(`${r.firstName} ${r.lastName}`)}`;
  return `n:${norm(`${r.firstName} ${r.lastName}`)}|${norm(r.household)}`;
}

/** Finds people in the book by import key, email, mobile or name (in that order). */
export class PersonMatcher {
  private byKey = new Map<string, PersonRecord>();
  private byEmail = new Map<string, PersonRecord>();
  private byPhone = new Map<string, PersonRecord>();
  private byName = new Map<string, PersonRecord[]>();
  constructor(book: PeopleBook) {
    for (const p of book.people) {
      if (p.mergedInto) continue;
      this.add(p);
    }
  }
  add(p: PersonRecord) {
    if (p.source?.key) this.byKey.set(p.source.key, p);
    if (p.email) this.byEmail.set(p.email, p);
    if (p.phone) this.byPhone.set(p.phone, p);
    for (const n of new Set([norm(`${p.firstName} ${p.lastName}`), norm(displayName(p))])) this.byName.set(n, [...(this.byName.get(n) ?? []), p]);
  }
  find(r: { key?: string; email?: string; phone?: string; name?: string }): { person: PersonRecord | null; ambiguous: boolean } {
    const k = r.key ? this.byKey.get(r.key) : undefined;
    if (k) return { person: k, ambiguous: false };
    const e = r.email ? this.byEmail.get(normalizeEmail(r.email) ?? "") : undefined;
    if (e) return { person: e, ambiguous: false };
    const ph = r.phone ? this.byPhone.get(normalizePhone(r.phone) ?? "") : undefined;
    if (ph) return { person: ph, ambiguous: false };
    // By name only when nothing contradicts it: a same-named person with a different email or mobile is someone else.
    const email = normalizeEmail(r.email) ?? undefined;
    const phone = normalizePhone(r.phone) ?? undefined;
    const named = (r.name ? this.byName.get(norm(r.name)) ?? [] : []).filter((p) => (!email || !p.email || p.email === email) && (!phone || !p.phone || p.phone === phone));
    if (named.length === 1) return { person: named[0], ambiguous: false };
    return { person: null, ambiguous: named.length > 1 };
  }
}
