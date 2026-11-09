import { AppShell } from "@/components/AppShell";
import { OpsTabs, type Tab } from "@/components/ops/OpsTabs";
import type { Profile } from "@/lib/profile";

export const NETWORK_TABS: Tab[] = [
  { href: "/network", label: "Find resources", exact: true },
  { href: "/network/share", label: "Share" },
  { href: "/network/connections", label: "Connections" },
];

export function NetworkFrame({ profile, title, intro, children }: { profile: Profile; title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Mesa · church to church</span>
          <h1>{title}</h1>
          <p className="muted">{intro}</p>
        </div>
      </div>
      <OpsTabs tabs={NETWORK_TABS} label="Mesa network" />
      {children}
    </AppShell>
  );
}
