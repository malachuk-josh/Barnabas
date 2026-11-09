import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody, respondOps } from "@/lib/ops/http";
import { today } from "@/lib/dates";
import { GATHERING_KEYS } from "@/lib/ops/gatherings";
import {
  addBlackout, addTeam, addVolunteer, assign, AssignInput, autoFill, BlackoutInput, cancelSwap, coverageFor, draftReminders, PositionsInput, removeBlackout,
  requestSwap, respondSwap, setPositions, setStatus, signUp, SlotInput, SwapInput, TeamInput, unassign, updateVolunteer, VolunteerInput, VolunteerPatch,
} from "@/lib/serve/service";
import { myServing, pendingSwaps, rosterFor, serveFor } from "@/lib/serve/views";

export const runtime = "nodejs";

/** The roster for a date, this leader's own slots and swap requests, and pending swaps they can answer. Everyone signed in can read it. */
export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const url = new URL(request.url);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(today()).parse(url.searchParams.get("date") ?? today());
    const { actor, book } = await serveFor(leader);
    const coverFor = url.searchParams.get("cover");
    if (coverFor) {
      const slot = SlotInput.omit({ positionId: true }).parse(JSON.parse(coverFor));
      const c = coverageFor(book, slot);
      return { available: c.available.map((x) => ({ id: x.volunteer.id, name: x.volunteer.name, servedRecently: x.servedRecently })), unavailable: c.unavailable.map((x) => ({ id: x.volunteer.id, name: x.volunteer.name, reason: x.reason })) };
    }
    return { date, roster: rosterFor(book, actor, date), mine: myServing(book, actor), swaps: pendingSwaps(book, actor), scheduler: actor.scheduler };
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), slot: AssignInput }),
  z.object({ action: z.literal("signup"), slot: SlotInput }),
  z.object({ action: z.literal("unassign"), id: Id }),
  z.object({ action: z.literal("status"), id: Id, status: z.enum(["scheduled", "confirmed", "declined"]) }),
  z.object({ action: z.literal("swap"), swap: SwapInput }),
  z.object({ action: z.literal("swap-answer"), id: Id, accept: z.boolean() }),
  z.object({ action: z.literal("swap-cancel"), id: Id }),
  z.object({ action: z.literal("volunteer"), volunteer: VolunteerInput }),
  z.object({ action: z.literal("volunteer-update"), id: Id, patch: VolunteerPatch }),
  z.object({ action: z.literal("blackout"), blackout: BlackoutInput }),
  z.object({ action: z.literal("blackout-remove"), volunteerId: Id, id: Id }),
  z.object({ action: z.literal("positions"), team: PositionsInput }),
  z.object({ action: z.literal("team"), team: TeamInput }),
  z.object({ action: z.literal("autofill"), date: z.string(), gathering: z.enum(GATHERING_KEYS), teamId: Id }),
  z.object({ action: z.literal("remind"), date: z.string(), teamId: Id.optional() }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const input = Action.parse(await rawBody(request));
    const { actor } = await serveFor(leader);
    switch (input.action) {
      case "assign":
        return (await assign(actor, input.slot)).assignment;
      case "signup":
        return (await signUp(actor, input.slot)).assignment;
      case "unassign":
        return { removed: (await unassign(actor, input.id)).id };
      case "status":
        return await setStatus(actor, input.id, input.status);
      case "swap":
        return await requestSwap(actor, input.swap);
      case "swap-answer":
        return await respondSwap(actor, input.id, input.accept);
      case "swap-cancel":
        return await cancelSwap(actor, input.id);
      case "volunteer":
        return await addVolunteer(actor, input.volunteer);
      case "volunteer-update":
        return await updateVolunteer(actor, input.id, input.patch);
      case "blackout": {
        const r = await addBlackout(actor, input.blackout);
        return { blackout: r.blackout, clashes: r.clashes.length };
      }
      case "blackout-remove":
        await removeBlackout(actor, input.volunteerId, input.id);
        return { ok: true };
      case "positions":
        return await setPositions(actor, input.team);
      case "team":
        return await addTeam(actor, input.team);
      case "autofill":
        return { added: (await autoFill(actor, input)).length };
      case "remind": {
        const draft = await draftReminders(actor, input.date, input.teamId);
        return draft ? { draftId: draft.id, recipients: draft.recipients.length } : { draftId: null, recipients: 0 };
      }
    }
  });
}
