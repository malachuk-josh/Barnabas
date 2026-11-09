import { createHash } from "node:crypto";
import { parseMoney } from "./money";
import { txnTotal } from "./ledger";
import type { Account, Chart, Transaction } from "./types";

/** RFC 4180-style CSV: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

export type ColumnMap = { date: number; description: number; amount?: number; debit?: number; credit?: number; reference?: number };

/** Guesses which columns hold the date, description and amount (or debit and credit) from the header row. */
export function detectColumns(header: string[]): ColumnMap | null {
  const h = header.map((x) => x.toLowerCase());
  const find = (...patterns: RegExp[]) => {
    for (const p of patterns) {
      const i = h.findIndex((x) => p.test(x));
      if (i >= 0) return i;
    }
    return undefined;
  };
  const date = find(/^(posted |posting |transaction |trans\.? )?date$/, /date/);
  const description = find(/^description$/, /desc|payee|memo|details|name/);
  const amount = find(/^amount$/, /amount/);
  const debit = find(/^debit$/, /withdraw|debit|payment/);
  const credit = find(/^credit$/, /deposit|credit/);
  const reference = find(/check|ref|number|no\.?$/);
  if (date === undefined || description === undefined) return null;
  if (amount === undefined && (debit === undefined || credit === undefined)) return null;
  return { date, description, amount: amount ?? undefined, debit: amount === undefined ? debit : undefined, credit: amount === undefined ? credit : undefined, reference };
}

/** "11/03/2026", "11/3/26", "2026-11-03" or "2026/11/03" → "2026-11-03". */
export function normalizeDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, Number(m[1]), Number(m[2]));
  }
  return null;
}

function iso(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return date.toISOString().slice(0, 10);
}

export type BankRow = {
  row: number;
  date: string | null;
  description: string;
  /** Signed cents: positive is money in (a deposit), negative is money out. */
  amount: number | null;
  reference?: string;
  problem?: string;
};

export function bankRows(table: string[][], map: ColumnMap, hasHeader = true): BankRow[] {
  const body = hasHeader ? table.slice(1) : table;
  return body.map((cells, i) => {
    const date = normalizeDate(cells[map.date] ?? "");
    const description = (cells[map.description] ?? "").replace(/\s+/g, " ").trim();
    let amount: number | null = null;
    if (map.amount !== undefined) amount = parseMoney(cells[map.amount] ?? "");
    else {
      const debit = parseMoney(cells[map.debit!] ?? "");
      const credit = parseMoney(cells[map.credit!] ?? "");
      if (debit !== null || credit !== null) amount = (credit ?? 0) - Math.abs(debit ?? 0);
    }
    const reference = map.reference !== undefined ? cells[map.reference] || undefined : undefined;
    const problem = !date ? "The date couldn't be read." : amount === null ? "The amount couldn't be read." : amount === 0 ? "The amount is zero." : !description ? "There's no description." : undefined;
    return { row: i + (hasHeader ? 2 : 1), date, description, amount, reference, problem };
  });
}

/** Keyword rules for suggesting an account, by account number. The treasurer can change any of them. */
export const DEFAULT_RULES: { pattern: RegExp; number: string; direction?: "in" | "out" }[] = [
  { pattern: /gusto|payroll/i, number: "5000", direction: "out" },
  { pattern: /national grid|eversource|electric/i, number: "5300" },
  { pattern: /heating oil|propane|fuel oil|berkshire gas|\bgas co/i, number: "5310" },
  { pattern: /water|sewer/i, number: "5320" },
  { pattern: /verizon|spectrum|comcast|internet|phone/i, number: "5330" },
  { pattern: /insurance|church mutual|brotherhood mutual/i, number: "5220" },
  { pattern: /mortgage|loan pmt|loan payment/i, number: "5200" },
  { pattern: /planning center|subsplash|software|adobe|google workspace|microsoft/i, number: "5610" },
  { pattern: /staples|amazon|usps|postage|office/i, number: "5600" },
  { pattern: /service charge|bank fee|stripe fee|processing fee/i, number: "5620" },
  { pattern: /interest/i, number: "4500", direction: "in" },
  { pattern: /rental|rent from/i, number: "4400", direction: "in" },
  { pattern: /deposit|offering|tithe|giving/i, number: "4000", direction: "in" },
];

export function suggestAccount(chart: Chart, description: string, direction: "in" | "out", rules = DEFAULT_RULES): Account | null {
  const byNumber = new Map(chart.accounts.filter((a) => !a.archived).map((a) => [a.number, a]));
  for (const r of rules) {
    if (r.direction && r.direction !== direction) continue;
    if (!r.pattern.test(description)) continue;
    const a = byNumber.get(r.number);
    if (!a) continue;
    if (direction === "in" && a.type === "expense") continue;
    return a;
  }
  return null;
}

/** An imported row that looks like a transaction already in the books (same bank, date and amount). */
export function findDuplicate(txns: Transaction[], bankAccountId: string, date: string, signedAmount: number): Transaction | null {
  return (
    txns.find(
      (t) => t.bankAccountId === bankAccountId && t.date === date && (t.direction === "in" ? 1 : -1) * txnTotal(t) === signedAmount,
    ) ?? null
  );
}

const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Stable dedupe keys for bank rows. Same bank account, date, signed amount, description and reference make
 * the same key; identical rows inside one file are told apart by their order (#1, #2), so two real $20
 * deposits on one day both import once, and importing the file again adds neither. This replaces trusting the
 * date-and-amount guess alone, which both skipped real transactions and let a re-import through when the
 * leader unticked "skip duplicates".
 */
export function bankImportKeys(bankAccountId: string, rows: { date: string; amount: number; description: string; reference?: string }[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [bankAccountId, r.date, r.amount, normText(r.description), (r.reference ?? "").trim()].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `bank:${createHash("sha256").update(`${base}|#${n}`).digest("hex").slice(0, 32)}`;
  });
}

/** A deposit in the bank file that is probably a Sunday offering already entered in Giving (same amount, within 3 days). */
export function findGiftDeposit(txns: Transaction[], bankAccountId: string, date: string, signedAmount: number): Transaction | null {
  if (signedAmount <= 0) return null;
  const t0 = Date.parse(`${date}T00:00:00Z`);
  return (
    txns.find((t) => t.source === "giving" && t.bankAccountId === bankAccountId && t.direction === "in" && txnTotal(t) === signedAmount && Math.abs(Date.parse(`${t.date}T00:00:00Z`) - t0) <= 3 * 86_400_000) ?? null
  );
}
