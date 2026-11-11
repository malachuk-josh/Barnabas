/**
 * Who sees which version of the church website, and whether search engines may index it.
 *
 *   published, no preview asked    everyone sees the published site; indexable
 *   ?preview={token}               anyone with the preview link sees the draft; noindex
 *   ?preview=1                     a leader with site.edit sees the draft; noindex
 *   not published yet              signed-in leaders (not kids check-in volunteers) see the draft with a
 *                                  "not published" banner; everyone else gets a 404; always noindex
 */

export type SiteViewer = { signedIn: boolean; canEdit: boolean; checkinOnly: boolean };
export type SiteMode = { show: "published" | "draft" | null; noindex: boolean; banner?: "preview" | "unpublished" };

/**
 * Where "Back to Barnabas" goes when someone signed in to Barnabas is looking at the church's website or
 * member app from inside the app (a preview, the unpublished site, or the live one): editors back to the
 * Website pages, everyone else to Today. Nothing for the public, or on the church's own domain.
 */
export function backToApp(viewer: SiteViewer, base: "" | "/s"): string | undefined {
  if (!viewer.signedIn || base !== "/s") return undefined;
  return viewer.canEdit ? "/site" : "/";
}

export function siteMode(opts: { published: boolean; viewer: SiteViewer; preview?: string | null; previewToken?: string }): SiteMode {
  const { published, viewer, preview, previewToken } = opts;
  const leader = viewer.signedIn && !viewer.checkinOnly;
  if (preview && previewToken && preview.length >= 20 && preview === previewToken) return { show: "draft", noindex: true, banner: "preview" };
  if (preview === "1" && leader && viewer.canEdit) return { show: "draft", noindex: true, banner: "preview" };
  if (published) return { show: "published", noindex: false };
  if (leader) return { show: "draft", noindex: true, banner: "unpublished" };
  return { show: null, noindex: true };
}

/** robots.txt for the site: everything allowed once published, nothing before. */
export function robotsTxt(published: boolean, sitemapUrl: string) {
  return published ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${sitemapUrl}\n` : "User-agent: *\nDisallow: /\n";
}
