import { AppShell, requirePageLeader } from "@/components/AppShell";
import { DraftsQueue } from "@/components/DraftsQueue";
import { OpsTabs } from "@/components/ops/OpsTabs";
import { DRAFT_TABS } from "@/components/messages/MessagingSetup";
import { canSeeSendLog } from "@/lib/messages/permissions";
import { accessFor } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const { leader, profile } = await requirePageLeader();
  const log = canSeeSendLog(await accessFor(leader)) !== "none";
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Nothing goes out without you</span>
          <h1>Drafts</h1>
          <p className="muted">Messages Barnabas wrote for you, with every translation. Review each one and tap Send; Barnabas never sends on its own.</p>
        </div>
      </div>
      {log && <OpsTabs tabs={DRAFT_TABS} label="Drafts" />}
      <DraftsQueue />
    </AppShell>
  );
}
