"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/budget", label: "Budget" },
  { href: "/finance/accounts", label: "Funds and ledger" },
  { href: "/finance/giving", label: "Giving" },
  { href: "/finance/missions", label: "Missions" },
  { href: "/finance/reports", label: "Reports" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="fin-tabs" aria-label="Finance">
      {TABS.map((t) => {
        const current = t.href === "/finance" ? pathname === "/finance" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={current ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
