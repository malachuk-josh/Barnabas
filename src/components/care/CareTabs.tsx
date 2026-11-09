"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/care", label: "Cases" },
  { href: "/care/prayer", label: "Prayer" },
  { href: "/care/guests", label: "Guests" },
  { href: "/care/discipleship", label: "Next steps" },
  { href: "/care/load", label: "My care load" },
];

export function CareTabs() {
  const pathname = usePathname();
  return (
    <nav className="fin-tabs" aria-label="Care">
      {TABS.map((t) => {
        const current = t.href === "/care" ? pathname === "/care" || pathname.startsWith("/care/cases") : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={current ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
