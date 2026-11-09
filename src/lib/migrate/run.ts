import { createHash } from "node:crypto";
import type { Leader } from "../auth/session";
import { invalidateChurchData } from "../chms";
import { matchColumns, normHeader, type ColumnSpec } from "../csv/columns";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { normalizeDate, parseCsv } from "../finance/csv";
import { readGiving } from "../finance/giving-import";
import { FinanceError, importGifts, removeImportedGifts } from "../finance/service";
import { loadBooks } from "../finance/store";
import { normalizeEmail, normalizePhone } from "../messages/phone";
import { GATHERINGS, type GatheringKey } from "../ops/gatherings";
import { displayName, isActive, toPerson } from "../people/native";
import { loadPeople, updatePeople } from "../people/store";
import type { GroupRecord, HouseholdRecord, HouseholdRole, ImportBatch, MemberStatus, PeopleBook, PersonRecord } from "../people/types";
import { ATTENDANCE_COLUMNS, GROUP_COLUMNS, PEOPLE_COLUMNS, type FileKind, type System } from "./columns";
import { norm, PersonMatcher, personKey, splitName } from "./match";

/**
 * "Move your church to Barnabas": one engine for every file. Each run is planned against the current
 * People database (preview and dry run show exactly what would happen and why rows are skipped), then
 * applied under the church's lock as one batch with an id. Every row has a stable key, so running the same
 * file again changes nothing; a batch records what it created and what it changed, so it can be undone.
 */

export class MigrateError extends Error {}
const fail = (m: string): never => {
  throw new MigrateError(m);
};

export type Mapping = Record<string, number>;
export type RunInput = { system: System; file: FileKind; csv: string; fileName?: string; mapping?: Mapping; extraAsCustom?: boolean };
export type PlanRow = { row: number; label: string; action: "add" | "update" | "same" | "skip"; reason?: string; detail?: string };

const SPECS: Record<Exclude<FileKind, "giving">, ColumnSpec<string>> = { people: PEOPLE_COLUMNS, groups: GROUP_COLUMNS, attendance: ATTENDANCE_COLUMNS };

/** Dates as old systems write them: 2026-11-03, 11/3/26, "Nov 3, 2026"; a birthday without a year gets 1900. */
export function readDate(text: string | undefined): string | undefined {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  const clean = t.replace(/\s+\d{1,2}:\d{2}.*$/, "");
  const d = normalizeDate(clean);
  // Two-digit years: "3/4/80" is 1980, not 2080.
  if (d && /\/\d{2}$/.test(clean) && Number(d.slice(0, 4)) > new Date().getUTCFullYear() + 1) return `${Number(d.slice(0, 4)) - 100}${d.slice(4)}`;
  if (d) return d;
  const md = t.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (md) return `1900-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
  const parsed = Date.parse(t);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined;
}

export function readStatus(text: string | undefined): MemberStatus | undefined {
  const t = norm(text);
  if (!t) return undefined;
  if (/deceas/.test(t)) return "deceased";
  if (/inactive|former|moved|removed|dropped/.test(t)) return "inactive";
  if (/child|kid|minor/.test(t)) return "child";
  if (/visit|guest|first time|prospect/.test(t)) return "visitor";
  if (/^member|active member|full member|members/.test(t) || t === "member") return "member";
  if (/attend|regular|friend|participant/.test(t)) return "regular";
  return "regular";
}

export function readRole(text: string | undefined): HouseholdRole | undefined {
  const t = norm(text);
  if (!t) return undefined;
  if (/head|primary|husband|father/.test(t) && !/child/.test(t)) return "head";
  if (/spouse|wife|partner|mother/.test(t)) return "spouse";
  if (/child|son|daughter|dependent/.test(t)) return "child";
  return "other";
}

const truthyAbsent = (v: string | undefined) => /^(no|n|absent|false|0|x\s*absent)$/i.test((v ?? "").trim());

function table(csv: string) {
  const t = parseCsv(csv);
  if (t.length < 2) fail("That file has no rows to import. Check you exported the report with people in it.");
  if (t.length > 20_001) fail("That file is over 20,000 rows. Split it and import each part.");
  return t;
}

function columnsFor(header: string[], spec: ColumnSpec<string>, mapping?: Mapping) {
  const detected = matchColumns(header, spec) as Record<string, number | undefined>;
  const cols: Record<string, number | undefined> = { ...detected };
  for (const [f, i] of Object.entries(mapping ?? {})) cols[f] = i < 0 ? undefined : i;
  return { detected, cols };
}

const emptyBatch = (input: RunInput, leader: Leader): ImportBatch => ({
  id: newId("imp"),
  system: input.system,
  file: input.file,
  fileName: input.fileName?.slice(0, 120),
  at: Date.now(),
  byId: leader.leaderId,
  byName: leader.name,
  counts: {},
  skipped: [],
  created: { people: [], households: [], groups: [], attendance: [], gifts: [], txns: [], funds: [] },
  before: { people: [], groups: [] },
});

const tally = (rows: PlanRow[]) => {
  const counts: Record<string, number> = { total: rows.length, add: 0, update: 0, same: 0, skip: 0 };
  const reasons = new Map<string, number>();
  for (const r of rows) {
    counts[r.action]++;
    if (r.action === "skip" && r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  }
  return { counts, skipped: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count) };
};

/* ---------- People and households ---------- */

function planPeople(book: PeopleBook, input: RunInput, header: string[], body: string[][], cols: Record<string, number | undefined>, batch: ImportBatch) {
  if (cols.fullName === undefined && cols.firstName === undefined) fail("Couldn't find a name column. Choose which column holds first names (or full names) below.");
  const cell = (r: string[], f: string) => (cols[f] !== undefined ? (r[cols[f]!] ?? "").replace(/\s+/g, " ").trim() : "");
  const matcher = new PersonMatcher(book);
  const seen = new Set<string>();
  const households = new Map<string, HouseholdRecord>();
  for (const h of book.households) if (h.source?.key) households.set(h.source.key, h);
  const groupByName = new Map(book.groups.filter((g) => !g.archivedAt).map((g) => [norm(g.name), g]));
  const mapped = new Set(Object.values(cols).filter((x): x is number => x !== undefined));
  const extra = input.extraAsCustom ? header.map((h, i) => ({ h, i })).filter(({ h, i }) => h.trim() && !mapped.has(i) && body.some((r) => (r[i] ?? "").trim())) : [];
  const fieldFor = new Map<number, string>();
  for (const { h, i } of extra) {
    const existing = book.fields.find((f) => normHeader(f.label) === normHeader(h));
    if (existing) fieldFor.set(i, existing.id);
    else {
      const f = { id: newId("fld"), label: h.trim().slice(0, 40), kind: "text" as const, createdAt: Date.now() };
      book.fields.push(f);
      fieldFor.set(i, f.id);
    }
  }

  const rows: PlanRow[] = body.map((r, i) => {
    let first = cell(r, "firstName");
    let last = cell(r, "lastName");
    const full = cell(r, "fullName");
    if (!first && full) [first, last] = splitName(full);
    const label = [first, last].filter(Boolean).join(" ") || full || `(row ${i + 2})`;
    if (!first && !last) return { row: i + 2, label, action: "skip" as const, reason: "No name" };
    const rawEmail = cell(r, "email");
    const rawPhone = cell(r, "phone");
    const email = normalizeEmail(rawEmail) ?? undefined;
    const phone = normalizePhone(rawPhone) ?? undefined;
    const hhRaw = cell(r, "household");
    const key = personKey(input.system, { externalId: cell(r, "externalId") || undefined, email, phone, firstName: first, lastName: last, household: hhRaw });
    if (seen.has(key)) return { row: i + 2, label, action: "skip" as const, reason: "Same person appears earlier in the file" };
    seen.add(key);
    const street = cell(r, "street"), city = cell(r, "city"), state = cell(r, "state"), zip = cell(r, "zip");
    const data: Partial<PersonRecord> = {
      firstName: first,
      lastName: last,
      nickname: cell(r, "nickname") && cell(r, "nickname") !== first ? cell(r, "nickname") : undefined,
      email,
      phone,
      homePhone: cell(r, "homePhone") || undefined,
      address: street || city || state || zip ? { street: street || undefined, city: city || undefined, state: state || undefined, zip: zip || undefined } : undefined,
      birthdate: readDate(cell(r, "birthdate")),
      anniversary: readDate(cell(r, "anniversary")),
      status: readStatus(cell(r, "status")),
      membershipDate: readDate(cell(r, "membershipDate")),
      householdRole: readRole(cell(r, "householdRole")),
      language: /^(es|spa|spanish|espa)/i.test(cell(r, "language")) ? "es" : /^(ko|kor|korean)/i.test(cell(r, "language")) ? "ko" : undefined,
    };
    for (const k of Object.keys(data) as (keyof PersonRecord)[]) if (data[k] === undefined) delete data[k];
    const custom: Record<string, string> = {};
    for (const [col, fid] of fieldFor) if ((r[col] ?? "").trim()) custom[fid] = r[col].trim().slice(0, 500);
    const notes = [rawEmail && !email ? "the email couldn't be read" : "", rawPhone && !phone ? "the mobile number couldn't be read" : ""].filter(Boolean).join("; ");

    // Household: by its name or ID in the file.
    let householdId: string | undefined;
    if (hhRaw) {
      const hkey = `${input.system}:hh:${norm(hhRaw)}`;
      let h = households.get(hkey);
      if (!h) {
        h = { id: newId("hh"), name: /^\d+$/.test(hhRaw) ? `${last || first} household` : /household|family/i.test(hhRaw) ? hhRaw : `${hhRaw} household`, createdAt: Date.now(), source: { batchId: batch.id, key: hkey, system: input.system } };
        households.set(hkey, h);
        book.households.push(h);
        batch.created.households.push(h.id);
      }
      householdId = h.id;
      if (data.address && !h.address) h.address = data.address;
    }
    const { person: match } = matcher.find({ key, email, phone, name: `${first} ${last}` });
    let p: PersonRecord;
    let action: PlanRow["action"];
    if (match) {
      const before = JSON.stringify(match);
      if (!batch.created.people.includes(match.id) && !batch.before.people.some((x) => x.id === match.id)) batch.before.people.push(JSON.parse(before));
      Object.assign(match, data, { custom: { ...match.custom, ...custom } });
      if (householdId) match.householdId = householdId;
      match.source ??= { batchId: batch.id, key, system: input.system };
      const changed = JSON.stringify(match) !== before;
      if (changed) match.updatedAt = Date.now();
      else batch.before.people = batch.before.people.filter((x) => x.id !== match.id);
      p = match;
      action = changed ? "update" : "same";
    } else {
      p = { id: newId("per"), firstName: first, lastName: last, status: "regular", language: "en", ...data, householdId, custom, createdAt: Date.now(), updatedAt: Date.now(), source: { batchId: batch.id, key, system: input.system } } as PersonRecord;
      book.people.push(p);
      matcher.add(p);
      batch.created.people.push(p.id);
      action = "add";
    }
    // Group memberships listed in the people file.
    for (const gname of cell(r, "groups").split(/[,;|]/).map((x) => x.trim()).filter(Boolean)) {
      let g = groupByName.get(norm(gname));
      if (!g) {
        g = { id: newId("grp"), name: gname.slice(0, 80), kind: /group/i.test(gname) ? "small_group" : "other", leaderIds: [], memberIds: [], createdAt: Date.now(), source: { batchId: batch.id, key: `${input.system}:grp:${norm(gname)}`, system: input.system } };
        book.groups.push(g);
        groupByName.set(norm(gname), g);
        batch.created.groups.push(g.id);
      } else if (!batch.created.groups.includes(g.id) && !batch.before.groups.some((x) => x.id === g!.id)) batch.before.groups.push(JSON.parse(JSON.stringify(g)));
      if (!g.memberIds.includes(p.id)) {
        g.memberIds.push(p.id);
        if (action === "same") action = "update";
      }
    }
    return { row: i + 2, label, action, detail: notes || undefined };
  });
  return rows;
}

/* ---------- Groups ---------- */

function planGroups(book: PeopleBook, input: RunInput, body: string[][], cols: Record<string, number | undefined>, batch: ImportBatch) {
  if (cols.group === undefined) fail("Couldn't find the group column. Choose it below.");
  if (cols.fullName === undefined && cols.firstName === undefined && cols.email === undefined) fail("Couldn't find who's in each group (a name or email column).");
  const cell = (r: string[], f: string) => (cols[f] !== undefined ? (r[cols[f]!] ?? "").replace(/\s+/g, " ").trim() : "");
  const matcher = new PersonMatcher(book);
  const byName = new Map(book.groups.filter((g) => !g.archivedAt).map((g) => [norm(g.name), g]));
  return body.map((r, i): PlanRow => {
    const gname = cell(r, "group");
    const name = cell(r, "fullName") || [cell(r, "firstName"), cell(r, "lastName")].filter(Boolean).join(" ");
    const label = `${name || cell(r, "email") || "?"} → ${gname || "?"}`;
    if (!gname) return { row: i + 2, label, action: "skip", reason: "No group name" };
    const full = cell(r, "fullName");
    const lookup = full && /,/.test(full) ? splitName(full).join(" ") : name;
    const { person, ambiguous } = matcher.find({ email: cell(r, "email") || undefined, name: lookup });
    if (!person) return { row: i + 2, label, action: "skip", reason: ambiguous ? "More than one person has that name; add an email column" : "Not in the directory yet (import people first)" };
    let g = byName.get(norm(gname));
    let action: PlanRow["action"] = "same";
    if (!g) {
      g = { id: newId("grp"), name: gname.slice(0, 80), kind: /class/i.test(gname) ? "class" : /team/i.test(gname) ? "team" : /group/i.test(gname) ? "small_group" : "other", leaderIds: [], memberIds: [], createdAt: Date.now(), source: { batchId: batch.id, key: `${input.system}:grp:${norm(gname)}`, system: input.system } } satisfies GroupRecord;
      book.groups.push(g);
      byName.set(norm(gname), g);
      batch.created.groups.push(g.id);
      action = "add";
    } else if (!batch.created.groups.includes(g.id) && !batch.before.groups.some((x) => x.id === g!.id)) batch.before.groups.push(JSON.parse(JSON.stringify(g)));
    const leader = /lead|host|facilitator|teacher|coach/i.test(cell(r, "role"));
    if (!g.memberIds.includes(person.id)) {
      g.memberIds.push(person.id);
      if (action === "same") action = "update";
    }
    if (leader && !g.leaderIds.includes(person.id)) {
      g.leaderIds.push(person.id);
      if (action === "same") action = "update";
    }
    return { row: i + 2, label: `${displayName(person)} → ${g.name}`, action };
  });
}

/* ---------- Attendance ---------- */

export function gatheringFor(event: string, date: string): GatheringKey {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const t = event.toLowerCase();
  const byTime = GATHERINGS.find((g) => t.includes(g.short.replace("Wed ", "").toLowerCase()) && g.day === dow);
  if (byTime) return byTime.key;
  if (/early|first|8/.test(t) && dow === 0) return "sun-0830";
  const sameDay = GATHERINGS.filter((g) => g.day === dow);
  return (sameDay.find((g) => g.worship) ?? sameDay[0] ?? GATHERINGS.find((g) => g.key === "sun-1045")!).key;
}

function planAttendance(book: PeopleBook, input: RunInput, body: string[][], cols: Record<string, number | undefined>, batch: ImportBatch) {
  if (cols.date === undefined) fail("Couldn't find the date column. Choose it below.");
  if (cols.fullName === undefined && cols.firstName === undefined && cols.email === undefined) fail("Couldn't find who attended (a name or email column).");
  const cell = (r: string[], f: string) => (cols[f] !== undefined ? (r[cols[f]!] ?? "").replace(/\s+/g, " ").trim() : "");
  const matcher = new PersonMatcher(book);
  const groups = new Map(book.groups.filter((g) => !g.archivedAt).map((g) => [norm(g.name), g]));
  const existing = new Set(book.attendance.map((a) => a.key ?? `${a.date}|${a.personId}|${a.kind}|${a.gathering ?? a.groupId}`));
  return body.map((r, i): PlanRow => {
    const date = readDate(cell(r, "date"));
    const name = cell(r, "fullName") || [cell(r, "firstName"), cell(r, "lastName")].filter(Boolean).join(" ");
    const event = cell(r, "event");
    const label = `${name || cell(r, "email") || "?"}, ${date ?? cell(r, "date")}${event ? `, ${event}` : ""}`;
    if (!date) return { row: i + 2, label, action: "skip", reason: "The date couldn't be read" };
    if (truthyAbsent(cell(r, "present"))) return { row: i + 2, label, action: "skip", reason: "Marked absent (only who was there is kept)" };
    const full = cell(r, "fullName");
    const { person, ambiguous } = matcher.find({ email: cell(r, "email") || undefined, name: full && /,/.test(full) ? splitName(full).join(" ") : name });
    if (!person) return { row: i + 2, label, action: "skip", reason: ambiguous ? "More than one person has that name; add an email column" : "Not in the directory yet (import people first)" };
    const group = event ? groups.get(norm(event)) : undefined;
    const kind = group ? "group" : "worship";
    const gathering = group ? undefined : gatheringFor(event, date);
    const key = `${date}|${person.id}|${kind}|${gathering ?? group!.id}`;
    if (existing.has(key)) return { row: i + 2, label, action: "same" };
    existing.add(key);
    const a = { id: newId("att"), personId: person.id, date, kind, gathering, groupId: group?.id, present: true, recordedBy: batch.byId, at: Date.now(), batchId: batch.id, key } as const;
    book.attendance.push({ ...a });
    batch.created.attendance.push(a.id);
    return { row: i + 2, label, action: "add", detail: group ? group.name : GATHERINGS.find((g) => g.key === gathering)?.label };
  });
}

/* ---------- Running ---------- */

export type RunResult = {
  batchId?: string;
  dryRun: boolean;
  header: string[];
  columns: Record<string, number | undefined>;
  detected: Record<string, number | undefined>;
  counts: Record<string, number>;
  skipped: { reason: string; count: number }[];
  rows: PlanRow[];
  extras?: { newFunds: string[]; deposits: number; total: number };
};

/** Preview and dry run (`apply: false`) plan against a copy; commit (`apply: true`) plans and saves under the lock. */
export async function runImport(leader: Leader, input: RunInput, apply: boolean): Promise<RunResult> {
  const t = table(input.csv);
  const header = t[0];
  const body = t.slice(1);
  if (input.file === "giving") return runGiving(leader, input, apply);
  const { detected, cols } = columnsFor(header, SPECS[input.file], input.mapping);
  const plan = (book: PeopleBook, batch: ImportBatch) =>
    input.file === "people" ? planPeople(book, input, header, body, cols, batch) : input.file === "groups" ? planGroups(book, input, body, cols, batch) : planAttendance(book, input, body, cols, batch);
  if (!apply) {
    const copy = JSON.parse(JSON.stringify(await loadPeople(leader.churchId))) as PeopleBook;
    const rows = plan(copy, emptyBatch(input, leader));
    return { dryRun: true, header, columns: cols, detected, ...tally(rows), rows: rows.slice(0, 300) };
  }
  const out = await updatePeople(leader.churchId, ["people", "households", "groups", "attendance", "fields", "imports"], (book) => {
    const batch = emptyBatch(input, leader);
    const rows = plan(book, batch);
    const { counts, skipped } = tally(rows);
    batch.counts = counts;
    batch.skipped = skipped;
    book.imports.push(batch);
    return { batch, rows, counts, skipped };
  });
  invalidateChurchData();
  await audit(leader, { action: "people.import", detail: `${out.batch.id} ${input.system} ${input.file}: ${out.counts.add} added, ${out.counts.update} updated, ${out.counts.skip} skipped` });
  return { batchId: out.batch.id, dryRun: false, header, columns: cols, detected, counts: out.counts, skipped: out.skipped, rows: out.rows.slice(0, 300) };
}

const fundId = (name: string) => `fund_${createHash("sha256").update(norm(name)).digest("hex").slice(0, 10)}`;

async function runGiving(leader: Leader, input: RunInput, apply: boolean): Promise<RunResult> {
  const [books, people] = await Promise.all([loadBooks(leader.churchId), loadPeople(leader.churchId)]);
  const directory = people.people.filter(isActive).map((p) => toPerson(people, p));
  const first = readGiving(input.csv, books, directory, input.mapping as never);
  // Funds the books don't have are created (restricted), so designated giving keeps its designation.
  const newFunds = [...new Map(first.rows.filter((r) => !r.problem && !r.fundMatched && r.rawFund).map((r) => [norm(r.rawFund), { id: fundId(r.rawFund), name: r.rawFund.slice(0, 60) }])).values()];
  const withFunds = { ...books, chart: { ...books.chart, funds: [...books.chart.funds, ...newFunds.filter((f) => !books.chart.funds.some((x) => x.id === f.id)).map((f) => ({ id: f.id, name: f.name, restricted: true, incomeAccountId: books.chart.funds[0].incomeAccountId, openingBalance: 0 }))] } };
  const read = readGiving(input.csv, withFunds, directory, input.mapping as never);
  const rows: PlanRow[] = read.rows.map((r) => ({
    row: r.row,
    label: `${r.date ?? "?"} · ${r.donorName || "?"} · ${r.amount === null ? "?" : `$${(r.amount / 100).toFixed(2)}`} · ${r.fundName}`,
    action: r.problem ? "skip" : r.alreadyImported ? "same" : "add",
    reason: r.problem,
    detail: r.problem ? undefined : [r.personId ? "matched to the directory" : "giver not in the directory (kept by name)", newFunds.some((f) => f.id === r.fundId) ? `new fund "${r.fundName}"` : ""].filter(Boolean).join("; "),
  }));
  const { counts, skipped } = tally(rows);
  const result = await importGifts(leader, read.gifts, { dryRun: !apply, newFunds });
  const usedNew = newFunds.filter((f) => read.gifts.some((g) => g.fundId === f.id)).map((f) => f.name);
  const base = { header: read.header, columns: read.columns as Record<string, number | undefined>, detected: read.columns as Record<string, number | undefined>, counts, skipped, rows: rows.slice(0, 300), extras: { newFunds: usedNew, deposits: result.deposits, total: result.total } };
  if (!apply) return { dryRun: true, ...base };
  const batch = { ...emptyBatch(input, leader), counts, skipped, created: { ...emptyBatch(input, leader).created, gifts: result.created.gifts, txns: result.created.txns, funds: result.created.funds } };
  await updatePeople(leader.churchId, ["imports"], (b) => void b.imports.push(batch));
  await audit(leader, { action: "people.import", detail: `${batch.id} ${input.system} giving: ${result.add} gifts, ${result.alreadyImported} already in` });
  return { batchId: batch.id, dryRun: false, ...base };
}

/** Undoes a whole batch: removes what it added and puts back what it changed. */
export async function undoImport(leader: Leader, batchId: string) {
  const book = await loadPeople(leader.churchId);
  const batch = book.imports.find((b) => b.id === batchId) ?? fail("That import isn't in the log.");
  if (batch.undoneAt) fail("That import was already undone.");
  if (batch.created.gifts.length || batch.created.txns.length) {
    try {
      await removeImportedGifts(leader, batch.created);
    } catch (err) {
      if (err instanceof FinanceError) fail(err.message);
      throw err;
    }
  }
  await updatePeople(leader.churchId, ["people", "households", "groups", "attendance", "notes", "imports"], (b) => {
    const people = new Set(batch.created.people);
    const groups = new Set(batch.created.groups);
    const households = new Set(batch.created.households);
    const att = new Set(batch.created.attendance);
    b.people = b.people.filter((p) => !people.has(p.id)).map((p) => batch.before.people.find((x) => x.id === p.id) ?? p);
    b.groups = b.groups.filter((g) => !groups.has(g.id)).map((g) => batch.before.groups.find((x) => x.id === g.id) ?? g);
    for (const g of b.groups) {
      g.memberIds = g.memberIds.filter((id) => !people.has(id));
      g.leaderIds = g.leaderIds.filter((id) => !people.has(id));
    }
    b.households = b.households.filter((h) => !households.has(h.id) || b.people.some((p) => p.householdId === h.id));
    b.attendance = b.attendance.filter((a) => !att.has(a.id) && !people.has(a.personId));
    b.notes = b.notes.filter((n) => !people.has(n.personId));
    const rec = b.imports.find((x) => x.id === batchId)!;
    rec.undoneAt = Date.now();
    rec.undoneBy = leader.name;
  });
  invalidateChurchData();
  await audit(leader, { action: "people.import.undo", detail: batchId });
  return { undone: batchId };
}
