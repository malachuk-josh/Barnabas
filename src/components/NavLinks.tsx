"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { levelMayUse, type Access } from "@/lib/auth/roles";
import { BookIcon, CalendarIcon, DraftsIcon, EventsIcon, FinanceIcon, HeartIcon, KidsIcon, MemoryIcon, MessagesIcon, MoreIcon, NetworkIcon, NotebookIcon, PeopleIcon, ReportsIcon, ServeIcon, ServicesIcon, SettingsIcon, ShieldIcon, TalkIcon, TodayIcon, WebsiteIcon } from "./icons";

/** Sections of the menu, in order. Items with no group sit at the top; "account" sits at the foot. */
export const NAV_GROUPS = [
  { id: "people", label: "People & shepherding" },
  { id: "worship", label: "Worship" },
  { id: "office", label: "Church office" },
] as const;

type Group = (typeof NAV_GROUPS)[number]["id"] | "account";

type NavItem = {
  href: string;
  label: string;
  Icon: () => React.ReactElement;
  group?: Group;
  /** one of the phone tab bar's own slots; everything else goes under More */
  tab?: boolean;
  finance?: boolean;
  kids?: boolean;
  site?: boolean;
  admin?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Today", Icon: TodayIcon, tab: true },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon, tab: true },
  { href: "/inbox", label: "Messages", Icon: MessagesIcon },
  { href: "/drafts", label: "Drafts", Icon: DraftsIcon },
  { href: "/people", label: "People", Icon: PeopleIcon, group: "people", tab: true },
  { href: "/shepherding", label: "Shepherding", Icon: HeartIcon, group: "people" },
  { href: "/serve", label: "Serve", Icon: ServeIcon, group: "people" },
  { href: "/kids", label: "Kids", Icon: KidsIcon, group: "people", kids: true },
  { href: "/word", label: "The Word", Icon: BookIcon, group: "worship" },
  { href: "/services", label: "Services", Icon: ServicesIcon, group: "worship" },
  { href: "/journal", label: "Journal", Icon: NotebookIcon, group: "worship" },
  { href: "/events", label: "Events", Icon: EventsIcon, group: "worship" },
  { href: "/finance", label: "Finance", Icon: FinanceIcon, group: "office", finance: true },
  { href: "/reports", label: "Reports", Icon: ReportsIcon, group: "office" },
  { href: "/network", label: "Mesa", Icon: NetworkIcon, group: "office" },
  { href: "/site", label: "Website", Icon: WebsiteIcon, group: "office", site: true },
  { href: "/admin", label: "Admin", Icon: ShieldIcon, group: "office", admin: true },
  { href: "/memory", label: "Memory", Icon: MemoryIcon, group: "account" },
  { href: "/settings", label: "Settings", Icon: SettingsIcon, group: "account" },
];

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export type NavAccess = {
  showFinance?: boolean;
  showKids?: boolean;
  showSite?: boolean;
  showAdmin?: boolean;
  checkinOnly?: boolean;
  /** Team and Member levels: Barnabas by typing only, so no microphone button. */
  limited?: boolean;
  /** Team and Member levels: their access, to show only the pages they may use. */
  levelAccess?: Access;
  /** Members see Kids as Child care. */
  member?: boolean;
  /** Unread messages, shown on Messages. */
  unread?: number;
};

function Badge({ href, unread }: { href: string; unread?: number }) {
  if (href !== "/inbox" || !unread) return null;
  return (
    <span className="nav-badge" aria-label={`${unread} unread`}>
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

export function navItems({ showFinance = false, showKids = false, showSite = false, showAdmin = false, checkinOnly = false, levelAccess, member = false }: NavAccess) {
  if (checkinOnly) return NAV.filter((n) => n.href === "/kids" || n.href === "/inbox" || n.href === "/settings");
  return NAV.filter((n) => (!n.finance || showFinance) && (!n.kids || showKids || member) && (!n.site || showSite) && (!n.admin || showAdmin) && (!levelAccess || levelMayUse(levelAccess, n.href))).map((n) =>
    member && n.href === "/kids" ? { ...n, label: "Child care", group: "worship" as const } : n,
  );
}

/** The items in sections: the ungrouped top first, then each named group that has anything in it. */
function sections(items: NavItem[]) {
  const out: { id: string; label?: string; items: NavItem[] }[] = [{ id: "top", items: items.filter((n) => !n.group) }];
  for (const g of NAV_GROUPS) out.push({ id: g.id, label: g.label, items: items.filter((n) => n.group === g.id) });
  return out.filter((s) => s.items.length > 0);
}

/**
 * Talk to Barnabas from anywhere. On Today the Talk panel listens for this event and starts the
 * microphone inside the same tap (browsers only allow the mic from a tap); elsewhere it opens Today.
 */
export const TALK_EVENT = "barnabas:talk";
/** Hands Barnabas a request in words, as if typed (the briefing's "Draft a thank-you" buttons). */
export const ASK_EVENT = "barnabas:ask";
/** Starts a fresh conversation in which the leader has invited Barnabas to get to know them. */
export const KNOW_EVENT = "barnabas:know";
export const KNOW_INVITE_TEXT = "I'd like you to get to know me better.";

function useTalk() {
  const pathname = usePathname();
  const router = useRouter();
  return () => {
    if (pathname === "/") window.dispatchEvent(new Event(TALK_EVENT));
    else router.push("/?talk=1");
  };
}

export function TalkButton() {
  const talk = useTalk();
  return (
    <button type="button" className="talk-cta" onClick={talk}>
      <TalkIcon />
      Talk to Barnabas
    </button>
  );
}

export function SideNav(access: NavAccess) {
  const pathname = usePathname();
  const items = navItems(access).filter((n) => n.group !== "account");
  return (
    <nav className="side-nav" aria-label="Main">
      {sections(items).map((s) => (
        <div key={s.id} className="side-group" role={s.label ? "group" : undefined} aria-labelledby={s.label ? `nav-${s.id}` : undefined}>
          {s.label && (
            <p className="side-group-label" id={`nav-${s.id}`}>
              {s.label}
            </p>
          )}
          {s.items.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined}>
              <Icon />
              {label}
              <Badge href={href} unread={access.unread} />
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Memory, under the menu at the sidebar's foot (Settings is the profile card). */
export function SideFootLinks(access: NavAccess) {
  const pathname = usePathname();
  return (
    <>
      {navItems(access)
        .filter((n) => n.group === "account" && n.href !== "/settings")
        .map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="side-foot-link" aria-current={active(pathname, href) ? "page" : undefined}>
            <Icon />
            {label}
          </Link>
        ))}
    </>
  );
}

export function TabBar(access: NavAccess) {
  const pathname = usePathname();
  const talk = useTalk();
  const [open, setOpen] = useState(false);
  const all = navItems(access);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Kids check-in volunteers see only their pages: no Talk, no More.
  if (access.checkinOnly) {
    return (
      <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
        {all.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined}>
            <span className="nav-tab-icon">
              <Icon />
              <Badge href={href} unread={access.unread} />
            </span>
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  // Team and Member levels: Today, Messages and Calendar as tabs, the rest under More, and no microphone.
  const limitedTabs = ["/", "/inbox", "/calendar"];
  const tabs = access.limited ? all.filter((n) => limitedTabs.includes(n.href)) : all.filter((n) => n.tab);
  const overflow = all.filter((n) => !tabs.includes(n));
  const moreActive = overflow.some((n) => active(pathname, n.href));
  // Today and People to the left of the microphone, Calendar and More to the right.
  const left = tabs.filter((n) => n.href === "/" || n.href === "/people" || (access.limited && n.href === "/inbox"));
  const right = tabs.filter((n) => !left.includes(n));
  const tab = ({ href, label, Icon }: NavItem) => (
    <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined}>
      <span className="nav-tab-icon">
        <Icon />
        <Badge href={href} unread={access.unread} />
      </span>
      {label}
    </Link>
  );
  // Grouped pages as tiles; the ungrouped ones (Drafts) sit in the plain rows with Memory and Settings.
  const moreSections = sections(overflow.filter((n) => n.group && n.group !== "account"));
  const account = overflow.filter((n) => !n.group || n.group === "account");

  return (
    <>
      {open && (
        <div className="more-backdrop" onClick={() => setOpen(false)}>
          <nav className="more-sheet" id="more-sheet" aria-label="More" onClick={(e) => e.stopPropagation()}>
            {moreSections.map((s) => (
              <div key={s.id} className="more-group">
                <p className="more-group-label">{s.label}</p>
                <div className="more-tiles">
                  {s.items.map(({ href, label, Icon }) => (
                    <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined} onClick={() => setOpen(false)}>
                      <Icon />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {account.length > 0 && (
              <div className="more-rows">
                {account.map(({ href, label, Icon }) => (
                  <Link key={href} href={href} aria-current={active(pathname, href) ? "page" : undefined} onClick={() => setOpen(false)}>
                    <Icon />
                    {label}
                    <Badge href={href} unread={access.unread} />
                  </Link>
                ))}
              </div>
            )}
          </nav>
        </div>
      )}
      <nav className={access.limited ? "tabbar" : "tabbar tabbar-talk"} aria-label="Main" style={access.limited ? { gridTemplateColumns: `repeat(${tabs.length + (overflow.length > 0 ? 1 : 0)}, minmax(0, 1fr))` } : undefined}>
        {left.map(tab)}
        {!access.limited && (
          <button type="button" className="tab-talk" aria-label="Talk to Barnabas" onClick={talk}>
            <TalkIcon />
          </button>
        )}
        {right.map(tab)}
        {overflow.length > 0 && (
          <button type="button" className="tab-more" aria-expanded={open} aria-controls="more-sheet" aria-current={moreActive ? "page" : undefined} onClick={() => setOpen((o) => !o)}>
            <span className="nav-tab-icon">
              <MoreIcon />
              {!tabs.some((n) => n.href === "/inbox") && <Badge href="/inbox" unread={access.unread} />}
            </span>
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
