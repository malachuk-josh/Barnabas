import type { Metadata } from "next";
import { PagesList, PublishPanel } from "@/components/site/editor/Panels";
import { SiteAdminFrame } from "@/components/site/editor/SiteAdminFrame";
import { sitePageData } from "@/lib/site/admin";
import { hasUnpublishedChanges, publishProblems } from "@/lib/site/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website · Barnabas" };

export default async function SitePagesPage() {
  const { profile, actor, book, appOrigin, liveUrl, customHost } = await sitePageData();
  return (
    <SiteAdminFrame profile={profile} title="Church website" intro="Pages, blocks and theme for the church's public website and member app. Edits go to a draft; visitors see what you publish." book={book} editor={actor.editor}>
      {book && (
        <div className="fin-stack">
          <PublishPanel
            published={Boolean(book.published)}
            publishedAt={book.meta.publishedAt}
            publishedBy={book.meta.publishedBy}
            changes={hasUnpublishedChanges(book)}
            problems={publishProblems(book.draft)}
            previewUrl={`${appOrigin}/s?preview=${book.meta.previewToken}`}
            liveUrl={liveUrl}
          />
          <PagesList pages={book.draft.pages.map((p) => ({ id: p.id, title: p.title, kind: p.kind, slug: p.slug, blocks: p.blocks.length, nav: p.nav }))} base={customHost ? "" : "/s"} />
          <p className="fin-source">
            {customHost ? `Live at https://${customHost} (CHURCH_SITE_HOST).` : "The site is served at /s on this domain. To use the church's own domain, set CHURCH_SITE_HOST (see the README)."}
          </p>
        </div>
      )}
    </SiteAdminFrame>
  );
}
