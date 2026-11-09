import { describe, expect, it } from "vitest";
import { DemoChurch } from "@/lib/chms/demo";
import { addDays, lastSunday } from "@/lib/dates";
import { scoreVolunteers } from "@/lib/radar/burnout";
import { setChurchData } from "@/lib/chms";
import { briefing, radarNow } from "@/lib/engine/briefing";
import { fixtureChurch } from "./fixtures";
import { freshStore, leader } from "./helpers";

describe("burnout radar on the demo church", () => {
  it("flags overloaded and withdrawing volunteers with reasons (fixture congregation)", async () => {
    const today = "2026-11-10";
    const church = fixtureChurch(() => today);
    const sunday = lastSunday(today);
    const since = addDays(sunday, -77);
    const radar = scoreVolunteers({
      people: await church.listPeople(),
      teams: await church.teams(),
      serving: await church.serving(since),
      attendance: await church.attendance(since),
      mostRecentSunday: sunday,
      today,
    });
    const sarah = radar.find((r) => r.name === "Sarah Kim")!;
    expect(sarah.band).toBe("high");
    expect(sarah.consecutiveWeeks).toBeGreaterThanOrEqual(8);
    expect(sarah.drivers.join(" ")).toMatch(/teams/);
    expect(sarah.drivers.join(" ")).toMatch(/small-group/);
    expect(sarah.suggestion).toMatch(/Sarah/);

    const luis = radar.find((r) => r.name === "Luis Hernández")!;
    expect(luis.band).not.toBe("ok");
    expect(luis.drivers.join(" ")).toMatch(/worship/);

    const daniel = radar.find((r) => r.name === "Daniel Okafor")!;
    expect(daniel.band).toBe("ok");
    expect(radar[0].score).toBeGreaterThanOrEqual(radar[radar.length - 1].score);
  });

  it("puts Aaron Malachuk, who leads worship every week, on watch with a thank-you and a Sunday off, not high", async () => {
    const today = "2026-11-10";
    const church = new DemoChurch(() => today);
    const sunday = lastSunday(today);
    const since = addDays(sunday, -77);
    const radar = scoreVolunteers({
      people: await church.listPeople(),
      teams: await church.teams(),
      serving: await church.serving(since),
      attendance: await church.attendance(since),
      mostRecentSunday: sunday,
      today,
    });
    const aaron = radar.find((r) => r.name === "Aaron Malachuk")!;
    expect(aaron.band).toBe("watch");
    expect(aaron.consecutiveWeeks).toBeGreaterThanOrEqual(12);
    expect(aaron.drivers).toEqual(expect.arrayContaining(["12 Sundays in a row", "no thank-you on record"]));
    expect(aaron.suggestion).toBe("Thank Aaron for serving so faithfully, and offer a Sunday off.");
    expect(aaron.suggestion).not.toMatch(/burn/i);
    expect(aaron.note).toContain("Travels often for work");
    expect(aaron.teams).toEqual(["Worship team"]);

    // The deacons in a busy season serve about twice a month and read as fine.
    for (const name of ["Travis Willette", "Micah Hayre"]) {
      const r = radar.find((x) => x.name === name)!;
      expect(r.band, name).toBe("ok");
      expect(r.servedLast8, name).toBe(4);
    }
    expect((await church.teams()).find((t) => t.id === "worship")?.lead).toBe("Aaron Malachuk");
    const bios = Object.fromEntries((await church.leadership()).map((l) => [l.name, l.bio ?? ""]));
    expect(bios["Travis Willette"]).toContain("Married, with two kids in high school");
    expect(bios["Micah Hayre"]).toContain("Married, with two kids in high school");
    expect(bios["Cal Najimy"]).not.toContain("Married");
  });

  it("never shows a name outside the church's published leadership in the demo briefing", async () => {
    freshStore();
    setChurchData(new DemoChurch());
    const church = new DemoChurch();
    const leaders = new Set((await church.leadership()).map((l) => l.name));
    const people = await church.listPeople();
    expect(people.every((p) => p.leadership && leaders.has(p.name))).toBe(true);
    const { radar } = await radarNow();
    expect(radar.length).toBeGreaterThan(0);
    for (const r of radar) expect(leaders.has(r.name), r.name).toBe(true);
    const b = await briefing(leader);
    // Only Aaron is on the card: Travis and Micah serve about twice a month and read as fine.
    expect(b.radar.map((r) => r.name)).toEqual(["Aaron Malachuk"]);
    expect(b.radar[0].band).toBe("watch");
    for (const f of b.followUps) expect(leaders.has(f.name), f.name).toBe(true);
  });
});
