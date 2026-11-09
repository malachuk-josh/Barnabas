/** Money helpers. Amounts are integer cents. */

export function dollars(cents: number, opts: { cents?: boolean } = {}): string {
  const showCents = opts.cents ?? true;
  const value = Math.abs(cents) / 100;
  const text = value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  return cents < 0 ? `-${text}` : text;
}

/** Whole dollars, for summaries: "$12,400". */
export const wholeDollars = (cents: number) => dollars(Math.round(cents / 100) * 100, { cents: false });

/** "1,234.50", "$1,234.5", "(45.00)" or "-45" → cents. Returns null when it isn't a number. */
export function parseMoney(text: string): number | null {
  let t = String(text ?? "").trim();
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  } else if (t.endsWith("-")) {
    negative = !negative;
    t = t.slice(0, -1);
  }
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return negative ? -cents : cents;
}

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function percent(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}
