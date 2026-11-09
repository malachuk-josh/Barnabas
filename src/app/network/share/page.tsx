import { requirePageLeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { NetworkFrame } from "@/components/network/NetworkFrame";
import { ShareForm } from "@/components/network/ShareForm";
import { can } from "@/lib/auth/roles";
import { networkState, shareStarters } from "@/lib/network/service";
import { accessFor } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function SharePage() {
  const { leader, profile } = await requirePageLeader();
  const access = await accessFor(leader);
  const allowed = can(access, "network.share");
  const [state, starters] = await Promise.all([networkState(leader), allowed ? shareStarters(leader) : null]);
  return (
    <NetworkFrame profile={profile} title="Share with other churches" intro="Choose what to share. You'll see exactly what leaves the church before it goes.">
      {allowed && starters ? (
        <ShareForm starters={starters} mine={state.myItems} />
      ) : (
        <EmptyState title="Sharing is for pastors and staff" actions={[{ label: "Find resources", href: "/network", primary: true }]}>
          You can search what connected churches share. Ask a pastor or staff member if there&apos;s something your church should share.
        </EmptyState>
      )}
    </NetworkFrame>
  );
}
