import { ImageResponse } from "next/og";
import { churchIdOf } from "@/lib/site/data";
import { onColor } from "@/lib/site/media";
import { initialsName } from "@/lib/site/seed";
import { loadSite } from "@/lib/site/store";

export const dynamic = "force-dynamic";

const SIZES = [180, 192, 512];

/** A home-screen icon drawn from the church's initials and main color (PNG). */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  const size = SIZES.includes(n) ? n : 192;
  const maskable = new URL(request.url).searchParams.has("maskable");
  const book = await loadSite(churchIdOf());
  const doc = book.published ?? book.draft;
  const bg = doc.theme.colors.primary;
  const fg = onColor(bg);
  const text = initialsName(doc.theme.churchName).slice(0, 4);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color: fg, borderRadius: maskable ? 0 : size * 0.22 }}>
        <div style={{ display: "flex", fontSize: size * (text.length > 3 ? 0.26 : 0.34), fontWeight: 700, letterSpacing: size * 0.01, borderBottom: `${Math.max(2, size * 0.025)}px solid ${doc.theme.colors.accent}`, paddingBottom: size * 0.02 }}>{text}</div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
