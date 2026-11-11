import { fontsHref, themeVars } from "@/lib/site/manifest";
import { siteHref } from "@/lib/site/routing";
import { SOCIAL_LABELS, type SiteDoc } from "@/lib/site/types";
import type { SiteMode } from "@/lib/site/access";

/** The public site's header, navigation and footer, themed from the church's settings. */
export function SiteFrame({ doc, base, suffix, mode, current, backTo, children }: { doc: SiteDoc; base: string; suffix: string; mode: SiteMode; current: string; backTo?: string; children: React.ReactNode }) {
  const t = doc.theme;
  const nav = doc.pages.filter((p) => p.nav);
  const href = (slug: string) => `${siteHref(slug ? `/${slug}` : "/", base)}${suffix}`;
  const fonts = fontsHref(t);
  const items = nav.map((p) => (
    <li key={p.id}>
      <a href={href(p.slug)} aria-current={p.slug === current ? "page" : undefined}>
        {p.kind === "home" ? "Home" : p.title}
      </a>
    </li>
  ));
  return (
    <div className="cs-root" style={themeVars(t) as React.CSSProperties}>
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <a className="cs-skip" href="#main">
        Skip to content
      </a>
      {backTo ? (
        <BackBar href={backTo} note={mode.banner === "unpublished" ? "Not published yet: only signed-in leaders can see this site." : mode.banner === "preview" ? "Preview of unpublished changes." : undefined} />
      ) : (
        mode.banner && (
          <p className="cs-banner" role="note">
            {mode.banner === "unpublished" ? "Not published yet: only signed-in leaders can see this site, and search engines are asked not to index it." : "Preview of unpublished changes. Search engines are asked not to index this page."}
          </p>
        )
      )}
      <header className="cs-header">
        <div className="cs-wrap cs-header-row">
          <a className="cs-brand" href={href("")}>
            {t.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo.url} alt={t.logo.alt} className="cs-logo" />
            ) : null}
            <span>{t.churchName}</span>
          </a>
          <nav className="cs-nav" aria-label="Main">
            <ul>{items}</ul>
          </nav>
          <details className="cs-menu">
            <summary>Menu</summary>
            <nav aria-label="Main">
              <ul>{items}</ul>
            </nav>
          </details>
        </div>
      </header>
      <main id="main" className="cs-main cs-wrap">
        {children}
      </main>
      <footer className="cs-footer">
        <div className="cs-wrap cs-footer-grid">
          <div>
            <p className="cs-footer-name">{t.churchName}</p>
            {t.tagline && <p>{t.tagline}</p>}
            {t.footer.address && <p>{t.footer.address}</p>}
            {t.footer.phone && (
              <p>
                <a href={`tel:${t.footer.phone.replace(/[^0-9+]/g, "")}`}>{t.footer.phone}</a>
              </p>
            )}
            {t.footer.email && (
              <p>
                <a href={`mailto:${t.footer.email}`}>{t.footer.email}</a>
              </p>
            )}
          </div>
          <div>
            {t.social.length > 0 && (
              <ul className="cs-social" aria-label="Social media">
                {t.social.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} rel="noopener noreferrer">
                      {SOCIAL_LABELS[s.kind]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <a href="/m">Get our app</a>
            </p>
            {t.footer.text && <p className="cs-small">{t.footer.text}</p>}
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * For someone signed in to Barnabas looking at the site from inside the app (a home-screen app has no
 * browser back button): a way back, plus what the banner would have said.
 */
export function BackBar({ href, note }: { href: string; note?: string }) {
  return (
    <div className="cs-backbar" role="navigation" aria-label="Barnabas">
      <a className="cs-backbar-link" href={href}>
        <span aria-hidden="true">←</span> Back to Barnabas
      </a>
      {note && <span className="cs-backbar-note">{note}</span>}
    </div>
  );
}
