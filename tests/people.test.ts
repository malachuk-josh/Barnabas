import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { Leader } from "@/lib/auth/session";
import { churchData, churchSource, setChurchData } from "@/lib/chms";
import { ConnectedChurch } from "@/lib/chms/connected";
import { loadBooks, resetBooks, updateBooks } from "@/lib/finance/store";
import { gatheringFor, readDate, readRole, readStatus, runImport, undoImport } from "@/lib/migrate/run";
import { splitName } from "@/lib/migrate/match";
import { xlsxToCsv } from "@/lib/migrate/xlsx";
import { addNote, duplicates, mergePeople, peopleActor, personView, recordAttendance, saveGroup, savePerson, setArchived } from "@/lib/people/service";
import { loadPeople } from "@/lib/people/store";
import { buildExport } from "@/lib/exports";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "pppp0001", name: "Pastor Test", email: "pastor@example.org", role: "Pastor" };
const deacon: Leader = { churchId: "demo", leaderId: "pppp0002", name: "Deacon Test", email: "deacon@example.org", role: "Deacon" };
const plain: Leader = { churchId: "demo", leaderId: "pppp0003", name: "Leader Test", email: "leader@example.org", role: "Leader" };

beforeEach(async () => {
  freshStore();
  setChurchData(new ConnectedChurch("demo", undefined, 0));
  vi.stubEnv("BARNABAS_ADMIN_EMAILS", "pastor@example.org");
  for (const l of [pastor, deacon, plain]) await recordSignIn(l);
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
});

const CHURCHTRAC_PEOPLE = [
  "Person ID,First Name,Last Name,Nickname,Email,Mobile Phone,Address,City,State,Zip,Birthdate,Anniversary,Member Status,Membership Date,Family,Family Position,Groups,T-Shirt Size",
  "101,Jordan,Example,,jordan@example.org,(413) 555-0100,1 Test Way,Testville,MA,01200,03/04/1980,06/12/2005,Member,01/15/2010,Example Family,Head of Household,\"Tuesday Growth Group, Greeters Team\",L",
  "102,Riley,Example,Ri,,413.555.0101,1 Test Way,Testville,MA,01200,7/9/1982,06/12/2005,Member,,Example Family,Spouse,Tuesday Growth Group,M",
  "103,Casey,Sample,,not-an-email,,,,,,,,Visitor,,Sample,,,",
  "104,,,,,,,,,,,,,,,,,",
  "101,Jordan,Example,,jordan@example.org,,,,,,,,,,,,,",
].join("\n");

describe("the People database", () => {
  it("starts on the demo church and switches to the church's own people once someone is added", async () => {
    expect(await churchSource()).toBe("demo");
    const a = await peopleActor(pastor);
    const p = await savePerson(a, { firstName: "Jordan", lastName: "Example", email: "Jordan@Example.org", phone: "413-555-0100" });
    expect(p).toMatchObject({ email: "jordan@example.org", phone: "+14135550100", status: "regular" });
    expect(await churchSource()).toBe("native");
    expect((await churchData().findPeople("jordan")).map((x) => x.id)).toEqual([p.id]);
    expect((await churchData().leadership()).some((l) => l.name === "Ethan Malachuk")).toBe(true);
  });

  it("checks roles: only people.edit edits; contacts and notes follow the care roles; the policy holds for notes", async () => {
    const a = await peopleActor(pastor);
    const p = await savePerson(a, { firstName: "Jordan", lastName: "Example", email: "jordan@example.org", birthdate: "1980-03-04" });
    await expect(savePerson(await peopleActor(plain), { firstName: "X" })).rejects.toThrow(/pastors and staff/);
    await expect(savePerson(await peopleActor(deacon), { firstName: "X" })).rejects.toThrow(/pastors and staff/);
    const book = await loadPeople("demo");
    const asLeader = personView(book, await peopleActor(plain), book.people[0]);
    expect(asLeader.contact).toBeNull();
    expect(asLeader.birthday).toBe("03-04");
    expect(personView(book, await peopleActor(deacon), book.people[0]).contact?.email).toBe("jordan@example.org");
    await expect(addNote(await peopleActor(plain), p.id, { text: "Prefers calls" })).rejects.toThrow();
    await expect(addNote(await peopleActor(deacon), p.id, { text: "Was diagnosed last week" })).rejects.toThrow(/policy/);
    await expect(addNote(await peopleActor(deacon), p.id, { text: "Prefers calls", private: true })).rejects.toThrow(/pastors/);
    expect((await addNote(await peopleActor(deacon), p.id, { text: "Prefers a call to a text" })).text).toBe("Prefers a call to a text");
    expect((await peopleActor({ ...plain, leaderId: "x" })).edit).toBe(false);
  });

  it("finds and merges duplicates, moving groups, attendance and giving links over", async () => {
    const a = await peopleActor(pastor);
    const keep = await savePerson(a, { firstName: "Jordan", lastName: "Example", email: "jordan@example.org" });
    const drop = await savePerson(a, { firstName: "Jordan", lastName: "Example", phone: "413-555-0100", birthdate: "1980-03-04" });
    const g = await saveGroup(a, { name: "Tuesday Growth Group", memberIds: [drop.id] });
    await recordAttendance(a, { date: "2026-11-08", kind: "worship", gathering: "sun-1045", presentIds: [drop.id] });
    await resetBooks("demo");
    await updateBooks("demo", ["gifts"], (b) => void b.gifts.push({ id: "gift_x", date: "2026-11-01", personId: drop.id, donorName: "Jordan Example", amount: 5000, fundId: "general", method: "cash", batchId: "b", txnId: "t", createdAt: 1, createdBy: "t" }));
    expect(duplicates(await loadPeople("demo"))).toEqual([expect.objectContaining({ reason: "Same name" })]);
    await mergePeople(a, keep.id, drop.id);
    const book = await loadPeople("demo");
    const kept = book.people.find((p) => p.id === keep.id)!;
    expect(kept).toMatchObject({ email: "jordan@example.org", phone: "+14135550100", birthdate: "1980-03-04" });
    expect(book.people.find((p) => p.id === drop.id)?.mergedInto).toBe(keep.id);
    expect(book.groups.find((x) => x.id === g.id)?.memberIds).toEqual([keep.id]);
    expect(book.attendance[0].personId).toBe(keep.id);
    expect((await loadBooks("demo")).gifts[0].personId).toBe(keep.id);
    expect((await churchData().getPerson(drop.id))?.id).toBe(keep.id); // old links follow the merge
    expect(duplicates(book)).toEqual([]);
    await setArchived(a, keep.id, true);
    expect(await churchData().listPeople()).toEqual([]);
  });

  it("attendance replaces a date's list, and the radar and reports read it", async () => {
    const a = await peopleActor(pastor);
    const p1 = await savePerson(a, { firstName: "A", lastName: "One" });
    const p2 = await savePerson(a, { firstName: "B", lastName: "Two" });
    await recordAttendance(a, { date: "2026-11-08", kind: "worship", gathering: "sun-1045", presentIds: [p1.id, p2.id] });
    await recordAttendance(a, { date: "2026-11-08", kind: "worship", gathering: "sun-1045", presentIds: [p1.id] });
    expect((await churchData().attendance("2026-11-01")).map((r) => r.personId)).toEqual([p1.id]);
    await expect(recordAttendance(await peopleActor(plain), { date: "2026-11-08", kind: "worship", gathering: "sun-1045", presentIds: [] })).rejects.toThrow();
  });
});

describe("Move your church to Barnabas", () => {
  it("reads the old system's dates, statuses and family positions", () => {
    expect(readDate("03/04/1980")).toBe("1980-03-04");
    expect(readDate("Nov 3, 2026")).toBe("2026-11-03");
    expect(readDate("3/4")).toBe("1900-03-04");
    expect(readDate("2/1/90")).toBe("1990-02-01");
    expect(readDate("2026-11-08 10:45")).toBe("2026-11-08");
    expect(readStatus("Active Member")).toBe("member");
    expect(readStatus("Regular Attender")).toBe("regular");
    expect(readStatus("First Time Guest")).toBe("visitor");
    expect(readRole("Head of Household")).toBe("head");
    expect(readRole("Wife")).toBe("spouse");
    expect(readRole("Son")).toBe("child");
    expect(splitName("Example, Jordan")).toEqual(["Jordan", "Example"]);
    expect(gatheringFor("8:30 Service", "2026-11-08")).toBe("sun-0830");
    expect(gatheringFor("Sunday Worship", "2026-11-08")).toBe("sun-0830");
  });

  it("previews ChurchTrac people with households, groups and skip reasons, saving nothing", async () => {
    const r = await runImport(pastor, { system: "churchtrac", file: "people", csv: CHURCHTRAC_PEOPLE, extraAsCustom: true }, false);
    expect(r.columns).toMatchObject({ externalId: 0, firstName: 1, lastName: 2, email: 4, phone: 5, household: 14, householdRole: 15, groups: 16 });
    expect(r.counts).toMatchObject({ total: 5, add: 3, skip: 2 });
    expect(r.skipped).toEqual(expect.arrayContaining([{ reason: "No name", count: 1 }, { reason: "Same person appears earlier in the file", count: 1 }]));
    expect(r.rows[2].detail).toMatch(/email couldn't be read/);
    expect((await loadPeople("demo")).people).toHaveLength(0);
  });

  it("imports once, re-runs idempotently, links households and groups, keeps extra columns, and undoes the batch", async () => {
    const first = await runImport(pastor, { system: "churchtrac", file: "people", csv: CHURCHTRAC_PEOPLE, fileName: "people.csv", extraAsCustom: true }, true);
    expect(first.counts.add).toBe(3);
    let book = await loadPeople("demo");
    const jordan = book.people.find((p) => p.firstName === "Jordan")!;
    expect(jordan).toMatchObject({ status: "member", membershipDate: "2010-01-15", birthdate: "1980-03-04", anniversary: "2005-06-12", householdRole: "head", address: { street: "1 Test Way", city: "Testville", state: "MA", zip: "01200" } });
    const riley = book.people.find((p) => p.firstName === "Riley")!;
    expect(riley.nickname).toBe("Ri");
    expect(riley.householdId).toBe(jordan.householdId);
    expect(book.households.find((h) => h.id === jordan.householdId)?.name).toBe("Example Family");
    expect(book.groups.map((g) => g.name).sort()).toEqual(["Greeters Team", "Tuesday Growth Group"]);
    expect(book.groups.find((g) => g.name === "Tuesday Growth Group")?.memberIds).toHaveLength(2);
    const shirt = book.fields.find((f) => f.label === "T-Shirt Size")!;
    expect(jordan.custom[shirt.id]).toBe("L");
    expect((await churchData().getPerson(jordan.id))?.smallGroup).toBe("Tuesday Growth Group");

    const again = await runImport(pastor, { system: "churchtrac", file: "people", csv: CHURCHTRAC_PEOPLE, extraAsCustom: true }, true);
    expect(again.counts).toMatchObject({ add: 0, update: 0, same: 3 });
    expect((await loadPeople("demo")).people).toHaveLength(3);

    const changed = await runImport(pastor, { system: "churchtrac", file: "people", csv: CHURCHTRAC_PEOPLE.replace("(413) 555-0100", "(413) 555-0199") }, true);
    expect(changed.counts.update).toBe(1);
    expect((await loadPeople("demo")).people.find((p) => p.id === jordan.id)?.phone).toBe("+14135550199");
    await undoImport(pastor, changed.batchId!);
    expect((await loadPeople("demo")).people.find((p) => p.id === jordan.id)?.phone).toBe("+14135550100");

    await undoImport(pastor, first.batchId!);
    book = await loadPeople("demo");
    expect(book.people).toHaveLength(0);
    expect(book.groups).toHaveLength(0);
    expect(book.households).toHaveLength(0);
    expect(book.imports.find((b) => b.id === first.batchId)?.undoneAt).toBeTruthy();
    await expect(undoImport(pastor, first.batchId!)).rejects.toThrow(/already undone/);
    expect(await churchSource()).toBe("demo");
  });

  it("takes a Planning Center People export and an .xlsx workbook", async () => {
    const pco = "First Name,Last Name,Home Email,Mobile Phone Number,Household Name,Birthdate,Membership\nAvery,Sample,avery@example.org,+1 413 555 0110,Sample Household,1990-02-01,Member\n";
    // A real workbook: the birthdate is a date cell, as Excel and Planning Center's XLSX write it.
    const wb = XLSX.utils.book_new();
    const rows = pco.trim().split("\n").map((l) => l.split(","));
    const sheet = XLSX.utils.aoa_to_sheet([rows[0], [...rows[1].slice(0, 5), new Date(Date.UTC(1990, 1, 1)), rows[1][6]]], { cellDates: true });
    XLSX.utils.book_append_sheet(wb, sheet, "People");
    const csv = xlsxToCsv(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const r = await runImport(pastor, { system: "planning_center", file: "people", csv }, true);
    expect(r.columns).toMatchObject({ email: 2, phone: 3, household: 4, birthdate: 5, status: 6 });
    const p = (await loadPeople("demo")).people[0];
    expect(p).toMatchObject({ firstName: "Avery", email: "avery@example.org", phone: "+14135550110", status: "member", birthdate: "1990-02-01" });
  });

  it("groups and attendance files are matched to people, with reasons for what's skipped", async () => {
    await runImport(pastor, { system: "churchtrac", file: "people", csv: CHURCHTRAC_PEOPLE }, true);
    const groups = await runImport(pastor, { system: "churchtrac", file: "groups", csv: "Group,Name,Role\nMen's Breakfast,\"Example, Jordan\",Leader\nMen's Breakfast,Nobody Here,Member\n" }, true);
    expect(groups.counts).toMatchObject({ add: 1, skip: 1 });
    expect(groups.skipped[0].reason).toMatch(/import people first/);
    const g = (await loadPeople("demo")).groups.find((x) => x.name === "Men's Breakfast")!;
    expect(g.leaderIds).toHaveLength(1);
    const att = "Date,First Name,Last Name,Event,Present\n11/08/2026,Jordan,Example,10:45 Worship,Yes\n11/08/2026,Riley,Example,Men's Breakfast,Yes\n11/08/2026,Casey,Sample,10:45 Worship,No\nnot a date,Jordan,Example,Worship,Yes\n";
    const r = await runImport(pastor, { system: "churchtrac", file: "attendance", csv: att }, true);
    expect(r.counts).toMatchObject({ add: 2, skip: 2 });
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(["Marked absent (only who was there is kept)", "The date couldn't be read"]);
    const rows = (await loadPeople("demo")).attendance;
    expect(rows.find((a) => a.kind === "worship")?.gathering).toBe("sun-1045");
    expect(rows.find((a) => a.kind === "group")?.groupId).toBe(g.id);
    expect((await runImport(pastor, { system: "churchtrac", file: "attendance", csv: att }, true)).counts.add).toBe(0);
  });

  it("giving history goes into Finance, linked to the directory, with new funds, idempotent and undoable", async () => {
    await resetBooks("demo");
    await runImport(pastor, { system: "churchtrac", file: "people", csv: CHURCHTRAC_PEOPLE }, true);
    const csv = "Date,Name,Email,Amount,Fund,Payment Type,Check #\n11/02/2026,Jordan Example,jordan@example.org,50.00,Tithes,Check,1042\n11/02/2026,Someone Else,,25.00,Youth Camp,Cash,\n11/09/2026,Riley Example,,0,General,Cash,\n";
    const preview = await runImport(pastor, { system: "churchtrac", file: "giving", csv }, false);
    expect(preview.counts).toMatchObject({ add: 2, skip: 1 });
    expect(preview.extras?.newFunds).toEqual(["Youth Camp"]);
    const r = await runImport(pastor, { system: "churchtrac", file: "giving", csv }, true);
    let books = await loadBooks("demo");
    expect(books.chart.funds.some((f) => f.name === "Youth Camp" && f.restricted)).toBe(true);
    const jordan = (await loadPeople("demo")).people.find((p) => p.firstName === "Jordan")!;
    expect(books.gifts.find((g) => g.amount === 5000)?.personId).toBe(jordan.id);
    expect((await runImport(pastor, { system: "churchtrac", file: "giving", csv }, true)).counts.add).toBe(0);
    expect((await loadBooks("demo")).gifts).toHaveLength(2);
    await undoImport(pastor, r.batchId!);
    books = await loadBooks("demo");
    expect(books.gifts).toHaveLength(0);
    expect(books.transactions.filter((t) => t.source === "import")).toHaveLength(0);
    expect(books.chart.funds.some((f) => f.name === "Youth Camp")).toBe(false);
  });

  it("exports every field of the directory for people.export", async () => {
    await runImport(pastor, { system: "churchtrac", file: "people", csv: CHURCHTRAC_PEOPLE, extraAsCustom: true }, true);
    const out = await buildExport(pastor, { role: "pastor", admin: true }, "people");
    const [head, first] = out.csv.split("\r\n");
    expect(head).toContain("Member since");
    expect(head).toContain("T-Shirt Size");
    expect(first).toContain("Example Family");
    await expect(buildExport(deacon, { role: "deacon", admin: false }, "people")).rejects.toThrow();
  });
});
