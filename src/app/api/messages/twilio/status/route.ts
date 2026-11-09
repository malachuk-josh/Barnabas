import { NextResponse } from "next/server";
import { verifiedTwilioParams } from "@/lib/messages/http";
import { applyTwilioCallback } from "@/lib/messages/service";

export const runtime = "nodejs";

/** Twilio's message status callback. Public (see middleware); every request must carry a valid Twilio signature. */
export async function POST(request: Request) {
  const params = await verifiedTwilioParams(request);
  if (!params) return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  await applyTwilioCallback(params);
  return new Response(null, { status: 204 });
}
