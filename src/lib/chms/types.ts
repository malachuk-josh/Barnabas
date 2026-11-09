/** The church-data surface Barnabas reads. Each ChMS (Planning Center, Rock, Breeze...) gets an adapter. */

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
};

export type Team = { id: string; name: string };

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

export type Leader = { name: string; title: string; ministry?: string };

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
