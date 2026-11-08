import { NextResponse, after } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { hasAnthropicKey } from "@/lib/config";
import { deleteConversation, getConversation, saveConversation } from "@/lib/data/conversations";
import { consolidateConversation } from "@/lib/engine/memory-jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** End a conversation. Off-the-record conversations are erased; others update memory in the background. */
export async function POST(_request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  const meta = await getConversation(leader, id);
  if (!meta) return NextResponse.json({ ok: true });
  if (meta.offRecord || meta.turns === 0) {
    await deleteConversation(leader, id);
    return NextResponse.json({ ok: true, erased: true });
  }
  meta.endedAt = Date.now();
  await saveConversation(leader, meta);
  if (meta.turns > 0 && hasAnthropicKey()) {
    after(async () => {
      await consolidateConversation(leader, id);
    });
  }
  return NextResponse.json({ ok: true, consolidating: meta.turns > 0 });
}
