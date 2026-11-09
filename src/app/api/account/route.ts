import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { PROVIDERS, disconnect, stopFeed } from "@/lib/calendar/connections";
import { clearCalendar } from "@/lib/calendar/store";
import { deleteConversation, listConversations } from "@/lib/data/conversations";
import { leaderRecordKeys, listDrafts } from "@/lib/data/records";
import { MemoryFS } from "@/lib/memory/fs";
import { profileKey } from "@/lib/profile";
import { kv } from "@/lib/store";
import { forgetLeader } from "@/lib/team";

export const runtime = "nodejs";

const Body = z.object({ confirm: z.literal("DELETE") });

/** Deletes everything Barnabas stores about the signed-in leader, then signs them out. */
export async function DELETE(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!Body.safeParse(await request.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  }
  const fs = new MemoryFS({ churchId: leader.churchId, leaderId: leader.leaderId });
  for (const path of await fs.paths()) await fs.run({ command: "delete", path });
  for (const c of await listConversations(leader)) await deleteConversation(leader, c.id);
  for (const d of await listDrafts(leader)) await kv().del(`draft:${leader.churchId}:${leader.leaderId}:${d.id}`);
  for (const p of Object.values(PROVIDERS)) await disconnect(leader, p.id);
  await stopFeed(leader);
  await clearCalendar(leader);
  await kv().del(...leaderRecordKeys(leader), profileKey(leader), `cal:${leader.churchId}:${leader.leaderId}`, `leader:${leader.churchId}:${leader.leaderId}`);
  await forgetLeader(leader);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
