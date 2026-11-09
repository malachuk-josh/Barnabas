import { OpsFrame } from "@/components/ops/OpsFrame";
import type { Tab } from "@/components/ops/OpsTabs";
import type { Profile } from "@/lib/profile";
import type { SiteBook } from "@/lib/site/types";

export const SITE_TABS: Tab[] = [
  { href: "/site", label: "Pages", exact: true },
  { href: "/site/theme", label: "Theme" },
  { href: "/site/app", label: "Member app and giving" },
  { href: "/site/inbox", label: "Inbox" },
  { href: "/site/history", label: "History" },
];

/** The leader-side frame for the website builder: heading, tabs, the demo label and the permission check. */
export function SiteAdminFrame({ profile, title, intro, book, editor, children }: { profile: Profile; title: string; intro?: React.ReactNode; book: SiteBook | null; editor: boolean; children: React.ReactNode }) {
  if (!editor) {
    return (
      <OpsFrame profile={profile} eyebrow="Website" title="Church website">
        <p className="notice">Pastors and staff edit the church website and member app. Ask your church administrator if you need access.</p>
      </OpsFrame>
    );
  }
  return (
    <OpsFrame
      profile={profile}
      eyebrow="Website"
      title={title}
      intro={intro}
      tabs={SITE_TABS}
      tabsLabel="Website"
      demo={
        book?.meta.demo
          ? {
              text: (
                <>
                  <strong>Demo content.</strong> This draft was built from Mount Greylock&apos;s public information in Barnabas (name, address, weekly schedule, events and published leadership), with placeholder words where the church&apos;s own story goes. It isn&apos;t published, and search engines are asked not to index it.
                </>
              ),
              clear: book.published ? undefined : { path: "/api/site", method: "POST", body: { action: "demo-clear", confirm: "CLEAR" }, label: "Start from a blank site" },
            }
          : undefined
      }
    >
      {children}
    </OpsFrame>
  );
}
