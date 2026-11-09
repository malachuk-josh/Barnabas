import Link from "next/link";
import { redirect } from "next/navigation";
import { currentLeader, type Leader } from "@/lib/auth/session";
import { getProfile, type Profile } from "@/lib/profile";
import { Mark } from "./Mark";
import { SideNav, SignOutButton, TabBar } from "./NavLinks";

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

export function AppShell({
  profile,
  fill = false,
  children,
}: {
  profile: Profile;
  /** the page fills the main area edge to edge and scrolls itself (The Word) */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Mark light />
          Barnabas
        </Link>
        <SideNav />
        <div className="side-foot">
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
          <Link href="/" className="brand">
            <Mark light />
            Barnabas
          </Link>
          <Link href="/settings" className="avatar" aria-label="Settings">
            {initials(profile.name)}
          </Link>
        </header>
        {fill ? (
          <main className="main-fill">{children}</main>
        ) : (
          <main className="wrap" style={{ width: "100%", maxWidth: 1180 }}>
            {children}
          </main>
        )}
      </div>
      <TabBar />
    </div>
  );
}
