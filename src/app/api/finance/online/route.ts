import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { audit } from "@/lib/data/records";
import { rawBody, respond } from "@/lib/finance/http";
import { recordPayout, setFundOnline } from "@/lib/finance/online";
import { FinanceError } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";
import { markReviewed } from "@/lib/people/online";
import { stripePort } from "@/lib/stripe/client";
import { loadOnlineSettings, saveOnlineSettings, savePayouts } from "@/lib/stripe/store";
import { onlineGivingView } from "@/lib/stripe/view";

export const runtime = "nodejs";

/** Online giving: connection status, totals, funds and payouts (finance.view); gifts and new givers need giving.donors. */
export async function GET() {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  return respond(async () => ({ online: await onlineGivingView(await loadBooks(leader.churchId), leader.access, leader.churchId) }));
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fund-online"), fundId: z.string().min(1).max(40), online: z.boolean() }),
  z.object({ action: z.literal("thank-you"), on: z.boolean() }),
  z.object({ action: z.literal("refresh-payouts") }),
  z.object({ action: z.literal("reviewed"), personId: z.string().min(1).max(60) }),
]);

/**
 * Changes for pastors and treasurers (finance.edit). There is no refund or charge action: refunds are made
 * in the Stripe dashboard and recorded here from Stripe's webhook.
 */
export async function POST(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => {
    const input = Action.parse(await rawBody(request));
    switch (input.action) {
      case "fund-online":
        return { fund: await setFundOnline(leader, input.fundId, input.online) };
      case "thank-you": {
        if (!can(leader.access, "giving.donors")) throw new FinanceError("Thank-you drafts name givers, so they need individual giving access.");
        const s = await loadOnlineSettings(leader.churchId);
        s.thankYou = input.on ? { on: true, leaderId: leader.leaderId, leaderName: leader.name } : { on: false };
        await saveOnlineSettings(leader.churchId, s);
        await audit(leader, { action: "finance.online.thank-you", detail: input.on ? "Thank-you drafts on (to this leader's Drafts)" : "Thank-you drafts off" });
        return { thankYou: s.thankYou };
      }
      case "refresh-payouts": {
        const port = stripePort();
        if (!port) throw new FinanceError("Stripe isn't connected yet.");
        let payouts;
        try {
          payouts = await port.recentPayouts(20);
        } catch {
          throw new FinanceError("Couldn't reach Stripe just now. Try again in a minute.");
        }
        let recorded = 0;
        const stored = [];
        for (const p of payouts) {
          let txnId: string | undefined;
          if (p.status === "paid") {
            const r = await recordPayout(leader, { id: p.id, amount: p.amount, arrivalDate: p.arrivalDate, gross: p.gross, fees: p.fees, refunds: p.refunds, count: p.count });
            if (r.txn && !r.duplicate) recorded++;
            txnId = r.txn?.id;
          }
          stored.push({ ...p, recordedAt: Date.now(), txnId });
        }
        await savePayouts(leader.churchId, stored);
        await audit(leader, { action: "finance.online.payouts", detail: `Fetched ${payouts.length} payouts from Stripe, ${recorded} new in the books` });
        return { fetched: payouts.length, recorded };
      }
      case "reviewed": {
        if (!can(leader.access, "giving.donors")) throw new FinanceError("Only the pastor or treasurer reviews online givers.");
        return { ok: await markReviewed(leader, input.personId) };
      }
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  });
}
