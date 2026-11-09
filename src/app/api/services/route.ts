import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody, respondOps } from "@/lib/ops/http";
import { GATHERING_KEYS } from "@/lib/ops/gatherings";
import { addSeries, clearDemoServices, clearPreacher, copyPlan, loadServices, PlanInput, PreachInput, removeSeries, savePlan, SeriesInput, servicesActor, setPreacher, startPlan, updateSeries } from "@/lib/services/service";

export const runtime = "nodejs";

/** Series, the preaching rotation and orders of service. Everyone signed in can read them. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const [actor, book] = await Promise.all([servicesActor(leader), loadServices(leader.churchId)]);
    return { ...book, planner: actor.planner };
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("series-add"), series: SeriesInput }),
  z.object({ action: z.literal("series-update"), id: Id, series: SeriesInput }),
  z.object({ action: z.literal("series-remove"), id: Id }),
  z.object({ action: z.literal("preach"), entry: PreachInput }),
  z.object({ action: z.literal("preach-clear"), date: z.string() }),
  z.object({ action: z.literal("plan"), plan: PlanInput }),
  z.object({ action: z.literal("plan-start"), date: z.string(), gathering: z.enum(GATHERING_KEYS) }),
  z.object({ action: z.literal("plan-copy"), date: z.string(), from: z.enum(GATHERING_KEYS), to: z.enum(GATHERING_KEYS) }),
  z.object({ action: z.literal("demo-clear"), confirm: z.literal("CLEAR") }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const input = Action.parse(await rawBody(request));
    const actor = await servicesActor(leader);
    switch (input.action) {
      case "series-add":
        return await addSeries(actor, input.series);
      case "series-update":
        return await updateSeries(actor, input.id, input.series);
      case "series-remove":
        await removeSeries(actor, input.id);
        return { ok: true };
      case "preach":
        return await setPreacher(actor, input.entry);
      case "preach-clear":
        await clearPreacher(actor, input.date);
        return { ok: true };
      case "plan":
        return await savePlan(actor, input.plan);
      case "plan-start":
        return await startPlan(actor, input.date, input.gathering);
      case "plan-copy":
        return await copyPlan(actor, input.date, input.from, input.to);
      case "demo-clear":
        await clearDemoServices(actor);
        return { ok: true };
    }
  });
}
