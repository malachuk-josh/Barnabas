import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { jsonBody, respondSite } from "@/lib/site/http";
import { sendAnnouncementPush } from "@/lib/site/push";
import {
  addPage,
  clearDemoSite,
  deleteMessage,
  loadSite,
  markMessage,
  movePage,
  newPreviewLink,
  postAnnouncement,
  publish,
  removeAnnouncement,
  removePage,
  restoreVersion,
  saveApp,
  saveGive,
  savePage,
  saveTheme,
  siteActor,
  SiteError,
  unpublish,
} from "@/lib/site/service";

export const runtime = "nodejs";

const Id = z.string().min(1).max(60);

/** The website builder's actions. Every one needs site.edit (pastors and staff) and is audited. */
export async function POST(request: Request) {
  const leader = await requirePermission("site.edit");
  if (isResponse(leader)) return leader;
  return respondSite(async () => {
    const actor = await siteActor(leader);
    const raw = await jsonBody(request);
    const action = String(raw.action ?? "");
    switch (action) {
      case "save-page":
        return { doc: await savePage(actor, raw.page) };
      case "add-page":
        return { page: await addPage(actor, { title: String(raw.title ?? ""), kind: (raw.kind as "custom") ?? "custom" }) };
      case "remove-page":
        return { doc: await removePage(actor, Id.parse(raw.id)) };
      case "move-page":
        return { doc: await movePage(actor, Id.parse(raw.id), raw.dir === -1 ? -1 : 1) };
      case "save-theme":
        return { doc: await saveTheme(actor, raw.theme) };
      case "save-app":
        return { doc: await saveApp(actor, raw.app) };
      case "save-give":
        return { doc: await saveGive(actor, raw.give) };
      case "publish":
        return { meta: await publish(actor) };
      case "unpublish":
        await unpublish(actor);
        return { ok: true };
      case "restore":
        return { doc: await restoreVersion(actor, Id.parse(raw.id)) };
      case "preview-link":
        return { token: await newPreviewLink(actor) };
      case "announce":
        return { announcement: await postAnnouncement(actor, raw.announcement as never) };
      case "announce-remove":
        await removeAnnouncement(actor, Id.parse(raw.id));
        return { ok: true };
      case "push": {
        if (raw.confirm !== "SEND") throw new SiteError("Confirm before sending a notification to everyone.");
        return await sendAnnouncementPush(actor, Id.parse(raw.id), "/m");
      }
      case "inbox-mark":
        await markMessage(actor, Id.parse(raw.id), raw.handled !== false);
        return { ok: true };
      case "inbox-delete":
        await deleteMessage(actor, Id.parse(raw.id));
        return { ok: true };
      case "demo-clear":
        if (raw.confirm !== "CLEAR") throw new SiteError("Confirm before clearing the demo site.");
        await clearDemoSite(actor);
        return { ok: true };
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  });
}

/** The draft and status, for the editor. */
export async function GET() {
  const leader = await requirePermission("site.edit");
  if (isResponse(leader)) return leader;
  const book = await loadSite(leader.churchId);
  return NextResponse.json({ draft: book.draft, published: Boolean(book.published), meta: { publishedAt: book.meta.publishedAt, demo: book.meta.demo } });
}
