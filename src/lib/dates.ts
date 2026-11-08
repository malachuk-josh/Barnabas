/** Date helpers that work in whole days (yyyy-mm-dd), in UTC, so tests are stable. */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function today(now: Date = new Date()): string {
  return isoDate(now);
}

/** The most recent Sunday on or before the given date. */
export function lastSunday(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -d.getUTCDay());
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function friendlyDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
