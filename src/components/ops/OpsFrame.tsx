import { AppShell } from "@/components/AppShell";
import { checkinMayUse, isCheckinOnly } from "@/lib/auth/roles";
import { currentLeader } from "@/lib/auth/session";
import { churchSource } from "@/lib/chms";
import { accessFor } from "@/lib/team";
import type { Profile } from "@/lib/profile";
import { OpsDemoBanner, type DemoClear } from "./OpsDemoBanner";
import { OpsTabs, type Tab } from "./OpsTabs";

export const SERVE_TABS: Tab[] = [
  { href: "/serve", label: "Rosters", exact: true },
  { href: "/serve/mine", label: "My serving" },
  { href: "/serve/teams", label: "Teams and availability" },
];
export const SERVICES_TABS: Tab[] = [
  { href: "/services", label: "Rotation and series", exact: true },
  { href: "/services/plan", label: "Order of service" },
];
export const KIDS_TABS: Tab[] = [
  { href: "/kids", label: "Check-in station", exact: true },
  { href: "/kids/rooms", label: "Rooms" },
  { href: "/kids/families", label: "Families" },
];

/**
 * The page frame for Serve, Services, Events and Kids: heading, section tabs and the demo banner, which goes
 * away once the church's own people are in Barnabas (added in People or moved in with the migration tool).
 */
export async function OpsFrame({
  profile,
  eyebrow,
  title,
  intro,
  actions,
  tabs,
  tabsLabel,
  demo,
  children,
}: {
  profile: Profile;
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: Tab[];
  tabsLabel?: string;
  demo?: { text: React.ReactNode; clear?: DemoClear };
  children: React.ReactNode;
}) {
  // A kids check-in volunteer sees only the tabs they can open.
  const leader = await currentLeader();
  if (tabs && leader && isCheckinOnly(await accessFor(leader))) tabs = tabs.filter((t) => checkinMayUse(t.href));
  const connected = (await churchSource()) !== "demo";
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {intro && <p className="muted">{intro}</p>}
        </div>
        {actions}
      </div>
      {tabs && <OpsTabs tabs={tabs} label={tabsLabel ?? eyebrow} />}
      {demo && !connected && <OpsDemoBanner text={demo.text} clear={demo.clear} />}
      {children}
    </AppShell>
  );
}
