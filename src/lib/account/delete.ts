import type { Leader } from "../auth/session";
import { deletePassword } from "../auth/credentials";
import { revokeLinks } from "../auth/links";
import { PROVIDERS, disconnect, stopFeed } from "../calendar/connections";
import { clearCalendar } from "../calendar/store";
import { careLeaderKeys } from "../care/store";
import { deleteConversation, listConversations } from "../data/conversations";
import { leaderRecordKeys, listDrafts } from "../data/records";
import { deleteJournal } from "../journal/store";
import { MemoryFS } from "../memory/fs";
import { subscriptionsKey } from "../notifications/subscriptions";
import { profileKey } from "../profile";
import { kv } from "../store";
import { forgetLeader } from "../team";

/**
 * Deletes everything Barnabas stores about one leader: memory, conversations, drafts, calendar connections,
 * feed and events, journal, shepherding records, profile, push subscriptions, password and links, and the
 * leader record. Used by "Delete all my data" (/api/account) and the owner's "Remove user and delete their
 * data". Nothing is read back to the caller.
 */
export async function deleteLeaderData(leader: Leader) {
  const fs = new MemoryFS({ churchId: leader.churchId, leaderId: leader.leaderId });
  for (const path of await fs.paths()) await fs.run({ command: "delete", path });
  for (const c of await listConversations(leader)) await deleteConversation(leader, c.id);
  for (const d of await listDrafts(leader)) await kv().del(`draft:${leader.churchId}:${leader.leaderId}:${d.id}`);
  for (const p of Object.values(PROVIDERS)) await disconnect(leader, p.id);
  await stopFeed(leader);
  await clearCalendar(leader);
  await deleteJournal(leader);
  await deletePassword(leader.churchId, leader.leaderId);
  await revokeLinks(leader.churchId, leader.leaderId);
  await kv().del(
    ...leaderRecordKeys(leader),
    ...careLeaderKeys(leader.churchId, leader.leaderId),
    `pcare:${leader.churchId}:rest-seeded:${leader.leaderId}`,
    profileKey(leader),
    subscriptionsKey(leader),
    `cal:${leader.churchId}:${leader.leaderId}`,
    `leader:${leader.churchId}:${leader.leaderId}`,
  );
  await forgetLeader(leader);
}
