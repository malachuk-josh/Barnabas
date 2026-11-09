import type { Unit } from "@/lib/reports/types";

export function formatValue(v: number | null, unit: Unit, compact = false): string {
  if (v === null || Number.isNaN(v)) return "–";
  if (unit === "usd") {
    const d = v / 100;
    if (compact && Math.abs(d) >= 1000) return `$${(d / 1000).toFixed(Math.abs(d) >= 10_000 ? 0 : 1)}k`;
    return d.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  if (unit === "pct") return `${Math.round(v)}%`;
  if (unit === "days") return `${Math.round(v * 10) / 10} d`;
  return Number.isInteger(v) ? v.toLocaleString("en-US") : (Math.round(v * 10) / 10).toLocaleString("en-US");
}

export function niceMax(max: number) {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  const s = step < 1 ? 1 : step;
  return { top: Math.ceil(max / s) * s, step: s };
}
