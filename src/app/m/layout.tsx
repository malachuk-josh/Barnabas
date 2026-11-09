import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { MemberTabs } from "@/components/site/MemberApp";
import { publicContext } from "@/lib/site/context";
import { themeVars } from "@/lib/site/manifest";
import "../s/site.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await publicContext(null);
  if (!ctx.doc) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: ctx.doc.app.name,
    description: `${ctx.doc.theme.churchName}: announcements, events, sermons and ways to connect.`,
    manifest: "/m/manifest.webmanifest",
    icons: { icon: "/m/icon/192", apple: "/m/icon/180" },
    appleWebApp: { capable: true, title: ctx.doc.app.shortName, statusBarStyle: "default" },
    robots: ctx.mode.noindex ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const ctx = await publicContext(null);
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: ctx.doc?.theme.colors.primary ?? "#1e4543", colorScheme: "light" };
}

/** The church member app: a separate installable app (scope /m/) for the congregation. No member sign-in yet. */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const ctx = await publicContext(null);
  if (!ctx.doc) notFound();
  const { app, theme } = ctx.doc;
  return (
    <div className="cs-root ma-root" style={themeVars(theme) as React.CSSProperties}>
      {ctx.mode.banner && (
        <p className="cs-banner" role="note">
          Not published yet: only signed-in leaders can open the member app.
        </p>
      )}
      <header className="ma-top">
        <div className="cs-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ma-icon" src={app.icon || "/m/icon/192"} alt="" width={36} height={36} />
          <h1>{app.name}</h1>
        </div>
      </header>
      <main className="ma-main cs-wrap" id="main">
        {children}
      </main>
      <MemberTabs tabs={app.tabs} />
    </div>
  );
}
