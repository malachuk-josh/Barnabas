"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarIcon, DraftsIcon, MemoryIcon, SettingsIcon, TalkIcon } from "./icons";

export const NAV = [
  { href: "/", label: "Talk", Icon: TalkIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/memory", label: "Memory", Icon: MemoryIcon },
  { href: "/drafts", label: "Drafts", Icon: DraftsIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="side-nav" aria-label="Main">
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined}>
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined}>
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="signout"
      onClick={async () => {
        await fetch("/api/auth/signout", { method: "POST" });
        router.push("/signin");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
