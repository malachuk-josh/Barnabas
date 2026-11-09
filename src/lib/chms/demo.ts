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
 * The demo church (Mount Greylock Baptist Church) before any ChMS is connected: its published leadership,
 * teams, weekly schedule and events, and the serving patterns of the leaders who serve on teams.
 * Tests can pass their own fictional people. Serving and attendance patterns are written most-recent-Sunday first:
 *   serving: S = served, D = declined, . = not scheduled
 *   attendance: 1 = present, 0 = absent
 * All dates are computed relative to today, so the data never goes stale.
 */

export type DemoPerson = Person & {
  serving?: Record<string, string>;
  worship: string;
  group?: string;
  next?: string[]; // teams scheduled for the coming Sunday
  thankedDaysAgo?: number;
};

const TEAMS: Team[] = [
  { id: "worship", name: "Worship team", lead: "Aaron Malachuk" },
  { id: "kids", name: "MGBC Kids" },
  { id: "hospitality", name: "Hospitality & Connections", lead: "Aaron Malachuk" },
  { id: "tech", name: "Tech & livestream" },
  { id: "greeters", name: "Greeters", lead: "Travis Willette" },
  { id: "parking", name: "Parking", lead: "Micah Hayre" },
];

/**
 * Mount Greylock Baptist Church, North Adams, MA: leadership, weekly schedule and upcoming events
 * as published on mountgreylockbaptist.com and mgbc.churchtrac.com (checked November 2026).
 * No congregation is invented: the directory below has only the real leaders who serve on teams.
 */
const LEADERSHIP: ChurchLeader[] = [
  { name: "Ethan Malachuk", title: "Lead Pastor", ministry: "Bible teaching", email: "ethanmalachuk@gmail.com",
    bio: "Raised at MGBC and on the pastoral team since 2006: assistant pastor, then co-pastor from 2016, and Lead Pastor since 2024. His focus is clear, faithful Bible teaching that connects with everyday life. Lives in Clarksburg." },
  { name: "Eric Malachuk", title: "Care Pastor", ministry: "Discipleship and pastoral care",
    bio: "Came to faith in the church's first year and has served since 1982, as Senior Pastor from 1990 to 2023. He guided the pastoral transition from 2016 to 2024 and now gives his time to discipleship and pastoral care." },
  { name: "Aaron Malachuk", title: "Connections & Worship Pastor", ministry: "Worship and connections",
    bio: "At MGBC since 2011, including thirteen years as Youth Pastor. Now leads worship and helps newcomers get connected; a gifted musician. Lives in Stamford, Vermont. Travels often for work; has led worship at both services every week for a long stretch." },
  { name: "Travis Willette", title: "Deacon", lighterLoad: true,
    bio: "Serves with the pastors in caring for the church family. Married, with two kids in high school, and a very busy life; serves with Greeters about twice a month." },
  { name: "Cal Najimy", title: "Deacon", bio: "Serves with the pastors in caring for the church family." },
  { name: "Micah Hayre", title: "Deacon", lighterLoad: true,
    bio: "Serves with the pastors in caring for the church family. Married, with two kids in high school, and a very busy life; serves with Parking about twice a month." },
  // Added at the church's request (not on the website's leadership page): a worship leader.
  { name: "Adam Malachuk", title: "Worship Leader", ministry: "Worship", published: false },
];

const CHURCH = "Mount Greylock Baptist Church, 35 Notch Road, North Adams, MA";

const SPECIAL_EVENTS: ChurchEvent[] = [
  { id: "mgbc-reverb", title: "MGBC Teens Reverb: All-Nighter", date: "2026-11-13", time: "3:00 PM", endTime: "11:59 PM", location: CHURCH,
    description: "Word of Life REVERB All-Nighter with games, activities, food and a Gospel message. Runs until 8:00 AM Saturday. $67; bring money for food." },
  { id: "mgbc-thanksgiving", title: "Thanksgiving Communion Service", date: "2026-11-22", time: "6:00 PM", endTime: "7:00 PM", location: CHURCH,
    description: "An evening of worship and thanksgiving with singing and reflection as a church family. Registration open." },
  { id: "mgbc-ladies-christmas", title: "Ladies Christmas Gathering", date: "2026-12-06", time: "4:00 PM", endTime: "5:00 PM", location: CHURCH,
    description: "Women and teen girls Life Group Christmas gathering (normally first Sundays at Lickety Split in MASS MoCA; December location TBD)." },
  { id: "lg-men-strength", title: "Men and Boys: Spiritual Strength Night", date: "2026-11-06", time: "6:00 PM", endTime: "8:00 PM", location: CHURCH,
    description: "Life Group for men and boys: Bible study, spiritual strength and fellowship." },
  { id: "lg-seniors-lunch", title: "Young At Heart Seniors: Sunday Lunch", date: "2026-11-15", time: "", location: CHURCH,
    description: "Monthly potluck luncheon and devotional. Everyone welcome; bring a dish to share." },
  { id: "lg-moms-nov", title: "Mom's Group: James study", date: "2026-11-18", time: "6:30 PM", endTime: "7:30 PM", location: "Upstairs at MGBC",
    description: "Moms of all ages studying the book of James. Childcare provided." },
  { id: "lg-thrive-nov", title: "Thrive Couples Group (married 40+)", date: "2026-11-21", time: "5:00 PM", endTime: "7:00 PM", location: CHURCH,
    description: "Potluck meal and discussion. Current study: 5 Things to Pray for Your Spouse (Michael and Melissa Kruger)." },
  { id: "lg-ya-friendsgiving", title: "Young Adults 18–29: Friendsgiving", date: "2026-11-22", time: "1:00 PM", endTime: "4:00 PM", location: CHURCH,
    description: "Fellowship, fun and Bible study for young adults." },
  { id: "lg-moms-dec", title: "Mom's Group: James study", date: "2026-12-16", time: "6:30 PM", endTime: "7:30 PM", location: "Upstairs at MGBC",
    description: "Moms of all ages studying the book of James. Childcare provided." },
  { id: "lg-ya-dec", title: "Young Adults 18–29", date: "2026-12-20", time: "6:00 PM", endTime: "9:00 PM", location: CHURCH,
    description: "Fellowship, fun and Bible study for young adults." },
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

/**
 * The demo directory holds only the church's real leaders who also serve on a volunteer team, with the
 * serving patterns the church described. There is no fictional congregation: a church's own people come in
 * from its ChMS (or the CSV import), and every list starts empty with a first step to take.
 */
const PEOPLE: DemoPerson[] = [
  // Real leaders who also serve on volunteer teams, with patterns the church described. Only their serving
  // and worship attendance appear here; nothing else about them is made up.
  { id: "p19", name: "Aaron Malachuk", firstName: "Aaron", language: "en", leadership: true,
    note: "Travels often for work; has led worship at both services every week for a long stretch.",
    serving: { worship: "SSSSSSSSSSSS" }, worship: "111111111111", next: ["worship"] },
  { id: "p20", name: "Travis Willette", firstName: "Travis", language: "en", leadership: true,
    serving: { greeters: "S.S.S.S.S.S." }, worship: "111111111111", next: ["greeters"], thankedDaysAgo: 20 },
  { id: "p21", name: "Micah Hayre", firstName: "Micah", language: "en", leadership: true,
    serving: { parking: ".S.S.S.S.S.S" }, worship: "111111111111", thankedDaysAgo: 20 },
];

// Real leaders get no made-up phone numbers or email addresses.

function strip(p: DemoPerson, base: string): Person {
  const { serving: _s, worship: _w, group: _g, next: _n, thankedDaysAgo, ...person } = p;
  return { ...person, lastThanked: thankedDaysAgo !== undefined ? addDays(base, -thankedDaysAgo) : undefined };
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export class DemoChurch implements ChurchData {
  readonly source = "demo";
  private readonly people: DemoPerson[];
  constructor(
    private readonly clock: () => string = () => today(),
    /** Extra people (test fixtures only); the demo church itself has none. */
    extra: DemoPerson[] = [],
  ) {
    this.people = [...extra, ...PEOPLE];
  }

  private sunday() {
    return lastSunday(this.clock());
  }

  async listPeople() {
    return this.people.map((p) => strip(p, this.clock()));
  }

  async getPerson(id: string) {
    const p = this.people.find((x) => x.id === id);
    return p ? strip(p, this.clock()) : null;
  }

  async findPeople(query: string) {
    const q = normalize(query.trim());
    if (!q) return [];
    const words = q.split(/\s+/);
    return this.people.filter((p) => {
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
    for (const p of this.people) {
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
    for (const p of this.people) {
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
      const people = this.people.filter((p) => p.next?.includes(team.id)).map((p) => ({
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
