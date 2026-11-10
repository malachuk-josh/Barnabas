import type { Metadata } from "next";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { Inbox } from "@/components/inbox/Inbox";
import { inboxActor, isMemberLevel, listThreads } from "@/lib/inbox/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages · Barnabas" };

const ID = /^[\w-]{1,64}$/;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ to?: string; about?: string; t?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const actor = await inboxActor(leader);
  const { threads } = await listThreads(actor);
  const q = await searchParams;
  const to = (q.to ?? "").split(",").filter((id) => ID.test(id)).slice(0, 20);
  const about = (q.about ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const open = q.t && ID.test(q.t) ? q.t : undefined;
  const member = isMemberLevel(actor.access);
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p className="muted">
            {member ? "Talk with the church staff and the kids team." : "Talk with your co-laborers, and with parents during a service."}
          </p>
        </div>
      </div>
      <Inbox initialThreads={threads} initialOpen={open} compose={to.length ? { to, about } : undefined} />
    </AppShell>
  );
}
