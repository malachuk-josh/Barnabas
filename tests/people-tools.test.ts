import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";
import { setChurchData } from "@/lib/chms";
import { ConnectedChurch } from "@/lib/chms/connected";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { PEOPLE_TOOL_NAMES } from "@/lib/engine/people-tools";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";
import { executeTool, TOOL_DEFS, toolNamesFor, type ToolContext } from "@/lib/engine/tools";
import { peopleActor, saveGroup, saveHousehold, savePerson } from "@/lib/people/service";
import { loadPeople } from "@/lib/people/store";
import { accessFor, recordSignIn, setLeaderRole, setPersonLevel } from "@/lib/team";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "pt000001", name: "Pastor Test", email: "pastor@example.org", role: "Pastor" };
const deacon: Leader = { churchId: "demo", leaderId: "pt000002", name: "Deacon Test", email: "deacon@example.org", role: "Deacon" };
const member: Leader = { churchId: "demo", leaderId: "pt000003", name: "Member Test", email: "member@example.org", role: "Member" };
const team: Leader = { churchId: "demo", leaderId: "pt000004", name: "Team Test", email: "team@example.org", role: "Care" };

beforeEach(async () => {
  freshStore();
  setChurchData(new ConnectedChurch("demo", undefined, 0));
  vi.stubEnv("BARNABAS_ADMIN_EMAILS", "pastor@example.org");
  for (const l of [pastor, deacon, member, team]) await recordSignIn(l);
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
  await setPersonLevel("demo", member.leaderId, { level: "member" }, "test");
  await setPersonLevel("demo", team.leaderId, { level: "team", teamRole: "care" }, "test");
});

let n = 0;
async function ctxFor(leader: Leader, offRecord = false) {
  const meta: ConversationMeta = { id: `conv_pt_${n++}`, title: "t", mode: "voice", offRecord, createdAt: 1, updatedAt: 1, context: "", turns: 1 };
  await createConversation(leader, meta);
  let turn = 0;
  return (text: string): ToolContext => ({ leader, meta: Object.assign(meta, { turns: ++turn }), turnStartedAt: Date.now(), lastUserText: text });
}
const run = (name: string, input: unknown, ctx: ToolContext) => executeTool(name, input, ctx);
const body = (r: { content: string }) => JSON.parse(r.content);
const person = async (id: string) => (await loadPeople("demo")).people.find((p) => p.id === id)!;
const newPerson = async (input: Parameters<typeof savePerson>[1]) => savePerson(await peopleActor(pastor), input);

describe("directory tools", () => {
  it("adds a person only after a yes, and links to the new record", async () => {
    const ctx = await ctxFor(pastor);
    const input = { first_name: "Ruth", last_name: "Moab", email: "Ruth@Example.org", phone: "413-555-0199", status: "visitor" };
    const ask = await run("add_person", input, ctx("Add Ruth Moab to the directory"));
    expect(ask.isError).toBe(true);
    expect(ask.content).toMatch(/Not confirmed yet.*Ruth Moab.*visitor.*ruth@example.org/);
    expect((await loadPeople("demo")).people.some((p) => p.firstName === "Ruth")).toBe(false);
    const done = await run("add_person", input, ctx("Yes"));
    expect(done.isError).toBe(false);
    const id = body(done).person_id;
    expect(await person(id)).toMatchObject({ firstName: "Ruth", email: "ruth@example.org", phone: "+14135550199", status: "visitor" });
    expect(done.links).toEqual([{ label: "Open Ruth Moab's record", href: `/people/${id}` }]);
  });

  it("a changed detail asks again instead of running", async () => {
    const ctx = await ctxFor(pastor);
    await run("add_person", { first_name: "Ruth", last_name: "Moab" }, ctx("Add Ruth Moab"));
    const changed = await run("add_person", { first_name: "Ruth", last_name: "Moab", email: "ruth@example.org" }, ctx("Yes"));
    expect(changed.content).toMatch(/Not confirmed yet/);
    expect((await loadPeople("demo")).people.some((p) => p.firstName === "Ruth")).toBe(false);
    const no = await run("add_person", { first_name: "Ruth", last_name: "Moab", email: "ruth@example.org" }, ctx("No, wait"));
    expect(no.content).toMatch(/Not confirmed yet/);
    expect((await loadPeople("demo")).people.some((p) => p.firstName === "Ruth")).toBe(false);
  });

  it("returns likely duplicates instead of adding, and adds someone new only when the leader says so", async () => {
    const existing = await newPerson({ firstName: "Jordan", lastName: "Example", email: "jordan@example.org" });
    const ctx = await ctxFor(pastor);
    const byEmail = await run("add_person", { first_name: "Jo", last_name: "Sample", email: "JORDAN@example.org" }, ctx("Add Jo Sample"));
    expect(byEmail.isError).toBe(true);
    expect(body(byEmail)).toMatchObject({ not_added: true, likely_matches: [{ person_id: existing.id, why: "same email" }] });
    expect(byEmail.links?.[0].href).toBe(`/people/${existing.id}`);

    const byName = await run("add_person", { first_name: "jordan", last_name: "EXAMPLE" }, ctx("Add Jordan Example"));
    expect(body(byName).likely_matches[0]).toMatchObject({ person_id: existing.id, why: "same name" });
    // A yes alone doesn't add over a likely match: the model has to say it's someone new.
    expect(body(await run("add_person", { first_name: "jordan", last_name: "EXAMPLE" }, ctx("Yes"))).not_added).toBe(true);
    const confirm = await run("add_person", { first_name: "jordan", last_name: "EXAMPLE", not_a_duplicate: true }, ctx("He's someone new"));
    expect(confirm.content).toMatch(/Not confirmed yet/);
    const added = await run("add_person", { first_name: "jordan", last_name: "EXAMPLE", not_a_duplicate: true }, ctx("Yes, add him"));
    expect(added.isError).toBe(false);
    expect((await loadPeople("demo")).people.filter((p) => p.lastName.toLowerCase() === "example")).toHaveLength(2);
  });

  it("refuses a leader without people.edit, before asking", async () => {
    const p = await newPerson({ firstName: "Jordan", lastName: "Example" });
    const ctx = await ctxFor(deacon);
    for (const [name, input] of [
      ["add_person", { first_name: "X" }],
      ["update_person", { person_id: p.id, email: "x@example.org" }],
      ["add_to_household", { person_id: p.id, new_household: "Example Family", role: "head" }],
      ["add_to_group", { person_id: p.id, group: "anything" }],
      ["remove_from_group", { person_id: p.id, group: "anything" }],
      ["archive_person", { person_id: p.id }],
      ["merge_people", { keep_id: p.id, duplicate_id: "per_x" }],
    ] as const) {
      const r = await run(name, input, ctx("Do it"));
      expect(r.isError, name).toBe(true);
      expect(r.content, name).toMatch(/Only pastors and staff/);
    }
  });

  it("updates a record showing old → new, and links to it", async () => {
    const p = await newPerson({ firstName: "Jordan", lastName: "Example", email: "jordan@example.org", status: "visitor", address: { city: "Testville", state: "MA" } });
    const ctx = await ctxFor(pastor);
    const input = { person_id: p.id, email: "jordan.e@example.org", status: "member", address: { street: "1 Test Way" } };
    const ask = await run("update_person", input, ctx("Update Jordan's email and make him a member"));
    expect(ask.content).toContain("Email: jordan@example.org → jordan.e@example.org");
    expect(ask.content).toContain("Status: Visitor → Member");
    expect(ask.content).toContain("Address: Testville, MA → 1 Test Way, Testville, MA");
    expect((await person(p.id)).email).toBe("jordan@example.org");
    const done = await run("update_person", input, ctx("Yes please"));
    expect(done.isError).toBe(false);
    expect(await person(p.id)).toMatchObject({ email: "jordan.e@example.org", status: "member", address: { street: "1 Test Way", city: "Testville", state: "MA" }, firstName: "Jordan" });
    expect(done.links).toEqual([{ label: "Open Jordan Example's record", href: `/people/${p.id}` }]);
    expect(body(await run("update_person", { person_id: p.id, status: "member" }, ctx("Make him a member"))).unchanged).toBe(true);
  });

  it("puts people in households", async () => {
    const a = await newPerson({ firstName: "Jordan", lastName: "Example" });
    const b = await newPerson({ firstName: "Riley", lastName: "Example" });
    const ctx = await ctxFor(pastor);
    const start = { person_id: a.id, new_household: "Example Family", role: "head" };
    expect((await run("add_to_household", start, ctx("Start a household for Jordan"))).content).toMatch(/new household, Example Family/);
    await run("add_to_household", start, ctx("Yes"));
    const join = { person_id: b.id, same_household_as: a.id, role: "spouse" };
    expect((await run("add_to_household", join, ctx("Riley is his wife"))).content).toMatch(/Example Family household as spouse/);
    const done = await run("add_to_household", join, ctx("Yes"));
    expect(done.links?.[0].href).toBe(`/people/${b.id}`);
    const book = await loadPeople("demo");
    const hh = book.households.find((h) => h.name === "Example Family")!;
    expect(book.people.filter((p) => p.householdId === hh.id).map((p) => [p.firstName, p.householdRole]).sort()).toEqual([["Jordan", "head"], ["Riley", "spouse"]]);
  });

  it("lists groups and adds and removes members after a yes", async () => {
    const p = await newPerson({ firstName: "Jordan", lastName: "Example" });
    const g = await saveGroup(await peopleActor(pastor), { name: "Tuesday Growth Group", meets: "Tuesdays 7 PM" });
    const ctx = await ctxFor(pastor);
    const list = await run("list_groups", {}, ctx("What groups do we have?"));
    expect(body(list).groups.some((x: { name: string }) => x.name === "Tuesday Growth Group")).toBe(true);
    expect(list.links).toEqual([{ label: "Open Groups", href: "/people/groups" }]);
    const add = { person_id: p.id, group: "tuesday growth", as_leader: true };
    expect((await run("add_to_group", add, ctx("Add Jordan to the Tuesday group as a leader"))).content).toMatch(/add Jordan Example to Tuesday Growth Group as a leader\?/);
    await run("add_to_group", add, ctx("Yes"));
    let group = (await loadPeople("demo")).groups.find((x) => x.id === g.id)!;
    expect(group).toMatchObject({ memberIds: [p.id], leaderIds: [p.id], meets: "Tuesdays 7 PM" });
    expect(body(await run("list_groups", { person_id: p.id }, ctx("Which groups is Jordan in?"))).groups[0]).toMatchObject({ name: "Tuesday Growth Group", leads: true });
    const rm = { person_id: p.id, group: g.id };
    await run("remove_from_group", rm, ctx("Take Jordan out of it"));
    await run("remove_from_group", rm, ctx("Yes"));
    group = (await loadPeople("demo")).groups.find((x) => x.id === g.id)!;
    expect(group).toMatchObject({ memberIds: [], leaderIds: [] });
  });

  it("adds notes by the care roles and the privacy policy", async () => {
    const p = await newPerson({ firstName: "Jordan", lastName: "Example" });
    const d = await ctxFor(deacon);
    const health = await run("add_person_note", { person_id: p.id, text: "Was diagnosed with cancer last week" }, d("Note that on Jordan's record"));
    expect(health.content).toMatch(/Not saved to the note.*health/);
    expect(d("x").meta.pending).toBeUndefined();
    const code = await run("add_person_note", { person_id: p.id, text: "The door code is 4512" }, d("Note that"));
    expect(code.content).toMatch(/never stores passwords and codes/);
    expect((await run("add_person_note", { person_id: p.id, text: "Prefers calls", private: true }, d("Private note"))).content).toMatch(/Only pastors/);
    const note = { person_id: p.id, text: "Prefers a call to a text" };
    expect((await run("add_person_note", note, d("Add a note"))).content).toMatch(/Not confirmed yet/);
    const done = await run("add_person_note", note, d("Yes"));
    expect(done.isError).toBe(false);
    expect(done.links?.[0].href).toBe(`/people/${p.id}`);
    expect((await loadPeople("demo")).notes.map((x) => x.text)).toEqual(["Prefers a call to a text"]);

    const off = await ctxFor(pastor, true);
    expect((await run("add_person_note", note, off("Add a note"))).content).toMatch(/off the record/);
  });

  it("archives and merges with a clear summary", async () => {
    const keep = await newPerson({ firstName: "Jordan", lastName: "Example", email: "jordan@example.org" });
    const drop = await newPerson({ firstName: "Jordan", lastName: "Example", phone: "413-555-0100" });
    await saveGroup(await peopleActor(pastor), { name: "Greeters", kind: "team", memberIds: [drop.id] });
    const ctx = await ctxFor(pastor);
    const merge = { keep_id: keep.id, duplicate_id: drop.id };
    const ask = await run("merge_people", merge, ctx("Merge the two Jordans"));
    expect(ask.content).toMatch(new RegExp(`merge Jordan Example \\(${drop.id}\\) into Jordan Example \\(${keep.id}\\)`));
    expect(ask.content).toMatch(/fills in mobile \+14135550100; adds them to Greeters/);
    expect(ask.content).toMatch(/duplicate is retired/);
    expect((await person(drop.id)).mergedInto).toBeUndefined();
    const done = await run("merge_people", merge, ctx("Yes"));
    expect(done.links).toEqual([{ label: "Open Jordan Example's record", href: `/people/${keep.id}` }]);
    expect((await person(drop.id)).mergedInto).toBe(keep.id);
    expect((await person(keep.id)).phone).toBe("+14135550100");
    expect((await run("update_person", { person_id: drop.id, email: "x@example.org" }, ctx("Change it"))).content).toMatch(/merged into Jordan Example/);

    const arch = { person_id: keep.id };
    expect((await run("archive_person", arch, ctx("Jordan moved away, archive him"))).content).toMatch(/archived, not deleted.*Greeters/);
    expect((await person(keep.id)).archivedAt).toBeUndefined();
    await run("archive_person", arch, ctx("Yes"));
    expect((await person(keep.id)).archivedAt).toBeTypeOf("number");
    await run("archive_person", { person_id: keep.id, archived: false }, ctx("Bring him back"));
    await run("archive_person", { person_id: keep.id, archived: false }, ctx("Yes"));
    expect((await person(keep.id)).archivedAt).toBeUndefined();
  });

  it("find_person and get_person_summary link to the person's page", async () => {
    const p = await newPerson({ firstName: "Ruth", lastName: "Moab" });
    const ctx = await ctxFor(pastor);
    const found = await run("find_person", { name: "Ruth" }, ctx("Find Ruth"));
    expect(found.links).toEqual([{ label: "Open Ruth Moab's record", href: `/people/${p.id}` }]);
    expect(body(found).matches[0].page).toBe(`/people/${p.id}`);
    const summary = await run("get_person_summary", { person_id: p.id }, ctx("How is Ruth doing?"));
    expect(summary.links).toEqual([{ label: "Open Ruth Moab's record", href: `/people/${p.id}` }]);
  });

  it("isn't offered at the Team or Member levels, and is refused there", async () => {
    for (const l of [member, team]) {
      const names = toolNamesFor(await accessFor(l))!;
      expect(names).not.toBeNull();
      for (const t of PEOPLE_TOOL_NAMES) expect(names, `${l.name} ${t}`).not.toContain(t);
      const ctx = await ctxFor(l);
      const r = await executeTool("add_person", { first_name: "X" }, { ...ctx("Add X"), toolNames: names });
      expect(r.content).toMatch(/isn't available/);
    }
    expect(toolNamesFor(await accessFor(pastor))).toBeNull();
    for (const t of PEOPLE_TOOL_NAMES) expect(TOOL_DEFS.some((d) => d.name === t)).toBe(true);
    expect(BARNABAS_SYSTEM).toContain("The directory");
  });

  it("existing household members keep their place when someone joins", async () => {
    const a = await newPerson({ firstName: "Jordan", lastName: "Example" });
    const kid = await newPerson({ firstName: "Sam", lastName: "Example", status: "child" });
    const hh = await saveHousehold(await peopleActor(pastor), { name: "Example Family", homePhone: "413-555-0111", members: [{ personId: a.id, role: "head" }, { personId: kid.id, role: "child" }] });
    const b = await newPerson({ firstName: "Riley", lastName: "Example" });
    const ctx = await ctxFor(pastor);
    const join = { person_id: b.id, household: "example family", role: "spouse" };
    await run("add_to_household", join, ctx("Riley joins the Example family"));
    await run("add_to_household", join, ctx("Yes"));
    const book = await loadPeople("demo");
    expect(book.households.find((h) => h.id === hh.id)?.homePhone).toBe("413-555-0111");
    expect(book.people.filter((p) => p.householdId === hh.id).map((p) => p.householdRole).sort()).toEqual(["child", "head", "spouse"]);
  });
});
