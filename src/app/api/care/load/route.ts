import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody, respondCare } from "@/lib/care/http";
import { logDayOff, removeDayOff } from "@/lib/care/service";
import { careFor, myCareLoad, teamView } from "@/lib/care/views";

export const runtime = "nodejs";

/** The signed-in leader's own care load (only ever theirs), and the team's totals without names. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const { actor, book } = await careFor(leader);
    return { mine: await myCareLoad(leader, book, actor), team: teamView(book) };
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("day-off"), date: z.string(), note: z.string().max(400).optional() }),
  z.object({ action: z.literal("remove-day-off"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const input = Action.parse(await rawBody(request));
    if (input.action === "day-off") await logDayOff(leader, input.date, input.note);
    else await removeDayOff(leader, input.date);
    return { ok: true };
  });
}
