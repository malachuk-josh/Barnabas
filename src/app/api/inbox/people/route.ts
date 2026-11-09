import { isResponse, requireLeader } from "@/lib/auth/require";
import { respondInbox } from "@/lib/inbox/http";
import { inboxActor, messagablePeople } from "@/lib/inbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who I may start a conversation with: leaderId, name and level. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondInbox(async () => ({ people: await messagablePeople(await inboxActor(leader)) }));
}
