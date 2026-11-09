import { AppShell } from "@/components/AppShell";
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

/** The page frame for Serve, Services, Events and Kids: heading, section tabs and the demo banner. */
export function OpsFrame({
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
      {demo && <OpsDemoBanner text={demo.text} clear={demo.clear} />}
      {children}
    </AppShell>
  );
}
