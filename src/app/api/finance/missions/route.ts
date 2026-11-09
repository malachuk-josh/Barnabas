import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { today } from "@/lib/dates";
import { rawBody, respond } from "@/lib/finance/http";
import { CampaignInput, PartnerInput, PledgeInput, addCampaign, addPledge, addPrayerUpdate, savePartner } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";
import { missionsView } from "@/lib/finance/views";

export const runtime = "nodejs";

/** Partners, campaigns and the Missions fund. Pledges by name only for pastors and treasurers. */
export async function GET() {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  return respond(async () => ({ missions: missionsView(await loadBooks(leader.churchId), leader.access, today()) }));
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save-partner"), id: z.string().max(60).optional(), partner: PartnerInput }),
  z.object({ action: z.literal("add-update"), partnerId: z.string().min(1).max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("add-pledge"), pledge: PledgeInput }),
  z.object({ action: z.literal("add-campaign"), campaign: CampaignInput }),
]);

export async function POST(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => {
    const input = Action.parse(await rawBody(request));
    switch (input.action) {
      case "save-partner":
        return { partner: await savePartner(leader, input.partner, input.id) };
      case "add-update":
        return { update: await addPrayerUpdate(leader, input.partnerId, input.date, input.text) };
      case "add-pledge": {
        // Pledges are donor-level records.
        const donors = await requirePermission("giving.donors");
        if (isResponse(donors)) return donors;
        return { pledge: await addPledge(leader, input.pledge) };
      }
      case "add-campaign":
        return { campaign: await addCampaign(leader, input.campaign) };
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  });
}
