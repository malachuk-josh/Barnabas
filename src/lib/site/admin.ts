import { requirePageLeader } from "@/components/AppShell";
import { requestHost } from "./context";
import { siteHosts } from "./routing";
import { siteActor } from "./service";
import { loadSite } from "./store";

/** The leader-side pages' common load: the leader, whether they may edit, the site and its public address. */
export async function sitePageData() {
  const { leader, profile } = await requirePageLeader();
  const actor = await siteActor(leader);
  const book = actor.editor ? await loadSite(leader.churchId) : null;
  const host = await requestHost();
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const appOrigin = `${proto}://${host}`;
  const custom = siteHosts()[0];
  const liveUrl = custom ? `https://${custom}` : `${appOrigin}/s`;
  const appUrl = custom ? `https://${custom}/m` : `${appOrigin}/m`;
  return { leader, profile, actor, book, appOrigin, liveUrl, appUrl, customHost: custom ?? null };
}
