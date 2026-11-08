import { addDays, daysBetween } from "../dates";
import type { AttendanceRecord, Person, ServingRecord, Team } from "../chms/types";

/**
 * Volunteer burnout radar. Combines overload signals (load across ministries, consecutive weeks,
 * declines) with withdrawal signals (the volunteer's own worship and small-group attendance)
 * and appreciation recency. Rules of thumb, not science: every score comes with its reasons.
 */

export type RadarBand = "high" | "watch" | "ok";

export type RadarEntry = {
  personId: string;
  name: string;
  score: number;
  band: RadarBand;
  teams: string[];
  consecutiveWeeks: number;
  servedLast8: number;
  drivers: string[];
  suggestion: string;
};

const WINDOW_WEEKS = 8;

export function consecutiveWeeks(servedDates: Set<string>, mostRecentSunday: string): number {
  let count = 0;
  for (let i = 0; i < 52; i++) {
    if (servedDates.has(addDays(mostRecentSunday, -7 * i))) count++;
    else break;
  }
  return count;
}

export function scoreVolunteers(input: {
  people: Person[];
  teams: Team[];
  serving: ServingRecord[];
  attendance: AttendanceRecord[];
  mostRecentSunday: string;
  today: string;
}): RadarEntry[] {
  const { people, teams, serving, attendance, mostRecentSunday, today } = input;
  const windowStart = addDays(mostRecentSunday, -7 * (WINDOW_WEEKS - 1));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const out: RadarEntry[] = [];

  for (const person of people) {
    const mine = serving.filter((s) => s.personId === person.id && s.date >= windowStart);
    const served = mine.filter((s) => s.status === "served");
    if (!served.length && !mine.some((s) => s.status === "declined")) continue;

    const drivers: string[] = [];
    let score = 0;

    const teamIds = [...new Set(served.map((s) => s.teamId))];
    if (teamIds.length >= 3) {
      score += 3;
      drivers.push(`serves on ${teamIds.length} teams`);
    } else if (teamIds.length === 2) {
      score += 1.5;
      drivers.push("serves on 2 teams");
    }

    const servedSundays = new Set(served.map((s) => s.date));
    const streak = consecutiveWeeks(servedSundays, mostRecentSunday);
    if (streak >= 4) {
      const add = Math.min(3, (streak - 3) * 0.6);
      score += add;
      drivers.push(`${streak} Sundays in a row`);
    }

    const slotsPerWeek = served.length / WINDOW_WEEKS;
    if (slotsPerWeek >= 1.5) {
      score += 1;
      drivers.push(`about ${slotsPerWeek.toFixed(1)} roles a week`);
    }

    const recentStart = addDays(mostRecentSunday, -14);
    const recentDeclines = mine.filter((s) => s.status === "declined" && s.date >= recentStart).length;
    const olderDeclines = mine.filter((s) => s.status === "declined" && s.date < recentStart).length;
    if (recentDeclines >= 2 || (recentDeclines >= 1 && recentDeclines > olderDeclines)) {
      score += 1.5;
      drivers.push(`declined ${recentDeclines} recent request${recentDeclines > 1 ? "s" : ""}`);
    }

    const worship = attendance.filter((a) => a.personId === person.id && a.kind === "worship");
    const last4 = worship.filter((a) => a.date > addDays(mostRecentSunday, -28));
    const prior4 = worship.filter((a) => a.date <= addDays(mostRecentSunday, -28) && a.date > addDays(mostRecentSunday, -56));
    const presentLast4 = last4.filter((a) => a.present).length;
    const presentPrior4 = prior4.filter((a) => a.present).length;
    if (prior4.length && presentPrior4 - presentLast4 >= 2) {
      score += 1.5;
      drivers.push(`at worship ${presentLast4} of the last 4 Sundays, down from ${presentPrior4}`);
    }

    const groups = attendance
      .filter((a) => a.personId === person.id && a.kind === "group")
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4);
    const missedGroups = groups.filter((g) => !g.present).length;
    if (groups.length >= 3 && missedGroups >= 2) {
      score += 1.5;
      drivers.push(`missed ${missedGroups} of the last ${groups.length} small-group meetings`);
    }

    if (served.length >= 4) {
      const days = person.lastThanked ? daysBetween(person.lastThanked, today) : null;
      if (days === null || days > 60) {
        score += 1;
        drivers.push(days === null ? "no thank-you on record" : `last thanked ${days} days ago`);
      }
    }

    score = Math.min(10, Math.round(score * 10) / 10);
    const band: RadarBand = score >= 6 ? "high" : score >= 3.5 ? "watch" : "ok";
    out.push({
      personId: person.id,
      name: person.name,
      score,
      band,
      teams: teamIds.map((id) => teamName.get(id) ?? id),
      consecutiveWeeks: streak,
      servedLast8: served.length,
      drivers,
      suggestion: suggestionFor(person, band, drivers),
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function suggestionFor(person: Person, band: RadarBand, drivers: string[]): string {
  if (band === "ok") return "No action needed.";
  const first = person.firstName;
  const withdrawing = drivers.some((d) => d.includes("worship") || d.includes("small-group"));
  const unthanked = drivers.some((d) => d.includes("thank"));
  if (band === "high" && withdrawing) {
    return `Call ${first} this week to check in personally, and offer a Sunday off without asking them to find a replacement.`;
  }
  if (band === "high") return `Thank ${first} and offer a week off from at least one team.`;
  if (unthanked) return `Send ${first} a specific thank-you note this week.`;
  return `Keep an eye on ${first}; ask how they're doing next time you see them.`;
}
