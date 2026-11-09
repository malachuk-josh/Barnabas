import { addDays, today } from "../dates";
import { defaultChart } from "./chart";
import { txnTotal } from "./ledger";
import type { Books, Budget, Gift, Missions, MissionsPartner, Reconciliation, Recurring, Transaction, TxnLine } from "./types";

/**
 * A demo finance dataset for Mount Greylock Baptist Church (about 175 people), clearly labeled in the
 * app. It covers the twelve months up to today: Sunday offerings and online giving as anonymous
 * offering lines (no donor is made up), payroll, missions support, utilities, ministry
 * spending, a building project, and a bank reconciliation. Missions partners are fictional.
 * Everything is generated from a fixed seed, relative to today, so it never goes stale.
 */

const $ = (dollars: number) => Math.round(dollars * 100);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARTNERS: Omit<MissionsPartner, "id" | "updates" | "pledgeStart">[] = [
  { name: "Andrés and Lucía Moreno", kind: "missionary", field: "Cusco, Peru", type: "Church planting", supportLevel: "partial", monthly: $(600), active: true },
  { name: "Mark and Ellie Lindqvist", kind: "missionary", field: "Northern Thailand", type: "Bible translation", supportLevel: "partial", monthly: $(500), active: true },
  { name: "Jonah and Mei Akers", kind: "missionary", field: "Sendai, Japan", type: "Church planting", supportLevel: "partial", monthly: $(450), active: true },
  { name: "Sam and Priscilla Feld", kind: "missionary", field: "Montréal, Québec", type: "Campus ministry", supportLevel: "partial", monthly: $(400), active: true },
  { name: "Living Springs Water Project", kind: "organization", field: "Turkana, Kenya", type: "Clean water and evangelism", supportLevel: "project", monthly: $(300), active: true },
  { name: "Harvest Pastors Institute", kind: "organization", field: "Moldova and Romania", type: "Pastor training", supportLevel: "partial", monthly: $(350), active: true },
  { name: "Hilltop Pregnancy Resource Center", kind: "organization", field: "Berkshire County, MA", type: "Pregnancy care", supportLevel: "partial", monthly: $(250), active: true },
  { name: "Mohawk Trail Rescue Mission", kind: "organization", field: "Western Massachusetts", type: "Shelter and recovery", supportLevel: "partial", monthly: $(300), active: true },
];

const UPDATES: Record<string, { daysAgo: number; text: string }[]> = {
  "Andrés and Lucía Moreno": [
    { daysAgo: 12, text: "Twelve adults finished the new believers' class in San Jerónimo. Pray for a meeting space; their lease ends in January." },
    { daysAgo: 75, text: "Lucía's mother is recovering well. The kids' club now has thirty children most Saturdays." },
  ],
  "Mark and Ellie Lindqvist": [{ daysAgo: 30, text: "Draft of Mark's Gospel is with community checkers. Pray for clear understanding and for Ellie's visa renewal." }],
  "Jonah and Mei Akers": [{ daysAgo: 20, text: "English café outreach doubled this fall. Two students asked for Bible study." }],
  "Sam and Priscilla Feld": [{ daysAgo: 45, text: "Fall retreat had 64 students. Pray for follow-up conversations and for French-speaking leaders." }],
  "Living Springs Water Project": [{ daysAgo: 60, text: "Two wells completed in October; a third is waiting on parts." }],
  "Hilltop Pregnancy Resource Center": [{ daysAgo: 25, text: "They're looking for co-laborers for the Thursday parenting class." }],
};

function sundaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  d = addDays(d, (7 - dow) % 7);
  for (; d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

const monthStarts = (from: string, to: string) => {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  for (;;) {
    const iso = `${y}-${String(m).padStart(2, "0")}-01`;
    if (iso > to) break;
    out.push(iso);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

const monthEnd = (first: string) => {
  const [y, m] = first.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const dayOf = (first: string, day: number) => {
  const end = Number(monthEnd(first).slice(8, 10));
  return `${first.slice(0, 8)}${String(Math.min(day, end)).padStart(2, "0")}`;
};

/** Seasonal giving: Christmas and Easter run high, summer a little low. */
function season(date: string) {
  const m = Number(date.slice(5, 7));
  return m === 12 ? 1.22 : m === 7 || m === 8 ? 0.86 : m === 4 ? 1.06 : m === 6 ? 0.93 : 1;
}

export async function seedDemoBooks(asOf: string = today()): Promise<Books> {
  const r = rng(175);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  // Demo entries are recorded and the reconciliation signed off by a deacon (Cal Najimy), as the treasurer would.
  const by = "demo:cal-najimy";
  const created = Date.now();
  let seq = 0;
  const id = (p: string) => `${p}_demo${(seq++).toString(36).padStart(5, "0")}`;

  const [y, m] = asOf.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 13, 1)).toISOString().slice(0, 10); // the first of the month, twelve months back
  const year = y;

  const chart = defaultChart();
  const opening: Record<string, number> = { general: $(46_200), missions: $(8_900), building: $(61_500), benevolence: $(3_400) };
  for (const f of chart.funds) f.openingBalance = opening[f.id] ?? 0;
  const checking = chart.accounts.find((a) => a.number === "1000")!;
  const savings = chart.accounts.find((a) => a.number === "1010")!;
  checking.openingBalance = opening.general + opening.missions + opening.benevolence + $(11_500);
  savings.openingBalance = opening.building - $(11_500);
  const acct = (n: string) => `acct_${n}`;

  /*
   * ---------- Giving ----------
   * No donor is made up: each Sunday's giving is recorded as anonymous offering lines with no person
   * attached (the plate offering, the weekly online payout, missions, building and benevolence), so the
   * totals, funds and trends are real-looking while the donor lists start empty.
   */
  const gifts: Gift[] = [];
  const txns: Transaction[] = [];
  const recurring: Recurring[] = [];
  const sundays = sundaysBetween(start, asOf);

  const txn = (date: string, description: string, direction: "in" | "out", lines: TxnLine[], extra: Partial<Transaction> = {}) => {
    if (date > asOf || date < start) return;
    const kept = lines.filter((l) => l.amount > 0);
    if (!kept.length) return;
    txns.push({ id: id("txn"), date, description, bankAccountId: checking.id, direction, lines: kept, cleared: false, source: "manual", createdAt: created, createdBy: by });
    Object.assign(txns[txns.length - 1], extra);
  };

  const fundAccount = Object.fromEntries(chart.funds.map((f) => [f.id, f.incomeAccountId]));

  /** Posts a batch of gifts as one deposit, with a line per fund. */
  function deposit(batchGifts: Omit<Gift, "id" | "batchId" | "txnId" | "createdAt" | "createdBy">[], date: string, description: string) {
    if (!batchGifts.length || date > asOf) return;
    const batchId = id("batch");
    const txnId = id("txn");
    const perFund = new Map<string, number>();
    for (const g of batchGifts) {
      gifts.push({ ...g, anonymous: true, id: id("gift"), batchId, txnId, createdAt: created, createdBy: by });
      perFund.set(g.fundId, (perFund.get(g.fundId) ?? 0) + g.amount);
    }
    txns.push({
      id: txnId,
      date,
      description,
      bankAccountId: checking.id,
      direction: "in",
      lines: [...perFund].map(([fundId, amount]) => ({ accountId: fundAccount[fundId], fundId, amount })),
      cleared: false,
      source: "giving",
      giftBatchId: batchId,
      createdAt: created,
      createdBy: by,
    });
  }

  type Line = Omit<Gift, "id" | "batchId" | "txnId" | "createdAt" | "createdBy">;
  for (let i = 0; i < sundays.length; i++) {
    const sunday = sundays[i];
    const weekEnd = addDays(sunday, 6);
    const factor = season(sunday);
    const firstSunday = Number(sunday.slice(8, 10)) <= 7;
    const round5 = (n: number) => Math.round(n / 5) * 5;
    const inPerson: Line[] = [
      { date: sunday, donorName: "Sunday offering (checks)", amount: $(round5(3_900 * factor * (0.88 + r() * 0.24))), fundId: "general", method: "check" },
      { date: sunday, donorName: "Sunday offering (cash)", amount: $(Math.round((520 + r() * 220) * factor)), fundId: "general", method: "cash" },
    ];
    const online: Line[] = [{ date: addDays(sunday, 1), donorName: "Online and ACH giving", amount: $(round5(2_350 * factor * (0.92 + r() * 0.16))), fundId: "general", method: "online" }];
    // Faith-promise giving to Missions, and building gifts, mostly on first Sundays.
    if (firstSunday) {
      inPerson.push({ date: sunday, donorName: "Missions offering", amount: $(round5(2_400 + r() * 500)), fundId: "missions", method: "check" });
      online.push({ date: addDays(sunday, 1), donorName: "Online missions giving", amount: $(round5(800 + r() * 200)), fundId: "missions", method: "online" });
      inPerson.push({ date: sunday, donorName: "Building fund offering", amount: $(round5(280 + r() * 160)), fundId: "building", method: "check" });
      inPerson.push({ date: sunday, donorName: "Benevolence offering (communion)", amount: $(Math.round(260 + r() * 220)), fundId: "benevolence", method: "cash" });
    }
    // Year-end giving on the last Sunday of December.
    if (sunday.slice(5, 7) === "12" && Number(sunday.slice(8, 10)) > 24) inPerson.push({ date: sunday, donorName: "Year-end offering", amount: $(round5(9_500 + r() * 2_000)), fundId: "general", method: "check" });
    if (sunday.slice(5, 7) === "03" && Number(sunday.slice(8, 10)) > 7 && Number(sunday.slice(8, 10)) <= 14)
      inPerson.push({ date: sunday, donorName: "Missions conference offering", amount: $(3_850), fundId: "missions", method: "cash" });

    deposit(inPerson, addDays(sunday, 1), `Sunday offering deposit, ${sunday}`);
    deposit(online, addDays(weekEnd, 2), "Online and ACH giving payout");
  }

  /* ---------- Spending ---------- */
  const partners: MissionsPartner[] = PARTNERS.map((p) => ({
    ...p,
    id: id("partner"),
    pledgeStart: `${year - 2 - Math.floor(r() * 4)}-01-01`,
    pledgeEnd: r() < 0.25 ? `${year + 1}-12-31` : undefined,
    updates: (UPDATES[p.name] ?? []).map((u) => ({ id: id("upd"), date: addDays(asOf, -u.daysAgo), text: u.text })),
  }));

  for (const first of monthStarts(start, asOf)) {
    const mo = Number(first.slice(5, 7));
    const winter = [11, 12, 1, 2, 3].includes(mo);
    const vary = (base: number, spread = 0.15) => $(Math.round(base * (1 - spread + r() * spread * 2)));

    for (const day of [15, 31]) {
      txn(dayOf(first, day), "Gusto payroll: pastors and staff", "out", [
        { accountId: acct("5000"), fundId: "general", amount: $(4_916.67), memo: "Gross pastoral salaries" },
        { accountId: acct("5010"), fundId: "general", amount: $(2_250), memo: "Clergy housing allowance" },
        { accountId: acct("5020"), fundId: "general", amount: $(1_583.33), memo: "Office administrator and custodian" },
        { accountId: acct("5030"), fundId: "general", amount: $(125), memo: "Employer FICA, non-clergy staff" },
      ], { reference: "GUSTO" });
    }
    txn(dayOf(first, 1), "Blue Cross health insurance", "out", [{ accountId: acct("5040"), fundId: "general", amount: $(2_480) }], { reference: "ACH" });
    txn(dayOf(first, 16), "GuideStone retirement contributions", "out", [{ accountId: acct("5050"), fundId: "general", amount: $(740) }], { reference: "ACH" });

    txn(dayOf(first, 2), "Missionary support, monthly", "out", partners.map((p) => ({ accountId: acct("5100"), fundId: "missions", amount: p.monthly, memo: p.name, partnerId: p.id })), { reference: String(4100 + mo) });

    txn(dayOf(first, 5), "Greylock Federal Credit Union: building loan", "out", [{ accountId: acct("5200"), fundId: "general", amount: $(2_390) }], { reference: "ACH" });
    txn(dayOf(first, 10), "Custodial and grounds", "out", [{ accountId: acct("5230"), fundId: "general", amount: vary(600, 0.1), memo: winter ? "Includes snow plowing" : undefined }]);
    if ([1, 4, 7, 10].includes(mo)) txn(dayOf(first, 8), "Church Mutual property insurance", "out", [{ accountId: acct("5220"), fundId: "general", amount: $(2_410) }]);
    const repairs = Math.floor(r() * 3);
    for (let i = 0; i < repairs; i++) txn(dayOf(first, 6 + i * 9), pick(["Hardware store", "Plumbing repair", "Furnace service", "Electrical repair", "Door hardware"]), "out", [{ accountId: acct("5210"), fundId: "general", amount: vary(450, 0.6) }]);

    txn(dayOf(first, 18), "National Grid electric", "out", [{ accountId: acct("5300"), fundId: "general", amount: vary([6, 7, 8].includes(mo) ? 940 : 720) }], { reference: "ACH" });
    if (winter || mo === 4 || mo === 10) txn(dayOf(first, 12), "Heating oil delivery", "out", [{ accountId: acct("5310"), fundId: "general", amount: vary(mo === 1 || mo === 2 ? 2_150 : mo === 12 ? 1_900 : 1_150) }]);
    if ([2, 5, 8, 11].includes(mo)) txn(dayOf(first, 20), "City of North Adams water and sewer", "out", [{ accountId: acct("5320"), fundId: "general", amount: vary(450, 0.1) }]);
    txn(dayOf(first, 22), "Spectrum internet and phone", "out", [{ accountId: acct("5330"), fundId: "general", amount: $(199.99) }], { reference: "ACH" });

    txn(dayOf(first, 9), "Kids Club curriculum and snacks", "out", [{ accountId: acct("5400"), fundId: "general", amount: vary(mo === 7 ? 1_400 : 380, 0.3), memo: mo === 7 ? "Vacation Bible School" : undefined }]);
    txn(dayOf(first, 14), mo === 11 ? "Reverb All-Nighter deposit" : "Teen Group activities", "out", [{ accountId: acct("5410"), fundId: "general", amount: vary(mo === 11 ? 1_250 : mo === 2 ? 1_100 : 380, 0.3) }]);
    txn(dayOf(first, 19), "Growth Group books", "out", [{ accountId: acct("5420"), fundId: "general", amount: vary(240, 0.4) }]);
    txn(dayOf(first, 24), "CCLI license and worship supplies", "out", [{ accountId: acct("5430"), fundId: "general", amount: vary(mo === 1 ? 980 : 300, 0.3) }]);
    txn(dayOf(first, 26), "Hospitality: coffee and fellowship meals", "out", [{ accountId: acct("5440"), fundId: "general", amount: vary(mo === 11 || mo === 12 ? 650 : 240, 0.3) }]);

    if (mo === 11) txn(dayOf(first, 20), "Thanksgiving baskets for neighbors", "out", [{ accountId: acct("5110"), fundId: "general", amount: vary(900, 0.1) }]);
    if (mo === 12) txn(dayOf(first, 15), "Christmas outreach: Angel Tree gifts", "out", [{ accountId: acct("5110"), fundId: "general", amount: vary(700, 0.1) }]);
    if (mo === 6) txn(dayOf(first, 28), "Short-term mission team, Peru (airfare)", "out", [{ accountId: acct("5120"), fundId: "general", amount: $(4_350) }]);

    const benev = 1 + Math.floor(r() * 2);
    for (let i = 0; i < benev; i++) txn(dayOf(first, 7 + i * 11), pick(["Benevolence: utility help", "Benevolence: groceries", "Benevolence: rent help", "Benevolence: car repair"]), "out", [{ accountId: acct("5500"), fundId: "benevolence", amount: vary(330, 0.5), memo: "Approved by Deacon Travis Willette" }]);

    txn(dayOf(first, 11), "Staples and USPS", "out", [{ accountId: acct("5600"), fundId: "general", amount: vary(190, 0.4) }]);
    txn(dayOf(first, 3), "Planning Center and Google Workspace", "out", [{ accountId: acct("5610"), fundId: "general", amount: $(296) }], { reference: "CARD" });
    txn(monthEnd(first), "Bank service charge and card fees", "out", [{ accountId: acct("5620"), fundId: "general", amount: vary(118, 0.2) }], { reference: "FEE" });
    if (mo === 3) txn(dayOf(first, 25), "Annual financial review (CPA)", "out", [{ accountId: acct("5630"), fundId: "general", amount: $(2_400) }]);

    txn(dayOf(first, 27), "Facility rental: receptions and community groups", "in", [{ accountId: acct("4400"), fundId: "general", amount: vary(380, 0.4) }]);
    txn(monthEnd(first), "Interest", "in", [{ accountId: acct("4500"), fundId: "general", amount: vary(48, 0.2) }], { reference: "INT" });
  }
  // A building project, paid from the Building fund.
  txn(`${year}-08-14`, "Roof repair, north side (Taconic Roofing)", "out", [{ accountId: acct("5240"), fundId: "building", amount: $(14_250), memo: "Paid from the Building fund" }], { reference: "4188" });
  txn(`${year}-08-13`, "Transfer from savings for roof project", "in", [{ accountId: savings.id, fundId: "building", amount: $(14_000) }], { reference: "XFER" });

  txns.sort((a, b) => a.date.localeCompare(b.date));

  /* ---------- Reconciliation ---------- */
  // Everything up to two month-ends ago is reconciled; last month is open, with a few items still to tick.
  const lastClose = monthEnd(new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10));
  const openClose = monthEnd(new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10));
  const reconciliations: Reconciliation[] = [];
  const done: Reconciliation = { id: id("recon"), bankAccountId: checking.id, statementDate: lastClose, statementBalance: 0, status: "finished", finishedAt: created, finishedBy: by };
  let balance = checking.openingBalance ?? 0;
  const effect = (t: Transaction) => (t.bankAccountId === checking.id ? (t.direction === "in" ? 1 : -1) * txnTotal(t) : 0);
  for (const t of txns) {
    if (t.date <= lastClose) {
      t.cleared = true;
      t.reconciliationId = done.id;
      balance += effect(t);
    }
  }
  done.statementBalance = balance;
  reconciliations.push(done);
  const openMonth = txns.filter((t) => t.date > lastClose && t.date <= openClose);
  const outstanding = new Set(openMonth.filter((t) => t.direction === "out").slice(-3).map((t) => t.id)); // checks not yet cashed
  const unticked = openMonth.filter((t) => !outstanding.has(t.id)).slice(-2).map((t) => t.id); // on the statement, not yet ticked
  let statement = balance;
  for (const t of openMonth) {
    if (outstanding.has(t.id)) continue;
    statement += effect(t);
    if (!unticked.includes(t.id)) t.cleared = true;
  }
  reconciliations.push({ id: id("recon"), bankAccountId: checking.id, statementDate: openClose, statementBalance: statement, status: "open" });

  /* ---------- Budget ---------- */
  const line = (n: string, annual: number, basis: "annual" | "monthly" = "annual", note?: string, timing?: "seasonal") => ({ accountId: acct(n), annual: $(annual), basis, note, timing });
  const budget: Budget = {
    year,
    lines: [
      line("4000", 362_000, "annual", "Based on last year's giving plus 3%"),
      line("4100", 46_000, "annual", "Faith Promise pledges"),
      line("4200", 7_200),
      line("4300", 5_400),
      line("4400", 4_200, "monthly"),
      line("4500", 600),
      line("5000", 118_000, "annual", "Lead and care pastors"),
      line("5010", 54_000, "annual", "Set by resolution each December"),
      line("5020", 38_000),
      line("5030", 3_000),
      line("5040", 30_000, "monthly"),
      line("5050", 9_000, "monthly"),
      line("5100", 37_800, "monthly", "Eight partners"),
      line("5110", 2_000, "annual", "Thanksgiving and Christmas", "seasonal"),
      line("5120", 4_000, "annual", "Peru team, June", "seasonal"),
      line("5200", 28_680, "monthly"),
      line("5210", 9_000),
      line("5220", 9_640, "annual", "Paid quarterly", "seasonal"),
      line("5230", 7_200, "monthly"),
      line("5240", 15_000, "annual", "Roof, from the Building fund", "seasonal"),
      line("5300", 9_600, "monthly"),
      line("5310", 10_500, "annual", "Mostly November to March", "seasonal"),
      line("5320", 1_800),
      line("5330", 2_400, "monthly"),
      line("5400", 5_500),
      line("5410", 5_800),
      line("5420", 3_000),
      line("5430", 4_400),
      line("5440", 3_000),
      line("5500", 5_400),
      line("5600", 2_400, "monthly"),
      line("5610", 3_552, "monthly"),
      line("5620", 1_400),
      line("5630", 2_400, "annual", "Once a year, in March", "seasonal"),
    ],
    notes:
      "Approved by the congregation at the annual business meeting in January.\n" +
      "Goal: hold general expenses flat, finish the roof from the Building fund, and keep missions at 10% of giving or more.",
    updatedAt: created,
    updatedBy: by,
  };

  /* ---------- Missions ---------- */
  const campaign = { id: id("camp"), name: `Faith Promise ${year}`, goal: $(48_000), start: `${year}-01-01`, end: `${year}-12-31`, note: "Pledged at the missions conference in March." };
  const missions: Missions = {
    partners,
    campaigns: [campaign],
    // Pledges are made by people, so none are seeded; the campaign keeps its goal.
    pledges: [],
  };

  return {
    meta: { demo: true, startDate: start, createdAt: created },
    chart,
    transactions: txns,
    gifts,
    recurring,
    budgets: [budget],
    reconciliations,
    missions,
  };
}
