import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { audit, getDraft, saveDraft } from "@/lib/data/records";
import { respondMessages } from "@/lib/messages/http";
import { maskAddress } from "@/lib/messages/phone";
import { sendApprovedDraft } from "@/lib/messages/service";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["send", "discard"]), confirm: z.literal(true).optional() });

type Params = { params: Promise<{ id: string }> };

/**
 * The leader sends or discards one draft from the Drafts screen. Sending is the only way anything leaves
 * Barnabas, and it needs this explicit request for this draft (`confirm: true` from the Send dialog).
 */
export async function POST(request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (parsed.data.action === "send") {
    if (!parsed.data.confirm) return NextResponse.json({ error: "Confirm sending this draft." }, { status: 400 });
    return respondMessages(async () => {
      const r = await sendApprovedDraft(leader, id, { origin: new URL(request.url).origin });
      return {
        draft: r.draft,
        sent: r.sent,
        failed: r.failed,
        skipped: r.skipped,
        optedOut: r.optedOut,
        noContact: r.noContact,
        results: r.deliveries.map((d) => ({ name: d.name, to: d.to ? maskAddress(d.to) : null, status: d.status, error: d.error })),
      };
    });
  }
  const draft = await getDraft(leader, id);
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (draft.status !== "needs_review" && draft.status !== "failed") return NextResponse.json({ error: `This draft is already ${draft.status.replace("_", " ")}.` }, { status: 409 });
  draft.status = "discarded";
  await saveDraft(leader, draft);
  await audit(leader, { action: "draft.discard", detail: id });
  return NextResponse.json({ draft });
}
