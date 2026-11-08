import { addDays, lastSunday, today } from "../dates";
import type {
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
  { id: "kids", name: "Kids ministry" },
  { id: "hospitality", name: "Hospitality" },
  { id: "tech", name: "Tech and sound" },
  { id: "greeters", name: "Greeters" },
  { id: "parking", name: "Parking" },
];

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

  async events(fromISO: string, toISO: string) {
    const sunday = this.sunday();
    const all: ChurchEvent[] = [
      { id: "e1", title: "Elders meeting", date: addDays(sunday, 4), time: "7:00 PM", location: "Conference room" },
      { id: "e2", title: "Community food drive with Iglesia Nueva Vida", date: addDays(sunday, 6), time: "9:00 AM", location: "Fellowship hall parking lot" },
      { id: "e3", title: "Sunday worship", date: addDays(sunday, 7), time: "9:30 AM and 11:15 AM", location: "Sanctuary" },
      { id: "e4", title: "Volunteer appreciation lunch", date: addDays(sunday, 14), time: "12:30 PM", location: "Fellowship hall" },
    ];
    return all.filter((e) => e.date >= fromISO && e.date <= toISO);
  }
}
