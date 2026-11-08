import { beforeEach, describe, expect, it } from "vitest";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { open, resetKey, seal } from "@/lib/calendar/crypto";
import { buildIcs } from "@/lib/calendar/ics";
import { EventInputSchema, allEvents } from "@/lib/calendar/store";
import { createEvent, deleteEvent, updateEvent } from "@/lib/calendar/service";
import { fromWall, toWall } from "@/lib/calendar/time";
import { executeTool, type ToolContext } from "@/lib/engine/tools";
import { getProfile, saveProfile } from "@/lib/profile";
import { feedToken, leaderForFeed } from "@/lib/calendar/connections";
import { freshStore, leader } from "./helpers";

describe("time zones", () => {
  it("converts wall time to instants across daylight saving", () => {
    expect(fromWall("2026-07-01", "19:00", "America/Chicago").toISOString()).toBe("2026-07-02T00:00:00.000Z");
    expect(fromWall("2026-12-01", "19:00", "America/Chicago").toISOString()).toBe("2026-12-02T01:00:00.000Z");
    expect(fromWall("2026-11-12", "09:30", "Asia/Seoul").toISOString()).toBe("2026-11-12T00:30:00.000Z");
  });
  it("round-trips", () => {
    const at = fromWall("2026-03-08", "10:15", "America/New_York");
    expect(toWall(at, "America/New_York")).toEqual({ date: "2026-03-08", time: "10:15" });
  });
});

describe("event validation", () => {
  it("requires times for timed events and an end after the start", () => {
    expect(EventInputSchema.safeParse({ title: "Elders", date: "2026-11-12", allDay: false }).success).toBe(false);
    expect(EventInputSchema.safeParse({ title: "Elders", date: "2026-11-12", start: "19:00", end: "18:00" }).success).toBe(false);
    expect(EventInputSchema.safeParse({ title: "Sabbath", date: "2026-11-13", allDay: true }).success).toBe(true);
  });
});

describe("ICS feed", () => {
  it("writes timed and all-day events in UTC without private notes", () => {
    const now = Date.now();
    const ics = buildIcs(
      [
        { id: "evt_1", title: "Visit, Grace; Lee", date: "2026-11-12", start: "14:00", end: "15:00", allDay: false, kind: "visit", notes: "secret note", createdBy: "barnabas", createdAt: now, updatedAt: now },
        { id: "evt_2", title: "Sabbath", date: "2026-11-13", allDay: true, kind: "rest", createdBy: "leader", createdAt: now, updatedAt: now },
      ],
      "America/Chicago",
      "Barnabas",
    );
    expect(ics).toContain("DTSTART:20261112T200000Z");
    expect(ics).toContain("SUMMARY:Visit\\, Grace\; Lee");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261113");
    expect(ics).toContain("DTEND;VALUE=DATE:20261114");
    expect(ics).not.toContain("secret note");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
});

describe("token encryption", () => {
  it("round-trips and doesn't store plain text", async () => {
    resetKey();
    const sealed = await seal(JSON.stringify({ accessToken: "abc", expiresAt: 1 }));
    expect(sealed).not.toContain("abc");
    expect(JSON.parse(await open(sealed)).accessToken).toBe("abc");
  });
});

describe("calendar service and Barnabas's calendar tools", () => {
  beforeEach(() => freshStore());

  it("creates, updates and deletes events (no connections: local only)", async () => {
    const e = await createEvent(leader, { title: "Elders meeting", date: "2026-11-12", start: "19:00", end: "20:30", allDay: false, kind: "meeting" }, "leader");
    expect(e.syncError).toBeUndefined();
    const u = await updateEvent(leader, e.id, { start: "18:30" }, "leader");
    expect(u?.start).toBe("18:30");
    await deleteEvent(leader, e.id, "leader");
    expect(await allEvents(leader)).toEqual([]);
  });

  async function ctx(lastUserText: string, turns: number, meta?: ConversationMeta): Promise<ToolContext> {
    const m: ConversationMeta = meta ?? { id: "conv_cal", title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns };
    if (!meta) await createConversation(leader, m);
    m.turns = turns;
    return { leader, meta: m, turnStartedAt: Date.now(), lastUserText };
  }

  it("lets Barnabas add and change events, but asks before deleting", async () => {
    const c1 = await ctx("Add the elders meeting Thursday at 7", 0);
    const added = await executeTool("add_calendar_event", { title: "Elders meeting", date: "2026-11-12", start: "19:00", end: "20:00", kind: "meeting" }, c1);
    expect(added.isError).toBe(false);
    const id = JSON.parse(added.content).event_id;
    expect((await allEvents(leader))[0].createdBy).toBe("barnabas");

    const moved = await executeTool("update_calendar_event", { event_id: id, start: "18:30", end: "19:30" }, c1);
    expect(JSON.parse(moved.content).now).toContain("6:30 PM");

    const first = await executeTool("delete_calendar_event", { event_id: id }, c1);
    expect(first.isError).toBe(true);
    expect(first.content).toContain("Not confirmed");
    expect(await allEvents(leader)).toHaveLength(1);

    const c2 = await ctx("Yes, delete it", 1, c1.meta);
    const second = await executeTool("delete_calendar_event", { event_id: id }, c2);
    expect(second.isError).toBe(false);
    expect(await allEvents(leader)).toHaveLength(0);
  });

  it("lists Barnabas, church and connected events in the leader's time zone", async () => {
    const profile = await getProfile(leader);
    await saveProfile(leader, { ...profile, timezone: "America/Chicago" });
    const c = await ctx("What's on my calendar?", 0);
    await executeTool("add_calendar_event", { title: "Sermon prep", date: new Date().toISOString().slice(0, 10), all_day: true, kind: "prep" }, c);
    const listed = JSON.parse((await executeTool("list_calendar", {}, c)).content);
    expect(listed.time_zone).toBe("America/Chicago");
    expect(listed.other_events.some((e: { source: string }) => e.source === "church calendar")).toBe(true);
  });

  it("refuses secrets in event text", async () => {
    const c = await ctx("add it", 0);
    const r = await executeTool("add_calendar_event", { title: "Open the church", date: "2026-11-12", all_day: true, notes: "door code is 4471" }, c);
    expect(r.isError).toBe(true);
  });
});

describe("subscription feed tokens", () => {
  beforeEach(() => freshStore());
  it("maps a long random token to the leader and can be reset", async () => {
    const t1 = await feedToken(leader);
    expect(t1).toMatch(/^[a-f0-9]{48}$/);
    expect(await leaderForFeed(t1)).toEqual({ churchId: leader.churchId, leaderId: leader.leaderId });
    const t2 = await feedToken(leader, true);
    expect(t2).not.toBe(t1);
    expect(await leaderForFeed(t1)).toBeNull();
    expect(await leaderForFeed("../../etc")).toBeNull();
  });
});
