import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { config, hasAnthropicKey } from "@/lib/config";
import { churchData } from "@/lib/chms";

export const runtime = "nodejs";

/** What's connected, for the setup checklist in the app. No secrets are returned. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const storage = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? "upstash" : process.env.REDIS_URL ? "redis" : "memory";
  return NextResponse.json({
    claude: hasAnthropicKey(),
    model: config.model,
    storage,
    churchData: churchData().source,
    churchName: config.churchName,
    messaging: "not connected",
  });
}
