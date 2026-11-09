import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { body, respondOps } from "@/lib/ops/http";
import { clearDemoServe, serveActor } from "@/lib/serve/service";

export const runtime = "nodejs";

/** Clears the demo rosters (the teams stay). Schedulers only. */
export async function DELETE(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    await body(request, z.object({ confirm: z.literal("CLEAR") }));
    await clearDemoServe(await serveActor(leader));
    return { ok: true };
  });
}
