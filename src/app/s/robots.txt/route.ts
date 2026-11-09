import { robotsTxt } from "@/lib/site/access";
import { publicContext } from "@/lib/site/context";

export const dynamic = "force-dynamic";

/** Disallows everything until the site is published. */
export async function GET() {
  const ctx = await publicContext(null);
  return new Response(robotsTxt(Boolean(ctx.book.published), `${ctx.origin}${ctx.base}/sitemap.xml`), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
