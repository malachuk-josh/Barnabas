import Link from "next/link";
import { redirect } from "next/navigation";
import { currentLeader, type Leader } from "@/lib/auth/session";
import { can, checkinMayUse, isCheckinOnly } from "@/lib/auth/roles";
import { requestPath } from "@/lib/auth/require";
import { getProfile, type Profile } from "@/lib/profile";
import { accessFor } from "@/lib/team";
import { Mark } from "./Mark";
import { AppThemeSwitch } from "./AppThemeSwitch";
import { PullToRefresh } from "./PullToRefresh";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";
import { pushConfig } from "@/lib/push/vapid";
import { SideFootLinks, SideNav, SignOutButton, TabBar, TalkButton } from "./NavLinks";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Loads the signed-in leader and their profile, or sends them to sign in. */
export async function requirePageLeader(): Promise<{ leader: Leader; profile: Profile }> {
  const leader = await currentLeader();
  if (!leader) redirect("/signin");
  return { leader, profile: await getProfile(leader) };
}

export async function AppShell({
  profile,
  fill = false,
  children,
}: {
  profile: Profile;
  /** the page fills the main area edge to edge and scrolls itself (The Word) */
  fill?: boolean;
  children: React.ReactNode;
}) {
  // The Finance entry shows only for roles that can see finance; the server checks again on every request.
  // Kids check-in shows only for roles that run it.
  const leader = await currentLeader();
  const access = leader ? await accessFor(leader) : null;
  const showFinance = can(access, "finance.view");
  const showKids = can(access, "kids.checkin");
  const showSite = can(access, "site.edit");
  // Kids check-in volunteers get the check-in station and their settings, nothing else.
  const checkinOnly = isCheckinOnly(access);
  if (checkinOnly && !checkinMayUse(await requestPath())) redirect("/kids");
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row">
          <Link href={checkinOnly ? "/kids" : "/"} className="brand">
            <Mark light />
            Barnabas
          </Link>
          <AppThemeSwitch />
        </div>
        {!checkinOnly && <TalkButton />}
        <SideNav showFinance={showFinance} showKids={showKids} showSite={showSite} checkinOnly={checkinOnly} />
        <div className="side-foot">
          <SideFootLinks showFinance={showFinance} showKids={showKids} showSite={showSite} checkinOnly={checkinOnly} />
          <Link href="/settings" className="me-card">
            <span className="avatar" aria-hidden="true">
              {initials(profile.name)}
            </span>
            <span className="who">
              <span>{profile.name}</span>
              <small>{profile.role || "Edit your profile"}</small>
            </span>
          </Link>
          <SignOutButton />
        </div>
      </aside>
      <div className="main-area">
        <header className="mobile-top">
          <Link href={checkinOnly ? "/kids" : "/"} className="brand">
            <Mark light />
            Barnabas
          </Link>
          <div className="header-actions">
            <AppThemeSwitch />
            <Link href="/settings" className="avatar" aria-label="Settings">
              {initials(profile.name)}
            </Link>
          </div>
        </header>
        {fill ? (
          <main className="main-fill">{children}</main>
        ) : (
          <main className="wrap" style={{ width: "100%", maxWidth: 1180 }}>
            {children}
          </main>
        )}
      </div>
      <TabBar showFinance={showFinance} showKids={showKids} showSite={showSite} checkinOnly={checkinOnly} />
      <PullToRefresh />
      {pushConfig() && <ServiceWorkerRegistrar />}
    </div>
  );
}
