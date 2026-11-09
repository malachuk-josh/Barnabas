import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { body, respond } from "@/lib/finance/http";
import { clearDemoData } from "@/lib/finance/service";

export const runtime = "nodejs";

/** Clears the demo finance data and starts empty books. Pastors and treasurers only. */
export async function DELETE(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => {
    await body(request, z.object({ confirm: z.literal("CLEAR") }));
    await clearDemoData(leader);
    return { ok: true };
  });
}
