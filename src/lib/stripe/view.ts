import { can, type Access } from "../auth/roles";
import { today } from "../dates";
import { onlineTotals, STRIPE_ACCOUNT_ID } from "../finance/online";
import { accountBalance } from "../finance/ledger";
import type { Books } from "../finance/types";
import { peopleToReview } from "../people/online";
import { stripeStatus } from "./config";
import { listPayouts, loadOnlineSettings } from "./store";

/**
 * The Finance → Online giving screen's data. Totals, funds and payouts for everyone with finance access;
 * individual online gifts and new givers to review only with `giving.donors` (pastor, treasurer).
 */
export async function onlineGivingView(books: Books, access: Access, churchId: string, asOf = today()) {
  const year = asOf.slice(0, 4);
  const month = asOf.slice(0, 7);
  const donors = can(access, "giving.donors");
  const [payouts, settings, review] = await Promise.all([listPayouts(churchId), loadOnlineSettings(churchId), donors ? peopleToReview(churchId).catch(() => []) : Promise.resolve([])]);
  const fundName = new Map(books.chart.funds.map((f) => [f.id, f.name]));
  const stripeAccount = books.chart.accounts.find((a) => a.id === STRIPE_ACCOUNT_ID);
  const bankDeposits = new Map(books.transactions.filter((t) => t.importKey?.startsWith("stripe-payout:")).map((t) => [t.reference, t]));
  return {
    status: stripeStatus(),
    asOf,
    year: onlineTotals(books, `${year}-01-01`, asOf),
    month: onlineTotals(books, `${month}-01`, asOf),
    funds: books.chart.funds.map((f) => ({ id: f.id, name: f.name, restricted: f.restricted, online: Boolean(f.online) })),
    stripeBalance: stripeAccount ? accountBalance(stripeAccount, books.transactions, { asOf }) : 0,
    payouts: payouts.map((p) => ({ ...p, inBooks: bankDeposits.has(p.id), cleared: bankDeposits.get(p.id)?.cleared ?? false })),
    thankYou: settings.thankYou,
    gifts: donors
      ? books.gifts
          .filter((g) => g.online)
          .slice(-40)
          .reverse()
          .map((g) => ({ id: g.id, date: g.date, donorName: g.donorName, personId: g.personId, amount: g.amount, fee: g.fee ?? 0, net: g.net ?? g.amount, fund: fundName.get(g.fundId) ?? g.fundId, method: g.method, recurring: Boolean(g.online?.subscriptionId), reversal: Boolean(g.reversalOf), disputed: Boolean(g.disputed), testMode: Boolean(g.online?.testMode) }))
      : null,
    review: donors ? review : null,
  };
}
export type OnlineGivingView = Awaited<ReturnType<typeof onlineGivingView>>;
