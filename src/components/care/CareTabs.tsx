"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/shepherding", label: "Needs" },
  { href: "/shepherding/prayer", label: "Prayer" },
  { href: "/shepherding/guests", label: "Guests" },
  { href: "/shepherding/discipleship", label: "Next steps" },
  { href: "/shepherding/load", label: "My care load" },
];

export function CareTabs() {
  const pathname = usePathname();
  return (
    <nav className="fin-tabs" aria-label="Shepherding">
      {TABS.map((t) => {
        const current = t.href === "/shepherding" ? pathname === "/shepherding" || pathname.startsWith("/shepherding/cases") : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={current ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
