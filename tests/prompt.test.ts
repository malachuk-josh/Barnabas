import { describe, expect, it } from "vitest";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";
import { CORE_TOOLS, TOOL_DEFS } from "@/lib/engine/tools";
import { kjvVerse } from "../evals/harness";

/**
 * Barnabas's shared instructions: a character, a few rules that protect people, how to find tools, and
 * four example conversations. Detail lives in each tool's description. These keep it that way.
 */
describe("Barnabas's instructions", () => {
  it("stay short (the rewrite halved them; detail belongs in tool descriptions)", () => {
    expect(BARNABAS_SYSTEM.length).toBeLessThan(14_000);
  });

  it("name only tools that exist", () => {
    const real = new Set([...TOOL_DEFS.map((t) => t.name), "web_search", "web_fetch", "person_id"]);
    const mentioned = new Set(BARNABAS_SYSTEM.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []);
    const unknown = [...mentioned].filter((n) => !real.has(n));
    expect(unknown).toEqual([]);
  });

  it("list the always-loaded tools exactly", () => {
    const line = BARNABAS_SYSTEM.split("\n").find((l) => l.includes("A few tools are always at hand"))!;
    for (const name of CORE_TOOLS) expect(line).toContain(name);
  });

  it("keep the protections: KJV word for word, asking first, privacy, the thorn, safety", () => {
    expect(BARNABAS_SYSTEM).toMatch(/King James Version \(KJV\) unless they chose another/);
    expect(BARNABAS_SYSTEM).toMatch(/Always read scripture with read_scripture/);
    expect(BARNABAS_SYSTEM).toMatch(/confirmed in code/);
    expect(BARNABAS_SYSTEM).toMatch(/You never send anything yourself/);
    expect(BARNABAS_SYSTEM).toMatch(/Individual giving is confidential/);
    expect(BARNABAS_SYSTEM).toMatch(/pickup codes/);
    expect(BARNABAS_SYSTEM).toMatch(/thorn in the flesh \(2 Corinthians 12:7\)/);
    expect(BARNABAS_SYSTEM).toMatch(/988/);
    expect(BARNABAS_SYSTEM).toMatch(/never the person/);
  });

  it("show four example conversations, whose scripture is word-for-word KJV", async () => {
    expect(BARNABAS_SYSTEM.match(/<example>/g)).toHaveLength(4);
    const norm = (s: string) => s.replace(/[^A-Za-z ]/g, "").replace(/\s+/g, " ").trim();
    for (const ref of ["Psalm 23:1", "Psalm 23:4"]) {
      expect(norm(BARNABAS_SYSTEM)).toContain(norm(await kjvVerse(ref)));
    }
  });

  it("move tool-specific guidance into the tools' own descriptions", () => {
    const desc = (n: string) => TOOL_DEFS.find((t) => t.name === n)!.description ?? "";
    expect(desc("budget_status")).toMatch(/seasonal lines/);
    expect(desc("giving_summary")).toMatch(/No tax, legal or accounting advice/);
    expect(desc("get_volunteer_load")).toMatch(/Never shame/);
    expect(desc("find_coverage")).toMatch(/away dates or monthly limit/);
    expect(desc("update_calendar_event")).toMatch(/read-only to you/);
  });
});
