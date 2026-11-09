import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";
import { churchData, churchSource, setChurchData } from "@/lib/chms";
import { ConnectedChurch } from "@/lib/chms/connected";
import { commitPeople, previewPeople, readPeople } from "@/lib/chms/import";
import { backoff, PcoClient, type Page } from "@/lib/chms/pco";
import { mapPeople, pullPlanningCenter, SnapshotChurch } from "@/lib/chms/planning-center";
import { loadSnapshot, saveConnection, type ChmsSnapshot } from "@/lib/chms/snapshot";
import { mergePco, syncPlanningCenter } from "@/lib/chms/sync";
import { matchColumns, normHeader, toCsv } from "@/lib/csv/columns";
import { buildExport } from "@/lib/exports";
import { bankImportKeys } from "@/lib/finance/csv";
import { fundFor, methodFrom, readGiving } from "@/lib/finance/giving-import";
import { importGifts, importTransactions } from "@/lib/finance/service";
import { loadBooks, resetBooks } from "@/lib/finance/store";
import { freshStore } from "./helpers";

const admin: Leader = { churchId: "demo", leaderId: "aaaa0001", name: "Admin Test", email: "admin@example.org", role: "Pastor" };

/** A fake Planning Center: paginated people with included emails, phones and households. */
function fakePco(opts: { people: number; perPage?: number; rateLimitFirst?: boolean; services?: boolean }) {
  const perPage = opts.perPage ?? 2;
  const calls: string[] = [];
  let limited = Boolean(opts.rateLimitFirst);
  const f = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
    if (url.endsWith("/people/v2")) return json({ data: { id: "1", type: "Organization", attributes: { name: "Example Org" } } });
    if (url.includes("/people/v2/people")) {
      if (limited) {
        limited = false;
        return json({ errors: [{ title: "Rate limit" }] }, 429, { "Retry-After": "2" });
      }
      const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
      const ids = Array.from({ length: opts.people }, (_, i) => i + 1).slice(offset, offset + perPage);
      const page: Page = {
        data: ids.map((id) => ({
          id: String(id),
          type: "Person",
          attributes: { first_name: `Test${id}`, last_name: "Person", name: `Test${id} Person` },
          relationships: { emails: { data: [{ id: `e${id}`, type: "Email" }] }, phone_numbers: { data: [{ id: `ph${id}`, type: "PhoneNumber" }, { id: `pw${id}`, type: "PhoneNumber" }] }, households: { data: id <= 2 ? [{ id: "h1", type: "Household" }] : [] } },
        })),
        included: ids.flatMap((id) => [
          { id: `e${id}`, type: "Email", attributes: { address: `test${id}@example.org`, primary: true } },
          { id: `pw${id}`, type: "PhoneNumber", attributes: { number: `413-555-01${String(id).padStart(2, "0")}`, location: "Work", primary: false } },
          { id: `ph${id}`, type: "PhoneNumber", attributes: { number: `413-555-02${String(id).padStart(2, "0")}`, location: "Mobile", primary: false } },
          ...(id <= 2 ? [{ id: "h1", type: "Household", attributes: { name: "Person Household" } }] : []),
        ]),
        links: offset + perPage < opts.people ? { next: `https://api.planningcenteronline.com/people/v2/people?per_page=${perPage}&offset=${offset + perPage}` } : {},
      };
      return json(page);
    }
    if (url.includes("/services/v2/teams")) return json({ data: [{ id: "t1", type: "Team", attributes: { name: "Worship band" } }] });
    if (url.includes("/services/v2/service_types?")) return json({ data: [{ id: "st1", type: "ServiceType", attributes: { name: "Sunday" } }] });
    if (url.includes("/plans?")) return json({ data: [{ id: "pl1", type: "Plan", attributes: { sort_date: "2026-11-01T10:45:00Z" } }, { id: "pl2", type: "Plan", attributes: { sort_date: "2026-11-15T10:45:00Z" } }] });
    if (url.includes("/team_members")) {
      return json({ data: [{ id: "tm1", type: "PlanPerson", attributes: { status: "C" }, relationships: { person: { data: { id: "1", type: "Person" } }, team: { data: { id: "t1", type: "Team" } } } }] });
    }
    return json({ errors: [] }, 404);
  });
  return { f: f as unknown as typeof fetch, calls };
}

beforeEach(() => {
  freshStore();
  setChurchData(new ConnectedChurch("demo", undefined, 0));
  vi.stubEnv("BARNABAS_ADMIN_EMAILS", "admin@example.org");
});

describe("Planning Center client", () => {
  it("follows pagination and maps people, primary email, mobile phone and households", async () => {
    const { f, calls } = fakePco({ people: 5 });
    const client = new PcoClient({ appId: "app", secret: "sec", fetchImpl: f, sleep: async () => {} });
    const { snapshot } = await pullPlanningCenter(client, { includeServices: false });
    expect(calls.filter((c) => c.includes("/people/v2/people"))).toHaveLength(3);
    expect(snapshot.people).toHaveLength(5);
    const p1 = snapshot.people[0];
    expect(p1).toMatchObject({ id: "pco_1", name: "Test1 Person", firstName: "Test1", email: "test1@example.org", phone: "413-555-0201", household: "Person Household", language: "en" });
    expect(snapshot.households).toEqual([{ id: "pco_hh_h1", name: "Person Household", memberIds: ["pco_1", "pco_2"] }]);
  });

  it("backs off on 429 using Retry-After, and keeps under 100 requests per 20 seconds", async () => {
    const { f } = fakePco({ people: 2, rateLimitFirst: true });
    const sleeps: number[] = [];
    let now = 0;
    const client = new PcoClient({ appId: "a", secret: "s", fetchImpl: f, limit: 3, windowMs: 20_000, now: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms; } });
    await client.get("/people/v2/people");
    expect(sleeps[0]).toBe(2000);
    expect(client.retries).toBe(1);
    // Three requests fit in the window; the fourth waits for the window to roll.
    await client.get("/people/v2");
    await client.get("/people/v2");
    expect(sleeps.length).toBe(2);
    expect(sleeps[1]).toBeGreaterThanOrEqual(20_000 - 2000);
    expect(backoff(0)).toBe(1000);
    expect(backoff(10)).toBe(30_000);
  });

  it("gives up after repeated failures with a plain message, and refuses links outside Planning Center", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    const client = new PcoClient({ appId: "a", secret: "s", fetchImpl: f, maxRetries: 2, sleep: async () => {} });
    await expect(client.get("/people/v2/people")).rejects.toThrow(/Planning Center had a problem/);
    await expect(client.get("https://evil.example.com/x")).rejects.toThrow(/outside Planning Center/);
    const unauthorized = new PcoClient({ appId: "a", secret: "s", fetchImpl: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch });
    await expect(unauthorized.get("/people/v2")).rejects.toThrow(/PCO_APP_ID/);
  });

  it("maps Services teams and team members onto serving records and rosters", async () => {
    const { f } = fakePco({ people: 2, perPage: 10 });
    const client = new PcoClient({ appId: "a", secret: "s", fetchImpl: f, sleep: async () => {} });
    const { snapshot, plans } = await pullPlanningCenter(client, { includeServices: true, asOf: "2026-11-09" });
    expect(plans).toBe(2);
    expect(snapshot.teams).toEqual([{ id: "pco_team_t1", name: "Worship band" }]);
    expect(snapshot.serving).toEqual([
      { personId: "pco_1", teamId: "pco_team_t1", date: "2026-11-01", status: "served" },
      { personId: "pco_1", teamId: "pco_team_t1", date: "2026-11-15", status: "scheduled" },
    ]);
    expect(snapshot.rosters[0]).toMatchObject({ date: "2026-11-15", teamName: "Worship band" });
  });

  it("a sync replaces the demo directory, and the demo source goes away", async () => {
    expect(await churchSource()).toBe("demo");
    vi.stubEnv("PCO_APP_ID", "app");
    vi.stubEnv("PCO_SECRET", "secret");
    await saveConnection("demo", { provider: "planning_center", connectedAt: 1, connectedBy: admin.leaderId, includeServices: false });
    const { f } = fakePco({ people: 3 });
    const result = await syncPlanningCenter(admin, { client: new PcoClient({ appId: "app", secret: "secret", fetchImpl: f, sleep: async () => {} }) });
    expect(result.people).toBe(3);
    expect(await churchSource()).toBe("planning_center");
    const people = await churchData().listPeople();
    expect(people.map((p) => p.name)).toEqual(["Test1 Person", "Test2 Person", "Test3 Person"]);
    expect(await churchData().findPeople("test2")).toHaveLength(1);
    // Leadership and the weekly schedule still come from the church's published data.
    expect((await churchData().leadership()).some((l) => l.name === "Ethan Malachuk")).toBe(true);
  });

  it("merging keeps imported people Planning Center doesn't have", () => {
    const pulled = { ...mapPeople([], []), version: 1 as const, sources: ["planning_center" as const], syncedAt: 1, teams: [], serving: [], rosters: [] };
    pulled.people = [{ id: "pco_1", name: "A Person", firstName: "A", language: "en", email: "a@example.org", source: "planning_center", dedupeKey: "pco:1" }];
    const prev: ChmsSnapshot = { ...pulled, sources: ["import"], people: [
      { id: "imp_1", name: "A Person", firstName: "A", language: "en", email: "a@example.org", source: "import", dedupeKey: "e:a@example.org" },
      { id: "imp_2", name: "B Person", firstName: "B", language: "en", source: "import", dedupeKey: "n:b person|" },
    ] };
    const merged = mergePco(prev, pulled);
    expect(merged.people.map((p) => p.id)).toEqual(["pco_1", "imp_2"]);
    expect(merged.sources).toEqual(["planning_center", "import"]);
    expect(new SnapshotChurch(merged).source).toBe("planning_center");
  });
});

describe("CSV column matching", () => {
  it("tolerates header variations", () => {
    expect(normHeader(" E-mail Address ")).toBe("emailaddress");
    expect(matchColumns(["FirstName", "LAST_NAME", "E-mail", "Cell Phone", "Family Name"], { first: { exact: ["first name"] }, last: { exact: ["last name"] }, email: { exact: ["email", "e-mail"] }, phone: { exact: ["cell phone"] }, fam: { exact: ["family name"] } })).toEqual({ first: 0, last: 1, email: 2, phone: 3, fam: 4 });
    // A column is used once: "Mobile Phone" doesn't also become the generic phone match.
    expect(matchColumns(["Home Phone", "Mobile Phone"], { mobile: { exact: ["mobile phone"] }, other: { exact: [], partial: ["phone"] } })).toEqual({ mobile: 1, other: 0 });
    expect(toCsv(["a"], [["=SUM(A1)"], ['say "hi"']])).toBe("a\r\n'=SUM(A1)\r\n\"say \"\"hi\"\"\"\r\n");
  });
});

describe("people import", () => {
  const CSV = [
    "First Name,Last Name,E-mail,Mobile Phone,Family,Preferred Language",
    "Jordan,Example,Jordan@Example.org,(413) 555-0100,Example Family,English",
    "Riley,Example,,413.555.0101,Example Family,Spanish",
    "Jordan,Example,jordan@example.org,,Example Family,",
    ",,,,,",
    "Casey,Sample,not-an-email,,Sample,",
  ].join("\n");

  it("previews with matched columns, dedupe and problems, without saving", async () => {
    const p = await previewPeople("demo", CSV);
    expect(p.columns).toMatchObject({ firstName: 0, lastName: 1, email: 2, phone: 3, household: 4, language: 5 });
    expect(p.rows.map((r) => r.action)).toEqual(["add", "add", "duplicate", "add"]);
    expect(p.rows[0]).toMatchObject({ email: "jordan@example.org", phone: "+14135550100", household: "Example Family" });
    expect(p.rows[1].language).toBe("es");
    expect(p.rows[3].problem).toMatch(/email/);
    expect(p.counts).toMatchObject({ total: 4, add: 3, duplicate: 1, households: 2 });
    expect(await loadSnapshot("demo")).toBeNull();
  });

  it("dry run counts, commit saves, and a second import updates instead of adding", async () => {
    const dry = await commitPeople(admin, CSV, undefined, true);
    expect(dry).toMatchObject({ dryRun: true, counts: { add: 3 } });
    expect(await loadSnapshot("demo")).toBeNull();
    const first = await commitPeople(admin, CSV, undefined, false);
    expect(first).toMatchObject({ added: 3, updated: 0 });
    expect(await churchSource()).toBe("import");
    const again = await commitPeople(admin, CSV.replace("(413) 555-0100", "(413) 555-0199"), undefined, false);
    expect(again).toMatchObject({ added: 0, updated: 1 });
    const snap = (await loadSnapshot("demo"))!;
    expect(snap.people).toHaveLength(3);
    expect(snap.people.find((x) => x.email === "jordan@example.org")?.phone).toBe("+14135550199");
    expect(snap.households.find((h) => h.name === "Example Family")?.memberIds).toHaveLength(2);
  });

  it("accepts a manual mapping and 'Last, First' full names", () => {
    const csv = "Person,Contact\n\"Kim, Jordan\",jordan@example.org\n";
    const r = readPeople(csv, { fullName: 0, email: 1 });
    expect(r.rows[0]).toMatchObject({ name: "Jordan Kim", email: "jordan@example.org", action: "add" });
    expect(() => readPeople("Foo,Bar\n1,2\n")).toThrow(/name column/);
  });

  it("exports the directory as CSV only for roles with people.export", async () => {
    await commitPeople(admin, CSV, undefined, false);
    const out = await buildExport(admin, { role: "staff", admin: false }, "people");
    expect(out.rows).toBe(3);
    expect(out.csv.split("\r\n")[0]).toBe("Name,First name,Household,Email,Phone,Preferred language,Small group");
    await expect(buildExport(admin, { role: "deacon", admin: false }, "people")).rejects.toThrow(/role/);
    await expect(buildExport(admin, { role: "deacon", admin: false }, "giving-donors")).rejects.toThrow(/role/);
  });
});

describe("finance imports and dedupe", () => {
  it("bank rows get stable keys: same file twice adds nothing, identical rows in one file both import", async () => {
    await resetBooks("demo");
    const books = await loadBooks("demo");
    const bank = books.chart.accounts.find((a) => a.bank)!;
    const expense = books.chart.accounts.find((a) => a.type === "expense")!;
    const general = books.chart.funds[0];
    const rows = [
      { date: "2026-11-02", description: "Coffee", amount: -2000, accountId: expense.id, fundId: general.id },
      { date: "2026-11-02", description: "Coffee", amount: -2000, accountId: expense.id, fundId: general.id },
    ];
    const keys = bankImportKeys(bank.id, rows);
    expect(keys[0]).not.toBe(keys[1]);
    expect(bankImportKeys(bank.id, rows)).toEqual(keys);
    const first = await importTransactions(admin, { bankAccountId: bank.id, rows, skipDuplicates: false });
    expect(first.added).toBe(2);
    // Before the fix, unticking "skip duplicates" re-added both rows.
    const second = await importTransactions(admin, { bankAccountId: bank.id, rows, skipDuplicates: false });
    expect(second).toMatchObject({ added: 0, alreadyImported: 2 });
  });

  it("giving CSV: tolerant headers, fund matching, a dry run, and no double count on re-import", async () => {
    await resetBooks("demo");
    const books = await loadBooks("demo");
    const csv = [
      "Contribution Date,Contributor,Contribution Amount,Category,Payment Type,Check #",
      "11/02/2026,Jordan Example,$50.00,Tithes,Check,1042",
      "11/02/2026,Jordan Example,$50.00,Tithes,Check,1042",
      "11/02/2026,\"Example, Riley\",25,Missions,Credit Card,",
      "11/09/2026,Casey Sample,100,Youth Camp,Cash,",
      "bad,Nobody,10,General,Cash,",
    ].join("\n");
    const read = readGiving(csv, books, []);
    expect(read.columns).toMatchObject({ date: 0, donor: 1, amount: 2, fund: 3, method: 4, check: 5 });
    expect(read.counts).toMatchObject({ total: 5, add: 4, problems: 1, unmatchedFunds: 1 });
    expect(read.rows[2]).toMatchObject({ donorName: "Riley Example", method: "online", fundName: "Missions" });
    expect(read.rows[0].importKey).not.toBe(read.rows[1].importKey);
    const dry = await importGifts(admin, read.gifts, { dryRun: true });
    expect(dry).toMatchObject({ add: 4, deposits: 2, total: 22500 });
    expect((await loadBooks("demo")).gifts).toHaveLength(0);
    await importGifts(admin, read.gifts, { dryRun: false });
    const after = await loadBooks("demo");
    expect(after.gifts).toHaveLength(4);
    expect(after.transactions.filter((t) => t.source === "import")).toHaveLength(2);
    const again = readGiving(csv, after, []);
    expect(again.counts.add).toBe(0);
    expect((await importGifts(admin, again.gifts, { dryRun: false })).add).toBe(0);
    expect((await loadBooks("demo")).gifts).toHaveLength(4);
    expect(methodFrom("", "1001")).toBe("check");
    expect(fundFor(books, "Building Fund").fundId).toBe(books.chart.funds.find((f) => /building/i.test(f.name))!.id);
  });
});
