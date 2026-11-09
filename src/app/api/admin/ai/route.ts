import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { EFFORT_IDS, MODEL_IDS } from "@/lib/ai/choices";
import { aiSettingsView, saveAiSettings } from "@/lib/ai/settings";
import { audit } from "@/lib/data/records";

export const runtime = "nodejs";

/** Settings → Barnabas AI: which Claude models Barnabas uses. Admins only. */
export async function GET() {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  return NextResponse.json(await aiSettingsView(leader.churchId));
}

const Body = z.object({
  textModel: z.enum(MODEL_IDS).nullable(),
  voiceModel: z.enum(MODEL_IDS).nullable(),
  textEffort: z.enum(EFFORT_IDS).nullable(),
  voiceEffort: z.enum(EFFORT_IDS).nullable().optional(),
});

export async function PUT(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Choose a model and thinking level from the lists." }, { status: 400 });
  const view = await saveAiSettings(leader.churchId, leader.name, parsed.data);
  await audit(leader, { action: "settings.ai", detail: `typed ${view.textModel} (${view.textEffort}), voice ${view.voiceModel} (${view.voiceEffort})` });
  return NextResponse.json(view);
}
