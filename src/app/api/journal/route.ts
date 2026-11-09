import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody } from "@/lib/finance/http";
import { respondJournal } from "@/lib/journal/http";
import { createEntry, journalActor, listEntries, ListQuery, myTags } from "@/lib/journal/service";
import { NewEntrySchema } from "@/lib/journal/types";

export const runtime = "nodejs";

/** The leader's journal (or what others shared with them): summaries only, filtered and searched. */
export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondJournal(async () => {
    const actor = await journalActor(leader);
    const sp = new URL(request.url).searchParams;
    const query = ListQuery.parse({ q: sp.get("q") || undefined, kind: sp.get("kind") || undefined, tag: sp.get("tag") || undefined, filter: sp.get("filter") || undefined });
    const [entries, tags] = await Promise.all([listEntries(actor, query), myTags(actor)]);
    return { entries: entries.map(({ haystack: _h, ...s }) => s), tags };
  });
}

const Create = z.object({ action: z.literal("create"), entry: NewEntrySchema });

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondJournal(async () => {
    const actor = await journalActor(leader);
    const input = Create.parse(await rawBody(request));
    return await createEntry(actor, input.entry);
  });
}
