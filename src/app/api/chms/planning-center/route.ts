import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { respondData } from "@/lib/chms/http";
import { connectionState, connectPlanningCenter, disconnectPlanningCenter, syncPlanningCenter } from "@/lib/chms/sync";
import { rawBody } from "@/lib/finance/http";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Planning Center connection state for Settings (admins only). Says whether the token is set, never what it is. */
export async function GET() {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  return respondData(() => connectionState(leader.churchId));
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), includeServices: z.boolean().default(true) }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("disconnect"), removePeople: z.boolean().default(false) }),
]);

export async function POST(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  return respondData(async () => {
    const input = Action.parse(await rawBody(request));
    if (input.action === "connect") {
      await connectPlanningCenter(leader, input.includeServices);
      await syncPlanningCenter(leader);
    } else if (input.action === "sync") await syncPlanningCenter(leader);
    else await disconnectPlanningCenter(leader, input.removePeople);
    return connectionState(leader.churchId);
  });
}
