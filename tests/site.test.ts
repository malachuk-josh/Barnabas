import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// Routes read the signed-in leader from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { NextRequest } from "next/server";
import { can, checkinMayUse, ROLES } from "@/lib/auth/roles";
import { loadCare } from "@/lib/care/store";
import { canSeePrayer } from "@/lib/care/visibility";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { listAudit, listDrafts } from "@/lib/data/records";
import { executeTool, type ToolContext } from "@/lib/engine/tools";
import { robotsTxt, siteMode } from "@/lib/site/access";
import { publicEvents, serviceTimes } from "@/lib/site/data";
import { defaultBlock } from "@/lib/site/defaults";
import { giveTarget } from "@/lib/site/give";
import { memberManifest } from "@/lib/site/manifest";
import { contrast, parseVideo } from "@/lib/site/media";
import { allowSubmission, FORM_LIMITS, formsOpen, isHoneypot, submitContact, submitPrayer } from "@/lib/site/public";
import { isSiteHost, routeSiteHost, siteBase, siteHref } from "@/lib/site/routing";
import { isSafeHref, sanitizeHtml } from "@/lib/site/sanitize";
import { publicBio, starterDoc } from "@/lib/site/seed";
import { addPage, hasUnpublishedChanges, postAnnouncement, publish, publishProblems, restoreVersion, savePage, saveTheme, siteActor, SiteError, unpublish } from "@/lib/site/service";
import { loadSite } from "@/lib/site/store";
import { BlockSchema, DocSchema, PageSchema } from "@/lib/site/types";
import { checkUpload } from "@/lib/site/upload";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { middleware } from "@/middleware";
import { navItems } from "@/components/NavLinks";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "st000001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const staff: Leader = { churchId: "demo", leaderId: "st000002", name: "Kim Staff", email: "kim@example.org", role: "Office" };
const deacon: Leader = { churchId: "demo", leaderId: "st000003", name: "Dee Deacon", email: "dee@example.org", role: "Deacon" };
const member: Leader = { churchId: "demo", leaderId: "st000004", name: "Lee Leader", email: "lee@example.org", role: "Small group leader" };
const checkin: Leader = { churchId: "demo", leaderId: "st000005", name: "Cam Checkin", email: "cam@example.org", role: "Check-in" };

async function setupTeam() {
  freshStore();
  for (const l of [pastor, staff, deacon, member, checkin]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", staff.leaderId, "staff", "test");
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
  await setLeaderRole("demo", checkin.leaderId, "checkin", "test");
}

let n = 0;
const req = (path: string, body: unknown, ip = "203.0.113.9") =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

/* ---------- Sanitizer ---------- */

describe("rich text sanitizer", () => {
  it("keeps the safe subset and removes scripts, handlers and unsafe links", () => {
    expect(sanitizeHtml("<p>Hello <strong>friends</strong></p>")).toBe("<p>Hello <strong>friends</strong></p>");
    expect(sanitizeHtml('<p onclick="x()">Hi</p><script>alert(1)</script>')).toBe("<p>Hi</p>");
    expect(sanitizeHtml('<img src=x onerror="alert(1)">ok')).toBe("ok");
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe("click");
    expect(sanitizeHtml('<a href="java\nscript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>')).toBe("x");
    expect(sanitizeHtml('<a href="https://example.org/a?b=1&amp;c=2" target="_blank" style="color:red">site</a>')).toBe('<a href="https://example.org/a?b=1&amp;c=2" rel="noopener noreferrer nofollow">site</a>');
    expect(sanitizeHtml('<a href="/visit">Plan a visit</a>')).toBe('<a href="/visit">Plan a visit</a>');
    expect(sanitizeHtml("<style>p{}</style><iframe src=//evil></iframe><svg onload=alert(1)><circle/></svg>Text")).toBe("Text");
    expect(sanitizeHtml("<b>bold</b> <i>it</i> <div>line</div>")).toBe("<strong>bold</strong> <em>it</em> <p>line</p>");
  });

  it("escapes text, balances tags and survives broken markup", () => {
    expect(sanitizeHtml("1 < 2 & 3 > 2")).toBe("1 &lt; 2 &amp; 3 &gt; 2");
    expect(sanitizeHtml("<p><strong>open")).toBe("<p><strong>open</strong></p>");
    expect(sanitizeHtml("</p>stray</em>")).toBe("stray");
    expect(sanitizeHtml("<scr<script>ipt>alert(1)</script>")).not.toMatch(/<script/i);
    expect(sanitizeHtml('<p title="a>b">x</p>')).toBe("<p>x</p>");
    expect(sanitizeHtml("<!-- <script>x</script> -->safe")).toBe("safe");
    expect(sanitizeHtml('"><img src=x onerror=alert(1)>')).toBe("&quot;&gt;");
  });

  it("allows only safe hrefs", () => {
    for (const ok of ["https://x.org", "http://x.org", "mailto:a@b.org", "tel:+1 413 555 0100", "/visit", "#times"]) expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.com", "/\\evil.com", "vbscript:x", "data:text/html,x", "ftp://x", ""]) expect(isSafeHref(bad), bad).toBe(false);
  });
});

/* ---------- Blocks ---------- */

describe("block validation", () => {
  it("validates every block type's default", () => {
    for (const t of ["hero", "richtext", "columns", "service_times", "events", "leadership", "sermons", "visit", "give", "contact", "announcement"] as const) {
      expect(BlockSchema.safeParse(defaultBlock(t)).success, t).toBe(true);
    }
    // These need the leader to fill something in first.
    expect(BlockSchema.safeParse(defaultBlock("image")).success).toBe(false);
    expect(BlockSchema.safeParse(defaultBlock("video")).success).toBe(false);
    expect(BlockSchema.safeParse(defaultBlock("map")).success).toBe(false);
    expect(BlockSchema.safeParse(defaultBlock("map", "35 Notch Road, North Adams, MA")).success).toBe(true);
  });

  it("requires alt text on images", () => {
    const r = BlockSchema.safeParse({ id: "b1", type: "image", image: { url: "https://cdn.example.org/a.jpg", alt: "" } });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/alt text/);
    expect(BlockSchema.safeParse({ id: "b1", type: "hero", heading: "Hi", image: { url: "https://cdn.example.org/a.jpg", alt: "" } }).success).toBe(false);
    expect(BlockSchema.safeParse({ id: "b1", type: "image", image: { url: "https://cdn.example.org/a.jpg", alt: "The church building in autumn" } }).success).toBe(true);
    expect(BlockSchema.safeParse({ id: "b1", type: "image", image: { url: "javascript:alert(1)", alt: "x" } }).success).toBe(false);
    expect(BlockSchema.safeParse({ id: "b1", type: "image", image: { url: "http://insecure.example.org/a.jpg", alt: "x" } }).success).toBe(false);
  });

  it("sanitizes rich text while parsing and rejects unsafe button links", () => {
    const r = BlockSchema.parse({ id: "b1", type: "richtext", html: '<p>Hi</p><script>alert(1)</script><a href="javascript:x">y</a>' });
    expect(r.type === "richtext" && r.html).toBe("<p>Hi</p>y");
    expect(BlockSchema.safeParse({ id: "b1", type: "hero", heading: "Hi", buttons: [{ label: "Go", href: "javascript:alert(1)" }] }).success).toBe(false);
    expect(BlockSchema.safeParse({ id: "b1", type: "hero", heading: "Hi", buttons: [{ label: "Go", href: "/visit" }, { label: "a", href: "/" }, { label: "b", href: "/" }, { label: "c", href: "/" }] }).success).toBe(false);
    expect(BlockSchema.safeParse({ id: "b1", type: "nope" }).success).toBe(false);
  });

  it("embeds only YouTube and Vimeo", () => {
    expect(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(parseVideo("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(parseVideo("https://vimeo.com/76979871")?.src).toBe("https://player.vimeo.com/video/76979871");
    expect(parseVideo("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideo("https://www.youtube.com/watch?v=bad\"onload")).toBeNull();
    expect(parseVideo("javascript:alert(1)")).toBeNull();
    expect(BlockSchema.safeParse({ id: "v", type: "video", url: "https://example.org/video.mp4", title: "x" }).success).toBe(false);
  });

  it("checks page addresses and the document's pages", () => {
    const doc = starterDoc("Test Church", "1 Main St");
    expect(DocSchema.safeParse(doc).success).toBe(true);
    const page = doc.pages[1];
    expect(PageSchema.safeParse({ ...page, slug: "api" }).success).toBe(false);
    expect(PageSchema.safeParse({ ...page, slug: "Bad Slug" }).success).toBe(false);
    expect(PageSchema.safeParse({ ...page, slug: "" }).success).toBe(false);
    expect(DocSchema.safeParse({ ...doc, pages: [...doc.pages, { ...page, id: "pg_x" }] }).success).toBe(false); // same slug twice
    expect(DocSchema.safeParse({ ...doc, pages: doc.pages.slice(1) }).success).toBe(false); // no home
  });

  it("validates uploads by their bytes, not just their type", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkUpload({ type: "image/png", size: 100 }, png)).toBeNull();
    expect(checkUpload({ type: "image/svg+xml", size: 100 }, new TextEncoder().encode("<svg onload=alert(1)>"))).toMatch(/PNG/);
    expect(checkUpload({ type: "image/jpeg", size: 100 }, png)).toMatch(/isn't/);
    expect(checkUpload({ type: "image/png", size: 5 * 1024 * 1024 }, png)).toMatch(/4 MB/);
  });
});

/* ---------- Publish, draft and noindex ---------- */

describe("draft, publish and noindex", () => {
  const anon = { signedIn: false, canEdit: false, checkinOnly: false };
  const leaderV = { signedIn: true, canEdit: false, checkinOnly: false };
  const editorV = { signedIn: true, canEdit: true, checkinOnly: false };
  const checkinV = { signedIn: true, canEdit: false, checkinOnly: true };
  const token = "t".repeat(43);

  it("shows the unpublished site only to signed-in leaders, always noindex", () => {
    expect(siteMode({ published: false, viewer: anon })).toEqual({ show: null, noindex: true });
    expect(siteMode({ published: false, viewer: checkinV }).show).toBeNull();
    expect(siteMode({ published: false, viewer: leaderV })).toMatchObject({ show: "draft", noindex: true, banner: "unpublished" });
    expect(siteMode({ published: false, viewer: anon, preview: "1", previewToken: token }).show).toBeNull();
    expect(siteMode({ published: false, viewer: anon, preview: token, previewToken: token })).toMatchObject({ show: "draft", noindex: true });
    expect(siteMode({ published: false, viewer: anon, preview: "wrong".repeat(9), previewToken: token }).show).toBeNull();
  });

  it("shows the published site to everyone and the draft only on preview", () => {
    expect(siteMode({ published: true, viewer: anon })).toEqual({ show: "published", noindex: false });
    expect(siteMode({ published: true, viewer: anon, preview: "1", previewToken: token })).toEqual({ show: "published", noindex: false });
    expect(siteMode({ published: true, viewer: leaderV, preview: "1", previewToken: token }).show).toBe("published");
    expect(siteMode({ published: true, viewer: editorV, preview: "1", previewToken: token })).toMatchObject({ show: "draft", noindex: true });
    expect(robotsTxt(false, "x")).toContain("Disallow: /");
    expect(robotsTxt(true, "https://www.example.org/sitemap.xml")).toContain("Sitemap: https://www.example.org/sitemap.xml");
  });

  beforeEach(setupTeam);

  it("seeds the demo church as an unpublished, labeled draft from public information only", async () => {
    const book = await loadSite("demo");
    expect(book.meta.demo).toBe(true);
    expect(book.published).toBeNull();
    const kinds = book.draft.pages.map((p) => p.kind);
    expect(kinds).toEqual(["home", "about", "visit", "times", "events", "sermons", "give", "contact"]);
    expect(book.draft.theme.footer.address).toBe("35 Notch Road, North Adams, MA");
    expect(book.draft.theme.colors).toMatchObject({ primary: "#1E4543", accent: "#D9A441", background: "#F3F6F4", text: "#0F2423" });
    const lead = book.draft.pages[1].blocks.find((b) => b.type === "leadership");
    const bios = lead?.type === "leadership" ? lead.bios : [];
    expect(bios.map((b) => b.name)).toEqual(["Ethan Malachuk", "Eric Malachuk", "Aaron Malachuk", "Travis Willette", "Cal Najimy", "Micah Hayre"]);
    // Website bios keep ministry facts and leave out family, home town and workload notes from church records.
    const all = bios.map((b) => b.bio).join(" ");
    expect(all).toContain("Lead Pastor since 2024");
    expect(all).not.toMatch(/married|kids|Lives in|busy|Travels/i);
    expect(publicBio("Serves faithfully. Married, with two kids.")).toBe("Serves faithfully.");
    expect(publishProblems(book.draft)).toEqual([]);
  });

  it("keeps edits in the draft until publish, records versions and audits every write", async () => {
    const actor = await siteActor(pastor);
    const book = await loadSite("demo");
    const home = book.draft.pages[0];
    await savePage(actor, { ...home, title: "Welcome home" });
    let now = await loadSite("demo");
    expect(now.draft.pages[0].title).toBe("Welcome home");
    expect(now.published).toBeNull();
    await publish(actor);
    now = await loadSite("demo");
    expect(now.published?.pages[0].title).toBe("Welcome home");
    expect(hasUnpublishedChanges(now)).toBe(false);
    await savePage(actor, { ...now.draft.pages[0], title: "Changed again" });
    now = await loadSite("demo");
    expect(now.published?.pages[0].title).toBe("Welcome home");
    expect(hasUnpublishedChanges(now)).toBe(true);
    expect(now.versions.map((v) => v.kind)).toEqual(["edit", "publish", "edit"]);
    const before = now.versions.find((v) => v.kind === "publish")!;
    await restoreVersion(actor, before.id);
    now = await loadSite("demo");
    expect(now.draft.pages[0].title).toBe("Welcome home");
    await unpublish(actor);
    expect((await loadSite("demo")).published).toBeNull();
    const actions = (await listAudit(pastor)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["site.page.save", "site.publish", "site.restore", "site.unpublish"]));
  });

  it("won't publish a theme that fails WCAG AA contrast", async () => {
    const actor = await siteActor(pastor);
    const book = await loadSite("demo");
    await saveTheme(actor, { ...book.draft.theme, colors: { ...book.draft.theme.colors, text: "#BBBBBB" } });
    await expect(publish(actor)).rejects.toThrow(/too faint/);
    expect(contrast("#0F2423", "#F3F6F4")).toBeGreaterThan(4.5);
  });

  it("sanitizes stored rich text even when the request skips the editor", async () => {
    const actor = await siteActor(staff);
    const book = await loadSite("demo");
    const about = book.draft.pages[1];
    await savePage(actor, { ...about, blocks: [{ id: "x1", type: "richtext", html: '<p>Hi</p><img src=x onerror="alert(1)"><script>steal()</script>' }] });
    const saved = (await loadSite("demo")).draft.pages[1].blocks[0];
    expect(saved.type === "richtext" && saved.html).toBe("<p>Hi</p>");
  });
});

/* ---------- Custom domain ---------- */

describe("custom-domain routing", () => {
  const ENV = "www.mountgreylockbaptist.com, mountgreylockbaptist.com";

  it("maps the church's domain to the site and keeps the app off it", () => {
    expect(isSiteHost("www.mountgreylockbaptist.com", ENV)).toBe(true);
    expect(isSiteHost("WWW.MOUNTGREYLOCKBAPTIST.COM:443", ENV)).toBe(true);
    expect(isSiteHost("barnabas-three.vercel.app", ENV)).toBe(false);
    expect(routeSiteHost("barnabas-three.vercel.app", "/finance", ENV)).toBeNull();
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/", ENV)).toEqual({ kind: "rewrite", path: "/s" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/visit", ENV)).toEqual({ kind: "rewrite", path: "/s/visit" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/finance", ENV)).toEqual({ kind: "rewrite", path: "/s/finance" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/sitemap.xml", ENV)).toEqual({ kind: "rewrite", path: "/s/sitemap.xml" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/api/finance/overview", ENV)).toEqual({ kind: "block" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/api/auth/signin", ENV)).toEqual({ kind: "block" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/api/s/contact", ENV)).toEqual({ kind: "pass" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/m/events", ENV)).toEqual({ kind: "pass" });
    expect(routeSiteHost("www.mountgreylockbaptist.com", "/register/abc", ENV)).toEqual({ kind: "pass" });
    expect(siteBase("www.mountgreylockbaptist.com", ENV)).toBe("");
    expect(siteBase("barnabas-three.vercel.app", ENV)).toBe("/s");
    expect(siteHref("/visit", "/s")).toBe("/s/visit");
    expect(siteHref("/", "")).toBe("/");
    expect(siteHref("/m", "/s")).toBe("/m");
    expect(siteHref("https://x.org", "/s")).toBe("https://x.org");
  });

  describe("in the middleware", () => {
    const saved = process.env.CHURCH_SITE_HOST;
    beforeEach(() => {
      process.env.CHURCH_SITE_HOST = ENV;
    });
    afterEach(() => {
      process.env.CHURCH_SITE_HOST = saved;
    });
    const call = (url: string, host: string) => middleware(new NextRequest(url, { headers: { host } }));

    it("rewrites the church's domain to the site renderer without a sign-in", async () => {
      const res = await call("https://www.mountgreylockbaptist.com/visit", "www.mountgreylockbaptist.com");
      expect(new URL(res.headers.get("x-middleware-rewrite")!).pathname).toBe("/s/visit");
      const home = await call("https://www.mountgreylockbaptist.com/", "www.mountgreylockbaptist.com");
      expect(new URL(home.headers.get("x-middleware-rewrite")!).pathname).toBe("/s");
    });

    it("never serves the leader app or its API on the church's domain", async () => {
      const page = await call("https://www.mountgreylockbaptist.com/finance", "www.mountgreylockbaptist.com");
      expect(new URL(page.headers.get("x-middleware-rewrite")!).pathname).toBe("/s/finance");
      const api = await call("https://www.mountgreylockbaptist.com/api/care/cases", "www.mountgreylockbaptist.com");
      expect(api.status).toBe(404);
    });

    it("leaves the Barnabas domain as it was: /s and /m are public, the app needs a sign-in", async () => {
      const site = await call("https://barnabas-three.vercel.app/s/visit", "barnabas-three.vercel.app");
      expect(site.headers.get("x-middleware-rewrite")).toBeNull();
      expect(site.status).toBe(200);
      const app = await call("https://barnabas-three.vercel.app/finance", "barnabas-three.vercel.app");
      expect(app.status).toBe(307);
      const memory = await call("https://barnabas-three.vercel.app/memory", "barnabas-three.vercel.app");
      expect(memory.status).toBe(307); // "/m" being public doesn't open "/memory"
      const settings = await call("https://barnabas-three.vercel.app/settings", "barnabas-three.vercel.app");
      expect(settings.status).toBe(307); // nor does "/s" open "/settings"
    });
  });
});

/* ---------- Public forms ---------- */

describe("public forms", () => {
  beforeEach(async () => {
    await setupTeam();
    session.current = null;
  });

  it("rate-limits each form per address", async () => {
    const r = () => req("/api/s/contact", {}, `198.51.100.${n}`);
    n++;
    const results: boolean[] = [];
    for (let i = 0; i < FORM_LIMITS.contact.ip.limit + 2; i++) results.push(await allowSubmission("contact", r()));
    expect(results.filter(Boolean)).toHaveLength(FORM_LIMITS.contact.ip.limit);
    expect(results.at(-1)).toBe(false);
    // Another address is unaffected.
    expect(await allowSubmission("contact", req("/api/s/contact", {}, "192.0.2.77"))).toBe(true);
  });

  it("is closed until the site is published, except to signed-in leaders", async () => {
    const { POST } = await import("@/app/api/s/[form]/route");
    const params = Promise.resolve({ form: "contact" });
    const body = { name: "Sam", email: "sam@example.org", message: "Hello there" };
    const closed = await POST(req("/api/s/contact", body, "192.0.2.1"), { params });
    expect(closed.status).toBe(404);
    expect(formsOpen({ published: null }, true)).toBe(true);
    await publish(await siteActor(pastor));
    const open = await POST(req("/api/s/contact", body, "192.0.2.1"), { params: Promise.resolve({ form: "contact" }) });
    expect(open.status).toBe(200);
    expect((await loadSite("demo")).inbox).toHaveLength(1);
  });

  it("keeps nothing from a bot that fills the honeypot, and says thanks", async () => {
    await publish(await siteActor(pastor));
    const { POST } = await import("@/app/api/s/[form]/route");
    const res = await POST(req("/api/s/contact", { name: "Bot", email: "b@example.org", message: "Buy now", website: "http://spam.example" }, "192.0.2.2"), { params: Promise.resolve({ form: "contact" }) });
    expect(res.status).toBe(200);
    expect((await loadSite("demo")).inbox).toHaveLength(0);
    expect(isHoneypot({ website: " " })).toBe(false);
    expect(isHoneypot({ website: "x" })).toBe(true);
  });

  it("answers 429 once an address sends too many", async () => {
    await publish(await siteActor(pastor));
    const { POST } = await import("@/app/api/s/[form]/route");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await POST(req("/api/s/prayer", { name: "Pat", request: "For our family this week" }, "192.0.2.3"), { params: Promise.resolve({ form: "prayer" }) });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it("sends contact messages to the inbox, and drafts a reply only when the stored block says so", async () => {
    const actor = await siteActor(pastor);
    const book = await loadSite("demo");
    const contact = book.draft.pages.find((p) => p.kind === "contact")!;
    const block = contact.blocks.find((b) => b.type === "contact")!;
    await savePage(actor, { ...contact, blocks: contact.blocks.map((b) => (b.id === block.id ? { ...b, toDrafts: true } : b)) });
    await publish(actor);
    const doc = (await loadSite("demo")).published;
    const msg = await submitContact("demo", { name: "Jordan Visitor", email: "jordan@example.org", message: "What time is Sunday worship?", blockId: block.id }, doc);
    expect(msg.draftId).toBeTruthy();
    const drafts = await listDrafts(pastor);
    expect(drafts[0].status).toBe("needs_review");
    expect(drafts[0].recipients[0].name).toBe("Jordan Visitor");
    const plain = await submitContact("demo", { name: "Riley", phone: "413 555 0100", message: "Hello" }, doc);
    expect(plain.draftId).toBeUndefined();
    await expect(submitContact("demo", { name: "No Contact", message: "Hi there" }, doc)).rejects.toThrow(/email or phone/);
    await expect(submitContact("demo", { name: "Leaky", email: "a@b.org", message: "my password is hunter2" }, doc)).rejects.toThrow(/passwords/);
  });

  it("puts prayer requests into Shepherding with the existing privacy rules", async () => {
    const pr = await submitPrayer("demo", { name: "Morgan", request: "Pray for a new job search", shareable: false });
    const book = await loadCare("demo");
    const stored = book.prayers.find((p) => p.id === pr.id)!;
    expect(stored.shareable).toBe(false);
    const viewer = (role: "pastor" | "deacon", ids: string[]) => ({ access: { role, admin: false }, memberIds: ids });
    expect(canSeePrayer(viewer("pastor", ["l:x"]), stored)).toBe(true);
    expect(canSeePrayer(viewer("deacon", ["l:y"]), stored)).toBe(false);
    const shared = await submitPrayer("demo", { name: "Morgan", request: "Thankful for our church family", shareable: true });
    expect(canSeePrayer(viewer("deacon", ["l:y"]), shared)).toBe(true);
    await expect(submitPrayer("demo", { name: "Morgan", request: "My cancer diagnosis and chemo" })).rejects.toThrow(/privacy/);
  });
});

/* ---------- Member app manifest ---------- */

describe("member app manifest", () => {
  it("has its own name, icon, start_url and scope", () => {
    const doc = starterDoc("Mount Greylock Baptist Church", "35 Notch Road, North Adams, MA");
    const m = memberManifest(doc);
    expect(m.name).toBe("Mount Greylock Baptist Church");
    expect(m.short_name).toBe("MGBC");
    expect(m.start_url).toBe("/m");
    expect(m.scope).toBe("/m/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#1E4543");
    expect(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    expect(m.icons.every((i) => i.src.startsWith("/m/"))).toBe(true);
  });

  it("has a giving seam: a link, or coming soon", () => {
    expect(giveTarget({ give: { url: "", note: "" } })).toEqual({ kind: "soon", note: undefined });
    expect(giveTarget({ give: { url: "https://give.example.org", note: "" } })).toEqual({ kind: "link", href: "https://give.example.org", note: undefined });
  });

  it("reads service times and events from the church's schedule", async () => {
    freshStore();
    const times = await serviceTimes("2026-11-09");
    expect(times.map((d) => d.day)).toEqual(["Sunday", "Wednesday"]);
    expect(times[0].items.map((i) => i.time)).toEqual(["8:30 AM", "9:45 AM", "10:45 AM"]);
    const events = await publicEvents("2026-11-09", 60);
    const reverb = events.find((e) => e.title.includes("Reverb"));
    expect(reverb?.registerHref).toMatch(/^\/register\/[A-Za-z0-9_-]{43}$/);
    expect(events.find((e) => e.title.includes("Ladies"))?.registerHref).toBeUndefined();
  });
});

/* ---------- Permissions ---------- */

describe("website permissions", () => {
  beforeEach(setupTeam);

  it("lets pastors and staff edit; no one else, and never kids check-in", async () => {
    for (const role of ROLES) expect(can({ role, admin: false }, "site.edit"), role).toBe(role === "pastor" || role === "staff");
    expect(can({ role: "checkin", admin: true }, "site.edit")).toBe(false);
    expect(checkinMayUse("/site")).toBe(false);
    expect(checkinMayUse("/api/site")).toBe(false);
    for (const l of [deacon, member, checkin]) {
      const actor = await siteActor(l);
      expect(actor.editor).toBe(false);
      await expect(addPage(actor, { title: "Hack" })).rejects.toBeInstanceOf(SiteError);
      await expect(publish(actor)).rejects.toBeInstanceOf(SiteError);
      await expect(postAnnouncement(actor, { title: "x", body: "y" })).rejects.toBeInstanceOf(SiteError);
    }
    expect((await addPage(await siteActor(staff), { title: "Kids ministry" })).slug).toBe("kids-ministry");
  });

  it("refuses the builder's API to roles without site.edit, including check-in", async () => {
    const { POST } = await import("@/app/api/site/route");
    const call = () => POST(new Request("http://localhost/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish" }) }));
    session.current = null;
    expect((await call()).status).toBe(401);
    for (const l of [checkin, member, deacon]) {
      session.current = l;
      expect((await call()).status, l.name).toBe(403);
    }
    session.current = pastor;
    expect((await call()).status).toBe(200);
    session.current = null;
  });

  it("shows the Website nav entry only with site.edit, and never to check-in", () => {
    const hrefs = (a: Parameters<typeof navItems>[0]) => navItems(a).map((x) => x.href);
    expect(hrefs({ showSite: true })).toContain("/site");
    expect(hrefs({ showSite: false })).not.toContain("/site");
    expect(hrefs({ showSite: true, checkinOnly: true })).toEqual(["/inbox", "/kids", "/settings"]);
  });

  it("gates Barnabas's announcement tool behind a yes and site.edit, and reads only the published site", async () => {
    const meta: ConversationMeta = { id: `conv_site_${n++}`, title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns: 1 };
    await createConversation(pastor, meta);
    const ctx = (text: string, turns: number): ToolContext => ({ leader: pastor, meta: Object.assign(meta, { turns }), turnStartedAt: Date.now(), lastUserText: text });
    const input = { title: "Thanksgiving Communion Service", body: "Join us Sunday, November 22 at 6:00 PM." };
    const first = await executeTool("post_announcement", input, ctx("Post an announcement about the Thanksgiving service", 1));
    expect(first.isError).toBe(true);
    expect(first.content).toMatch(/Not confirmed/);
    expect((await loadSite("demo")).announcements).toHaveLength(0);
    const second = await executeTool("post_announcement", input, ctx("Yes, post it", 2));
    expect(second.isError).toBe(false);
    expect((await loadSite("demo")).announcements[0].title).toBe(input.title);

    const memberMeta: ConversationMeta = { ...meta, id: `conv_site_${n++}`, pending: undefined, turns: 1 };
    await createConversation(member, memberMeta);
    const denied = await executeTool("post_announcement", input, { leader: member, meta: memberMeta, turnStartedAt: Date.now(), lastUserText: "yes" });
    expect(denied.content).toMatch(/Only pastors and staff/);

    const unpublished = await executeTool("website_content", {}, ctx("What's on our website?", 3));
    expect(unpublished.content).toMatch(/isn't published/);
    await publish(await siteActor(pastor));
    const live = JSON.parse((await executeTool("website_content", {}, ctx("What's on our website?", 4))).content);
    expect(live.version).toBe("published");
    expect(live.pages.map((p: { title: string }) => p.title)).toContain("Plan a visit");
    expect(live.announcements[0].title).toBe(input.title);
    const draftDenied = await executeTool("website_content", { draft: true }, { leader: member, meta: memberMeta, turnStartedAt: Date.now(), lastUserText: "" });
    expect(draftDenied.isError).toBe(true);
  });
});
