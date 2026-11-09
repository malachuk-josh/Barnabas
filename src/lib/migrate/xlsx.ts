import * as XLSX from "xlsx";

/**
 * The first sheet of an .xlsx/.xls workbook as CSV, with dates written as yyyy-mm-dd. SheetJS Community
 * Edition from its official CDN tarball (`https://cdn.sheetjs.com`); the npm "xlsx" 0.18 line is unmaintained.
 * The browser runs this, so uploaded workbooks never reach the server as binaries.
 */
export function xlsxToCsv(data: ArrayBuffer | Uint8Array): string {
  const wb = XLSX.read(data, { type: "array", cellDates: true, dense: true });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("That workbook has no sheets.");
  // Date cells keep their own short format ("2/1/90"); write them out unambiguously instead.
  const sheet = wb.Sheets[name];
  const rows = (sheet["!data"] ?? []) as (XLSX.CellObject | undefined)[][];
  for (const row of rows) for (const cell of row ?? []) if (cell?.t === "d" && cell.v instanceof Date) cell.w = cell.v.toISOString().slice(0, 10);
  return XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false, dateNF: "yyyy-mm-dd", rawNumbers: true });
}
