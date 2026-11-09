import { requirePageLeader } from "@/components/AppShell";
import { Connections } from "@/components/network/Connections";
import { NetworkFrame } from "@/components/network/NetworkFrame";
import { networkState } from "@/lib/network/service";
import { accessFor } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const { leader, profile } = await requirePageLeader();
  const [state, access] = await Promise.all([networkState(leader), accessFor(leader)]);
  return (
    <NetworkFrame profile={profile} title="Connections" intro="Churches connect only when an administrator at each one says yes.">
      <Connections links={state.links} admin={access.admin} me={state.me.name} />
    </NetworkFrame>
  );
}
