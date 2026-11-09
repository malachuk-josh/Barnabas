/**
 * Church finance: lightweight fund accounting.
 *
 * - The chart of accounts has assets (bank accounts), liabilities, income and expenses.
 * - Funds are General (unrestricted) and restricted funds (Missions, Building, Benevolence...).
 * - A transaction moves money in or out of one bank account and is split into lines.
 *   Each line names an account (what it was for), a fund (whose money it is), an amount and a memo.
 * - Gift records are the donor detail behind deposits: each gift entry posts a deposit transaction.
 *
 * Amounts are whole cents (integers) everywhere, so sums never drift.
 */

export type AccountType = "asset" | "liability" | "income" | "expense";

export type Account = {
  id: string;
  /** Account number, e.g. "5010". Sorts the chart. */
  number: string;
  name: string;
  type: AccountType;
  /** Ministry or category used for budgets and reports, e.g. "Staff", "Facilities". */
  group: string;
  /** Bank accounts (assets) can be reconciled and receive imports. */
  bank?: boolean;
  /** Opening balance in cents (bank accounts and liabilities), as of the books' start date. */
  openingBalance?: number;
  /** Paychecks for these run through the payroll provider; Barnabas only records the expense. */
  payroll?: boolean;
  /** Restricted fund this account normally belongs to (e.g. missionary support → Missions). */
  defaultFundId?: string;
  archived?: boolean;
};

export type Fund = {
  id: string;
  name: string;
  restricted: boolean;
  /** The income account gifts to this fund post to. */
  incomeAccountId: string;
  /** Opening balance in cents as of the books' start date. */
  openingBalance: number;
  description?: string;
};

export type TxnLine = {
  accountId: string;
  fundId: string;
  /** Positive cents. Direction comes from the transaction. */
  amount: number;
  memo?: string;
  /** Missions support paid to this partner. */
  partnerId?: string;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  /** The bank account money moved in or out of. */
  bankAccountId: string;
  direction: "in" | "out";
  lines: TxnLine[];
  /** Cleared at the bank (ticked during reconciliation). */
  cleared: boolean;
  /** Set when a finished reconciliation locked this transaction. */
  reconciliationId?: string;
  source: "manual" | "import" | "giving" | "barnabas";
  /** Check number or bank reference. */
  reference?: string;
  /** Gift entries posted by this deposit. */
  giftBatchId?: string;
  createdAt: number;
  createdBy: string;
};

export const GIFT_METHODS = ["cash", "check", "online", "ach"] as const;
export type GiftMethod = (typeof GIFT_METHODS)[number];
export const METHOD_LABELS: Record<GiftMethod, string> = { cash: "Cash", check: "Check", online: "Online", ach: "ACH" };

export type Gift = {
  id: string;
  date: string;
  /** The ChMS person, when the donor is in the church directory. */
  personId?: string;
  donorName: string;
  amount: number;
  fundId: string;
  method: GiftMethod;
  checkNumber?: string;
  /** Sunday batch or single-entry batch this gift was deposited with. */
  batchId: string;
  /** The deposit transaction. */
  txnId: string;
  recurringId?: string;
  pledgeId?: string;
  createdAt: number;
  createdBy: string;
};

export type Recurring = {
  id: string;
  personId?: string;
  donorName: string;
  amount: number;
  fundId: string;
  method: GiftMethod;
  frequency: "weekly" | "biweekly" | "monthly";
  startDate: string;
  active: boolean;
  /** Last occurrence that was recorded as a gift. */
  lastRecorded?: string;
};

export type BudgetLine = {
  accountId: string;
  /** Cents for the whole fiscal year. */
  annual: number;
  /** How the amount was entered, so the editor shows it the same way. */
  basis: "annual" | "monthly";
  /** "seasonal" for one-time or lumpy spending (insurance, a trip): judged only against the whole year. */
  timing?: "even" | "seasonal";
  note?: string;
};

export type Budget = {
  year: number;
  lines: BudgetLine[];
  notes: string;
  updatedAt: number;
  updatedBy: string;
};

export type Reconciliation = {
  id: string;
  bankAccountId: string;
  statementDate: string;
  /** Statement ending balance in cents. */
  statementBalance: number;
  status: "open" | "finished";
  finishedAt?: number;
  finishedBy?: string;
};

export type PartnerKind = "missionary" | "organization";

export type PrayerUpdate = { id: string; date: string; text: string };

export type MissionsPartner = {
  id: string;
  name: string;
  kind: PartnerKind;
  /** Field or country, e.g. "Northern Peru". */
  field: string;
  /** e.g. "Church planting", "Bible translation". */
  type: string;
  supportLevel: "full" | "partial" | "project";
  /** The church's monthly commitment in cents. */
  monthly: number;
  pledgeStart: string;
  pledgeEnd?: string;
  updates: PrayerUpdate[];
  active: boolean;
};

export type MissionsPledge = {
  id: string;
  personId?: string;
  donorName: string;
  /** Total pledged in cents for the campaign period. */
  amount: number;
  campaignId?: string;
  createdAt: number;
};

export type Campaign = {
  id: string;
  name: string;
  /** Goal in cents. */
  goal: number;
  start: string;
  end: string;
  note?: string;
};

export type Missions = { partners: MissionsPartner[]; pledges: MissionsPledge[]; campaigns: Campaign[] };

export type FinanceMeta = {
  /** Demo data is on show; the app labels it. */
  demo: boolean;
  /** The books' start date: opening balances are as of this day. */
  startDate: string;
  createdAt: number;
  /** Set when a pastor or treasurer cleared the demo data. */
  clearedAt?: number;
};

export type Chart = { accounts: Account[]; funds: Fund[] };

/** Everything for one church, loaded together. Years cover transactions and gifts on hand. */
export type Books = {
  meta: FinanceMeta;
  chart: Chart;
  transactions: Transaction[];
  gifts: Gift[];
  recurring: Recurring[];
  budgets: Budget[];
  reconciliations: Reconciliation[];
  missions: Missions;
};
