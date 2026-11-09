import { Suspense } from "react";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { SettingsForm } from "@/components/SettingsForm";
import { ChurchDataSettings } from "@/components/data/ChurchDataSettings";
import { can } from "@/lib/auth/roles";
import { accessFor } from "@/lib/team";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { leader, profile } = await requirePageLeader();
  const access = await accessFor(leader);
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Settings</h1>
          <p className="muted">Your profile, how Barnabas talks with you, calendar connections, your team and your data.</p>
        </div>
      </div>
      <Suspense>
        <SettingsForm initial={profile} access={access} leaderId={leader.leaderId} />
      </Suspense>
      {can(access, "team.manage") && (
        <div style={{ marginTop: 24 }}>
          <ChurchDataSettings canImportGiving={can(access, "finance.edit") && can(access, "giving.donors")} />
        </div>
      )}
    </AppShell>
  );
}
