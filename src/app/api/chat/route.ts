import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { hasAnthropicKey } from "@/lib/config";
import { getConversation } from "@/lib/data/conversations";
import { runTurn } from "@/lib/engine/turn";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  conversationId: z.string().min(1).max(60),
  text: z.string().trim().min(1).max(4000),
  interruptedAfter: z.string().max(600).optional(),
  localTime: z.string().max(80).optional(),
  voice: z.boolean().optional(),
});

/** One leader turn, streamed back as newline-delimited JSON events. */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Say or type something first." }, { status: 400 });
  if (!hasAnthropicKey()) {
    return NextResponse.json({ error: "Barnabas isn't connected to Claude yet. Add ANTHROPIC_API_KEY to the server settings." }, { status: 503 });
  }
  const meta = await getConversation(leader, parsed.data.conversationId);
  if (!meta) return NextResponse.json({ error: "That conversation has ended. Start a new one." }, { status: 404 });

  const encoder = new TextEncoder();
  const events = runTurn({ leader, meta, ...parsed.data });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    async cancel() {
      // The leader's app stopped reading (for example, they closed it). Let the turn finish
      // so the full reply is saved; history must stay complete and append-only.
      for await (const _ of events) {
        // drain
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
