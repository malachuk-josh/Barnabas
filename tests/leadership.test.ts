import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { churchData } from "@/lib/chms";
import { LEADERSHIP_FIELD_ID, LEADERSHIP_GROUP_ID, addLeadership, emptyPeople, loadPeople, updatePeople } from "@/lib/people/store";
import { freshStore } from "./helpers";

describe("the leadership team in the directory", () => {
  beforeEach(() => {
    freshStore();
    vi.stubEnv("BARNABAS_SKIP_LEADER_SEED", "0");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("adds the published leaders and Adam Malachuk once, with roles only and no made-up details", async () => {
    const book = await loadPeople("demo");
    const names = book.people.map((p) => `${p.firstName} ${p.lastName}`).sort();
    expect(names).toEqual(["Aaron Malachuk", "Adam Malachuk", "Cal Najimy", "Eric Malachuk", "Ethan Malachuk", "Micah Hayre", "Travis Willette"]);
    for (const p of book.people) {
      expect(p.leadership).toBe(true);
      expect(p.phone ?? p.address ?? p.birthdate).toBeUndefined();
      // Only the email the church gave (Ethan's) is on a record.
      expect(p.email).toBe(p.firstName === "Ethan" ? "ethanmalachuk@gmail.com" : undefined);
    }
    const adam = book.people.find((p) => p.firstName === "Adam")!;
    expect(adam.custom[LEADERSHIP_FIELD_ID]).toBe("Worship Leader");
    expect(book.people.find((p) => p.firstName === "Aaron")!.id).toBe("p19"); // the id Serve's rosters use
    expect(book.groups.find((g) => g.id === LEADERSHIP_GROUP_ID)!.memberIds).toHaveLength(7);
    // Opening it again doesn't add anyone twice.
    expect((await loadPeople("demo")).people).toHaveLength(7);
  });

  it("isn't added back after the church removes them", async () => {
    await loadPeople("demo");
    await updatePeople("demo", ["people"], (b) => {
      b.people = [];
    });
    expect((await loadPeople("demo")).people).toHaveLength(0);
  });

  it("marks a leader who was already imported instead of adding a duplicate", () => {
    const book = emptyPeople();
    book.people.push({ id: "imp1", firstName: "Ethan", lastName: "Malachuk", status: "member", language: "en", custom: {}, createdAt: 0, updatedAt: 0 });
    addLeadership(book, [{ name: "Ethan Malachuk", title: "Lead Pastor" }]);
    expect(book.people).toHaveLength(1);
    expect(book.people[0]!.leadership).toBe(true);
    expect(book.people[0]!.custom[LEADERSHIP_FIELD_ID]).toBe("Lead Pastor");
  });

  it("Barnabas sees the directory with the leaders, and the home radar still finds Aaron by his roster id", async () => {
    await loadPeople("demo");
    const people = await churchData().listPeople();
    expect(people.some((p) => p.id === "p19" && p.name === "Aaron Malachuk")).toBe(true);
  });
});

describe("a leader whose email the church gave", () => {
  beforeEach(() => freshStore());

  it("starts with their profile filled in from the leadership list at first sign-in", async () => {
    const { ensureProfile } = await import("@/lib/profile");
    const ethan = { churchId: "demo", leaderId: "ethan1", name: "Ethan", email: "EthanMalachuk@gmail.com", role: "" };
    const p = await ensureProfile(ethan);
    expect(p.name).toBe("Ethan Malachuk");
    expect(p.preferredName).toBe("Pastor Ethan");
    expect(p.role).toBe("Lead Pastor");
    expect(p.ministries).toEqual(["Bible teaching"]);
    expect(p.about).toMatch(/Lead Pastor since 2024/);
    const other = await ensureProfile({ churchId: "demo", leaderId: "x1", name: "Sam", email: "sam@example.org", role: "Elder" });
    expect(other.name).toBe("Sam");
    expect(other.about).toBe("");
  });

  it("gets that email on an existing directory record", async () => {
    vi.stubEnv("BARNABAS_SKIP_LEADER_SEED", "0");
    await updatePeople("demo", ["meta", "people"], (b) => {
      b.meta.leadersAddedAt = 1;
      b.people.push({ id: "ldr-ethan-malachuk", firstName: "Ethan", lastName: "Malachuk", status: "member", language: "en", leadership: true, custom: {}, createdAt: 0, updatedAt: 0 });
    });
    const book = await loadPeople("demo");
    expect(book.people.find((p) => p.firstName === "Ethan")!.email).toBe("ethanmalachuk@gmail.com");
    vi.unstubAllEnvs();
  });
});
