import { createHash } from "node:crypto";
import { z } from "zod";
import type { Leader } from "../auth/session";
import { matchColumns, type ColumnSpec } from "../csv/columns";
import { audit } from "../data/records";
import { parseCsv } from "../finance/csv";
import { normalizeEmail, normalizePhone } from "../messages/phone";
import { withLock } from "../store";
import { invalidateChurchData } from "./index";
import { identityKeys } from "./sync";
import { emptySnapshot, loadSnapshot, saveSnapshot, type ChmsSnapshot, type Household } from "./snapshot";
import type { Language } from "./types";

/**
 * People and households from a CSV (ChurchTrac's People export, or any spreadsheet). The header row is
 * matched tolerantly; the leader sees a preview with what will be added, updated and skipped, and a dry
 * run gives the counts, before anything is saved.
 */

export class ImportError extends Error {}

export const PEOPLE_FIELDS = ["firstName", "lastName", "fullName", "email", "phone", "household", "language"] as const;
export type PeopleField = (typeof PEOPLE_FIELDS)[number];

export const PEOPLE_COLUMNS: ColumnSpec<PeopleField> = {
  firstName: { exact: ["first name", "firstname", "first", "given name", "preferred name", "nickname"], partial: ["first"] },
  lastName: { exact: ["last name", "lastname", "last", "surname", "family name"], partial: ["last", "surname"] },
  fullName: { exact: ["name", "full name", "display name", "person", "individual", "member name"], partial: ["fullname", "displayname"] },
  email: { exact: ["email", "e-mail", "email address", "primary email", "personal email"], partial: ["email", "e-mail"] },
  phone: { exact: ["mobile phone", "cell phone", "cell", "mobile", "phone", "primary phone", "home phone", "phone number"], partial: ["mobile", "cell", "phone"] },
  household: { exact: ["family", "family name", "household", "household name", "family id", "household id", "familyname"], partial: ["family", "household"] },
  language: { exact: ["language", "preferred language", "primary language"], partial: ["language"] },
};

export const FIELD_LABELS: Record<PeopleField, string> = { firstName: "First name", lastName: "Last name", fullName: "Full name", email: "Email", phone: "Phone", household: "Household / family", language: "Preferred language" };

export const Mapping = z.record(z.enum(PEOPLE_FIELDS), z.number().int().min(-1).max(200)).optional();

function language(v: string | undefined): Language {
  const s = (v ?? "").trim().toLowerCase();
  if (/^(es|spa|spanish|espa)/.test(s)) return "es";
  if (/^(ko|kor|korean|한)/.test(s)) return "ko";
  return "en";
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export type ImportRow = {
  row: number;
  name: string;
  firstName: string;
  email?: string;
  phone?: string;
  household?: string;
  language: Language;
  dedupeKey: string;
  action: "add" | "update" | "same" | "duplicate" | "skip";
  problem?: string;
  matchedName?: string;
};

/** Stable identity for a row: email, else phone and name, else name and household. */
export function personDedupeKey(r: { name: string; email?: string; phone?: string; household?: string }) {
  if (r.email) return `e:${r.email}`;
  const digits = r.phone?.replace(/\D/g, "").slice(-10);
  if (digits && digits.length === 10) return `p:${digits}:${norm(r.name)}`;
  return `n:${norm(r.name)}|${norm(r.household ?? "")}`;
}

export const importedId = (key: string) => `imp_${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;

export function readPeople(csv: string, mapping?: Partial<Record<PeopleField, number>>, existing: ChmsSnapshot | null = null) {
  const table = parseCsv(csv);
  if (table.length < 2) throw new ImportError("That file has no rows to import.");
  const header = table[0];
  const auto = matchColumns(header, PEOPLE_COLUMNS);
  const cols: Partial<Record<PeopleField, number>> = { ...auto };
  for (const [f, i] of Object.entries(mapping ?? {}) as [PeopleField, number][]) cols[f] = i < 0 ? undefined : i;
  if (cols.fullName === undefined && cols.firstName === undefined) throw new ImportError("Couldn't find a name column. Choose which column holds names.");
  const cell = (r: string[], f: PeopleField) => (cols[f] !== undefined ? clean(r[cols[f]!]) : "");

  const byKey = new Map<string, ChmsSnapshot["people"][number]>();
  for (const p of existing?.people ?? []) {
    byKey.set(p.dedupeKey, p);
    for (const k of identityKeys(p)) byKey.set(k, p);
  }
  const seen = new Set<string>();
  const rows: ImportRow[] = table.slice(1).map((r, i) => {
    const first = cell(r, "firstName");
    const last = cell(r, "lastName");
    let name = cell(r, "fullName");
    if (!name) name = [first, last].filter(Boolean).join(" ");
    // "Kim, Sarah" → "Sarah Kim"
    if (/^[^,]+,\s*[^,]+$/.test(name) && !first) name = name.split(/,\s*/).reverse().join(" ");
    const rawEmail = cell(r, "email");
    const rawPhone = cell(r, "phone");
    const email = normalizeEmail(rawEmail) ?? undefined;
    const phone = rawPhone ? (normalizePhone(rawPhone) ?? undefined) : undefined;
    const household = cell(r, "household") || undefined;
    const base = { row: i + 2, name, firstName: first || name.split(" ")[0] || "", email, phone, household, language: language(cell(r, "language")) };
    if (!name) return { ...base, dedupeKey: "", action: "skip" as const, problem: "No name." };
    const dedupeKey = personDedupeKey(base);
    if (seen.has(dedupeKey)) return { ...base, dedupeKey, action: "duplicate" as const, problem: "Same person appears earlier in the file." };
    seen.add(dedupeKey);
    const match = byKey.get(dedupeKey) ?? identityKeys(base).map((k) => byKey.get(k)).find(Boolean);
    const problem = rawEmail && !email ? "The email doesn't look right; it was left out." : rawPhone && !phone ? "The phone number couldn't be read; it was left out." : undefined;
    if (!match) return { ...base, dedupeKey, action: "add" as const, problem };
    const same = match.name === name && (match.email ?? undefined) === email && (match.phone ?? undefined) === phone && (match.household ?? undefined) === household && match.language === base.language;
    return { ...base, dedupeKey, action: same ? ("same" as const) : ("update" as const), matchedName: match.name, problem };
  });
  const count = (a: ImportRow["action"]) => rows.filter((r) => r.action === a).length;
  return {
    header,
    columns: cols,
    detected: auto,
    rows,
    counts: { total: rows.length, add: count("add"), update: count("update"), same: count("same"), duplicate: count("duplicate"), skip: count("skip"), households: new Set(rows.filter((r) => r.household && (r.action === "add" || r.action === "update")).map((r) => norm(r.household!))).size },
  };
}

export async function previewPeople(churchId: string, csv: string, mapping?: Partial<Record<PeopleField, number>>) {
  const r = readPeople(csv, mapping, await loadSnapshot(churchId));
  return { ...r, rows: r.rows.slice(0, 200) };
}

/** Saves the people (unless `dryRun`). Planning Center people are never overwritten by an import. */
export async function commitPeople(leader: Leader, csv: string, mapping: Partial<Record<PeopleField, number>> | undefined, dryRun: boolean) {
  return withLock(`chms:${leader.churchId}:import-lock`, async () => {
    const snap = (await loadSnapshot(leader.churchId)) ?? emptySnapshot();
    const read = readPeople(csv, mapping, snap);
    if (dryRun) return { dryRun: true, counts: read.counts };
    const index = new Map<string, number>();
    snap.people.forEach((p, i) => {
      index.set(p.dedupeKey, i);
      for (const k of identityKeys(p)) index.set(k, i);
    });
    let added = 0, updated = 0, protectedRows = 0;
    for (const r of read.rows) {
      if (r.action !== "add" && r.action !== "update") continue;
      const hhId = r.household ? `imp_hh_${createHash("sha256").update(norm(r.household)).digest("hex").slice(0, 10)}` : undefined;
      const at = index.get(r.dedupeKey) ?? identityKeys(r).map((k) => index.get(k)).find((x) => x !== undefined);
      if (at !== undefined) {
        const p = snap.people[at];
        if (p.source === "planning_center") {
          protectedRows++;
          continue; // Planning Center is the source of truth for its own people
        }
        Object.assign(p, { name: r.name, firstName: r.firstName, email: r.email, phone: r.phone, household: r.household, language: r.language });
        updated++;
      } else {
        snap.people.push({ id: importedId(r.dedupeKey), source: "import", dedupeKey: r.dedupeKey, name: r.name, firstName: r.firstName, email: r.email, phone: r.phone, household: r.household, language: r.language });
        index.set(r.dedupeKey, snap.people.length - 1);
        added++;
      }
      if (hhId && r.household) {
        const id = snap.people[index.get(r.dedupeKey) ?? at!]?.id;
        const h: Household = snap.households.find((x) => x.id === hhId) ?? { id: hhId, name: r.household, memberIds: [] };
        if (!snap.households.includes(h)) snap.households.push(h);
        if (id && !h.memberIds.includes(id)) h.memberIds.push(id);
      }
    }
    if (!snap.sources.includes("import") && (added || updated)) snap.sources.push("import");
    snap.syncedAt = snap.syncedAt || Date.now();
    await saveSnapshot(leader.churchId, snap);
    invalidateChurchData();
    await audit(leader, { action: "chms.import.people", detail: `${added} added, ${updated} updated, ${read.counts.same} unchanged, ${read.counts.duplicate} duplicates in file` });
    return { dryRun: false, counts: read.counts, added, updated, protected: protectedRows };
  });
}

/** Removes every imported person (Planning Center people stay). */
export async function clearImported(leader: Leader) {
  return withLock(`chms:${leader.churchId}:import-lock`, async () => {
    const snap = await loadSnapshot(leader.churchId);
    if (!snap) return { removed: 0 };
    const before = snap.people.length;
    snap.people = snap.people.filter((p) => p.source !== "import");
    snap.households = snap.households.filter((h) => !h.id.startsWith("imp_"));
    snap.sources = snap.sources.filter((s) => s !== "import");
    await saveSnapshot(leader.churchId, snap);
    invalidateChurchData();
    await audit(leader, { action: "chms.import.clear", detail: `${before - snap.people.length} removed` });
    return { removed: before - snap.people.length };
  });
}
