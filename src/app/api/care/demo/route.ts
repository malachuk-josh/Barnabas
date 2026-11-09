import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { body, respondCare } from "@/lib/care/http";
import { careActor, clearDemoCare } from "@/lib/care/service";

export const runtime = "nodejs";

/** Clears the demo care data and starts empty. Pastors only. */
export async function DELETE(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    await body(request, z.object({ confirm: z.literal("CLEAR") }));
    await clearDemoCare(await careActor(leader));
    return { ok: true };
  });
}
