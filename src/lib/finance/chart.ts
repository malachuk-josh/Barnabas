import type { Account, Chart, Fund } from "./types";

const a = (number: string, name: string, type: Account["type"], group: string, extra: Partial<Account> = {}): Account => ({
  id: `acct_${number}`,
  number,
  name,
  type,
  group,
  ...extra,
});

/** A starting chart of accounts for a church of one to three hundred people. */
export function defaultAccounts(): Account[] {
  return [
    a("1000", "Operating checking", "asset", "Bank accounts", { bank: true, openingBalance: 0 }),
    a("1010", "Savings (money market)", "asset", "Bank accounts", { bank: true, openingBalance: 0 }),
    a("2000", "Payroll liabilities", "liability", "Liabilities", { openingBalance: 0 }),
    a("2100", "Credit card payable", "liability", "Liabilities", { openingBalance: 0 }),

    a("4000", "Tithes and general offerings", "income", "Giving"),
    a("4100", "Missions offerings", "income", "Giving", { defaultFundId: "missions" }),
    a("4200", "Building fund gifts", "income", "Giving", { defaultFundId: "building" }),
    a("4300", "Benevolence gifts", "income", "Giving", { defaultFundId: "benevolence" }),
    a("4400", "Facility rental", "income", "Other income"),
    a("4500", "Interest income", "income", "Other income"),

    a("5000", "Pastoral salaries", "expense", "Salaries and benefits", { payroll: true }),
    a("5010", "Housing allowance (clergy)", "expense", "Salaries and benefits", { payroll: true }),
    a("5020", "Staff wages", "expense", "Salaries and benefits", { payroll: true }),
    a("5030", "Payroll taxes (employer)", "expense", "Salaries and benefits", { payroll: true }),
    a("5040", "Health insurance", "expense", "Salaries and benefits"),
    a("5050", "Retirement contributions", "expense", "Salaries and benefits"),

    a("5100", "Missionary support", "expense", "Missions", { defaultFundId: "missions" }),
    a("5110", "Local outreach", "expense", "Missions"),
    a("5120", "Short-term mission trips", "expense", "Missions"),

    a("5200", "Building loan payment", "expense", "Facilities"),
    a("5210", "Repairs and maintenance", "expense", "Facilities"),
    a("5220", "Property insurance", "expense", "Facilities"),
    a("5230", "Custodial and grounds", "expense", "Facilities"),
    a("5240", "Capital improvements", "expense", "Facilities", { defaultFundId: "building" }),

    a("5300", "Electricity", "expense", "Utilities"),
    a("5310", "Heating oil", "expense", "Utilities"),
    a("5320", "Water and sewer", "expense", "Utilities"),
    a("5330", "Phone and internet", "expense", "Utilities"),

    a("5400", "Kids ministry", "expense", "Ministries"),
    a("5410", "Teens ministry", "expense", "Ministries"),
    a("5420", "Adult discipleship", "expense", "Ministries"),
    a("5430", "Worship and tech", "expense", "Ministries"),
    a("5440", "Hospitality and events", "expense", "Ministries"),

    a("5500", "Benevolence assistance", "expense", "Benevolence", { defaultFundId: "benevolence" }),

    a("5600", "Office supplies and postage", "expense", "Administration"),
    a("5610", "Software and subscriptions", "expense", "Administration"),
    a("5620", "Bank and processing fees", "expense", "Administration"),
    a("5630", "Accounting and review", "expense", "Administration"),
  ];
}

export function defaultFunds(): Fund[] {
  return [
    { id: "general", name: "General fund", restricted: false, incomeAccountId: "acct_4000", openingBalance: 0, description: "Unrestricted: the church's day-to-day ministry and operations." },
    { id: "missions", name: "Missions", restricted: true, incomeAccountId: "acct_4100", openingBalance: 0, description: "Given for missions: missionary support and the faith-promise campaign." },
    { id: "building", name: "Building", restricted: true, incomeAccountId: "acct_4200", openingBalance: 0, description: "Given for capital projects on the building." },
    { id: "benevolence", name: "Benevolence", restricted: true, incomeAccountId: "acct_4300", openingBalance: 0, description: "Given to help people in need, in the church and the community." },
  ];
}

export function defaultChart(): Chart {
  return { accounts: defaultAccounts(), funds: defaultFunds() };
}
