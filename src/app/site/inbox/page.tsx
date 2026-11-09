import type { Metadata } from "next";
import { InboxList } from "@/components/site/editor/Panels";
import { SiteAdminFrame } from "@/components/site/editor/SiteAdminFrame";
import { sitePageData } from "@/lib/site/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox · Website · Barnabas" };

export default async function SiteInboxPage() {
  const { profile, actor, book } = await sitePageData();
  return (
    <SiteAdminFrame profile={profile} title="Website inbox" intro="Messages from the contact forms on the website and member app. Prayer requests go to Shepherding → Prayer, and guest cards to Shepherding → Guests." book={book} editor={actor.editor}>
      {book && <InboxList messages={book.inbox} />}
    </SiteAdminFrame>
  );
}
