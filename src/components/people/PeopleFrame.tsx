import { AppShell } from "@/components/AppShell";
import { OpsTabs, type Tab } from "@/components/ops/OpsTabs";
import type { Profile } from "@/lib/profile";

export function peopleTabs(edit: boolean): Tab[] {
  return [
    { href: "/people", label: "Directory", exact: true },
    { href: "/people/groups", label: "Groups" },
    { href: "/people/attendance", label: "Attendance" },
    ...(edit ? [{ href: "/people/duplicates", label: "Duplicates" }, { href: "/people/fields", label: "Custom fields" }, { href: "/people/import", label: "Move your church in" }] : []),
  ];
}

export function PeopleFrame({ profile, edit, eyebrow = "People", title, intro, actions, children }: { profile: Profile; edit: boolean; eyebrow?: string; title: string; intro?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
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
      <OpsTabs tabs={peopleTabs(edit)} label="People" />
      {children}
    </AppShell>
  );
}
