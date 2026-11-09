import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// API routes read the signed-in leader from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { can, ROLES, type Permission } from "@/lib/auth/roles";
import { budgetVsActual, copyBudget, elapsedFraction, health } from "@/lib/finance/budget";
import { defaultChart } from "@/lib/finance/chart";
import { bankRows, detectColumns, findDuplicate, normalizeDate, parseCsv, suggestAccount } from "@/lib/finance/csv";
import { contributionStatement, donorKey, dueOccurrences, givingTotals } from "@/lib/finance/giving";
import { accountActivity, accountBalance, fundBalances } from "@/lib/finance/ledger";
import { parseMoney } from "@/lib/finance/money";
import { reconcileState, finishReconciliation } from "@/lib/finance/reconcile";
import { recordGifts } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";
import type { Budget, Chart, Gift, Transaction } from "@/lib/finance/types";
import { givingSummary } from "@/lib/finance/views";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { listAudit } from "@/lib/data/records";
import { executeTool, type ToolContext } from "@/lib/engine/tools";
import { accessFor, recordSignIn, setLeaderRole } from "@/lib/team";
import { freshStore } from "./helpers";

let seq = 0;
function txn(date: string, direction: "in" | "out", lines: [string, string, number][], extra: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${seq++}`,
    date,
    description: "test",
    bankAccountId: "acct_1000",
    direction,
    lines: lines.map(([accountId, fundId, amount]) => ({ accountId, fundId, amount })),
    cleared: false,
    source: "manual",
    createdAt: seq,
    createdBy: "test",
    ...extra,
  };
}

function chartWithOpenings(): Chart {
  const chart = defaultChart();
  chart.funds.find((f) => f.id === "general")!.openingBalance = 10_000_00;
  chart.funds.find((f) => f.id === "missions")!.openingBalance = 2_000_00;
  chart.accounts.find((a) => a.id === "acct_1000")!.openingBalance = 12_000_00;
  return chart;
}

describe("roles and permissions", () => {
  const matrix: Record<Permission, string[]> = {
    "finance.view": ["pastor", "treasurer", "deacon"],
    "finance.edit": ["pastor", "treasurer"],
    "giving.donors": ["pastor", "treasurer"],
    "team.manage": [],
  };

  it("follows the role matrix", () => {
    for (const role of ROLES) {
      for (const [perm, allowed] of Object.entries(matrix)) {
        expect(can({ role, admin: false }, perm as Permission), `${role} ${perm}`).toBe(allowed.includes(role));
      }
    }
    expect(can({ role: "leader", admin: true }, "team.manage")).toBe(true);
    expect(can({ role: "leader", admin: true }, "finance.view")).toBe(false);
    expect(can(null, "finance.view")).toBe(false);
  });

  describe("leader records", () => {
    beforeEach(() => {
      freshStore();
      vi.stubEnv("BARNABAS_ADMIN_EMAILS", "Dana@Example.org, admin2@example.org");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("starts new leaders as leader, bootstrap admins as pastor, and keeps a role across sign-ins", async () => {
      const dana: Leader = { churchId: "demo", leaderId: "aaaa1111", name: "Dana", email: "dana@example.org", role: "Associate pastor" };
      const sam: Leader = { churchId: "demo", leaderId: "bbbb2222", name: "Sam", email: "sam@example.org", role: "" };
      await recordSignIn(dana);
      await recordSignIn(sam);
      expect(await accessFor(dana)).toEqual({ role: "pastor", admin: true });
      expect(await accessFor(sam)).toEqual({ role: "leader", admin: false });
      await setLeaderRole("demo", sam.leaderId, "treasurer", dana.leaderId);
      await recordSignIn(sam);
      expect((await accessFor(sam)).role).toBe("treasurer");
    });
  });
});

describe("budget vs actual", () => {
  it("measures the share of the year that has passed", () => {
    expect(elapsedFraction(2026, "2025-12-31")).toBe(0);
    expect(elapsedFraction(2026, "2026-12-31")).toBe(1);
    expect(elapsedFraction(2026, "2026-07-02")).toBeCloseTo(183 / 365, 5);
    expect(elapsedFraction(2024, "2024-12-30")).toBeCloseTo(365 / 366, 5);
  });

  it("computes actual, budget to date, variance, percent used and health", () => {
    const chart = chartWithOpenings();
    const budget: Budget = {
      year: 2026,
      notes: "",
      updatedAt: 0,
      updatedBy: "t",
      lines: [
        { accountId: "acct_4000", annual: 365_000_00, basis: "annual" },
        { accountId: "acct_5400", annual: 3_650_00, basis: "annual" },
        { accountId: "acct_5220", annual: 1_000_00, basis: "annual", timing: "seasonal" },
      ],
    };
    const txns = [
      txn("2026-01-10", "in", [["acct_4000", "general", 100_000_00]]),
      txn("2026-02-10", "in", [["acct_4000", "general", 70_000_00]]),
      txn("2026-02-11", "out", [["acct_5400", "general", 2_200_00]]),
      txn("2026-02-12", "in", [["acct_5400", "general", 200_00]]), // a refund
      txn("2026-01-05", "out", [["acct_5220", "general", 900_00]]),
      txn("2026-01-06", "out", [["acct_5300", "general", 50_00]]), // unbudgeted
      txn("2025-12-30", "out", [["acct_5400", "general", 999_00]]), // last year
    ];
    const r = budgetVsActual(chart, budget, txns, 2026, "2026-06-30"); // 181 days
    const kids = r.rows.find((x) => x.account.number === "5400")!;
    expect(kids.actual).toBe(2_000_00);
    expect(kids.toDate).toBe(Math.round(3_650_00 * (181 / 365)));
    expect(kids.variance).toBe(kids.toDate - 2_000_00);
    expect(kids.pctUsed).toBeCloseTo(54.8, 1);
    expect(kids.health).toBe("watch"); // 2,000 vs 1,810 to date: 10.5% ahead of pace

    const giving = r.rows.find((x) => x.account.number === "4000")!;
    expect(giving.actual).toBe(170_000_00);
    expect(giving.health).toBe("watch"); // 170k vs 181k: 94% of pace
    expect(giving.variance).toBe(170_000_00 - 181_000_00);

    expect(r.rows.find((x) => x.account.number === "5220")!.health).toBe("on_track"); // seasonal, under the year's budget
    const unbudgeted = r.rows.find((x) => x.account.number === "5300")!;
    expect(unbudgeted.budgeted).toBe(false);
    expect(unbudgeted.health).toBe("over");
    expect(r.totals.expense.actual).toBe(2_000_00 + 900_00 + 50_00);
  });

  it("calls an expense over once it passes the year's budget, and income behind below 85% of pace", () => {
    expect(health("expense", 1001, 1000, 0.5)).toBe("over");
    expect(health("expense", 500, 1000, 0.5)).toBe("on_track");
    expect(health("expense", 560, 1000, 0.5)).toBe("watch");
    expect(health("expense", 900, 1000, 0.5, "seasonal")).toBe("on_track");
    expect(health("income", 400, 1000, 0.5)).toBe("behind");
    expect(health("income", 480, 1000, 0.5)).toBe("on_track");
  });

  it("copies last year's budget into a new year", () => {
    const b: Budget = { year: 2026, lines: [{ accountId: "acct_4000", annual: 100, basis: "annual" }], notes: "Plan", updatedAt: 0, updatedBy: "x" };
    const c = copyBudget(b, 2027, "me");
    expect(c.year).toBe(2027);
    expect(c.lines).toEqual(b.lines);
    expect(c.lines[0]).not.toBe(b.lines[0]);
    expect(c.notes).toContain("Copied from 2026");
  });
});

describe("fund balances", () => {
  it("tracks restricted funds separately from the General fund", () => {
    const chart = chartWithOpenings();
    const txns = [
      txn("2026-03-01", "in", [["acct_4000", "general", 5_000_00], ["acct_4100", "missions", 1_500_00]]),
      txn("2026-03-02", "out", [["acct_5100", "missions", 2_000_00]]),
      txn("2026-03-03", "out", [["acct_5300", "general", 300_00]]),
      txn("2026-03-04", "out", [["acct_1010", "general", 1_000_00]]), // transfer to savings: no change to the fund
      txn("2026-04-01", "out", [["acct_5300", "general", 999_00]]),
    ];
    const balances = Object.fromEntries(fundBalances(chart, txns, "2026-03-31").map((f) => [f.fund.id, f.balance]));
    expect(balances.general).toBe(10_000_00 + 5_000_00 - 300_00);
    expect(balances.missions).toBe(2_000_00 + 1_500_00 - 2_000_00);
    expect(balances.building).toBe(0);

    const checking = chart.accounts.find((a) => a.id === "acct_1000")!;
    const savings = chart.accounts.find((a) => a.id === "acct_1010")!;
    expect(accountBalance(checking, txns, { asOf: "2026-03-31" })).toBe(12_000_00 + 6_500_00 - 2_000_00 - 300_00 - 1_000_00);
    expect(accountBalance(savings, txns)).toBe(1_000_00);
    // Total cash equals total fund balances when the books start balanced.
    const totalFunds = Object.values(balances).reduce((a, b) => a + b, 0);
    expect(accountBalance(checking, txns, { asOf: "2026-03-31" }) + accountBalance(savings, txns, { asOf: "2026-03-31" })).toBe(totalFunds);
    expect(accountActivity(chart, txns, "2026-03-01", "2026-03-31", "missions").get("acct_5100")).toBe(2_000_00);
  });
});

describe("bank reconciliation", () => {
  it("compares cleared transactions with the statement and locks them when it balances", () => {
    const chart = chartWithOpenings();
    const checking = chart.accounts.find((a) => a.id === "acct_1000")!;
    const txns = [
      txn("2026-10-02", "in", [["acct_4000", "general", 3_000_00]], { cleared: true }),
      txn("2026-10-05", "out", [["acct_5300", "general", 400_00]], { cleared: true }),
      txn("2026-10-20", "out", [["acct_5210", "general", 250_00]]), // outstanding check
      txn("2026-11-02", "out", [["acct_5210", "general", 75_00]], { cleared: true }), // after the statement
    ];
    const rec = { id: "r1", bankAccountId: checking.id, statementDate: "2026-10-31", statementBalance: 12_000_00 + 3_000_00 - 400_00, status: "open" as const };
    const state = reconcileState(checking, txns, rec);
    expect(state.clearedBalance).toBe(14_600_00);
    expect(state.difference).toBe(0);
    expect(state.outstanding.map((t) => t.date)).toEqual(["2026-10-20"]);
    expect(state.canFinish).toBe(true);
    expect(finishReconciliation(checking, txns, rec)).toBe(2);
    expect(txns[3].reconciliationId).toBeUndefined();

    const off = reconcileState(checking, txns, { ...rec, statementBalance: 14_350_00 });
    expect(off.difference).toBe(-250_00);
    expect(off.canFinish).toBe(false);
  });
});

describe("CSV import", () => {
  it("parses quoted fields, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n11/03/2026,"Staples, Inc. ""office""",-45.10\r\n\r\n2026-11-04,Deposit,"1,250.00"\n');
    expect(rows).toEqual([
      ["Date", "Description", "Amount"],
      ["11/03/2026", 'Staples, Inc. "office"', "-45.10"],
      ["2026-11-04", "Deposit", "1,250.00"],
    ]);
  });

  it("reads dates, money and debit/credit columns", () => {
    expect(normalizeDate("11/3/26")).toBe("2026-11-03");
    expect(normalizeDate("2026/02/30")).toBeNull();
    expect(parseMoney("(45.00)")).toBe(-4500);
    expect(parseMoney("$1,234.5")).toBe(123450);
    expect(parseMoney("12.345")).toBeNull();
    const table = parseCsv("Posted Date,Payee,Debit,Credit,Check Number\n10/01/2026,National Grid,182.40,,\n10/02/2026,Mobile deposit,,500.00,\n10/03/2026,???,,,\n");
    const map = detectColumns(table[0])!;
    expect(map).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, reference: 4 });
    const rows = bankRows(table, map);
    expect(rows[0]).toMatchObject({ date: "2026-10-01", amount: -18240, description: "National Grid" });
    expect(rows[1].amount).toBe(50000);
    expect(rows[2].problem).toBeTruthy();
  });

  it("suggests accounts and spots duplicates", () => {
    const chart = defaultChart();
    expect(suggestAccount(chart, "NATIONAL GRID ELECTRIC", "out")?.number).toBe("5300");
    expect(suggestAccount(chart, "GUSTO PAYROLL 1234", "out")?.number).toBe("5000");
    expect(suggestAccount(chart, "Mobile deposit", "in")?.number).toBe("4000");
    expect(suggestAccount(chart, "Mystery", "out")).toBeNull();
    const existing = [txn("2026-10-01", "out", [["acct_5300", "general", 18240]])];
    expect(findDuplicate(existing, "acct_1000", "2026-10-01", -18240)).not.toBeNull();
    expect(findDuplicate(existing, "acct_1000", "2026-10-01", 18240)).toBeNull();
  });
});

describe("giving and statements", () => {
  const gift = (date: string, donor: Partial<Gift>, amount: number, fundId = "general"): Gift => ({
    id: `g${seq++}`, date, donorName: "x", amount, fundId, method: "check", batchId: "b", txnId: "t", createdAt: 0, createdBy: "t", ...donor,
  });

  it("totals a donor's year-end statement by fund", () => {
    const funds = defaultChart().funds;
    const gifts = [
      gift("2026-01-04", { personId: "p01", donorName: "Sarah Kim" }, 100_00),
      gift("2026-06-07", { personId: "p01", donorName: "Sarah Kim" }, 250_00, "missions"),
      gift("2026-12-27", { personId: "p01", donorName: "Sarah Kim" }, 1_000_00),
      gift("2025-12-28", { personId: "p01", donorName: "Sarah Kim" }, 999_00),
      gift("2026-03-01", { donorName: "Marcus Bell" }, 50_00),
    ];
    const s = contributionStatement(gifts, funds, "p:p01", 2026)!;
    expect(s.total).toBe(1_350_00);
    expect(s.gifts).toHaveLength(3);
    expect(s.byFund.map((f) => [f.fund.id, f.total])).toEqual([["general", 1_100_00], ["missions", 250_00]]);
    expect(contributionStatement(gifts, funds, "p:p01", 2024)).toBeNull();
    expect(donorKey({ donorName: "  Marcus   BELL " })).toBe("n:marcus bell");
    const t = givingTotals(gifts, "2026-01-01", "2026-12-31");
    expect(t).toMatchObject({ total: 1_400_00, count: 4, givers: 2 });
  });

  it("lists recurring gifts that have come due", () => {
    const base = { id: "r", donorName: "x", amount: 1, fundId: "general", method: "ach" as const, active: true };
    expect(dueOccurrences({ ...base, frequency: "weekly", startDate: "2026-11-01", lastRecorded: "2026-11-01" }, "2026-11-16")).toEqual(["2026-11-08", "2026-11-15"]);
    expect(dueOccurrences({ ...base, frequency: "monthly", startDate: "2026-01-31" }, "2026-04-15")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(dueOccurrences({ ...base, frequency: "weekly", startDate: "2026-11-01", active: false }, "2026-11-16")).toEqual([]);
  });
});

/* ---------- Demo books, the API and Barnabas's tools ---------- */

const pastor: Leader = { churchId: "demo", leaderId: "aaaa0001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const deacon: Leader = { churchId: "demo", leaderId: "aaaa0002", name: "Travis", email: "travis@example.org", role: "Deacon" };
const member: Leader = { churchId: "demo", leaderId: "aaaa0003", name: "Kim", email: "kim@example.org", role: "Kids director" };

async function setupTeam() {
  freshStore();
  for (const l of [pastor, deacon, member]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
}

async function ctx(leader: Leader, lastUserText: string, turns: number, meta?: ConversationMeta): Promise<ToolContext> {
  const m: ConversationMeta = meta ?? { id: `conv_${leader.leaderId}`, title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns };
  if (!meta) await createConversation(leader, m);
  m.turns = turns;
  return { leader, meta: m, turnStartedAt: Date.now(), lastUserText };
}

describe("demo finance data", () => {
  beforeEach(setupTeam);

  it("seeds labeled demo books once, with balanced fund and bank totals", async () => {
    const books = await loadBooks("demo");
    expect(books.meta.demo).toBe(true);
    expect(books.budgets).toHaveLength(1);
    expect(books.gifts.length).toBeGreaterThan(500);
    expect(books.missions.partners.length).toBeGreaterThanOrEqual(6);
    const again = await loadBooks("demo");
    expect(again.transactions.length).toBe(books.transactions.length);
    const funds = fundBalances(books.chart, books.transactions).reduce((a, f) => a + f.balance, 0);
    const banks = books.chart.accounts.filter((a) => a.bank).reduce((a, acct) => a + accountBalance(acct, books.transactions), 0);
    expect(banks).toBe(funds);
    // Gift records and their deposits agree.
    const deposits = books.transactions.filter((t) => t.giftBatchId).reduce((a, t) => a + t.lines.reduce((x, l) => x + l.amount, 0), 0);
    expect(deposits).toBe(books.gifts.reduce((a, g) => a + g.amount, 0));
    // Another church gets empty books.
    expect((await loadBooks("other")).transactions).toHaveLength(0);
  });
});

describe("finance API", () => {
  beforeEach(setupTeam);
  afterEach(() => {
    session.current = null;
  });

  const routes: Record<string, () => Promise<{ GET: (r: Request) => Promise<Response> }>> = {
    overview: () => import("@/app/api/finance/overview/route"),
    budget: () => import("@/app/api/finance/budget/route"),
    ledger: () => import("@/app/api/finance/ledger/route"),
    giving: () => import("@/app/api/finance/giving/route"),
    missions: () => import("@/app/api/finance/missions/route"),
    reports: () => import("@/app/api/finance/reports/route"),
    reconcile: () => import("@/app/api/finance/reconcile/route"),
    statements: () => import("@/app/api/finance/statements/route"),
  };

  async function get(path: string, leader: Leader | null) {
    session.current = leader;
    const route = await routes[path]();
    return route.GET(new Request(`http://test/api/finance/${path}`));
  }

  it("gives a deacon giving totals without donor names", async () => {
    const books = await loadBooks("demo");
    const res = await get("giving", deacon);
    expect(res.status).toBe(200);
    const text = await res.text();
    const json = JSON.parse(text);
    expect(json.giving.total).toBeGreaterThan(0);
    expect(json.giving.donors).toBeUndefined();
    expect(json.giving.recentGifts).toBeUndefined();
    for (const name of new Set(books.gifts.map((g) => g.donorName))) expect(text).not.toContain(name);

    const pastorJson = await (await get("giving", pastor)).json();
    expect(pastorJson.giving.donors.length).toBeGreaterThan(10);

    const missions = await (await get("missions", deacon)).text();
    expect(JSON.parse(missions).missions.pledges).toBeUndefined();
    for (const p of books.missions.pledges) expect(missions).not.toContain(p.donorName);

    expect((await get("statements", deacon)).status).toBe(403);
    expect((await get("statements", pastor)).status).toBe(200);
  });

  it("refuses finance to leaders without a finance role, and writes to deacons", async () => {
    for (const path of ["overview", "budget", "ledger", "giving", "missions", "reports", "reconcile"]) {
      expect((await get(path, member)).status, path).toBe(403);
    }
    expect((await get("overview", null)).status).toBe(401);
    session.current = deacon;
    const ledger = await import("@/app/api/finance/ledger/route");
    const res = await ledger.POST(new Request("http://test", { method: "POST", body: JSON.stringify({ action: "set-cleared", ids: ["x"], cleared: true }) }));
    expect(res.status).toBe(403);
    const demo = await import("@/app/api/finance/demo/route");
    expect((await demo.DELETE(new Request("http://test", { method: "DELETE", body: JSON.stringify({ confirm: "CLEAR" }) }))).status).toBe(403);
  });

  it("lets a pastor clear the demo data, and audits it", async () => {
    await loadBooks("demo");
    session.current = pastor;
    const demo = await import("@/app/api/finance/demo/route");
    const res = await demo.DELETE(new Request("http://test", { method: "DELETE", body: JSON.stringify({ confirm: "CLEAR" }) }));
    expect(res.status).toBe(200);
    const books = await loadBooks("demo");
    expect(books.meta.demo).toBe(false);
    expect(books.transactions).toHaveLength(0);
    expect(books.chart.funds.length).toBe(4);
    expect((await listAudit(pastor)).some((a) => a.action === "finance.demo.clear")).toBe(true);
  });
});

describe("Barnabas finance tools", () => {
  beforeEach(setupTeam);

  it("keeps finance from leaders without a finance role", async () => {
    const r = await executeTool("finance_overview", {}, await ctx(member, "How are we doing financially?", 0));
    expect(r.isError).toBe(true);
    expect(r.content).toContain("doesn't include church finances");
  });

  it("answers budget and missions questions for a deacon, without donor names", async () => {
    const books = await loadBooks("demo");
    const c = await ctx(deacon, "How are we tracking against budget?", 0);
    const budget = await executeTool("budget_status", {}, c);
    expect(budget.isError).toBe(false);
    expect(JSON.parse(budget.content).by_category.length).toBeGreaterThan(5);
    const missions = await executeTool("missions_status", {}, c);
    expect(JSON.parse(missions.content).campaigns[0].pledged).toMatch(/^\$/);
    const giving = await executeTool("giving_summary", { period: "this_year" }, c);
    const overview = await executeTool("finance_overview", {}, c);
    for (const name of new Set(books.gifts.map((g) => g.donorName))) {
      expect(giving.content).not.toContain(name);
      expect(overview.content).not.toContain(name);
      expect(missions.content).not.toContain(name);
    }
    const donor = await executeTool("giving_summary", { donor: "Sarah Kim" }, c);
    expect(donor.isError).toBe(true);
    expect(donor.content).toContain("confidential");
  });

  it("gives the pastor one donor's totals, not their ledger", async () => {
    await loadBooks("demo");
    const r = await executeTool("giving_summary", { donor: "Sarah Kim" }, await ctx(pastor, "How much has Sarah Kim given this year?", 0));
    expect(r.isError).toBe(false);
    const json = JSON.parse(r.content);
    expect(json.donor).toBe("Sarah Kim");
    expect(json.gifts).toEqual(expect.any(Number));
    expect(json).not.toHaveProperty("history");
  });

  it("records a gift only after the leader says yes on a later turn", async () => {
    const before = (await loadBooks("demo")).gifts.length;
    const input = { donor: "p01", amount: 250, fund: "missions", method: "check", date: "2026-11-08" };
    const c1 = await ctx(pastor, "Record Sarah Kim's $250 missions check from Sunday", 0);
    const first = await executeTool("record_gift", input, c1);
    expect(first.isError).toBe(true);
    expect(first.content).toContain("Not confirmed");
    expect(first.content).toContain("$250.00 from Sarah Kim to the Missions");

    // Saying yes in the same turn doesn't count; neither does a different amount on the next turn.
    const same = await executeTool("record_gift", input, await ctx(pastor, "yes", 0, c1.meta));
    expect(same.isError).toBe(true);
    const changed = await executeTool("record_gift", { ...input, amount: 300 }, await ctx(pastor, "Yes", 1, c1.meta));
    expect(changed.isError).toBe(true);

    const c3 = await ctx(pastor, "Yes, record it", 2, c1.meta);
    const done = await executeTool("record_gift", { ...input, amount: 300 }, c3);
    expect(done.isError).toBe(false);
    const books = await loadBooks("demo");
    expect(books.gifts.length).toBe(before + 1);
    const gift = books.gifts.find((g) => g.amount === 300_00 && g.date === "2026-11-08" && g.personId === "p01" && g.fundId === "missions");
    expect(gift).toBeTruthy();
    expect(books.transactions.find((t) => t.id === gift!.txnId)?.source).toBe("barnabas");
    expect((await listAudit(pastor)).some((a) => a.action === "finance.gifts.record")).toBe(true);
  });

  it("records an expense after a yes, and refuses deacons", async () => {
    const input = { description: "Hardware store: classroom shelves", amount: 84.5, account: "Kids ministry" };
    const no = await executeTool("record_expense", input, await ctx(deacon, "Record it", 0));
    expect(no.isError).toBe(true);
    expect(no.content).toContain("Only the pastor or treasurer");

    const c1 = await ctx(pastor, "Log $84.50 for classroom shelves to kids ministry", 0);
    expect((await executeTool("record_expense", input, c1)).content).toContain("Not confirmed");
    const declined = await executeTool("record_expense", input, await ctx(pastor, "No, wait", 1, c1.meta));
    expect(declined.isError).toBe(true);
    const ok = await executeTool("record_expense", input, await ctx(pastor, "Yes please", 2, c1.meta));
    expect(ok.isError).toBe(false);
    const books = await loadBooks("demo");
    const t = books.transactions.find((x) => x.description === input.description)!;
    expect(t.direction).toBe("out");
    expect(t.lines[0]).toMatchObject({ accountId: "acct_5400", fundId: "general", amount: 84_50 });
  });

  it("only shows donor detail in giving summaries to pastors and treasurers", async () => {
    const books = await loadBooks("demo");
    await recordGifts(pastor, { depositDate: "2026-11-09", gifts: [{ date: "2026-11-08", donorName: "Zed Newcomer", amount: 40_00, fundId: "general", method: "cash" }] });
    const fresh = await loadBooks("demo");
    expect(JSON.stringify(givingSummary(fresh, { role: "deacon", admin: false }, "2026-01-01", "2026-12-31"))).not.toContain("Zed Newcomer");
    expect(JSON.stringify(givingSummary(fresh, { role: "treasurer", admin: false }, "2026-01-01", "2026-12-31"))).toContain("Zed Newcomer");
    expect(books).toBeTruthy();
  });
});
