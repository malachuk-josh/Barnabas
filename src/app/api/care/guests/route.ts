import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { can } from "@/lib/auth/roles";
import { rawBody, respondCare } from "@/lib/care/http";
import { completeGuestTask, draftThankYou, GuestInput, reassignGuest, recordGuest, recordVisit } from "@/lib/care/service";
import { careFor, guestRows } from "@/lib/care/views";
import { createWelcomeLink, revokeWelcomeLink } from "@/lib/care/welcome";

export const runtime = "nodejs";

/** Guest cards and their follow-up, and (for pastors, deacons and staff) the public guest-card links. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const { actor, book } = await careFor(leader);
    return { guests: guestRows(book, actor), links: can(actor.viewer.access, "care.assign") ? book.links.filter((l) => !l.revokedAt) : [] };
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record"), guest: GuestInput }),
  z.object({ action: z.literal("visit"), id: Id, date: z.string() }),
  z.object({ action: z.literal("task-done"), id: Id, taskId: Id }),
  z.object({ action: z.literal("draft"), id: Id, taskId: Id }),
  z.object({ action: z.literal("reassign"), id: Id, assigneeId: z.string().min(1).max(80) }),
  z.object({ action: z.literal("link-create"), label: z.string().max(60) }),
  z.object({ action: z.literal("link-revoke"), id: Id }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const input = Action.parse(await rawBody(request));
    const { actor } = await careFor(leader);
    switch (input.action) {
      case "record":
        return { guest: await recordGuest(leader.churchId, actor, input.guest, actor.members) };
      case "visit":
        return { guest: await recordVisit(actor, input.id, input.date) };
      case "task-done":
        return { guest: await completeGuestTask(actor, input.id, input.taskId) };
      case "draft":
        return { draft: await draftThankYou(actor, input.id, input.taskId) };
      case "reassign":
        return { guest: await reassignGuest(actor, input.id, input.assigneeId) };
      case "link-create":
        return { link: await createWelcomeLink(actor, input.label) };
      case "link-revoke":
        return { link: await revokeWelcomeLink(actor, input.id) };
    }
  });
}
