import { redirect } from "next/navigation";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { OpsTabs } from "@/components/ops/OpsTabs";
import { SendLog } from "@/components/messages/SendLog";
import { canSeeSendLog } from "@/lib/messages/permissions";
import { accessFor } from "@/lib/team";
import { DRAFT_TABS } from "@/components/messages/MessagingSetup";

export const dynamic = "force-dynamic";

export default async function SendLogPage() {
  const { leader, profile } = await requirePageLeader();
  const scope = canSeeSendLog(await accessFor(leader));
  if (scope === "none") redirect("/drafts");
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Drafts</span>
          <h1>Send log</h1>
          <p className="muted">{scope === "all" ? "Every text and email sent from Barnabas, who approved it, and what Twilio and Resend reported back." : "The shepherding follow-ups you sent and what happened to each."}</p>
        </div>
      </div>
      <OpsTabs tabs={DRAFT_TABS} label="Drafts" />
      <SendLog />
    </AppShell>
  );
}
