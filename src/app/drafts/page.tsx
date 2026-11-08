import { AppShell, requirePageLeader } from "@/components/AppShell";
import { DraftsQueue } from "@/components/DraftsQueue";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const { profile } = await requirePageLeader();
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Nothing goes out without you</span>
          <h1>Drafts</h1>
          <p className="muted">Messages Barnabas wrote for you, with every translation, waiting for your review.</p>
        </div>
      </div>
      <DraftsQueue />
    </AppShell>
  );
}
