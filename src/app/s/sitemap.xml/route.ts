import { publicContext } from "@/lib/site/context";
import { siteHref } from "@/lib/site/routing";
import { escapeHtml } from "@/lib/site/sanitize";

export const dynamic = "force-dynamic";

/** The published pages only; empty until the site is published. */
export async function GET() {
  const ctx = await publicContext(null);
  const pages = ctx.book.published?.pages ?? [];
  const at = ctx.book.meta.publishedAt ? new Date(ctx.book.meta.publishedAt).toISOString() : undefined;
  const urls = pages
    .map((p) => `  <url><loc>${escapeHtml(`${ctx.origin}${siteHref(p.slug ? `/${p.slug}` : "/", ctx.base)}`)}</loc>${at ? `<lastmod>${at}</lastmod>` : ""}</url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
