import { leaderForFeed } from "@/lib/calendar/connections";
import { buildIcs } from "@/lib/calendar/ics";
import { allEvents } from "@/lib/calendar/store";
import { config } from "@/lib/config";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/** Private subscription feed. Anyone with the link can read event titles and times, so the link is long and can be reset. */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const owner = await leaderForFeed(token.replace(/\.ics$/, ""));
  if (!owner) return new Response("Not found", { status: 404 });
  const leader = { ...owner, name: "", email: "", role: "" };
  const profile = await getProfile(leader);
  const events = await allEvents(leader);
  const body = buildIcs(events, profile.timezone, `Barnabas · ${config.churchName}`);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="barnabas.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
