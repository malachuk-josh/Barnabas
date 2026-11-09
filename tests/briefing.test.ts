import { beforeEach, describe, expect, it } from "vitest";
import { briefing } from "@/lib/engine/briefing";
import { churchData } from "@/lib/chms";
import { freshStore, leader } from "./helpers";

describe("home briefing", () => {
  beforeEach(() => freshStore());

  it("lists only the church's real leaders under Volunteers to check on", async () => {
    const b = await briefing(leader, "2026-11-09");
    const names = new Set((await churchData().leadership()).map((l) => l.name));
    expect(b.radar.length).toBeGreaterThan(0);
    for (const r of b.radar) expect(names.has(r.name)).toBe(true);
  });
});
