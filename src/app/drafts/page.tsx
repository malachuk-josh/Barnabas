import { redirect } from "next/navigation";
import { DraftsQueue } from "@/components/DraftsQueue";
import { TopBar } from "@/components/TopBar";
import { currentLeader } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const leader = await currentLeader();
  if (!leader) redirect("/signin");
  return (
    <>
      <TopBar name={leader.name} />
      <main className="wrap">
        <div className="page-head">
          <h1>Drafts</h1>
          <p className="muted">Messages Barnabas wrote for you, with every translation, waiting for your review. Nothing goes out without your approval.</p>
        </div>
        <DraftsQueue />
      </main>
    </>
  );
}
