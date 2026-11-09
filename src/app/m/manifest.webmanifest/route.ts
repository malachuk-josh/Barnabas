import { NextResponse } from "next/server";
import { churchIdOf } from "@/lib/site/data";
import { memberManifest } from "@/lib/site/manifest";
import { loadSite } from "@/lib/site/store";

export const dynamic = "force-dynamic";

/** The member app's own manifest (scope /m/). Uses the published app settings, or the draft before publishing. */
export async function GET() {
  const book = await loadSite(churchIdOf());
  return NextResponse.json(memberManifest(book.published ?? book.draft), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}
