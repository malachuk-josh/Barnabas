import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { OpsTabs, type Tab } from "@/components/ops/OpsTabs";
import type { Profile } from "@/lib/profile";

/** The everyday views. The one-off jobs (duplicates, custom fields, moving in) live under Manage. */
export function peopleTabs(): Tab[] {
  return [
    { href: "/people", label: "Directory", exact: true },
    { href: "/people/groups", label: "Groups" },
    { href: "/people/attendance", label: "Attendance" },
  ];
}

export const MANAGE_LINKS = [
  { href: "/people/import", label: "Move your church in" },
  { href: "/people/duplicates", label: "Duplicates" },
  { href: "/people/fields", label: "Custom fields" },
  { href: "/people?archived=1", label: "Archived people" },
];

/** Manage: a small menu for those who can edit the directory. */
function ManageMenu() {
  return (
    <details className="menu">
      <summary className="btn">
        Manage
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="menu-list">
        {MANAGE_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export function PeopleFrame({
  profile,
  edit,
  eyebrow = "People",
  title,
  intro,
  actions,
  tabs = true,
  children,
}: {
  profile: Profile;
  edit: boolean;
  eyebrow?: string;
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  /** Section tabs under the title (a person's own page leaves them off). */
  tabs?: boolean;
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
        {(actions || (edit && tabs)) && (
          <div className="row page-actions">
            {edit && tabs && <ManageMenu />}
            {actions}
          </div>
        )}
      </div>
      {tabs && <OpsTabs tabs={peopleTabs()} label="People" />}
      {children}
    </AppShell>
  );
}
