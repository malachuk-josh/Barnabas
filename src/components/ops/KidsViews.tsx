import { AppShell } from "@/components/AppShell";
import type { Profile } from "@/lib/profile";

/** Shown instead of any Kids page to roles without kids.checkin. */
export function KidsNoAccess({ profile }: { profile: Profile }) {
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Kids</span>
          <h1>Kids check-in</h1>
        </div>
      </div>
      <div className="card stack" style={{ maxWidth: 560 }}>
        <p>Children&apos;s records are kept to the pastors and staff who run check-in.</p>
        <p className="muted small">If you serve at the check-in desk, ask your church administrator to give you access on the Admin page.</p>
      </div>
    </AppShell>
  );
}
