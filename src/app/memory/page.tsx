import { AppShell, requirePageLeader } from "@/components/AppShell";
import { MemoryManager } from "@/components/MemoryManager";
import Link from "next/link";
import { knowProgress } from "@/lib/engine/know";
import { accessFor } from "@/lib/team";
import { isLimited } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const { leader, profile } = await requirePageLeader();
  // Team and Member levels talk by typing and don't get the get-to-know-you questions (as on Today).
  const limited = isLimited(await accessFor(leader));
  const know = limited ? null : await knowProgress(leader).catch(() => null);
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Only you can see this</span>
          <h1>Memory</h1>
          <p className="muted">Everything Barnabas remembers about you and your ministry, and the conversations it learned from.</p>
        </div>
      </div>
      {know && know.total > 0 && (
        <section className="memory-know" aria-labelledby="memory-know-h">
          <div className="memory-know-text">
            <h2 id="memory-know-h">{know.answered >= know.total ? "Barnabas knows you well" : "Help Barnabas get to know you"}</h2>
            <p className="small muted">
              {know.answered} of {know.total} questions answered. What you share helps Barnabas remember how you like to work; anything it keeps shows up here to edit or delete.
            </p>
            <span className="memory-know-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((Math.min(know.answered, know.total) / know.total) * 100)}%` }} />
            </span>
          </div>
          {know.answered < know.total && (
            <Link className="btn btn-primary" href="/?know=1">
              {know.answered ? "Keep going" : "Start a conversation"}
            </Link>
          )}
        </section>
      )}
      <MemoryManager />
    </AppShell>
  );
}
