import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { emptyTwiml, verifiedTwilioParams } from "@/lib/messages/http";
import { applyInboundSms } from "@/lib/messages/service";

export const runtime = "nodejs";

/**
 * Incoming texts to the church's number (Twilio's "A message comes in" webhook). Only STOP/START keywords
 * are acted on: they update the church's do-not-text list. Twilio itself replies to STOP and blocks sends.
 */
export async function POST(request: Request) {
  const params = await verifiedTwilioParams(request);
  if (!params) return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  const church = new URL(request.url).searchParams.get("c") || config.churchId;
  await applyInboundSms(church.slice(0, 60), params);
  return emptyTwiml();
}
