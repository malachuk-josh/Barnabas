import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody, respondCare } from "@/lib/care/http";
import { addPrayer, answerPrayer, PrayerInput, prayedFor } from "@/lib/care/service";
import { careFor, prayerRows } from "@/lib/care/views";

export const runtime = "nodejs";

/** Prayer requests this leader may see: shareable ones, and private ones they recorded (pastors see all). */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const { actor, book } = await careFor(leader);
    return { prayers: prayerRows(book, actor) };
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), prayer: PrayerInput }),
  z.object({ action: z.literal("prayed"), id: z.string().min(1).max(60) }),
  z.object({ action: z.literal("answered"), id: z.string().min(1).max(60), date: z.string(), note: z.string().max(400).optional() }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const input = Action.parse(await rawBody(request));
    const { actor } = await careFor(leader);
    if (input.action === "add") return { prayer: await addPrayer(actor, input.prayer) };
    if (input.action === "prayed") return { prayer: await prayedFor(actor, input.id) };
    return { prayer: await answerPrayer(actor, input.id, input.date, input.note) };
  });
}
