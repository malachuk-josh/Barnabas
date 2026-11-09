import type { Metadata } from "next";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { JournalList, NewMenu } from "@/components/journal/JournalList";
import { journalActor, listEntries, myTags } from "@/lib/journal/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journal · Barnabas" };

export default async function JournalPage() {
  const { leader, profile } = await requirePageLeader();
  // The check-in role never gets here: AppShell sends it to Kids, and journalActor refuses it.
  const actor = await journalActor(leader).catch(() => null);
  const [entries, tags] = actor ? await Promise.all([listEntries(actor), myTags(actor)]) : [[], []];
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Worship</span>
          <h1>Journal</h1>
          <p className="muted">Your notes, sermon ideas, devotional guides and worship setlists. Private to you unless you share one with the leadership team.</p>
        </div>
        <NewMenu />
      </div>
      <JournalList initial={entries.map(({ haystack: _h, ...s }) => s)} tags={tags} me={leader.leaderId} />
    </AppShell>
  );
}
