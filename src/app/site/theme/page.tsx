import type { Metadata } from "next";
import { ThemeEditor } from "@/components/site/editor/Panels";
import { SiteAdminFrame } from "@/components/site/editor/SiteAdminFrame";
import { sitePageData } from "@/lib/site/admin";
import { blobConfigured } from "@/lib/site/upload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Theme · Website · Barnabas" };

export default async function SiteThemePage() {
  const { profile, actor, book } = await sitePageData();
  return (
    <SiteAdminFrame profile={profile} title="Theme" intro="Name, logo, colors, fonts, footer and social links. Saved to the draft." book={book} editor={actor.editor}>
      {book && <ThemeEditor theme={book.draft.theme} uploads={blobConfigured()} />}
    </SiteAdminFrame>
  );
}
