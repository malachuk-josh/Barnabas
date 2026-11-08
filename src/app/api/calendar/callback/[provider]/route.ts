import { NextResponse } from "next/server";
import { currentLeader } from "@/lib/auth/session";
import { provider as findProvider, saveConnection } from "@/lib/calendar/connections";
import { appUrl, checkState } from "@/lib/calendar/oauth-state";
import { audit } from "@/lib/data/records";

export const runtime = "nodejs";

type Params = { params: Promise<{ provider: string }> };

/** Google or Microsoft sends the leader back here after they approve calendar access. */
export async function GET(request: Request, { params }: Params) {
  const base = appUrl(request);
  const back = (query: string) => NextResponse.redirect(`${base}/settings?${query}#calendars`);
  const leader = await currentLeader();
  if (!leader) return NextResponse.redirect(`${base}/signin`);
  const { provider: id } = await params;
  const p = findProvider(id);
  if (!p) return back("sync=unknown");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return back(`sync=declined&provider=${p.id}`);
  if (!(await checkState(url.searchParams.get("state"), leader, p.id))) return back(`sync=expired&provider=${p.id}`);
  const code = url.searchParams.get("code");
  if (!code) return back(`sync=failed&provider=${p.id}`);
  try {
    const tokens = await p.exchangeCode(code, `${base}/api/calendar/callback/${p.id}`);
    const account = await p.account(tokens.accessToken).catch(() => p.label);
    await saveConnection(leader, p.id, account, tokens);
    await audit(leader, { action: "calendar.connect", detail: p.id });
    return back(`sync=connected&provider=${p.id}`);
  } catch (err) {
    console.error(`[barnabas] ${p.id} connect failed`, err);
    return back(`sync=failed&provider=${p.id}`);
  }
}
