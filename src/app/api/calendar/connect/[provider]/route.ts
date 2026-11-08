import { NextResponse } from "next/server";
import { currentLeader } from "@/lib/auth/session";
import { provider as findProvider } from "@/lib/calendar/connections";
import { appUrl, makeState } from "@/lib/calendar/oauth-state";

export const runtime = "nodejs";

type Params = { params: Promise<{ provider: string }> };

/** Starts the sign-in with Google or Microsoft. */
export async function GET(request: Request, { params }: Params) {
  const base = appUrl(request);
  const leader = await currentLeader();
  if (!leader) return NextResponse.redirect(`${base}/signin`);
  const { provider: id } = await params;
  const p = findProvider(id);
  if (!p) return NextResponse.redirect(`${base}/settings?sync=unknown#calendars`);
  if (!p.configured()) return NextResponse.redirect(`${base}/settings?sync=not-configured&provider=${p.id}#calendars`);
  const state = await makeState(leader, p.id);
  return NextResponse.redirect(p.authorizeUrl(`${base}/api/calendar/callback/${p.id}`, state));
}
