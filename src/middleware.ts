import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { routeSiteHost } from "./lib/site/routing";

const PATH_HEADER = "x-barnabas-path";

// /welcome/{token} and /register/{token} (and their APIs) are the public guest card and event registration:
// the token is checked and the API is rate-limited there. The messaging webhooks verify Twilio's request
// signature or Resend's svix signature on every call; unsubscribe links carry a signed token. Stripe's
// webhook verifies the Stripe-Signature header against the raw body with STRIPE_WEBHOOK_SECRET.
const PUBLIC_PATHS = [
  "/signin", "/api/auth/signin",
  // Setting a password from a one-time link, and owner recovery: both check their own secrets and are rate-limited there.
  "/set-password", "/api/auth/set-password", "/recover", "/api/auth/recover", "/api/calendar/ics", "/welcome", "/api/welcome", "/register", "/api/register", "/manifest.webmanifest", "/icon.svg",
  "/api/messages/twilio/status", "/api/messages/twilio/inbound", "/api/messages/resend", "/api/messages/unsubscribe",
  "/api/stripe/webhook",
  // The leader app's service worker script (it holds no data), and Vercel Cron, which checks CRON_SECRET itself.
  "/sw.js", "/api/cron",
  // The church website (/s) and member app (/m) and their public forms (/api/s): published content only,
  // checked in the pages; forms are rate-limited there.
  "/s", "/m", "/api/s",
];

function secret(): Uint8Array | null {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") return null;
  return new TextEncoder().encode("barnabas-local-development-secret-not-for-production");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Pass the path to server code (role limits are checked there); a header sent by the browser is overwritten.
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, pathname);
  // On the church's own domain (CHURCH_SITE_HOST) the website is served and the leader app isn't.
  const site = routeSiteHost(request.headers.get("host"), pathname);
  if (site?.kind === "block") return new NextResponse("Not found", { status: 404 });
  if (site?.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = site.path;
    headers.set(PATH_HEADER, site.path);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next({ request: { headers } });
  }
  const key = secret();
  const token = request.cookies.get("barnabas_session")?.value;
  let ok = false;
  if (key && token) {
    try {
      await jwtVerify(token, key, { algorithms: ["HS256"] });
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (ok) return NextResponse.next({ request: { headers } });
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
