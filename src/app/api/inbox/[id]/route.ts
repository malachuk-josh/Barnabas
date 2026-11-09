import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody } from "@/lib/finance/http";
import { respondInbox } from "@/lib/inbox/http";
import { inboxActor, openThread, reply, ReplyInput } from "@/lib/inbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** A conversation's messages (participants only; everyone else gets 404). Marks it read. */
export async function GET(_request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  return respondInbox(async () => openThread(await inboxActor(leader), id));
}

/** Reply in a conversation. */
export async function POST(request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  return respondInbox(async () => {
    const input = ReplyInput.parse(await rawBody(request));
    const r = await reply(await inboxActor(leader), id, input);
    return { messageId: r.message.id };
  });
}
