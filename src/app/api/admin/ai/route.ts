import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { EFFORT_IDS, HOST_RE, MAX_WEB_DOMAINS, MODEL_IDS } from "@/lib/ai/choices";
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
  textModel: z.enum(MODEL_IDS).nullable().optional(),
  voiceModel: z.enum(MODEL_IDS).nullable().optional(),
  textEffort: z.enum(EFFORT_IDS).nullable().optional(),
  voiceEffort: z.enum(EFFORT_IDS).nullable().optional(),
  voiceStability: z.number().min(0).max(1).nullable().optional(),
  voiceStyle: z.number().min(0).max(1).nullable().optional(),
  webSearch: z.boolean().optional(),
  webDomains: z
    .array(z.string().trim().toLowerCase().regex(HOST_RE, "Use plain site names like biblegateway.com."))
    .max(MAX_WEB_DOMAINS)
    .optional(),
});

export async function PUT(request: Request) {
  const leader = await requirePermission("team.manage");
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const domainIssue = parsed.error.issues.find((i) => i.path[0] === "webDomains");
    return NextResponse.json({ error: domainIssue ? `Check the site list: ${domainIssue.message}` : "Choose a model and thinking level from the lists, and keep the voice sliders between 0 and 1." }, { status: 400 });
  }
  const view = await saveAiSettings(leader.churchId, leader.name, parsed.data);
  await audit(leader, { action: "settings.ai", detail: `typed ${view.textModel} (${view.textEffort}), voice ${view.voiceModel} (${view.voiceEffort}), stability ${view.voiceStability}, style ${view.voiceStyle}, web ${view.webSearch ? "on" : "off"}${view.webDomains.length ? ` (${view.webDomains.join(", ")})` : ""}` });
  return NextResponse.json(view);
}
