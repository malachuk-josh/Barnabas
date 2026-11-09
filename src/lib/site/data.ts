import { churchData } from "../chms";
import { config } from "../config";
import { addDays, lastSunday, today } from "../dates";
import { loadEvents } from "../events/store";
import { counts } from "../events/service";
import { loadServices } from "../services/store";
import { parseRef } from "../services/scripture";
import { onlineFunds } from "../finance/online";
import { stripeReady } from "../stripe/config";
import { currentAnnouncements } from "./service";
import type { Announcement, SiteBook } from "./types";

/**
 * What the data blocks show, read through each area's public functions at render time. Only public-facing
 * fields are taken: event titles, times, places and descriptions with their public sign-up links; the
 * weekly schedule; leaders' names and titles (bios come from the website's own text, never church
 * records); preaching dates, preachers, series and passages. No registrant, roster, care or giving data.
 */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type ServiceTimes = { day: string; items: { time: string; endTime?: string; title: string }[] }[];
export type PublicEvent = { key: string; title: string; date: string; time?: string; endTime?: string; location: string; description?: string; registerHref?: string; full?: boolean; priceCents?: number };
export type PublicLeader = { name: string; title: string; ministry?: string };
export type PublicSermons = {
  series: { title: string; passage?: string; startDate: string; endDate: string; current: boolean }[];
  upcoming: { date: string; preacher: string; title?: string; passage?: string; series?: string }[];
};
export type GiveFund = { id: string; name: string; description?: string };
export type SiteData = {
  serviceTimes: ServiceTimes;
  events: PublicEvent[];
  leaders: PublicLeader[];
  sermons: PublicSermons;
  announcements: Announcement[];
  /** Funds open for online giving (names and descriptions only), when Stripe is connected. */
  giveFunds?: GiveFund[];
};

/**
 * The Word (/word) needs a sign-in in this build, so public pages show passage references as text. If
 * The Word is opened to the public later, set this to true and references link to /word?b=&c=&v=.
 */
export const WORD_IS_PUBLIC = false;

export function passageLabel(passage: string | undefined) {
  if (!passage) return undefined;
  return parseRef(passage)?.label ?? passage;
}

export async function serviceTimes(asOf = today()): Promise<ServiceTimes> {
  const from = lastSunday(asOf);
  const week = await churchData().events(from, addDays(from, 6));
  const byDay = new Map<number, ServiceTimes[number]["items"]>();
  for (const e of week.filter((x) => x.recurring)) {
    const dow = new Date(`${e.date}T00:00:00Z`).getUTCDay();
    const list = byDay.get(dow) ?? [];
    if (!list.some((i) => i.time === e.time && i.title === e.title)) list.push({ time: e.time, endTime: e.endTime, title: e.title });
    byDay.set(dow, list);
  }
  const minutes = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
    return m ? ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60;
  };
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, items]) => ({ day: WEEKDAYS[d], items: items.sort((x, y) => minutes(x.time) - minutes(y.time)) }));
}

export async function publicEvents(asOf = today(), days = 120): Promise<PublicEvent[]> {
  const [church, book] = await Promise.all([churchData().events(asOf, addDays(asOf, days)), loadEvents(churchIdOf()).catch(() => null)]);
  const regs = (book?.events ?? []).filter((e) => e.open && e.date >= asOf);
  const out: PublicEvent[] = [];
  for (const e of church.filter((x) => !x.recurring)) {
    const reg = regs.find((r) => r.churchEventId === e.id);
    const c = reg && book ? counts(book, reg.id) : null;
    out.push({ key: e.id, title: e.title, date: e.date, time: e.time || undefined, endTime: e.endTime, location: e.location, description: e.description, registerHref: reg ? `/register/${reg.token}` : undefined, full: c ? c.spotsLeft === 0 && !reg!.waitlist : undefined, priceCents: reg?.priceCents });
  }
  for (const r of regs.filter((x) => !x.churchEventId || !church.some((e) => e.id === x.churchEventId))) {
    const c = book ? counts(book, r.id) : null;
    out.push({ key: r.id, title: r.title, date: r.date, time: r.time, endTime: r.endTime, location: r.location, description: r.description, registerHref: `/register/${r.token}`, full: c ? c.spotsLeft === 0 && !r.waitlist : undefined, priceCents: r.priceCents });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function publicLeaders(): Promise<PublicLeader[]> {
  return (await churchData().leadership()).map((l) => ({ name: l.name, title: l.title, ministry: l.ministry }));
}

export async function publicSermons(asOf = today()): Promise<PublicSermons> {
  const book = await loadServices(churchIdOf()).catch(() => null);
  if (!book) return { series: [], upcoming: [] };
  const seriesTitle = (id?: string) => book.series.find((s) => s.id === id)?.title;
  return {
    series: book.series
      .filter((s) => s.endDate >= addDays(asOf, -180))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((s) => ({ title: s.title, passage: passageLabel(s.passage), startDate: s.startDate, endDate: s.endDate, current: s.startDate <= asOf && s.endDate >= asOf })),
    upcoming: book.rotation
      .filter((r) => r.date >= asOf)
      .slice(0, 12)
      .map((r) => ({ date: r.date, preacher: r.preacher, title: r.title, passage: passageLabel(r.passage), series: seriesTitle(r.seriesId) })),
  };
}

/** The church whose website this deployment serves (one church per deployment in this build). */
export function churchIdOf() {
  return config.churchId;
}

export async function siteData(book: Pick<SiteBook, "announcements">): Promise<SiteData> {
  const [times, events, leaders, sermons, giveFunds] = await Promise.all([serviceTimes(), publicEvents(), publicLeaders(), publicSermons(), publicGiveFunds()]);
  return { serviceTimes: times, events, leaders, sermons, announcements: currentAnnouncements(book), giveFunds };
}

/** Funds open for online giving, read only when Stripe is connected (so the public site never opens the books otherwise). */
export async function publicGiveFunds(): Promise<GiveFund[]> {
  if (!stripeReady()) return [];
  return onlineFunds(churchIdOf()).catch(() => []);
}
