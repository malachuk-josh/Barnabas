import { AppShell, requirePageLeader } from "@/components/AppShell";
import { MemoryManager } from "@/components/MemoryManager";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const { profile } = await requirePageLeader();
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Only you can see this</span>
          <h1>Memory</h1>
          <p className="muted">Everything Barnabas remembers about you and your ministry, and the conversations it learned from.</p>
        </div>
      </div>
      <MemoryManager />
    </AppShell>
  );
}
