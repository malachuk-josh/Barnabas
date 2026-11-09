import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody } from "@/lib/finance/http";
import { respondInbox } from "@/lib/inbox/http";
import { inboxActor, listThreads, startThread, StartInput } from "@/lib/inbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** My conversations, most recent first, with unread counts. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondInbox(async () => listThreads(await inboxActor(leader)));
}

/** Start a conversation (or add to the one with exactly these people, about the same child). */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondInbox(async () => {
    const input = StartInput.parse(await rawBody(request));
    const r = await startThread(await inboxActor(leader), input);
    return { threadId: r.thread.id, created: r.created, messageId: r.message.id };
  });
}
