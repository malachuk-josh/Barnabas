"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookIcon, CalendarIcon, DraftsIcon, EventsIcon, FinanceIcon, HeartIcon, KidsIcon, MemoryIcon, MoreIcon, ServeIcon, ServicesIcon, SettingsIcon, TalkIcon } from "./icons";

export const NAV = [
  { href: "/", label: "Talk", Icon: TalkIcon },
  { href: "/word", label: "The Word", Icon: BookIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/finance", label: "Finance", Icon: FinanceIcon, finance: true },
  { href: "/care", label: "Care", Icon: HeartIcon },
  { href: "/serve", label: "Serve", Icon: ServeIcon },
  { href: "/services", label: "Services", Icon: ServicesIcon },
  { href: "/events", label: "Events", Icon: EventsIcon },
  { href: "/kids", label: "Kids", Icon: KidsIcon, kids: true },
  { href: "/memory", label: "Memory", Icon: MemoryIcon },
  { href: "/drafts", label: "Drafts", Icon: DraftsIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

/** The phone tab bar shows at most this many items; past that, the rest go under More. */
const TAB_SLOTS = 5;

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export type NavAccess = { showFinance?: boolean; showKids?: boolean };

function items({ showFinance = false, showKids = false }: NavAccess) {
  return NAV.filter((n) => (!n.finance || showFinance) && (!n.kids || showKids));
}

export function SideNav(access: NavAccess) {
  const pathname = usePathname();
  return (
    <nav className="side-nav" aria-label="Main">
      {items(access).map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined}>
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar(access: NavAccess) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const all = items(access);
  const primary = all.length > TAB_SLOTS ? all.slice(0, TAB_SLOTS - 1) : all;
  const overflow = all.length > TAB_SLOTS ? all.slice(TAB_SLOTS - 1) : [];
  const moreActive = overflow.some((n) => active(pathname, n.href));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="more-backdrop" onClick={() => setOpen(false)}>
          <nav className="more-sheet" id="more-sheet" aria-label="More" onClick={(e) => e.stopPropagation()}>
            {overflow.map(({ href, label, Icon }) => (
              <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined} onClick={() => setOpen(false)}>
                <Icon />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
      <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${primary.length + (overflow.length ? 1 : 0)}, minmax(0, 1fr))` }}>
        {primary.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined}>
            <Icon />
            {label}
          </Link>
        ))}
        {overflow.length > 0 && (
          <button type="button" className="tab-more" aria-expanded={open} aria-controls="more-sheet" aria-current={moreActive ? "page" : undefined} onClick={() => setOpen((o) => !o)}>
            <MoreIcon />
            More
          </button>
        )}
      </nav>
    </>
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
