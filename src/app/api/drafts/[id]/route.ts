import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { audit, getDraft, queueDraft, saveDraft } from "@/lib/data/records";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["queue", "discard"]) });

type Params = { params: Promise<{ id: string }> };

/** The leader approves (queues) or discards a draft from the review screen. */
export async function POST(request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const draft = await getDraft(leader, id);
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (draft.status !== "needs_review") return NextResponse.json({ error: `This draft is already ${draft.status}.` }, { status: 409 });
  if (parsed.data.action === "queue") {
    await queueDraft(leader, draft);
    await audit(leader, { action: "draft.queue_by_leader", detail: id });
  } else {
    draft.status = "discarded";
    await saveDraft(leader, draft);
    await audit(leader, { action: "draft.discard", detail: id });
  }
  return NextResponse.json({ draft });
}
