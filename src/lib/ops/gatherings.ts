/**
 * Mount Greylock's regular gatherings, shared by scheduling, service planning and kids check-in:
 * Sunday worship at 8:30 and 10:45, Growth Groups (all ages) at 9:45, and Wednesday Kids Club and
 * Teen Group at 6:00. Dates are yyyy-mm-dd; a gathering only happens on its weekday.
 */
export const GATHERINGS = [
  { key: "sun-0830", day: 0, time: "8:30 AM", start: "08:30", short: "8:30", label: "Sunday 8:30 worship", worship: true, kids: true },
  { key: "sun-0945", day: 0, time: "9:45 AM", start: "09:45", short: "9:45", label: "Sunday 9:45 Growth Groups", worship: false, kids: true },
  { key: "sun-1045", day: 0, time: "10:45 AM", start: "10:45", short: "10:45", label: "Sunday 10:45 worship", worship: true, kids: true },
  { key: "wed-1800", day: 3, time: "6:00 PM", start: "18:00", short: "Wed 6:00", label: "Wednesday 6:00 Kids Club and Teens", worship: false, kids: true },
] as const;

export type GatheringKey = (typeof GATHERINGS)[number]["key"];
export const GATHERING_KEYS = GATHERINGS.map((g) => g.key) as unknown as readonly [GatheringKey, ...GatheringKey[]];
export const WORSHIP_KEYS = GATHERINGS.filter((g) => g.worship).map((g) => g.key) as GatheringKey[];

export function gathering(key: string) {
  return GATHERINGS.find((g) => g.key === key);
}

export const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Whether the gathering meets on that date. */
export function meetsOn(key: string, iso: string) {
  const g = gathering(key);
  return Boolean(g && weekday(iso) === g.day);
}

/** The gatherings on a date, in order. */
export function gatheringsOn(iso: string) {
  return GATHERINGS.filter((g) => g.day === weekday(iso));
}

/** The next date (on or after `from`) a gathering with one of these weekdays meets. */
export function nextMeeting(from: string, days: readonly number[] = [0, 3]) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    if (days.includes(d.getUTCDay())) return d.toISOString().slice(0, 10);
  }
  return from;
}

export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
