"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mark } from "./Mark";

const LINKS = [
  { href: "/", label: "Talk" },
  { href: "/memory", label: "Memory" },
  { href: "/drafts", label: "Drafts" },
];

export function TopBar({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/signin");
  }
  return (
    <header className="topbar">
      <div className="wrap">
        <Link href="/" className="brand">
          <Mark />
          Barnabas
        </Link>
        <span className="muted small">{name}</span>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
