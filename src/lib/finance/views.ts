import { can, type Access } from "../auth/roles";
import { budgetVsActual, type BudgetGroup, type BudgetReport } from "./budget";
import { donorSummaries, givingTotals, lastMonths, monthLabel, monthlyTrend, type MonthPoint } from "./giving";
import { accountActivity, accountBalance, fundBalances, inRange, type FundBalance } from "./ledger";
import { campaignStatus, MISSIONS_FUND, partnerStatus, pledgeProgress } from "./missions";
import { dollars, sum } from "./money";
import type { Books, GiftMethod } from "./types";

/**
 * Read models for the Finance screens, the API and Barnabas's tools. Every function that could
 * reveal who gave what takes the viewer's access and leaves donor names out unless the role
 * includes `giving.donors` (pastor and treasurer).
 */

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function sameDayLastYear(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export type Overview = ReturnType<typeof financeOverview>;

export function financeOverview(books: Books, asOf: string) {
  const year = Number(asOf.slice(0, 4));
  const from = `${year}-01-01`;
  const scoped = books.transactions.filter((t) => inRange(t.date, from, asOf));
  const activity = accountActivity(books.chart, books.transactions, from, asOf);
  const types = new Map(books.chart.accounts.map((a) => [a.id, a.type]));
  let income = 0;
  let expenses = 0;
  for (const [id, amount] of activity) {
    if (types.get(id) === "income") income += amount;
    if (types.get(id) === "expense") expenses += amount;
  }
  const funds = fundBalances(books.chart, books.transactions, asOf);
  const general = funds.find((f) => !f.fund.restricted) ?? funds[0];

  const month = asOf.slice(0, 7);
  const lastYearDay = sameDayLastYear(asOf);
  const thisMonth = givingTotals(books.gifts, `${month}-01`, asOf);
  const lastYearSamePeriod = givingTotals(books.gifts, `${lastYearDay.slice(0, 7)}-01`, lastYearDay);
  const lastYearMonth = givingTotals(books.gifts, `${lastYearDay.slice(0, 7)}-01`, monthEnd(lastYearDay.slice(0, 7)));

  const budget = books.budgets.find((b) => b.year === year) ?? null;
  const report = budgetVsActual(books.chart, budget, books.transactions, year, asOf);

  const campaign = books.missions.campaigns.find((c) => c.start <= asOf && c.end >= asOf) ?? books.missions.campaigns[books.missions.campaigns.length - 1];
  const camp = campaign ? campaignStatus(campaign, books.missions.pledges, books.gifts, asOf) : null;
  const partners = partnerStatus(books.missions, books.transactions, from, asOf);
  const missionsFund = funds.find((f) => f.fund.id === MISSIONS_FUND);
  const bankAccounts = books.chart.accounts.filter((a) => a.bank && !a.archived).map((a) => ({ id: a.id, name: a.name, balance: accountBalance(a, books.transactions, { asOf }) }));

  return {
    asOf,
    year,
    demo: books.meta.demo,
    ytd: {
      income,
      expenses,
      net: income - expenses,
      source: `${scoped.length} ledger transactions dated ${shortDate(from)} to ${shortDate(asOf)}: every line on an income account, less every line on an expense account, across all funds.`,
    },
    generalFund: {
      balance: general?.balance ?? 0,
      name: general?.fund.name ?? "General fund",
      source: `Opening balance ${dollars(general?.opening ?? 0)} on ${shortDate(books.meta.startDate)}, plus ${dollars(general?.income ?? 0)} income, less ${dollars(general?.expenses ?? 0)} expenses posted to the ${general?.fund.name ?? "General fund"} since then.`,
    },
    restrictedFunds: funds.filter((f) => f.fund.restricted).map((f) => ({ id: f.fund.id, name: f.fund.name, balance: f.balance })),
    bankAccounts,
    giving: {
      monthToDate: thisMonth.total,
      lastYearSamePeriod: lastYearSamePeriod.total,
      lastYearMonth: lastYearMonth.total,
      monthLabel: monthLabel(month, "long"),
      source: `${thisMonth.count} gifts recorded ${shortDate(`${month}-01`)} to ${shortDate(asOf)}, compared with ${lastYearSamePeriod.count} gifts ${shortDate(`${lastYearDay.slice(0, 7)}-01`)} to ${shortDate(lastYearDay)}. All funds.`,
    },
    budgetHealth: {
      hasBudget: Boolean(budget),
      elapsed: report.elapsed,
      groups: report.groups.filter((g) => g.kind === "expense").map(groupSummary),
      income: report.groups.filter((g) => g.kind === "income").map(groupSummary),
      source: budget
        ? `The ${year} budget compared with ledger actuals through ${shortDate(report.asOf)}, ${Math.round(report.elapsed * 100)}% of the way through the year.`
        : `There's no budget for ${year} yet.`,
    },
    missions: {
      campaign: camp ? { name: camp.campaign.name, goal: camp.campaign.goal, pledged: camp.pledged, received: camp.received, pledgeCount: camp.pledgeCount } : null,
      committedToPartners: sum(partners.map((p) => p.committed)),
      paidToPartners: sum(partners.map((p) => p.paid)),
      partnerCount: partners.filter((p) => p.partner.active).length,
      fundBalance: missionsFund?.balance ?? 0,
      source: camp
        ? `${camp.pledgeCount} pledges toward ${camp.campaign.name}; received is every gift to the Missions fund from ${shortDate(camp.campaign.start)} to ${shortDate(camp.campaign.end < asOf ? camp.campaign.end : asOf)}. Paid to partners is missionary support lines tagged with a partner this year.`
        : "No missions campaign has been set up.",
    },
  };
}

function groupSummary(g: BudgetGroup) {
  return { group: g.group, annual: g.annual, toDate: g.toDate, actual: g.actual, variance: g.variance, pctUsed: g.pctUsed, health: g.health };
}

export function budgetView(books: Books, year: number, asOf: string): BudgetReport & { notes: string; exists: boolean; years: number[] } {
  const budget = books.budgets.find((b) => b.year === year) ?? null;
  return { ...budgetVsActual(books.chart, budget, books.transactions, year, asOf), notes: budget?.notes ?? "", exists: Boolean(budget), years: books.budgets.map((b) => b.year) };
}

export type GivingSummary = {
  from: string;
  to: string;
  total: number;
  count: number;
  givers: number;
  byFund: { fundId: string; name: string; total: number }[];
  byMethod: Record<GiftMethod, number>;
  trend: MonthPoint[];
  /** Only for pastors and treasurers. */
  donors?: { key: string; personId?: string; name: string; total: number; count: number; lastGift: string; previousTotal: number }[];
  recentGifts?: { id: string; date: string; donorName: string; amount: number; fundId: string; method: GiftMethod }[];
  recurring?: { id: string; donorName: string; amount: number; fundId: string; method: GiftMethod; frequency: string; active: boolean; lastRecorded?: string }[];
  donorDetail: boolean;
};

/** Giving between two dates. Donor names and individual gifts only when the viewer may see them. */
export function givingSummary(books: Books, access: Access, from: string, to: string, opts: { trendMonths?: number } = {}): GivingSummary {
  const totals = givingTotals(books.gifts, from, to);
  const detail = can(access, "giving.donors");
  const summary: GivingSummary = {
    from,
    to,
    total: totals.total,
    count: totals.count,
    givers: totals.givers,
    byFund: books.chart.funds.map((f) => ({ fundId: f.id, name: f.name, total: totals.byFund[f.id] ?? 0 })),
    byMethod: totals.byMethod,
    trend: monthlyTrend(books.gifts, lastMonths(to, opts.trendMonths ?? 13)),
    donorDetail: detail,
  };
  if (detail) {
    const year = Number(to.slice(0, 4));
    summary.donors = donorSummaries(books.gifts, year);
    summary.recentGifts = books.gifts
      .filter((g) => inRange(g.date, from, to))
      .slice(-40)
      .reverse()
      .map((g) => ({ id: g.id, date: g.date, donorName: g.donorName, amount: g.amount, fundId: g.fundId, method: g.method }));
    summary.recurring = books.recurring.map((r) => ({ id: r.id, donorName: r.donorName, amount: r.amount, fundId: r.fundId, method: r.method, frequency: r.frequency, active: r.active, lastRecorded: r.lastRecorded }));
  }
  return summary;
}

export function missionsView(books: Books, access: Access, asOf: string) {
  const year = Number(asOf.slice(0, 4));
  const partners = partnerStatus(books.missions, books.transactions, `${year}-01-01`, asOf);
  const campaigns = books.missions.campaigns.map((c) => campaignStatus(c, books.missions.pledges, books.gifts, asOf));
  const fund = fundBalances(books.chart, books.transactions, asOf).find((f) => f.fund.id === MISSIONS_FUND);
  const detail = can(access, "giving.donors");
  return {
    asOf,
    partners,
    campaigns,
    fund: fund ? { balance: fund.balance, income: fund.income, expenses: fund.expenses, opening: fund.opening } : null,
    missionsGivingYtd: sum(books.gifts.filter((g) => g.fundId === MISSIONS_FUND && inRange(g.date, `${year}-01-01`, asOf)).map((g) => g.amount)),
    pledges: detail ? pledgeProgress(books.missions, books.gifts, asOf).map((p) => ({ id: p.pledge.id, donorName: p.pledge.donorName, personId: p.pledge.personId, amount: p.pledge.amount, given: p.given, campaignId: p.pledge.campaignId })) : undefined,
    donorDetail: detail,
  };
}

export type MonthlyReport = ReturnType<typeof monthlyReport>;

/** The monthly finance report for the deacons or board: aggregates only, no donor names. */
export function monthlyReport(books: Books, month: string, asOf: string) {
  const year = Number(month.slice(0, 4));
  const start = `${month}-01`;
  const end = monthEnd(month) < asOf ? monthEnd(month) : asOf;
  const budget = books.budgets.find((b) => b.year === year) ?? null;
  const ytd = budgetVsActual(books.chart, budget, books.transactions, year, end);
  const monthActivity = accountActivity(books.chart, books.transactions, start, end);
  const groups = ytd.groups.map((g) => {
    const monthActual = sum(g.rows.map((r) => monthActivity.get(r.account.id) ?? 0));
    const monthBudget = Math.round(g.annual / 12);
    return { ...groupSummary(g), kind: g.kind, monthActual, monthBudget, rows: g.rows.map((r) => ({ name: r.account.name, number: r.account.number, monthActual: monthActivity.get(r.account.id) ?? 0, monthBudget: Math.round(r.annual / 12), ytdActual: r.actual, ytdBudget: r.toDate, annual: r.annual })) };
  });
  const opening: FundBalance[] = fundBalances(books.chart, books.transactions.filter((t) => t.date < start));
  const closing = fundBalances(books.chart, books.transactions, end);
  const missions = missionsView(books, { role: "deacon", admin: false }, end);
  const giving = givingTotals(books.gifts, start, end);
  const lastYearGiving = givingTotals(books.gifts, `${year - 1}${month.slice(4)}-01`, monthEnd(`${year - 1}${month.slice(4)}`));
  const totals = (kind: "income" | "expense") => {
    const gs = groups.filter((g) => g.kind === kind);
    return { monthActual: sum(gs.map((g) => g.monthActual)), monthBudget: sum(gs.map((g) => g.monthBudget)), ytdActual: sum(gs.map((g) => g.actual)), ytdBudget: sum(gs.map((g) => g.toDate)), annual: sum(gs.map((g) => g.annual)) };
  };
  return {
    month,
    label: monthLabel(month, "long"),
    through: end,
    demo: books.meta.demo,
    hasBudget: Boolean(budget),
    groups,
    totals: { income: totals("income"), expense: totals("expense") },
    funds: closing.map((c) => {
      const o = opening.find((x) => x.fund.id === c.fund.id)!;
      return { name: c.fund.name, restricted: c.fund.restricted, opening: o.balance, income: c.income - o.income, expenses: c.expenses - o.expenses, closing: c.balance };
    }),
    giving: { total: giving.total, count: giving.count, givers: giving.givers, byFund: books.chart.funds.map((f) => ({ name: f.name, total: giving.byFund[f.id] ?? 0 })), byMethod: giving.byMethod, lastYear: lastYearGiving.total },
    missions: {
      campaigns: missions.campaigns.map((c) => ({ name: c.campaign.name, goal: c.campaign.goal, pledged: c.pledged, received: c.received })),
      partnersCommitted: sum(missions.partners.map((p) => p.committed)),
      partnersPaid: sum(missions.partners.map((p) => p.paid)),
      fundBalance: missions.fund?.balance ?? 0,
    },
  };
}
