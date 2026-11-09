import { AA, contrast, mix, onColor } from "./media";
import type { SiteDoc, SiteTheme } from "./types";

/**
 * The member app's web manifest: its own name, icon, start_url and scope (/m/), separate from the
 * Barnabas leader app's (/manifest.webmanifest, scope /), so a member's "Add to Home Screen" installs the
 * church's app.
 */
export function memberManifest(doc: Pick<SiteDoc, "app" | "theme">) {
  const { app, theme } = doc;
  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [
    { src: "/m/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/m/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/m/icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
  return {
    id: "/m/",
    name: app.name,
    short_name: app.shortName,
    description: `${theme.churchName}: announcements, events, sermons and ways to connect.`,
    start_url: "/m",
    scope: "/m/",
    display: "standalone",
    orientation: "portrait",
    background_color: theme.colors.background,
    theme_color: theme.colors.primary,
    icons,
  };
}

/** CSS custom properties for the public site and member app, from the validated theme (hex colors, allowlisted fonts). */
export function themeVars(theme: SiteTheme): Record<string, string> {
  const c = theme.colors;
  // Muted text: a step toward the background, kept at AA.
  let muted = mix(c.text, c.background, 0.28);
  if (contrast(muted, c.background) < AA || contrast(muted, c.surface) < AA) muted = c.text;
  const font = (f: string, fallback: string) => `"${f}", ${fallback}`;
  const serif = /Serif|Lora|Merriweather/.test(theme.fonts.heading) ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  return {
    "--cs-primary": c.primary,
    "--cs-on-primary": onColor(c.primary),
    "--cs-accent": c.accent,
    "--cs-on-accent": onColor(c.accent),
    "--cs-bg": c.background,
    "--cs-surface": c.surface,
    "--cs-text": c.text,
    "--cs-muted": muted,
    "--cs-line": mix(c.text, c.background, 0.82),
    "--cs-soft": mix(c.primary, c.background, 0.86),
    "--cs-heading": font(theme.fonts.heading, serif),
    "--cs-body": font(theme.fonts.body, 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'),
  };
}

/** The Google Fonts stylesheet for the theme's fonts (Young Serif and Figtree are already loaded by the app). */
export function fontsHref(theme: SiteTheme): string | null {
  const extra = [...new Set([theme.fonts.heading, theme.fonts.body])].filter((f) => f !== "Young Serif" && f !== "Figtree");
  if (!extra.length) return null;
  const fam = extra.map((f) => `family=${f.replace(/ /g, "+")}${/Young Serif/.test(f) ? "" : ":wght@400;600;700"}`).join("&");
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}
