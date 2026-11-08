import { describe, expect, it } from "vitest";
import { DemoChurch } from "@/lib/chms/demo";
import { addDays, lastSunday } from "@/lib/dates";
import { scoreVolunteers } from "@/lib/radar/burnout";

describe("burnout radar on the demo church", () => {
  it("flags overloaded and withdrawing volunteers with reasons", async () => {
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
});
