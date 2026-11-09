import { createHash } from "node:crypto";
import type { Person } from "../chms/types";
import { matchColumns, normHeader, type ColumnSpec } from "../csv/columns";
import { normalizeDate, parseCsv } from "./csv";
import { parseMoney } from "./money";
import { FinanceError, type ImportGift } from "./service";
import type { Books, GiftMethod } from "./types";

/**
 * ChurchTrac's contributions export (or any giving CSV): one row per gift with a date, the giver, the
 * amount, the fund and how it was given. Headers are matched tolerantly; funds are matched to the books'
 * funds by name; each row gets a stable key so a re-import of an overlapping date range skips what's in.
 */

export const GIVING_FIELDS = ["date", "donor", "firstName", "lastName", "email", "amount", "fund", "method", "check"] as const;
export type GivingField = (typeof GIVING_FIELDS)[number];

export const GIVING_COLUMNS: ColumnSpec<GivingField> = {
  date: { exact: ["date", "contribution date", "gift date", "received", "date received", "transaction date", "deposit date"], partial: ["date"] },
  donor: { exact: ["name", "donor", "contributor", "giver", "full name", "donor name", "contributor name", "family", "family name"], partial: ["donor", "contributor", "giver"] },
  firstName: { exact: ["first name", "firstname", "first"] },
  lastName: { exact: ["last name", "lastname", "last"] },
  email: { exact: ["email", "e-mail", "email address", "donor email"], partial: ["email"] },
  amount: { exact: ["amount", "contribution amount", "gift amount", "total", "amount given"], partial: ["amount"] },
  fund: { exact: ["fund", "category", "designation", "fund name", "account", "contribution category"], partial: ["fund", "category", "designation"] },
  method: { exact: ["method", "payment type", "payment method", "type", "contribution type", "tender"], partial: ["method", "payment"] },
  check: { exact: ["check #", "check number", "check no", "check", "reference", "ref", "check num"], partial: ["check"] },
};

export const GIVING_LABELS: Record<GivingField, string> = { date: "Date", donor: "Giver (full name)", firstName: "First name", lastName: "Last name", email: "Email", amount: "Amount", fund: "Fund", method: "Method", check: "Check number" };

export function methodFrom(raw: string, check?: string): GiftMethod {
  const m = raw.toLowerCase();
  if (/ach|bank|eft|direct/.test(m)) return "ach";
  if (/card|online|web|text|app|stripe|paypal|venmo|electronic/.test(m)) return "online";
  if (/check|cheque/.test(m)) return "check";
  if (/cash|coin|loose|plate/.test(m)) return "cash";
  return check ? "check" : "cash";
}

const FUND_ALIASES: Record<string, string[]> = {
  general: ["general", "tithe", "tithes", "offering", "tithes and offerings", "general fund", "operating", "budget"],
  missions: ["missions", "mission", "faith promise", "missionary"],
  building: ["building", "building fund", "capital", "facilities"],
  benevolence: ["benevolence", "deacons fund", "deacon fund", "mercy", "helping hands"],
};

export function fundFor(books: Books, raw: string): { fundId: string; matched: boolean } {
  const n = normHeader(raw);
  const general = books.chart.funds.find((f) => !f.restricted) ?? books.chart.funds[0];
  if (!n) return { fundId: general.id, matched: true };
  const exact = books.chart.funds.find((f) => normHeader(f.name) === n || normHeader(f.name).replace(/fund$/, "") === n.replace(/fund$/, ""));
  if (exact) return { fundId: exact.id, matched: true };
  for (const [id, aliases] of Object.entries(FUND_ALIASES)) {
    if (aliases.some((a) => normHeader(a) === n || n.includes(normHeader(a)))) {
      const f = books.chart.funds.find((x) => x.id === id || normHeader(x.name).includes(id));
      if (f) return { fundId: f.id, matched: true };
    }
  }
  return { fundId: general.id, matched: false };
}

export type GivingPreviewRow = { row: number; date: string | null; donorName: string; personId?: string; amount: number | null; fundId: string; fundName: string; rawFund: string; fundMatched: boolean; method: GiftMethod; checkNumber?: string; importKey?: string; alreadyImported: boolean; duplicateInFile: boolean; problem?: string; note?: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function readGiving(csv: string, books: Books, people: Person[], mapping?: Partial<Record<GivingField, number>>) {
  const table = parseCsv(csv);
  if (table.length < 2) throw new FinanceError("That file has no rows to import.");
  const header = table[0];
  const auto = matchColumns(header, GIVING_COLUMNS);
  const cols: Partial<Record<GivingField, number>> = { ...auto };
  for (const [f, i] of Object.entries(mapping ?? {}) as [GivingField, number][]) cols[f] = i < 0 ? undefined : i;
  if (cols.date === undefined || cols.amount === undefined || (cols.donor === undefined && cols.lastName === undefined)) {
    throw new FinanceError("Couldn't find the date, giver and amount columns. Choose them below.");
  }
  const cell = (r: string[], f: GivingField) => (cols[f] !== undefined ? (r[cols[f]!] ?? "").replace(/\s+/g, " ").trim() : "");
  const byName = new Map(people.map((p) => [norm(p.name), p]));
  const byEmail = new Map(people.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));
  const existing = new Set(books.gifts.map((g) => g.importKey).filter(Boolean));
  const occurrences = new Map<string, number>();
  const fundNames = new Map(books.chart.funds.map((f) => [f.id, f.name]));
  const rows: GivingPreviewRow[] = table.slice(1).map((r, i) => {
    const date = normalizeDate(cell(r, "date"));
    let donorName = cell(r, "donor") || [cell(r, "firstName"), cell(r, "lastName")].filter(Boolean).join(" ");
    if (/^[^,]+,\s*[^,]+$/.test(donorName)) donorName = donorName.split(/,\s*/).reverse().join(" ");
    const amount = parseMoney(cell(r, "amount"));
    const rawFund = cell(r, "fund");
    const fund = fundFor(books, rawFund);
    const checkNumber = cell(r, "check") || undefined;
    const method = methodFrom(cell(r, "method"), checkNumber);
    const person = byEmail.get(cell(r, "email").toLowerCase()) ?? byName.get(norm(donorName));
    const problem = !date ? "The date couldn't be read." : amount === null ? "The amount couldn't be read." : amount <= 0 ? "Only gifts above zero are imported (record refunds by hand)." : !donorName ? "No giver name (an anonymous plate total goes in Giving as an offering line)." : undefined;
    const base = { row: i + 2, date, donorName, personId: person?.id, amount, fundId: fund.fundId, fundName: fundNames.get(fund.fundId) ?? "General", rawFund, fundMatched: fund.matched, method, checkNumber, note: fund.matched ? undefined : `No fund called "${rawFund}" in the books; it goes to ${fundNames.get(fund.fundId)}.` };
    if (problem) return { ...base, alreadyImported: false, duplicateInFile: false, problem };
    const id = [date, norm(donorName), amount, fund.fundId, method, checkNumber ?? ""].join("|");
    const n = (occurrences.get(id) ?? 0) + 1;
    occurrences.set(id, n);
    const importKey = `ct:${createHash("sha256").update(`${id}|#${n}`).digest("hex").slice(0, 32)}`;
    return { ...base, importKey, alreadyImported: existing.has(importKey), duplicateInFile: false };
  });
  const ok = rows.filter((r) => !r.problem);
  return {
    header,
    columns: cols,
    rows,
    counts: { total: rows.length, add: ok.filter((r) => !r.alreadyImported).length, alreadyImported: ok.filter((r) => r.alreadyImported).length, problems: rows.length - ok.length, unmatchedFunds: ok.filter((r) => r.note).length, linkedToDirectory: ok.filter((r) => r.personId).length },
    gifts: ok.map((r): ImportGift => ({ date: r.date!, personId: r.personId, donorName: r.donorName, amount: r.amount!, fundId: r.fundId, method: r.method, checkNumber: r.checkNumber, importKey: r.importKey! })),
  };
}
