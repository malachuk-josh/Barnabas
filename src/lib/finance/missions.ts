import { donorKey } from "./giving";
import { inRange, naturalAmount } from "./ledger";
import { sum } from "./money";
import type { Campaign, Gift, Missions, MissionsPartner, MissionsPledge, Transaction } from "./types";

export const MISSIONS_FUND = "missions";

/** Whole months of a partner's commitment that fall between from and to (inclusive). */
export function monthsCommitted(p: Pick<MissionsPartner, "pledgeStart" | "pledgeEnd">, from: string, to: string): number {
  const start = p.pledgeStart > from ? p.pledgeStart : from;
  const end = p.pledgeEnd && p.pledgeEnd < to ? p.pledgeEnd : to;
  if (end < start) return 0;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

export type PartnerStatus = { partner: MissionsPartner; committed: number; paid: number; lastUpdate?: string };

export function partnerStatus(missions: Missions, txns: Transaction[], from: string, to: string): PartnerStatus[] {
  return missions.partners.map((partner) => {
    let paid = 0;
    for (const t of txns) {
      if (!inRange(t.date, from, to)) continue;
      for (const l of t.lines) if (l.partnerId === partner.id) paid += naturalAmount(t, "expense", l.amount);
    }
    const committed = partner.active ? partner.monthly * monthsCommitted(partner, from, to) : 0;
    const lastUpdate = [...partner.updates].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    return { partner, committed, paid, lastUpdate };
  });
}

export type CampaignStatus = { campaign: Campaign; pledged: number; received: number; pledgeCount: number; pctOfGoal: number | null };

/** Faith-promise campaign: pledges toward it, and gifts to the Missions fund during its dates. */
export function campaignStatus(campaign: Campaign, pledges: MissionsPledge[], gifts: Gift[], asOf: string): CampaignStatus {
  const mine = pledges.filter((p) => p.campaignId === campaign.id);
  const end = campaign.end < asOf ? campaign.end : asOf;
  const received = sum(gifts.filter((g) => g.fundId === MISSIONS_FUND && inRange(g.date, campaign.start, end)).map((g) => g.amount));
  return { campaign, pledged: sum(mine.map((p) => p.amount)), received, pledgeCount: mine.length, pctOfGoal: campaign.goal ? Math.round((received / campaign.goal) * 1000) / 10 : null };
}

export type PledgeProgress = { pledge: MissionsPledge; given: number };

/** Each pledge with what that donor has given to Missions during the campaign. Donor-level: pastor and treasurer only. */
export function pledgeProgress(missions: Missions, gifts: Gift[], asOf: string): PledgeProgress[] {
  return missions.pledges.map((pledge) => {
    const c = missions.campaigns.find((x) => x.id === pledge.campaignId);
    const key = donorKey(pledge);
    const given = sum(
      gifts.filter((g) => g.fundId === MISSIONS_FUND && donorKey(g) === key && (!c || inRange(g.date, c.start, c.end < asOf ? c.end : asOf))).map((g) => g.amount),
    );
    return { pledge, given };
  });
}
