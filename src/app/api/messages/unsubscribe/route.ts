import { config } from "@/lib/config";
import { escapeHtml } from "@/lib/messages/providers";
import { optOutEmail } from "@/lib/messages/store";
import { readUnsubscribeToken } from "@/lib/messages/unsubscribe";

export const runtime = "nodejs";

const church = () => config.churchName.replace(/\s*\(demo\)\s*$/i, "");

function page(title: string, text: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="robots" content="noindex"><style>body{margin:0;font-family:Figtree,system-ui,sans-serif;background:#f3f6f4;color:#0f2423;display:grid;place-items:center;min-height:100vh;padding:16px}main{background:#fff;border-radius:14px;padding:28px;max-width:420px}h1{font-family:"Young Serif",Georgia,serif;font-weight:400;margin:0 0 10px}button{font:inherit;border-radius:999px;padding:10px 18px;border:0;background:#1e4543;color:#f3f6f4;font-weight:600;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#0c1c1b;color:#e6eeeb}main{background:#132a28}button{background:#bfd8d1;color:#0f2423}}</style></head><body><main><h1>${escapeHtml(title)}</h1>${text}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** The link in each email: a page with one button, so link scanners that open URLs don't unsubscribe anyone. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const who = readUnsubscribeToken(token);
  if (!who) return page("This link isn't valid", "<p>It may have been cut off. Reply to the email and we'll take you off the list.</p>", 400);
  return page(
    "Unsubscribe",
    `<p>Stop emails from ${escapeHtml(church())} to ${escapeHtml(who.email)}?</p><form method="post"><input type="hidden" name="t" value="${escapeHtml(token!)}"><p><button type="submit">Unsubscribe</button></p></form>`,
  );
}

/** One-click unsubscribe (RFC 8058, List-Unsubscribe-Post) and the button above. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  if (!token) {
    const form = new URLSearchParams(await request.text().catch(() => ""));
    token = form.get("t");
  }
  const who = readUnsubscribeToken(token);
  if (!who) return page("This link isn't valid", "<p>Reply to the email and we'll take you off the list.</p>", 400);
  await optOutEmail(who.churchId, who.email);
  return page("You're unsubscribed", `<p>${escapeHtml(church())} won't email ${escapeHtml(who.email)} from Barnabas again.</p>`);
}
