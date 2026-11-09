/** Video embeds (YouTube and Vimeo only), map embeds and color contrast for the website. */

export type VideoEmbed = { provider: "youtube" | "vimeo"; id: string; src: string };

/**
 * A YouTube or Vimeo link turned into its player address, or null for anything else. Only the video id
 * is taken from the link; the player URL is built here, so nothing else from the link reaches the page.
 */
export function parseVideo(raw: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const yt = (id: string | null | undefined): VideoEmbed | null =>
    id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", id, src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return yt(url.searchParams.get("v"));
    const m = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
    return m ? yt(m[2]) : null;
  }
  if (host === "youtu.be") return yt(url.pathname.slice(1).split("/")[0]);
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = /^\/(?:video\/)?(\d{5,12})(?:\/|$)/.exec(url.pathname);
    return m ? { provider: "vimeo", id: m[1], src: `https://player.vimeo.com/video/${m[1]}` } : null;
  }
  return null;
}

/** A Google Maps embed for an address: no API key needed. */
export function mapEmbedSrc(address: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(address.trim())}&output=embed`;
}

export function directionsHref(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
}

/* ---------- Contrast (WCAG 2.x) ---------- */

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Text on a colored button: whichever of white or Night reads better. */
export function onColor(bg: string) {
  return contrast(bg, "#ffffff") >= contrast(bg, "#0f2423") ? "#ffffff" : "#0f2423";
}

/** Mixes two colors (t = 0 gives a, 1 gives b). */
export function mix(a: string, b: string, t: number) {
  const p = parseInt(a.slice(1), 16);
  const q = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((p >> s) & 255) * (1 - t) + ((q >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, "0")).join("")}`;
}

/** AA for body text is 4.5:1. */
export const AA = 4.5;
