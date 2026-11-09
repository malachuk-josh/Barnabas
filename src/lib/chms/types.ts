/** The church-data surface Barnabas reads. The native adapter (`src/lib/people/native.ts`) serves the church's own People database; the demo adapter serves the demo church. */

export type Language = "en" | "es" | "ko";

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Spanish",
  ko: "Korean",
};

export type Person = {
  id: string;
  name: string;
  firstName: string;
  household?: string;
  /** Preferred language for written communication. */
  language: Language;
  phone?: string;
  email?: string;
  smallGroup?: string;
  /** Last time a leader recorded a thank-you or appreciation (ISO date). */
  lastThanked?: string;
  /**
   * On the church's published leadership team: a real person who also serves on a volunteer team.
   * Demo data never makes them the subject of care, giving, pathway or prayer records.
   */
  leadership?: boolean;
  /** A short factual note the church supplied, e.g. why their serving pattern looks the way it does. */
  note?: string;
};

export type Team = {
  id: string;
  name: string;
  /** The person who leads the team, by name (a church leader). */
  lead?: string;
};

export type ServingStatus = "served" | "declined" | "scheduled";

export type ServingRecord = {
  personId: string;
  teamId: string;
  /** ISO date (yyyy-mm-dd) of the service. */
  date: string;
  status: ServingStatus;
};

export type AttendanceRecord = {
  personId: string;
  date: string;
  kind: "worship" | "group";
  present: boolean;
};

export type ChurchEvent = {
  id: string;
  title: string;
  date: string;
  /** Start time, e.g. "6:00 PM". */
  time: string;
  /** End time, e.g. "7:00 PM"; "next day" events end at midnight on the calendar. */
  endTime?: string;
  description?: string;
  /** Part of the regular weekly schedule (services, groups). */
  recurring?: boolean;
  location: string;
};

export type Roster = {
  date: string;
  teamId: string;
  teamName: string;
  people: { personId: string; name: string; status: ServingStatus }[];
};

export type Leader = {
  name: string;
  title: string;
  ministry?: string;
  /** A short summary in our own words, so Barnabas knows who's who. */
  bio?: string;
  /** In a busy season of life: give them a lighter share of follow-up assignments. */
  lighterLoad?: boolean;
  /** false: known to Barnabas and in the directory, but not on the church's published leadership page. */
  published?: boolean;
  /** Their Barnabas sign-in email, when the church gave it: fills in their profile at first sign-in and their directory record. */
  email?: string;
};

export interface ChurchData {
  /** Pastors, deacons and staff as published by the church. */
  leadership(): Promise<Leader[]>;
  readonly source: string;
  listPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | null>;
  findPeople(query: string): Promise<Person[]>;
  teams(): Promise<Team[]>;
  serving(sinceISO: string): Promise<ServingRecord[]>;
  attendance(sinceISO: string): Promise<AttendanceRecord[]>;
  rosters(fromISO: string, toISO: string): Promise<Roster[]>;
  events(fromISO: string, toISO: string): Promise<ChurchEvent[]>;
}
