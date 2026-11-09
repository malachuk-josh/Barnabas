import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { maskAddress } from "@/lib/messages/phone";
import { canSeeSendLog } from "@/lib/messages/permissions";
import { listDeliveries, optOuts } from "@/lib/messages/store";
import { accessFor } from "@/lib/team";

export const runtime = "nodejs";

/** The church's send log, with addresses masked. Pastors and staff see every send; deacons their own. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const scope = canSeeSendLog(await accessFor(leader));
  if (scope === "none") return NextResponse.json({ error: "Your role doesn't include the send log." }, { status: 403 });
  const [all, blocked] = await Promise.all([listDeliveries(leader.churchId), optOuts(leader.churchId)]);
  const rows = all.filter((d) => scope === "all" || d.approvedBy === leader.leaderId);
  return NextResponse.json({
    scope,
    optOuts: { phones: blocked.phones.size, emails: blocked.emails.size },
    deliveries: rows.map((d) => ({ id: d.id, draftId: d.draftId, name: d.name, channel: d.channel, to: d.to ? maskAddress(d.to) : null, status: d.status, error: d.error, approvedByName: d.approvedByName, createdAt: d.createdAt, updatedAt: d.updatedAt })),
  });
}
