import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The build the server is running, so a long-open phone app can tell it's behind and refresh. */
export function GET() {
  return NextResponse.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
