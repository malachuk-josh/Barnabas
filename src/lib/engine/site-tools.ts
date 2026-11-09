import { z } from "zod";
import { htmlToText } from "../site/sanitize";
import { currentAnnouncements, postAnnouncement, siteActor, SiteError } from "../site/service";
import { loadSite } from "../site/store";
import type { Block } from "../site/types";
import { gateConfirmed } from "./gate";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * Barnabas's website tools. `post_announcement` proposes first and posts only after the leader says yes
 * on a later turn (the confirmation gate in ./gate.ts), and only for site.edit. `website_content` reads
 * what visitors see: the published site, never the draft unless asked and allowed.
 */

const ok = (content: unknown): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;

const postAnnouncementTool = tool({
  def: {
    name: "post_announcement",
    description:
      "Post an announcement to the church's member app and the website's announcement blocks (pastors and staff only). Confirmed in code: the first call only proposes; tell the leader exactly what will post, and call again with the same title and text after they say yes.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title, e.g. 'Thanksgiving Communion Service'" },
        body: { type: "string", description: "One to three sentences" },
        expires_on: { type: "string", description: "yyyy-mm-dd; stop showing after this date" },
      },
      required: ["title", "body"],
    },
  },
  schema: z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(500), expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  async run(input, ctx: ToolContext) {
    const actor = await siteActor(ctx.leader);
    if (!actor.editor) return fail("Only pastors and staff post announcements to the church app and website. Tell the leader kindly.");
    const key = JSON.stringify([input.title.trim(), input.body.trim(), input.expires_on ?? ""]);
    if (!gateConfirmed(ctx, "post_announcement", key)) {
      return fail(`Not confirmed yet. Read the announcement back and ask: post "${input.title}" (${input.body}) to the member app and website${input.expires_on ? ` until ${input.expires_on}` : ""}? Call post_announcement again with exactly the same details after they say yes.`);
    }
    try {
      const a = await postAnnouncement(actor, { title: input.title, body: input.body, expiresOn: input.expires_on }, ctx.meta.offRecord ? undefined : ctx.meta.id);
      return ok({ posted: a.title, note: "It shows now on the member app's Home tab and in announcement blocks. No push notification was sent; a leader can send one from Website → Member app. Tell the leader in one sentence." });
    } catch (err) {
      if (err instanceof SiteError || err instanceof z.ZodError) return fail(err instanceof z.ZodError ? err.issues.map((i) => i.message).join("; ") : err.message);
      throw err;
    }
  },
});

function blockSummary(b: Block): string | null {
  switch (b.type) {
    case "hero":
      return `Hero: ${b.heading}${b.text ? `. ${b.text}` : ""}`;
    case "richtext":
      return htmlToText(b.html).slice(0, 400) || null;
    case "columns":
      return b.columns.map((c) => `${c.heading ? `${c.heading}: ` : ""}${htmlToText(c.html)}`).join(" | ").slice(0, 400);
    case "image":
      return `Image: ${b.image.alt}`;
    case "video":
      return `Video: ${b.title}`;
    case "map":
      return `Map: ${b.address}`;
    case "announcement":
      return b.source === "text" ? `Announcement: ${b.text ?? ""}` : "Latest announcement";
    case "visit":
      return `Plan a visit${b.text ? `: ${b.text}` : ""}${b.showForm ? " (with guest card)" : ""}`;
    case "give":
      return `Give${b.text ? `: ${b.text}` : ""}`;
    case "contact":
      return "Contact form";
    case "leadership":
      return `Leadership list${b.showBios ? " with bios" : ""}`;
    case "service_times":
      return "Service times (from the weekly schedule)";
    case "events":
      return `Upcoming events (${b.limit})`;
    case "sermons":
      return "Sermon series and preaching";
  }
}

const websiteContent = tool({
  phrase: "Let me look at the website.",
  def: {
    name: "website_content",
    description:
      "What's on the church's public website and member app: whether it's published, each published page with a short summary of its blocks, current announcements, and the giving link. Optionally one page by title. Reads the published site; with draft=true (pastors and staff), the unpublished draft instead.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { page: { type: "string", description: "Part of a page title, e.g. 'visit'" }, draft: { type: "boolean" } } },
  },
  schema: z.object({ page: z.string().max(80).optional(), draft: z.boolean().optional() }),
  async run({ page, draft }, ctx: ToolContext) {
    const book = await loadSite(ctx.leader.churchId);
    let doc = book.published;
    let which = "published";
    if (draft) {
      const actor = await siteActor(ctx.leader);
      if (!actor.editor) return fail("Only pastors and staff can see the website draft. Offer the published site instead.");
      doc = book.draft;
      which = "draft";
    }
    if (!doc) return ok({ published: false, note: "The website isn't published yet: only signed-in leaders can see the draft, and it's not indexed. Pastors and staff can publish it from Website. Say so; offer to describe the draft (draft=true) if they can edit it." });
    const pages = doc.pages.filter((p) => !page || p.title.toLowerCase().includes(page.toLowerCase()));
    if (!pages.length) return fail(`No page matches "${page}". Pages: ${doc.pages.map((p) => p.title).join(", ")}.`);
    return ok({
      version: which,
      demo_content: book.meta.demo || undefined,
      church: doc.theme.churchName,
      published_at: book.meta.publishedAt ? new Date(book.meta.publishedAt).toISOString().slice(0, 10) : undefined,
      pages: pages.map((p) => ({ title: p.title, address: `/${p.slug}`, in_menu: p.nav, blocks: p.blocks.map(blockSummary).filter(Boolean) })),
      announcements: currentAnnouncements(book).slice(0, 5).map((a) => ({ title: a.title, body: a.body, until: a.expiresOn })),
      giving: doc.give.url ? `Links to ${doc.give.url}` : "Online giving is coming soon (no giving link set)",
      member_app: { name: doc.app.name, tabs: Object.entries(doc.app.tabs).filter(([, on]) => on).map(([k]) => k) },
      note: "Placeholder text (\"Add ... here\") means the church hasn't written that part yet; say so rather than reading it out.",
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SITE_TOOLS: ToolSpec<any>[] = [postAnnouncementTool, websiteContent];
