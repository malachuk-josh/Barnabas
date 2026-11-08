import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { PROVIDERS, connectionStatus, disconnect, existingFeedToken, feedToken, setPush, stopFeed } from "@/lib/calendar/connections";
import { appUrl } from "@/lib/calendar/oauth-state";

export const runtime = "nodejs";

async function status(request: Request, leader: Awaited<ReturnType<typeof requireLeader>>) {
  if (isResponse(leader)) return null;
  const providers = await Promise.all(
    Object.values(PROVIDERS).map(async (p) => ({ id: p.id, label: p.label, configured: p.configured(), connection: await connectionStatus(leader, p.id) })),
  );
  const token = await existingFeedToken(leader);
  const base = appUrl(request);
  const feed = token ? { https: `${base}/api/calendar/ics/${token}.ics`, webcal: `${base.replace(/^https?:/, "webcal:")}/api/calendar/ics/${token}.ics` } : null;
  return { providers, feed };
}

export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return NextResponse.json(await status(request, leader));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-feed") }),
  z.object({ action: z.literal("rotate-feed") }),
  z.object({ action: z.literal("stop-feed") }),
  z.object({ action: z.literal("disconnect"), provider: z.enum(["google", "microsoft"]) }),
  z.object({ action: z.literal("set-push"), provider: z.enum(["google", "microsoft"]), push: z.boolean() }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const body = parsed.data;
  if (body.action === "create-feed") await feedToken(leader);
  if (body.action === "rotate-feed") await feedToken(leader, true);
  if (body.action === "stop-feed") await stopFeed(leader);
  if (body.action === "disconnect") await disconnect(leader, body.provider);
  if (body.action === "set-push") await setPush(leader, body.provider, body.push);
  return NextResponse.json(await status(request, leader));
}
