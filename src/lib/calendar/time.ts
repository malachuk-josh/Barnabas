/** Time-zone helpers built on Intl, so no date library is needed on the server or in the browser. */

export type Wall = { date: string; time: string };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The wall-clock date and time in a time zone for an instant. */
export function toWall(instant: Date, tz: string): Wall {
  const parts = Object.fromEntries(formatter(tz).formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function offsetMs(utcMs: number, tz: string) {
  const w = toWall(new Date(utcMs), tz);
  const [y, m, d] = w.date.split("-").map(Number);
  const [h, mi] = w.time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) - Math.floor(utcMs / 60000) * 60000;
}

/** The instant for a wall-clock date and time in a time zone (handles daylight-saving changes). */
export function fromWall(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = offsetMs(guess, tz);
  let utc = guess - first;
  const second = offsetMs(utc, tz);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

export function todayIn(tz: string, now = new Date()): string {
  return toWall(now, tz).date;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "19:00" -> "7:00 PM" */
export function time12(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}
