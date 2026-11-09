/**
 * Tolerant CSV header matching: "First Name", "first_name", "FirstName" and "First" all find the same
 * column. Exact (normalized) synonyms win over partial matches, and a column is used once.
 */
export const normHeader = (h: string) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9#]+/g, "");

export type ColumnSpec<F extends string> = Record<F, { exact: string[]; partial?: string[] }>;

export function matchColumns<F extends string>(header: string[], spec: ColumnSpec<F>): Partial<Record<F, number>> {
  const h = header.map(normHeader);
  const used = new Set<number>();
  const out: Partial<Record<F, number>> = {};
  const fields = Object.keys(spec) as F[];
  for (const pass of ["exact", "partial"] as const) {
    for (const f of fields) {
      if (out[f] !== undefined) continue;
      const words = (pass === "exact" ? spec[f].exact : spec[f].partial ?? []).map(normHeader);
      const i = h.findIndex((x, idx) => !used.has(idx) && (pass === "exact" ? words.includes(x) : words.some((w) => x.includes(w))));
      if (i >= 0) {
        out[f] = i;
        used.add(i);
      }
    }
  }
  return out;
}

/** Cells starting with =, +, - or @ are prefixed with ' so a spreadsheet won't run them. */
export function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
