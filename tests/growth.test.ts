import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { listDrafts } from "@/lib/data/records";
import { executeTool, type ToolContext } from "@/lib/engine/tools";
import { emptyBooks } from "@/lib/finance/store";
import type { Books, Gift } from "@/lib/finance/types";
import { addExampleChurch, answerRequest, createInvite, disconnect, networkState, previewShare, redeemInvite, searchNetwork, share } from "@/lib/network/service";
import { nameTerms, scrubText } from "@/lib/network/scrub";
import { carePipeline, givingVsBudget, guestConversion, kidsReport, median, volunteerHealth } from "@/lib/reports/aggregates";
import { draftMonthlyReport } from "@/lib/reports/monthly";
import { buildReports, sectionFor } from "@/lib/reports/service";
import type { CareBook, CareCase, GuestCard } from "@/lib/care/types";
import { emptyCareBook } from "@/lib/care/store";
import { emptyKids } from "@/lib/kids/store";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { useDemoChurch, useFixtureChurch } from "./fixtures";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "gggg0001", name: "Admin Pastor", email: "admin@example.org", role: "Pastor" };
const deacon: Leader = { churchId: "demo", leaderId: "gggg0002", name: "Deacon Test", email: "deacon@example.org", role: "Deacon" };
const plain: Leader = { churchId: "demo", leaderId: "gggg0003", name: "Lee Leader", email: "lee@example.org", role: "Leader" };
const otherAdmin: Leader = { churchId: "other-church", leaderId: "oooo0001", name: "Other Admin", email: "other@example.org", role: "Pastor" };

beforeEach(async () => {
  freshStore();
  useDemoChurch();
  vi.stubEnv("BARNABAS_ADMIN_EMAILS", "admin@example.org,other@example.org");
  for (const l of [pastor, deacon, plain, otherAdmin]) await recordSignIn(l);
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
});

async function ctx(leader: Leader): Promise<ToolContext> {
  const meta: ConversationMeta = { id: `conv_${Math.random().toString(36).slice(2)}`, title: "t", mode: "text", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns: 1 };
  await createConversation(leader, meta);
  return { leader, meta, turnStartedAt: Date.now(), lastUserText: "" };
}

describe("report aggregates", () => {
  it("median, and giving against the budget's pace", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const books: Books = emptyBooks("2026-01-01");
    const general = books.chart.funds[0];
    books.budgets = [{ year: 2026, lines: [{ accountId: general.incomeAccountId, annual: 120_000_00, basis: "annual" }], notes: "", updatedAt: 1, updatedBy: "t" }];
    const gift = (date: string, amount: number, donor: string): Gift => ({ id: date + donor, date, donorName: donor, amount, fundId: general.id, method: "check", batchId: "b", txnId: "t", createdAt: 1, createdBy: "t" });
    books.gifts = [gift("2026-01-04", 10_000_00, "A"), gift("2026-02-01", 9_000_00, "B"), gift("2025-03-01", 5_000_00, "A")];
    const g = givingVsBudget(books, "2026-02-28");
    expect(g.ytd).toBe(19_000_00);
    expect(g.rows.map((r) => r.budgetCumulative)).toEqual([10_000_00, 20_000_00]);
    expect(g.pace).toBe(20_000_00);
    expect(g.givers).toBe(2);
    expect(g.newGivers).toBe(1);
    expect(g.lastYear).toBe(0);
  });

  it("care pipeline: open by status, median days to first contact, assignees only when asked", () => {
    const now = Date.UTC(2026, 10, 1);
    const c = (id: string, status: CareCase["status"], firstContactDays: number | null, assigneeId?: string): CareCase => ({
      id, subject: { kind: "person", name: `Case ${id}` }, type: "hospital", status, confidential: false, assigneeId, contacts: firstContactDays === null ? [] : [{ id: "x", kind: "call", date: "2026-11-01", byId: "m", byName: "M", at: now + firstContactDays * 86_400_000 }],
      openedById: "m", openedByName: "M", openedAt: now, updatedAt: now, source: "app", closedAt: status === "closed" ? now : undefined,
    });
    const book: CareBook = { ...emptyCareBook(), cases: [c("1", "active", 1, "m1"), c("2", "new", null), c("3", "closed", 3, "m1")] };
    const agg = carePipeline(book, ["2026-11"], { byAssignee: false, memberName: () => "x" });
    expect(agg).toMatchObject({ open: 2, closed: 1, medianDaysToFirstContact: 2, noContactYet: 1, assignees: undefined });
    expect(agg.monthly).toEqual([{ month: "2026-11", opened: 3, closed: 1 }]);
    expect(carePipeline(book, [], { byAssignee: true, memberName: (id) => `Member ${id}` }).assignees).toEqual([{ name: "Member m1", count: 1 }, { name: "Unassigned", count: 1 }]);
  });

  it("guest conversion, kids ratio warnings and serving load per team", () => {
    const g = (id: string, contactedAfterH: number | null, visits: string[]): GuestCard => ({ id, name: id, interests: [], visits, assigneeId: "m", tasks: [], source: "leader", createdAt: 0, contactedAt: contactedAfterH === null ? undefined : contactedAfterH * 3600_000 });
    const book: CareBook = { ...emptyCareBook(), guests: [g("a", 10, ["2026-11-01"]), g("b", 60, ["2026-11-01", "2026-11-08"]), g("c", null, ["2026-11-08"])], pathways: [{ key: "b", guestId: "b", name: "b", steps: { discover_faith: "2026-11-10" }, updatedAt: 0 }] };
    expect(guestConversion(book, ["2026-11"])).toMatchObject({ total: 3, within48: 1, returned: 1, nextStep: 1, monthly: [{ month: "2026-11", guests: 3 }] });

    const kids = emptyKids();
    const room = kids.rooms[0];
    const g0 = room.gatherings[0];
    kids.checkins = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, date: "2026-11-08", gathering: g0, roomId: room.id, childId: `k${i}`, householdId: "h", pickupCode: "1", checkedInAt: 1, checkedInBy: "x" }));
    kids.staffing[`2026-11-08|${g0}|${room.id}`] = 1;
    const k = kidsReport(kids, ["2026-11-01", "2026-11-08"]);
    expect(k.weekly).toEqual([{ date: "2026-11-01", checkins: 0, children: 0, warnings: 0 }, { date: "2026-11-08", checkins: 3, children: 3, warnings: 1 }]);

    const v = volunteerHealth({
      people: [{ id: "a", name: "A", firstName: "A", language: "en" }, { id: "b", name: "B", firstName: "B", language: "en" }],
      teams: [{ id: "t1", name: "Greeters" }, { id: "t2", name: "Parking" }],
      serving: [
        { personId: "a", teamId: "t1", date: "2026-11-01", status: "served" },
        { personId: "a", teamId: "t1", date: "2026-11-08", status: "served" },
        { personId: "b", teamId: "t2", date: "2026-11-08", status: "served" },
        { personId: "b", teamId: "t2", date: "2026-11-01", status: "declined" },
      ],
      attendance: [],
      sundays: ["2026-11-01", "2026-11-08"],
      today: "2026-11-09",
    });
    expect(v.teams).toEqual([{ team: "Greeters", slots: 2, volunteers: 1, perVolunteer: 2, declined: 0 }, { team: "Parking", slots: 1, volunteers: 1, perVolunteer: 1, declined: 1 }]);
    expect(v.weekly.map((w) => w.active)).toEqual([1, 2]);
  });
});

describe("reports and permissions", () => {
  it("over the empty demo church, attendance and care show warm empty states", async () => {
    const { sections } = await buildReports(pastor);
    const by = Object.fromEntries(sections.map((s) => [s.id, s]));
    expect(by.attendance.empty?.title).toMatch(/No attendance/);
    expect(by.care.empty?.title).toMatch(/No shepherding needs/);
    expect(by.guests.empty).toBeTruthy();
    expect(by.kids.empty).toBeTruthy();
    // Nothing invented: the demo directory's leaders aren't counted as attendance.
    expect(by.attendance.table.rows.every((r) => r[1] === 0)).toBe(true);
  });

  it("filters by role: leaders get no giving, care or kids; deacons get giving without giver counts", async () => {
    const leaderReport = await buildReports(plain);
    const allowed = (r: typeof leaderReport) => r.sections.filter((s) => s.allowed).map((s) => s.id);
    expect(allowed(leaderReport)).toEqual(["attendance", "volunteers", "events"]);
    const deaconGiving = await sectionFor("giving", deacon, { role: "deacon", admin: false });
    const pastorGiving = await sectionFor("giving", pastor, { role: "pastor", admin: true });
    expect(deaconGiving.allowed && pastorGiving.allowed).toBe(true);
    expect(deaconGiving.stats.some((s) => s.label === "Givers this year")).toBe(false);
    expect(pastorGiving.stats.some((s) => s.label === "Givers this year")).toBe(true);
    expect(JSON.stringify(deaconGiving)).not.toMatch(/donorName/);
    const deaconKids = await sectionFor("kids", deacon, { role: "deacon", admin: false });
    expect(deaconKids.allowed).toBe(false);
  });

  it("the how_are_we_doing tool returns aggregates and refuses what the role can't see", async () => {
    const r = await executeTool("how_are_we_doing", { area: "giving" }, await ctx(plain));
    expect(r.content).toContain("not_available");
    const all = JSON.parse((await executeTool("how_are_we_doing", { area: "all" }, await ctx(pastor))).content);
    expect(all.sections).toHaveLength(7);
  });

  it("drafts the monthly report into the leader's own Drafts, never sending, and refuses sensitive details", async () => {
    const draft = await draftMonthlyReport(pastor, { narrative: "A good month. Giving and income kept pace with the budget, and the greeters team grew." });
    expect(draft).toMatchObject({ kind: "report", channel: "email", status: "needs_review" });
    expect(draft.recipients).toEqual([expect.objectContaining({ personId: `leader:${pastor.leaderId}`, email: pastor.email })]);
    expect(draft.baseText).toContain("The numbers");
    await expect(draftMonthlyReport(pastor, { narrative: "Pray for the family going through a divorce." })).rejects.toThrow(/Not drafted/);
    const viaTool = await executeTool("draft_monthly_report", {}, await ctx(pastor));
    expect(viaTool.isError).toBe(false);
    expect((await listDrafts(pastor)).filter((d) => d.kind === "report")).toHaveLength(2);
  });
});

describe("Mesa network", () => {
  it("scrubs people out: contacts, addresses and every known name, but keeps scripture and virtue words", () => {
    const names = ["Sarah Kim", "James Okafor", "Grace Lee"];
    const r = scrubText("Thanks to Sarah Kim (sarah@example.org, 413-555-0142) and Okafor! Meet at 35 Notch Road. A series on James about grace. Ask @sarahk or Sarah's group. https://x.org/p?u=42", names);
    expect(r.text).not.toMatch(/Sarah|Kim|Okafor|example\.org|555|Notch|@sarahk|u=42/);
    expect(r.text).toContain("A series on James about grace");
    expect(r.removed.map((x) => x.kind).sort()).toEqual(["address", "email", "handle", "link", "name", "phone"]);
    expect(nameTerms(["Grace Lee"])).toEqual(["Grace Lee", "Lee"]);
  });

  it("connects only after an admin at each church says yes, and only then shares", async () => {
    expect((await networkState(pastor)).links).toEqual([]); // no connected churches by default
    await expect(createInvite(plain, { role: "leader", admin: false })).rejects.toThrow(/administrator/);
    const { code } = await createInvite(pastor, { role: "pastor", admin: true });
    await expect(redeemInvite(pastor, { role: "pastor", admin: true }, code)).rejects.toThrow();
    const { code: code2 } = await createInvite(pastor, { role: "pastor", admin: true });
    await expect(redeemInvite(otherAdmin, { role: "pastor", admin: false }, code2)).rejects.toThrow(/administrator/);
    await redeemInvite(otherAdmin, { role: "pastor", admin: true }, code2);
    await expect(redeemInvite(otherAdmin, { role: "pastor", admin: true }, code2)).rejects.toThrow(/isn't valid/); // single use
    expect((await networkState(pastor)).links[0]).toMatchObject({ peer: "other-church", status: "awaiting_us" });
    expect((await networkState(otherAdmin)).links[0]).toMatchObject({ peer: "demo", status: "awaiting_them" });

    await share(pastor, { role: "pastor", admin: true }, { kind: "series_outline", title: "Faith at work", body: "Six weeks in James.", tags: ["james"], scripture: "James 1–5" });
    expect((await searchNetwork(otherAdmin, "james")).results).toHaveLength(0); // not connected yet

    await answerRequest(pastor, { role: "pastor", admin: true }, "other-church", true);
    expect((await networkState(otherAdmin)).links[0].status).toBe("connected");
    const found = await searchNetwork(otherAdmin, "find a church that's done a series on James");
    expect(found.results[0]).toMatchObject({ title: "Faith at work", church: "demo" });
    expect(Object.keys(found.results[0])).not.toContain("sharedBy");

    await disconnect(otherAdmin, { role: "pastor", admin: true }, "demo");
    expect((await networkState(pastor)).links).toEqual([]);
    expect((await searchNetwork(otherAdmin, "james")).results).toHaveLength(0);
  });

  it("a declined request leaves no connection", async () => {
    const { code } = await createInvite(pastor, { role: "pastor", admin: true });
    await redeemInvite(otherAdmin, { role: "pastor", admin: true }, code);
    await answerRequest(pastor, { role: "pastor", admin: true }, "other-church", false);
    expect((await networkState(pastor)).links).toEqual([]);
    expect((await networkState(otherAdmin)).links).toEqual([]);
  });

  it("previews exactly what is stored, scrubbed of the church's own people; sharing needs network.share", async () => {
    useFixtureChurch();
    const input = { kind: "training_doc" as const, title: "Greeter basics with Sarah Kim", body: "Call Marcus Bell at (413) 555-0101 if you can't make it. Ana López leads the team.", tags: [] };
    const preview = await previewShare(pastor, input);
    expect(preview.item.title).toBe("Greeter basics with [name removed]");
    expect(preview.item.body).not.toMatch(/Marcus|Bell|Ana|López|555/);
    await expect(share(deacon, { role: "deacon", admin: false }, input)).rejects.toThrow(/pastors and staff/);
    const item = await share(pastor, { role: "pastor", admin: true }, input);
    expect(item.title).toBe(preview.item.title);
    expect(item.body).toBe(preview.item.body);
  });

  it("offers one clearly fictional example church, and Barnabas can search it", async () => {
    await addExampleChurch(pastor, { role: "pastor", admin: true });
    const links = (await networkState(pastor)).links;
    expect(links).toEqual([expect.objectContaining({ peerName: "Example church (demo)", status: "connected", example: true })]);
    const r = JSON.parse((await executeTool("search_network", { query: "a series on James" }, await ctx(pastor))).content);
    expect(r.results[0]).toMatchObject({ church: "Example church (demo)" });
    const none = await executeTool("search_network", { query: "James" }, await ctx(otherAdmin));
    expect(none.content).toMatch(/isn't connected/);
  });
});
