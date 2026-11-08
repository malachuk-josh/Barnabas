import { NextResponse, after } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { hasAnthropicKey } from "@/lib/config";
import { listConversations } from "@/lib/data/conversations";
import { warmCache } from "@/lib/engine/claude";
import { startConversation } from "@/lib/engine/conversation";

export const runtime = "nodejs";

const Body = z.object({
  mode: z.enum(["voice", "text"]).default("voice"),
  offRecord: z.boolean().default(false),
  localDate: z.string().optional(),
});

export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const items = await listConversations(leader);
  return NextResponse.json({
    conversations: items.map(({ id, title, mode, createdAt, updatedAt, turns, consolidatedAt, consolidationError, endedAt }) => ({
      id, title, mode, createdAt, updatedAt, turns, consolidatedAt, consolidationError, endedAt,
    })),
  });
}

/** Start a conversation. The prompt cache is warmed in the background while the leader is still talking. */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation settings." }, { status: 400 });
  const meta = await startConversation(leader, parsed.data);
  if (hasAnthropicKey()) {
    after(async () => {
      try {
        await warmCache(meta);
      } catch (err) {
        console.warn("[barnabas] cache warm failed", err);
      }
    });
  }
  return NextResponse.json({ id: meta.id, offRecord: meta.offRecord, mode: meta.mode });
}
