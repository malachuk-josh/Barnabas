import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody } from "@/lib/finance/http";
import { respondJournal } from "@/lib/journal/http";
import { deleteEntry, duplicateEntry, getEntry, journalActor, linkPreaching, PreachLinkInput, SendInput, sendToService, setArchived, setPinned, setShared, updateEntry } from "@/lib/journal/service";
import { EntryPatchSchema } from "@/lib/journal/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const Id = z.string().min(1).max(40);

/** One entry: the leader's own, or one shared with the leadership team (read-only). */
export async function GET(_request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondJournal(async () => {
    const actor = await journalActor(leader);
    return await getEntry(actor, Id.parse((await params).id));
  });
}

/** Autosave from the editor. Owner only. */
export async function PATCH(request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondJournal(async () => {
    const actor = await journalActor(leader);
    const patch = EntryPatchSchema.parse(await rawBody(request));
    const e = await updateEntry(actor, Id.parse((await params).id), patch);
    return { ok: true, updatedAt: e.updatedAt };
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("duplicate") }),
  z.object({ action: z.literal("pin"), pinned: z.boolean() }),
  z.object({ action: z.literal("archive"), archived: z.boolean() }),
  z.object({ action: z.literal("share"), shared: z.boolean() }),
  z.object({ action: z.literal("link-preaching"), link: PreachLinkInput }),
  // Adding songs to Services needs an explicit yes from the leader, sent as confirm: true.
  z.object({ action: z.literal("send-to-service"), target: SendInput, confirm: z.literal(true, { message: "Confirm sending the setlist first." }) }),
]);

export async function POST(request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondJournal(async () => {
    const actor = await journalActor(leader);
    const id = Id.parse((await params).id);
    const input = Action.parse(await rawBody(request));
    switch (input.action) {
      case "duplicate":
        return await duplicateEntry(actor, id);
      case "pin":
        return await setPinned(actor, id, input.pinned);
      case "archive":
        return await setArchived(actor, id, input.archived);
      case "share":
        return await setShared(actor, id, input.shared);
      case "link-preaching":
        return await linkPreaching(actor, id, input.link);
      case "send-to-service": {
        const out = await sendToService(actor, id, input.target);
        return { entry: out.entry, started: out.started, songs: out.songs };
      }
    }
  });
}

const Delete = z.object({ confirm: z.literal("DELETE") });

/** Deletes for good, after the leader confirms. Owner only. */
export async function DELETE(request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondJournal(async () => {
    const actor = await journalActor(leader);
    Delete.parse(await rawBody(request));
    await deleteEntry(actor, Id.parse((await params).id));
    return { ok: true };
  });
}
