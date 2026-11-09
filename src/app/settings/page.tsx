import { Suspense } from "react";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { SettingsForm } from "@/components/SettingsForm";
import { accessFor } from "@/lib/team";
import { pushConfigProblem, vapidPublicKey } from "@/lib/push/vapid";
import { knowProgress } from "@/lib/engine/know";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { leader, profile } = await requirePageLeader();
  const [access, know] = await Promise.all([accessFor(leader), knowProgress(leader).catch(() => null)]);
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Settings</h1>
          <p className="muted">Your profile, how Barnabas talks with you, calendar connections, notifications, your team and your data.</p>
        </div>
      </div>
      <Suspense>
        <SettingsForm initial={profile} access={access} leaderId={leader.leaderId} vapidPublicKey={vapidPublicKey()} pushProblem={pushConfigProblem()} know={know} />
      </Suspense>
    </AppShell>
  );
}
