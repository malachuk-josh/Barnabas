/**
 * Custom-domain routing for the church website. Runs in the middleware (Edge runtime), so it imports
 * nothing. When a request's host is one of CHURCH_SITE_HOST (comma-separated, e.g.
 * "www.mountgreylockbaptist.com,mountgreylockbaptist.com"), the church's domain shows the website:
 *
 *   /            -> /s              (the site renderer)
 *   /about       -> /s/about
 *   /sitemap.xml -> /s/sitemap.xml, /robots.txt -> /s/robots.txt
 *   /m/...                          the member app, as is
 *   /api/s/...                      the website's public forms, as is
 *   /register/..., /welcome/...     public event sign-up and guest card links, as is
 *   any other /api/...              404: the leader app's API never answers on the church's domain
 *
 * Every other path is rewritten under /s, so app pages (/finance, /care, ...) can't be reached there; the
 * leader app stays on the Barnabas domain.
 */

export type HostRoute = { kind: "rewrite"; path: string } | { kind: "pass" } | { kind: "block" };

const PASS = ["/m", "/api/s", "/register", "/api/register", "/welcome", "/api/welcome", "/_next"];

export function siteHosts(env: string | undefined = process.env.CHURCH_SITE_HOST): string[] {
  return (env ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, ""))
    .filter(Boolean);
}

export function isSiteHost(host: string | null | undefined, env?: string): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase().replace(/:\d+$/, "");
  return siteHosts(env).includes(h);
}

/** How the middleware handles a request on the church's own domain; null when it's not that domain. */
export function routeSiteHost(host: string | null | undefined, pathname: string, env?: string): HostRoute | null {
  if (!isSiteHost(host, env)) return null;
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (PASS.some(under) || pathname === "/favicon.ico") return { kind: "pass" };
  if (under("/api")) return { kind: "block" };
  if (pathname === "/" || pathname === "") return { kind: "rewrite", path: "/s" };
  return { kind: "rewrite", path: `/s${pathname}` };
}

/** Where the site's own pages live for this host: "" on the church's domain, "/s" on the Barnabas domain. */
export function siteBase(host: string | null | undefined, env?: string): "" | "/s" {
  return isSiteHost(host, env) ? "" : "/s";
}

/** A site link for this base: "/visit" becomes "/s/visit" on the Barnabas domain. Other links are unchanged. */
export function siteHref(href: string, base: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (/^\/(m|register|welcome)(\/|$)/.test(href)) return href;
  if (href === "/") return base || "/";
  return `${base}${href}`;
}
