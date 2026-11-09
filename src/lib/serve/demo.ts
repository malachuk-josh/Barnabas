import { addDays, lastSunday, today } from "../dates";
import { newId } from "../data/ids";
import type { GatheringKey } from "../ops/gatherings";
import type { Assignment, ServeBook, ServeTeam, Volunteer } from "./types";

/**
 * The teams every church starts with (positions and gatherings only, no people), and the demo church's
 * rosters. Mount Greylock's real leaders are the only people on them, serving in their real roles:
 *   Aaron Malachuk   leads worship at both Sunday services every week (the church's note: a long run,
 *                    so the radar suggests a thank-you and a Sunday off)
 *   Travis Willette  leads Greeters, about twice a month (capped at two Sundays a month)
 *   Micah Hayre      leads Parking, about twice a month (capped at two Sundays a month)
 * Every other slot is open. No volunteer is made up, and they get no phone numbers or emails.
 */

const SUNDAY: GatheringKey[] = ["sun-0830", "sun-1045"];

export function defaultTeams(): ServeTeam[] {
  const pos = (name: string, needed = 1) => ({ id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, ""), name, needed });
  return [
    { id: "worship", name: "Worship team", lead: "Aaron Malachuk", gatherings: SUNDAY, positions: [pos("Worship leader"), pos("Vocals", 2), pos("Keys"), pos("Guitar"), pos("Bass"), pos("Drums")] },
    { id: "tech", name: "Tech & livestream", gatherings: SUNDAY, positions: [pos("Sound"), pos("Livestream"), pos("Slides")] },
    { id: "greeters", name: "Greeters", lead: "Travis Willette", gatherings: SUNDAY, positions: [pos("Door greeter", 2), pos("Welcome table")] },
    { id: "parking", name: "Parking", lead: "Micah Hayre", gatherings: SUNDAY, positions: [pos("Parking lot", 2)] },
    { id: "hospitality", name: "Hospitality & Connections", lead: "Aaron Malachuk", gatherings: SUNDAY, positions: [pos("Coffee", 2), pos("Connections desk")] },
    { id: "kids", name: "MGBC Kids", gatherings: ["sun-0945", "sun-1045", "wed-1800"], positions: [pos("Teacher", 2), pos("Helper", 2), pos("Check-in desk")] },
    { id: "teens", name: "Teen Group", gatherings: ["wed-1800"], positions: [pos("Leader", 2), pos("Dinner", 2)] },
  ];
}

export function seedDemoServe(asOf = today()): ServeBook {
  const created = Date.now();
  const teams = defaultTeams();
  const vol = (name: string, personId: string, teamIds: string[], maxPerMonth?: number): Volunteer => ({
    id: `vol_${personId}`, name, personId, teamIds, maxPerMonth, leadership: true, blackouts: [], createdAt: created, demo: true,
  });
  const aaron = vol("Aaron Malachuk", "p19", ["worship", "hospitality"]);
  const travis = vol("Travis Willette", "p20", ["greeters"], 2);
  const micah = vol("Micah Hayre", "p21", ["parking"], 2);

  const assignments: Assignment[] = [];
  const add = (date: string, g: GatheringKey, teamId: string, positionId: string, v: Volunteer) =>
    assignments.push({ id: newId("asg"), date, gathering: g, teamId, positionId, volunteerId: v.id, status: date <= asOf ? "confirmed" : "scheduled", source: "demo", createdAt: created, createdBy: "demo", demo: true });

  const sunday = lastSunday(asOf);
  const perMonth = new Map<string, number>();
  const underCap = (v: Volunteer, date: string) => (perMonth.get(`${v.id}:${date.slice(0, 7)}`) ?? 0) < (v.maxPerMonth ?? Infinity);
  const count = (v: Volunteer, date: string) => perMonth.set(`${v.id}:${date.slice(0, 7)}`, (perMonth.get(`${v.id}:${date.slice(0, 7)}`) ?? 0) + 1);
  // Twelve Sundays back through six ahead, oldest first so the monthly cap reads in order.
  for (let i = 12; i >= -6; i--) {
    const date = addDays(sunday, -7 * i);
    // Aaron: worship leader at both services, every week.
    for (const g of SUNDAY) add(date, g, "worship", "worship-leader", aaron);
    // Travis and Micah: every other Sunday, never more than two a month.
    if (i % 2 === 0 && underCap(travis, date)) {
      add(date, "sun-1045", "greeters", "door-greeter", travis);
      count(travis, date);
    }
    if (i % 2 !== 0 && underCap(micah, date)) {
      add(date, "sun-0830", "parking", "parking-lot", micah);
      count(micah, date);
    }
  }
  return { meta: { demo: true, createdAt: created }, teams, volunteers: [aaron, travis, micah], assignments, swaps: [] };
}
