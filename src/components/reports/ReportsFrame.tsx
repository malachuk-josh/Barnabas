import { AppShell } from "@/components/AppShell";
import { OpsTabs, type Tab } from "@/components/ops/OpsTabs";
import type { Profile } from "@/lib/profile";

export const REPORT_TABS: Tab[] = [
  { href: "/reports", label: "How we're doing", exact: true },
  { href: "/reports/monthly", label: "Monthly report" },
  { href: "/reports/exports", label: "Exports" },
];

export function ReportsFrame({ profile, title, intro, children }: { profile: Profile; title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Reports</span>
          <h1>{title}</h1>
          <p className="muted">{intro}</p>
        </div>
      </div>
      <OpsTabs tabs={REPORT_TABS} label="Reports" />
      {children}
    </AppShell>
  );
}
