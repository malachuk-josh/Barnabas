import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Blocks } from "@/components/site/Blocks";
import { SiteFrame } from "@/components/site/SiteFrame";
import { backToApp } from "@/lib/site/access";
import { publicContext } from "@/lib/site/context";
import { siteData } from "@/lib/site/data";
import { siteHref } from "@/lib/site/routing";
import { htmlToText } from "@/lib/site/sanitize";
import type { BlockOf, SitePage } from "@/lib/site/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const resolve = cache(async (slugParts: string[] | undefined, preview: string | null) => {
  const ctx = await publicContext(preview);
  const path = (slugParts ?? []).map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return "\u0000";
      }
    }).join("/");
  const page = ctx.doc?.pages.find((p) => p.slug === path) ?? null;
  return { ctx, page, path };
});

async function load(props: Props) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const preview = typeof sp.preview === "string" ? sp.preview.slice(0, 80) : null;
  return { ...(await resolve(slug, preview)), preview };
}

function describe(page: SitePage, church: string) {
  if (page.description) return page.description;
  for (const b of page.blocks) {
    if (b.type === "hero" && b.text) return b.text;
    if (b.type === "richtext") {
      const t = htmlToText(b.html).replace(/\s+/g, " ").trim();
      if (t.length > 40) return t.slice(0, 200);
    }
  }
  return `${page.title} at ${church}.`;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { ctx, page } = await load(props);
  if (!ctx.doc || !page) return { title: "Page not found", robots: { index: false, follow: false } };
  const church = ctx.doc.theme.churchName;
  const title = page.kind === "home" ? church : `${page.title} · ${church}`;
  const description = describe(page, church);
  const url = `${ctx.origin}${siteHref(page.slug ? `/${page.slug}` : "/", ctx.base)}`;
  const hero = page.blocks.find((b): b is BlockOf<"hero"> => b.type === "hero");
  const image = hero?.image ?? ctx.doc.theme.logo;
  const abs = (u: string) => (u.startsWith("/") ? `${ctx.origin}${u}` : u);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: ctx.mode.noindex ? { index: false, follow: false, nocache: true } : { index: true, follow: true },
    manifest: "/m/manifest.webmanifest",
    icons: { icon: "/m/icon/192", apple: "/m/icon/180" },
    appleWebApp: { capable: true, title: ctx.doc.app.shortName, statusBarStyle: "default" },
    openGraph: { type: "website", title, description, url, siteName: church, locale: "en_US", images: image ? [{ url: abs(image.url), alt: image.alt }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export async function generateViewport(props: Props): Promise<Viewport> {
  const { ctx } = await load(props);
  return { width: "device-width", initialScale: 1, themeColor: ctx.doc?.theme.colors.primary ?? "#1e4543", colorScheme: "light" };
}

/** The church's public website. Unknown pages, and the whole site before it's published (for visitors), are 404s. */
export default async function SitePage(props: Props) {
  const { ctx, page, path, preview } = await load(props);
  if (!ctx.doc || !page) notFound();
  const data = await siteData(ctx.book);
  const suffix = ctx.mode.banner === "preview" && preview ? `?preview=${encodeURIComponent(preview)}` : "";
  return (
    <SiteFrame doc={ctx.doc} base={ctx.base} suffix={suffix} mode={ctx.mode} current={path} backTo={backToApp(ctx.viewer, ctx.base)}>
      {page.blocks.some((b) => b.type === "hero") ? null : <h1 className="cs-page-title">{page.title}</h1>}
      <Blocks blocks={page.blocks} ctx={{ base: ctx.base, suffix, data, doc: ctx.doc, pageSlug: page.slug }} />
    </SiteFrame>
  );
}
