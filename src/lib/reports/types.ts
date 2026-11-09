/** A report section: headline numbers, a chart, a plain-language summary and the table behind it (the CSV). */

export type Unit = "count" | "usd" | "pct" | "days";

export type Series = { name: string; values: (number | null)[]; /** "primary" is the main series; "reference" a target or comparison. */ role: "primary" | "reference" };

export type Chart = { kind: "bars" | "lines"; title: string; x: string[]; series: Series[]; unit: Unit; /** Bars only: draw these labels on the axis less often on phones. */ every?: number };

export type Stat = { label: string; value: string; note?: string; tone?: "ok" | "watch" | "danger" };

export type SectionId = "attendance" | "giving" | "volunteers" | "care" | "guests" | "events" | "kids";

export type Section = {
  id: SectionId;
  title: string;
  /** False when the leader's role doesn't include it; `locked` says why. */
  allowed: boolean;
  locked?: string;
  /** No data yet: a warm empty state with the first step. */
  empty?: { title: string; text: string; actions: { label: string; href: string }[] };
  summary: string;
  stats: Stat[];
  chart?: Chart;
  extra?: Chart;
  table: { header: string[]; rows: (string | number)[][] };
  source: string;
};
