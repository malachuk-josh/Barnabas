import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageEditor } from "@/components/site/editor/PageEditor";
import { SiteAdminFrame } from "@/components/site/editor/SiteAdminFrame";
import { churchData } from "@/lib/chms";
import { sitePageData } from "@/lib/site/admin";
import { publicBio } from "@/lib/site/seed";
import { blobConfigured } from "@/lib/site/upload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit page · Website · Barnabas" };

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, actor, book } = await sitePageData();
  const page = book?.draft.pages.find((p) => p.id === id);
  if (book && !page) notFound();
  const leaders = book ? (await churchData().leadership()).map((l) => ({ name: l.name, title: l.title, suggestedBio: publicBio(l.bio) })) : [];
  return (
    <SiteAdminFrame profile={profile} title={page ? `Edit: ${page.title}` : "Church website"} book={book} editor={actor.editor}>
      {book && page && (
        <PageEditor
          key={page.id}
          page={page}
          uploads={blobConfigured()}
          leaders={leaders}
          address={book.draft.theme.footer.address ?? ""}
          previewHref={`/s${page.slug ? `/${page.slug}` : ""}?preview=1`}
          published={Boolean(book.published)}
        />
      )}
    </SiteAdminFrame>
  );
}
