import { NextResponse } from "next/server";
import { resendConfig } from "@/lib/messages/config";
import { applyResendEvent } from "@/lib/messages/service";
import { validSvix } from "@/lib/messages/signatures";

export const runtime = "nodejs";

/** Resend delivery webhooks, verified with svix signatures against RESEND_WEBHOOK_SECRET. */
export async function POST(request: Request) {
  const secret = resendConfig()?.webhookSecret;
  const body = await request.text();
  if (body.length > 200_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const ok = validSvix(secret, { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") }, body);
  if (!ok) return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  try {
    await applyResendEvent(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Unreadable event." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
