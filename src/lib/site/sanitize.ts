/**
 * The website's rich text is a small, safe subset of HTML. Everything a leader types in the editor goes
 * through `sanitizeHtml` when it's saved, and again when a page is rendered, so nothing from the editor
 * ever reaches a visitor's browser unchecked.
 *
 *   kept:      p, br, strong, em, u, s, a (href only), ul, ol, li, h2, h3, h4, blockquote
 *   renamed:   b -> strong, i -> em, div -> p
 *   unwrapped: every other tag (span, font, ...): its text stays, the tag goes
 *   removed:   script, style, iframe, object, embed, svg, math, template, form controls and the like,
 *              with everything inside them; comments; every attribute except a safe link href
 *
 * Links may be https:, http:, mailto:, tel:, a site path ("/visit") or an anchor ("#times").
 */

const KEEP = new Set(["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote"]);
const RENAME: Record<string, string> = { b: "strong", i: "em", div: "p", strike: "s", del: "s", h1: "h2", h5: "h4", h6: "h4" };
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "textarea", "title", "select", "xmp", "noembed", "noframes", "frameset", "frame", "applet", "head", "button", "option"];
const VOID = new Set(["br"]);

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8}|#39);?/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return safeChar(parseInt(k.slice(2), 16)) ?? m;
    if (k.startsWith("#")) return safeChar(parseInt(k.slice(1), 10)) ?? m;
    return NAMED[k] ?? m;
  });
}

function safeChar(code: number): string | null {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
  return String.fromCodePoint(code);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Whether a link target is safe to put in an href: web, mail and phone links, site paths and anchors. */
export function isSafeHref(raw: string): boolean {
  // Browsers ignore whitespace and control characters inside a scheme ("java\nscript:"), so strip them first.
  const href = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!href) return false;
  if (href.startsWith("#")) return /^#[\w-]{0,60}$/.test(href);
  if (href.startsWith("/")) return !href.startsWith("//") && !href.startsWith("/\\");
  return /^(https?:\/\/[^\s/$.?#][^\s]*|mailto:[^\s]+|tel:[0-9+().\- ]+)$/i.test(href);
}

/** Image sources: https (an uploaded Vercel Blob is https) or an image on this site ("/..."). */
export function isSafeImageUrl(raw: string): boolean {
  const url = raw.trim();
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\") && !/[\s"'<>]/.test(url);
  return /^https:\/\/[^\s"'<>]+$/i.test(url);
}

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function hrefFrom(attrs: string): string | null {
  for (const m of attrs.matchAll(ATTR)) {
    if (m[1].toLowerCase() !== "href") continue;
    const value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim();
    return isSafeHref(value) ? value : null;
  }
  return null;
}

function stripDangerous(html: string): string {
  let out = html.replace(/<!--[\s\S]*?(-->|$)/g, "").replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/gi, "").replace(/<![^>]*>/g, "").replace(/<\?[^>]*>/g, "");
  for (const tag of DROP_WITH_CONTENT) {
    // An unclosed one swallows the rest of the text, which is what a browser would do too.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?(<\\/${tag}\\s*>|$)`, "gi"), "");
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }
  return out;
}

/** Returns the safe subset of `html`, with balanced tags. Plain text comes back escaped. */
export function sanitizeHtml(input: string, maxLength = 20_000): string {
  const html = stripDangerous(String(input ?? "").slice(0, maxLength * 2));
  const out: string[] = [];
  const stack: string[] = [];
  const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  const text = (s: string) => {
    if (s) out.push(escapeHtml(decodeEntities(s)));
  };
  for (const m of html.matchAll(TAG)) {
    text(html.slice(last, m.index));
    last = m.index! + m[0].length;
    const closing = m[0].startsWith("</");
    let name = m[1].toLowerCase();
    name = RENAME[name] ?? name;
    if (!KEEP.has(name)) continue;
    if (VOID.has(name)) {
      if (!closing) out.push("<br>");
      continue;
    }
    if (closing) {
      const at = Math.max(stack.lastIndexOf(name), name === "a" ? stack.lastIndexOf("a-dropped") : -1);
      if (at === -1) continue;
      while (stack.length > at) {
        const t = stack.pop()!;
        if (t !== "a-dropped") out.push(`</${t}>`);
      }
      continue;
    }
    if (name === "a") {
      const href = hrefFrom(m[2]);
      if (!href) {
        // A link with an unsafe or missing target keeps its words, not the link.
        stack.push("a-dropped");
        continue;
      }
      const external = /^https?:/i.test(href);
      out.push(`<a href="${escapeHtml(href)}"${external ? ' rel="noopener noreferrer nofollow"' : ""}>`);
    } else out.push(`<${name}>`);
    stack.push(name);
  }
  text(html.slice(last));
  while (stack.length) {
    const t = stack.pop()!;
    if (t !== "a-dropped") out.push(`</${t}>`);
  }
  return out.join("");
}

/** Plain text for summaries (Barnabas, meta descriptions). */
export function htmlToText(html: string): string {
  return decodeEntities(
    sanitizeHtml(html)
      .replace(/<br>/g, "\n")
      .replace(/<\/(p|li|h2|h3|h4|blockquote)>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
