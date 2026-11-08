import type { Leader } from "../auth/session";
import { createConversation, type ConversationMeta, type Mode } from "../data/conversations";
import { newId } from "../data/ids";
import { today } from "../dates";
import { briefing } from "./briefing";
import { buildLeaderContext } from "./prompt";

export async function startConversation(
  leader: Leader,
  opts: { mode: Mode; offRecord: boolean; localDate?: string },
): Promise<ConversationMeta> {
  const localDate = opts.localDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.localDate) ? opts.localDate : today();
  const context = await buildLeaderContext({
    leader,
    mode: opts.mode,
    offRecord: opts.offRecord,
    localDate,
    briefing: await briefing(leader, localDate),
  });
  const now = Date.now();
  const meta: ConversationMeta = {
    id: newId("conv"),
    title: "New conversation",
    mode: opts.mode,
    offRecord: opts.offRecord,
    createdAt: now,
    updatedAt: now,
    context,
    turns: 0,
  };
  await createConversation(leader, meta);
  return meta;
}
