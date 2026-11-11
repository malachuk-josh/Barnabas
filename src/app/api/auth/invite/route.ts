import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { inviteFor } from "@/lib/team/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** For the sign-in page: who an invite link is for, so it can greet them and fill in their email. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const record = await inviteFor(config.churchId, token);
  if (!record) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true, firstName: record.name.split(/\s+/)[0] ?? "", email: record.email, church: config.churchName });
}
