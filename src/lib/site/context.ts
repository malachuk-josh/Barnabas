import { headers } from "next/headers";
import { can, isCheckinOnly } from "../auth/roles";
import { currentLeader } from "../auth/session";
import { accessFor } from "../team";
import { siteMode, type SiteMode, type SiteViewer } from "./access";
import { churchIdOf } from "./data";
import { siteBase } from "./routing";
import { loadSite } from "./store";
import type { SiteBook, SiteDoc } from "./types";

/** The request's host as the browser sent it (Vercel sets x-forwarded-host). */
export async function requestHost() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host") ?? "";
}

export async function siteViewer(): Promise<SiteViewer> {
  const leader = await currentLeader();
  if (!leader) return { signedIn: false, canEdit: false, checkinOnly: false };
  const access = await accessFor(leader);
  return { signedIn: true, canEdit: can(access, "site.edit"), checkinOnly: isCheckinOnly(access) };
}

export type PublicContext = { book: SiteBook; doc: SiteDoc | null; mode: SiteMode; base: "" | "/s"; host: string; origin: string; viewer: SiteViewer };

/** Everything a public page needs: which document to show (or none), noindex, and the link base. */
export async function publicContext(preview?: string | null): Promise<PublicContext> {
  const [book, viewer, host] = await Promise.all([loadSite(churchIdOf()), siteViewer(), requestHost()]);
  const mode = siteMode({ published: Boolean(book.published), viewer, preview, previewToken: book.meta.previewToken });
  const doc = mode.show === "published" ? book.published : mode.show === "draft" ? book.draft : null;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return { book, doc, mode, base: siteBase(host), host, origin: `${proto}://${host}`, viewer };
}
