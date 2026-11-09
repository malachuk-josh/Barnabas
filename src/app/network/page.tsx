import { requirePageLeader } from "@/components/AppShell";
import { LibrarySearch } from "@/components/network/LibrarySearch";
import { NetworkFrame } from "@/components/network/NetworkFrame";
import { connectedPeers } from "@/lib/network/service";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const { leader, profile } = await requirePageLeader();
  const peers = await connectedPeers(leader.churchId);
  return (
    <NetworkFrame profile={profile} title="Mesa" intro="Sermon series, service templates, volunteer training, event ideas and needs, shared by churches you've connected with. Never anything about people.">
      <LibrarySearch peers={peers.length} />
    </NetworkFrame>
  );
}
