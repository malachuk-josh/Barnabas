import { redirect } from "next/navigation";
import { MemoryManager } from "@/components/MemoryManager";
import { TopBar } from "@/components/TopBar";
import { currentLeader } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const leader = await currentLeader();
  if (!leader) redirect("/signin");
  return (
    <>
      <TopBar name={leader.name} />
      <main className="wrap">
        <div className="page-head">
          <h1>Memory</h1>
          <p className="muted">Everything Barnabas remembers about you and your ministry, and the conversations it learned from.</p>
        </div>
        <MemoryManager />
      </main>
    </>
  );
}
