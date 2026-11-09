import type { Metadata } from "next";
import { HistoryList } from "@/components/site/editor/Panels";
import { SiteAdminFrame } from "@/components/site/editor/SiteAdminFrame";
import { sitePageData } from "@/lib/site/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "History · Website · Barnabas" };

export default async function SiteHistoryPage() {
  const { profile, actor, book } = await sitePageData();
  return (
    <SiteAdminFrame profile={profile} title="Version history" book={book} editor={actor.editor}>
      {book && <HistoryList versions={book.versions.map((v) => ({ id: v.id, at: v.at, by: v.by, label: v.label, kind: v.kind, pages: v.doc.pages.length }))} />}
    </SiteAdminFrame>
  );
}
