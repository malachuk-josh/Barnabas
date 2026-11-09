import type { Metadata } from "next";
import { Announcements, AppEditor } from "@/components/site/editor/Panels";
import { QrCode } from "@/components/site/editor/QrCode";
import { SiteAdminFrame } from "@/components/site/editor/SiteAdminFrame";
import { sitePageData } from "@/lib/site/admin";
import { pushConfig } from "@/lib/site/push";
import { blobConfigured } from "@/lib/site/upload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member app · Website · Barnabas" };

export default async function SiteAppPage() {
  const { profile, actor, book, appUrl } = await sitePageData();
  return (
    <SiteAdminFrame profile={profile} title="Member app and giving" intro="The congregation's own app at /m: its name, icon and tabs, announcements and notifications, and where Give sends people." book={book} editor={actor.editor}>
      {book && (
        <div className="fin-stack">
          <section className="fin-card se-share" aria-labelledby="share-h">
            <div>
              <h2 id="share-h">Get our app</h2>
              <p className="small muted">Share this link or QR code on a slide, the bulletin or the welcome table. On a phone it opens the app, which can be added to the home screen.</p>
              <p>
                <a href={appUrl} target="_blank" rel="noopener">
                  {appUrl}
                </a>
              </p>
              {!book.published && <p className="notice small">The app opens for everyone once the site is published. Until then only signed-in leaders can see it.</p>}
            </div>
            <QrCode text={appUrl} label={`QR code for ${appUrl}`} />
          </section>
          <Announcements items={book.announcements} pushReady={Boolean(pushConfig())} devices={book.push.length} published={Boolean(book.published)} />
          <AppEditor app={book.draft.app} give={book.draft.give} uploads={blobConfigured()} />
        </div>
      )}
    </SiteAdminFrame>
  );
}
