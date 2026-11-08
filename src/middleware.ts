import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/signin", "/api/auth/signin", "/manifest.webmanifest", "/icon.svg"];

function secret(): Uint8Array | null {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") return null;
  return new TextEncoder().encode("barnabas-local-development-secret-not-for-production");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
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
  if (ok) return NextResponse.next();
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
