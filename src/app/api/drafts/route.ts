import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { listDrafts } from "@/lib/data/records";
import { messagingStatus } from "@/lib/messages/config";
import { canSendDraft } from "@/lib/messages/permissions";
import { accessFor } from "@/lib/team";

export const runtime = "nodejs";

/** The leader's drafts, whether each one is theirs to send, and which channels are set up (no secrets). */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const [drafts, access] = await Promise.all([listDrafts(leader), accessFor(leader)]);
  const status = messagingStatus();
  return NextResponse.json({
    drafts: drafts.map((d) => ({ ...d, canSend: canSendDraft(access, d) })),
    messaging: { sms: status.sms, email: status.email, webhooks: status.webhooks },
  });
}
