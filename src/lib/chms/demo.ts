import { addDays, lastSunday, today } from "../dates";
import type {
  Leader as ChurchLeader,
  AttendanceRecord,
  ChurchData,
  ChurchEvent,
  Person,
  Roster,
  ServingRecord,
  Team,
} from "./types";

/**
 * A fictional congregation so Barnabas works before any ChMS is connected.
 * Serving and attendance patterns are written most-recent-Sunday first:
 *   serving: S = served, D = declined, . = not scheduled
 *   attendance: 1 = present, 0 = absent
 * All dates are computed relative to today, so the data never goes stale.
 */

type DemoPerson = Person & {
  serving?: Record<string, string>;
  worship: string;
  group?: string;
  next?: string[]; // teams scheduled for the coming Sunday
  thankedDaysAgo?: number;
};

const TEAMS: Team[] = [
  { id: "worship", name: "Worship team" },
  { id: "kids", name: "MGBC Kids" },
  { id: "hospitality", name: "Hospitality & Connections" },
  { id: "tech", name: "Tech & livestream" },
  { id: "greeters", name: "Greeters" },
  { id: "parking", name: "Parking" },
];

/**
 * Mount Greylock Baptist Church, North Adams, MA: leadership, weekly schedule and upcoming events
 * as published on mountgreylockbaptist.com and mgbc.churchtrac.com (checked November 2026).
 * The congregation below stays fictional: no real person's attendance or serving data is invented.
 */
const LEADERSHIP: ChurchLeader[] = [
  { name: "Ethan Malachuk", title: "Lead Pastor", ministry: "Bible teaching" },
  { name: "Eric Malachuk", title: "Care Pastor", ministry: "Discipleship and pastoral care" },
  { name: "Aaron Malachuk", title: "Connections & Worship Pastor", ministry: "Worship and connections" },
  { name: "Travis Willette", title: "Deacon" },
  { name: "Cal Najimy", title: "Deacon" },
  { name: "Micah Hayre", title: "Deacon" },
];

const CHURCH = "Mount Greylock Baptist Church, 35 Notch Road, North Adams, MA";

const SPECIAL_EVENTS: ChurchEvent[] = [
  { id: "mgbc-reverb", title: "MGBC Teens Reverb: All-Nighter", date: "2026-11-13", time: "3:00 PM", endTime: "11:59 PM", location: CHURCH,
    description: "Word of Life REVERB All-Nighter with games, activities, food and a Gospel message. Runs until 8:00 AM Saturday. $67; bring money for food." },
  { id: "mgbc-thanksgiving", title: "Thanksgiving Communion Service", date: "2026-11-22", time: "6:00 PM", endTime: "7:00 PM", location: CHURCH,
    description: "An evening of worship and thanksgiving with singing and reflection as a church family. Registration open." },
  { id: "mgbc-ladies-christmas", title: "Ladies Christmas Gathering", date: "2026-12-06", time: "4:00 PM", endTime: "5:00 PM", location: CHURCH,
    description: "A festive Christmas get-together for the MGBC Ladies." },
  { id: "mgbc-teens-christmas", title: "MGBC Teens Christmas Party", date: "2026-12-13", time: "5:00 PM", endTime: "8:00 PM", location: "Bennington Sports Center",
    description: "Games, food and fun. Bring a gift for a game." },
];

/** The church's regular weekly schedule. */
function weeklyEvents(fromISO: string, toISO: string): ChurchEvent[] {
  const out: ChurchEvent[] = [];
  for (let d = fromISO; d <= toISO; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0) {
      out.push({ id: `sun-830-${d}`, title: "Worship service", date: d, time: "8:30 AM", endTime: "9:30 AM", location: CHURCH, recurring: true });
      out.push({ id: `sun-945-${d}`, title: "Growth Groups (all ages)", date: d, time: "9:45 AM", endTime: "10:30 AM", location: CHURCH, recurring: true });
      out.push({ id: `sun-1045-${d}`, title: "Worship service", date: d, time: "10:45 AM", endTime: "12:00 PM", location: CHURCH, recurring: true });
    } else if (dow === 3) {
      out.push({ id: `wed-kids-${d}`, title: "Kids Club and Teen Group (dinner provided)", date: d, time: "6:00 PM", endTime: "7:30 PM", location: CHURCH, recurring: true });
      out.push({ id: `wed-adults-${d}`, title: "Adult Growth Groups", date: d, time: "6:30 PM", endTime: "7:30 PM", location: CHURCH, recurring: true });
    }
  }
  return out;
}

const PEOPLE: DemoPerson[] = [
  { id: "p01", name: "Sarah Kim", firstName: "Sarah", language: "en", smallGroup: "Tuesday women's group",
    serving: { worship: "SSSSSSSSS...", kids: "S.S.S.S.S.S.", hospitality: ".S.S.S......" },
    worship: "111111111111", group: "00110111", next: ["worship", "kids"], thankedDaysAgo: 140 },
  { id: "p02", name: "Marcus Bell", firstName: "Marcus", language: "en", smallGroup: "Men's breakfast",
    serving: { tech: "SDSSSSD.S.S.", parking: "S.S.S.S....." },
    worship: "111111111111", group: "10111111", next: ["tech"], thankedDaysAgo: 75 },
  { id: "p03", name: "Ana López", firstName: "Ana", language: "es", household: "López family", smallGroup: "Grupo de jóvenes adultos",
    serving: { kids: "SSSSS.S.S...", greeters: "..S..S..S..." },
    worship: "111111110111", group: "11011111", next: ["kids"], thankedDaysAgo: 30 },
  { id: "p04", name: "Daniel Okafor", firstName: "Daniel", language: "en",
    serving: { worship: "S.S.S.S.S.S." }, worship: "111111111111", next: ["worship"], thankedDaysAgo: 20 },
  { id: "p05", name: "Grace Lee", firstName: "Grace", language: "en", smallGroup: "Tuesday women's group",
    serving: { hospitality: "...S.S.S.S.S" }, worship: "000111111111", group: "00011111", thankedDaysAgo: 45 },
  { id: "p06", name: "Jin-woo Park", firstName: "Jin-woo", language: "ko", household: "Park family",
    serving: { tech: "SSS...S...S." }, worship: "111111111111", next: ["tech"], thankedDaysAgo: 15 },
  { id: "p07", name: "Min-ji Park", firstName: "Min-ji", language: "ko", household: "Park family",
    serving: { kids: "S..S..S..S.." }, worship: "111111111111", thankedDaysAgo: 15 },
  { id: "p08", name: "Luis Hernández", firstName: "Luis", language: "es", household: "Hernández family",
    serving: { parking: "SSSSSSS.S.S." }, worship: "001001111111", next: ["parking"], thankedDaysAgo: 200 },
  { id: "p09", name: "Carmen Hernández", firstName: "Carmen", language: "es", household: "Hernández family",
    serving: { hospitality: "S.S.S.S.S.S." }, worship: "111111111111", thankedDaysAgo: 40 },
  { id: "p10", name: "Tom Reyes", firstName: "Tom", language: "en",
    serving: { greeters: "S..S..S..S.." }, worship: "111111111111", next: ["greeters"], thankedDaysAgo: 10 },
  { id: "p11", name: "Priya Shah", firstName: "Priya", language: "en", smallGroup: "Young families",
    serving: { kids: "S.S..S.S..S." }, worship: "111111111111", group: "11111111", next: ["kids"], thankedDaysAgo: 25 },
  { id: "p12", name: "Ben Carter", firstName: "Ben", language: "en", smallGroup: "Men's breakfast",
    worship: "000001111111", group: "00001111" },
  { id: "p13", name: "Ruth Adeyemi", firstName: "Ruth", language: "en",
    serving: { greeters: ".S..S..S..S." }, worship: "111111111111", thankedDaysAgo: 12 },
  { id: "p14", name: "Sofía Ramírez", firstName: "Sofía", language: "es",
    serving: { worship: ".S.S.S.S.S.S" }, worship: "111111111111", thankedDaysAgo: 18 },
  { id: "p15", name: "Hannah Wright", firstName: "Hannah", language: "en",
    serving: { kids: "DDS.D.S.S.S." }, worship: "101111111111", thankedDaysAgo: 90 },
  { id: "p16", name: "David Cho", firstName: "David", language: "ko",
    serving: { greeters: "S...S...S..." }, worship: "111111111111", next: ["greeters"], thankedDaysAgo: 22 },
  { id: "p17", name: "Elena Torres", firstName: "Elena", language: "es",
    serving: { kids: ".S...S...S.." }, worship: "111111111111", thankedDaysAgo: 35 },
  { id: "p18", name: "Nate Brooks", firstName: "Nate", language: "en",
    serving: { tech: "SSSSSSSSSS.." }, worship: "111111111111", next: ["tech"], thankedDaysAgo: 100 },
];

for (const p of PEOPLE) {
  p.phone = `(555) 01${p.id.slice(1)}-${String(1000 + Number(p.id.slice(1)) * 37).slice(-4)}`;
  p.email = `${p.firstName.toLowerCase().replace(/[^a-z]/g, "")}.${p.id}@example.org`;
}

function strip(p: DemoPerson, base: string): Person {
  const { serving: _s, worship: _w, group: _g, next: _n, thankedDaysAgo, ...person } = p;
  return { ...person, lastThanked: thankedDaysAgo !== undefined ? addDays(base, -thankedDaysAgo) : undefined };
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export class DemoChurch implements ChurchData {
  readonly source = "demo";
  constructor(private readonly clock: () => string = () => today()) {}

  private sunday() {
    return lastSunday(this.clock());
  }

  async listPeople() {
    return PEOPLE.map((p) => strip(p, this.clock()));
  }

  async getPerson(id: string) {
    const p = PEOPLE.find((x) => x.id === id);
    return p ? strip(p, this.clock()) : null;
  }

  async findPeople(query: string) {
    const q = normalize(query.trim());
    if (!q) return [];
    const words = q.split(/\s+/);
    return PEOPLE.filter((p) => {
      const name = normalize(p.name);
      return words.every((w) => name.includes(w));
    }).map((p) => strip(p, this.clock()));
  }

  async teams() {
    return TEAMS;
  }

  async serving(sinceISO: string) {
    const sunday = this.sunday();
    const out: ServingRecord[] = [];
    for (const p of PEOPLE) {
      for (const [teamId, pattern] of Object.entries(p.serving ?? {})) {
        [...pattern].forEach((ch, i) => {
          const date = addDays(sunday, -7 * i);
          if (date < sinceISO) return;
          if (ch === "S") out.push({ personId: p.id, teamId, date, status: "served" });
          if (ch === "D") out.push({ personId: p.id, teamId, date, status: "declined" });
        });
      }
    }
    return out;
  }

  async attendance(sinceISO: string) {
    const sunday = this.sunday();
    const out: AttendanceRecord[] = [];
    for (const p of PEOPLE) {
      [...p.worship].forEach((ch, i) => {
        const date = addDays(sunday, -7 * i);
        if (date >= sinceISO) out.push({ personId: p.id, date, kind: "worship", present: ch === "1" });
      });
      [...(p.group ?? "")].forEach((ch, i) => {
        const date = addDays(sunday, -7 * i - 5); // groups meet on the Tuesday before
        if (date >= sinceISO) {
          out.push({ personId: p.id, date, kind: "group", present: ch === "1" });
        }
      });
    }
    return out;
  }

  async rosters(fromISO: string, toISO: string) {
    const nextSunday = addDays(this.sunday(), 7);
    if (nextSunday < fromISO || nextSunday > toISO) return [];
    const out: Roster[] = [];
    for (const team of TEAMS) {
      const people = PEOPLE.filter((p) => p.next?.includes(team.id)).map((p) => ({
        personId: p.id,
        name: p.name,
        status: "scheduled" as const,
      }));
      if (people.length) out.push({ date: nextSunday, teamId: team.id, teamName: team.name, people });
    }
    return out;
  }

  async leadership() {
    return LEADERSHIP;
  }

  async events(fromISO: string, toISO: string) {
    const all = [...SPECIAL_EVENTS.filter((e) => e.date >= fromISO && e.date <= toISO), ...weeklyEvents(fromISO, toISO)];
    return all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
}
