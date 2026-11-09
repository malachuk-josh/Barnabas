import type { Leader } from "../auth/session";
import { createConversation, type ConversationMeta, type Mode } from "../data/conversations";
import { newId } from "../data/ids";
import { today } from "../dates";
import { listEvents } from "../calendar/store";
import { outsideEvents } from "../calendar/service";
import { addDaysIso } from "../calendar/time";
import { churchData } from "../chms";
import { getProfile } from "../profile";
import { can, ROLE_LABELS } from "../auth/roles";
import { accessFor } from "../team";
import { briefing } from "./briefing";
import { buildLeaderContext } from "./prompt";

export async function startConversation(
  leader: Leader,
  opts: { mode: Mode; offRecord: boolean; localDate?: string },
): Promise<ConversationMeta> {
  const localDate = opts.localDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.localDate) ? opts.localDate : today();
  const until = addDaysIso(localDate, 2);
  const [leadership, profile, brief, events, outside, access] = await Promise.all([
    churchData().leadership(),
    getProfile(leader),
    briefing(leader, localDate),
    listEvents(leader, localDate, until),
    // Don't hold up the conversation for a slow calendar connection.
    outsideEvents(leader, localDate, until, { timeoutMs: 2500 }),
    accessFor(leader),
  ]);
  const context = await buildLeaderContext({
    leader,
    mode: opts.mode,
    offRecord: opts.offRecord,
    localDate,
    briefing: brief,
    profile,
    calendar: { events, outside: outside.events },
    leadership,
    access: {
      role: ROLE_LABELS[access.role],
      financeAccess: can(access, "giving.donors")
        ? "full, including individual giving"
        : can(access, "finance.view")
          ? "summaries and reports only, no donor names, can't record anything"
          : "none",
    },
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
