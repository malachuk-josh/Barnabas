import { Suspense } from "react";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { profile } = await requirePageLeader();
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Settings</h1>
          <p className="muted">Your profile, how Barnabas talks with you, calendar connections and your data.</p>
        </div>
      </div>
      <Suspense>
        <SettingsForm initial={profile} />
      </Suspense>
    </AppShell>
  );
}
