import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { newToken } from "../care/welcome";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { accessFor } from "../team";
import { AA, contrast, onColor } from "./media";
import { loadSite, resetSite, updateSite } from "./store";
import { AppSchema, DocSchema, GiveSchema, Href, PageSchema, PAGE_KINDS, ThemeSchema, type Announcement, type SiteBook, type SiteDoc, type SitePage, type SiteVersion } from "./types";

/**
 * The website builder. Every change needs `site.edit` (pastors and staff), is validated with zod (rich
 * text is sanitized while it's parsed), records a version, and is written to the audit log. The draft is
 * what the editor changes; visitors only ever see `published`, which changes only on publish.
 */

export class SiteError extends Error {}
const fail = (message: string): never => {
  throw new SiteError(message);
};

export type SiteActor = { leader: Leader; access: Access; editor: boolean };

export async function siteActor(leader: Leader): Promise<SiteActor> {
  const access = await accessFor(leader);
  return { leader, access, editor: can(access, "site.edit") };
}

function needEdit(actor: SiteActor) {
  if (!actor.editor) fail("Pastors and staff edit the church website. Ask one of them to make this change.");
}

async function log(leader: Leader, action: string, detail: string, conversationId?: string) {
  await audit(leader, { action: `site.${action}`, detail: detail.slice(0, 300), conversationId });
}

const MAX_VERSIONS = 25;
const COALESCE_MS = 10 * 60 * 1000;

/** Records a version, newest first. Quick successive edits by one person fold into one entry. */
export function pushVersion(book: SiteBook, actor: Pick<SiteActor, "leader">, kind: SiteVersion["kind"], label: string, doc: SiteDoc, at = Date.now()) {
  const top = book.versions[0];
  const entry: SiteVersion = { id: newId("ver"), at, by: actor.leader.name, byId: actor.leader.leaderId, label, kind, doc: structuredClone(doc) };
  if (kind === "edit" && top && top.kind === "edit" && top.byId === entry.byId && at - top.at < COALESCE_MS) {
    book.versions[0] = { ...entry, id: top.id, label: top.label === label ? label : "Edits" };
  } else book.versions.unshift(entry);
  book.versions = book.versions.slice(0, MAX_VERSIONS);
}

/** Changes the draft under the church's lock, validating the whole document afterwards. */
async function changeDraft(actor: SiteActor, label: string, action: string, fn: (doc: SiteDoc) => void, conversationId?: string) {
  needEdit(actor);
  const doc = await updateSite(actor.leader.churchId, ["draft", "versions", "meta"], (book) => {
    const next = structuredClone(book.draft);
    fn(next);
    const parsed = DocSchema.parse(next);
    book.draft = parsed;
    book.meta.updatedAt = Date.now();
    book.meta.updatedBy = actor.leader.name;
    book.meta.updatedById = actor.leader.leaderId;
    pushVersion(book, actor, "edit", label, parsed);
    return parsed;
  });
  await log(actor.leader, action, label, conversationId);
  return doc;
}

export const findPage = (doc: SiteDoc, id: string) => doc.pages.find((p) => p.id === id) ?? fail("That page doesn't exist anymore.");

/* ---------- Pages ---------- */

export async function savePage(actor: SiteActor, input: unknown) {
  const page = PageSchema.parse(input);
  return changeDraft(actor, `Edited ${page.title}`, "page.save", (doc) => {
    const at = doc.pages.findIndex((p) => p.id === page.id);
    if (at === -1) fail("That page doesn't exist anymore.");
    if (doc.pages[at].kind !== page.kind) fail("A page's kind can't change.");
    doc.pages[at] = page;
  });
}

export function slugFor(title: string, taken: string[]) {
  let slug = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "page";
  const base = slug;
  for (let i = 2; taken.includes(slug) || ["s", "m", "api", "preview", "register", "welcome", "signin", "word"].includes(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export const NewPageInput = z.object({ title: z.string().trim().min(1, "Give the page a title.").max(80), kind: z.enum(PAGE_KINDS).default("custom") });

export async function addPage(actor: SiteActor, input: z.input<typeof NewPageInput>) {
  const v = NewPageInput.parse(input);
  if (v.kind === "home") fail("The site already has a home page.");
  let created: SitePage | null = null;
  await changeDraft(actor, `Added ${v.title}`, "page.add", (doc) => {
    const page: SitePage = {
      id: newId("pg"),
      kind: v.kind,
      slug: slugFor(v.title, doc.pages.map((p) => p.slug)),
      title: v.title,
      nav: true,
      blocks: [{ id: newId("blk"), type: "richtext", html: `<h2>${v.title.replace(/[<>&"']/g, "")}</h2><p>Add this page's words here.</p>` }],
    };
    doc.pages.push(page);
    created = page;
  });
  return created! as SitePage;
}

export async function removePage(actor: SiteActor, id: string) {
  return changeDraft(actor, "Removed a page", "page.remove", (doc) => {
    const p = findPage(doc, id);
    if (p.kind === "home") fail("The home page can't be removed.");
    doc.pages = doc.pages.filter((x) => x.id !== id);
  });
}

export async function movePage(actor: SiteActor, id: string, dir: -1 | 1) {
  return changeDraft(actor, "Reordered pages", "page.move", (doc) => {
    const i = doc.pages.findIndex((p) => p.id === id);
    if (i === -1) fail("That page doesn't exist anymore.");
    const j = i + dir;
    if (j < 1 || j >= doc.pages.length || i === 0) return; // home stays first
    [doc.pages[i], doc.pages[j]] = [doc.pages[j], doc.pages[i]];
  });
}

/* ---------- Theme, member app, giving ---------- */

export async function saveTheme(actor: SiteActor, input: unknown) {
  const theme = ThemeSchema.parse(input);
  return changeDraft(actor, "Changed the theme", "theme.save", (doc) => {
    doc.theme = theme;
  });
}

export async function saveApp(actor: SiteActor, input: unknown) {
  const app = AppSchema.parse(input);
  return changeDraft(actor, "Changed the member app", "app.save", (doc) => {
    doc.app = app;
  });
}

export async function saveGive(actor: SiteActor, input: unknown) {
  const give = GiveSchema.parse(input);
  return changeDraft(actor, "Changed giving", "give.save", (doc) => {
    doc.give = give;
  });
}

/* ---------- Publishing ---------- */

/** What stops a draft from being published: contrast below WCAG AA, missing pieces. Empty when it's ready. */
export function publishProblems(doc: SiteDoc): string[] {
  const out: string[] = [];
  const parsed = DocSchema.safeParse(doc);
  if (!parsed.success) out.push(...parsed.error.issues.map((i) => i.message));
  const c = doc.theme.colors;
  if (contrast(c.text, c.background) < AA) out.push(`Text on the page background is too faint to read (${contrast(c.text, c.background).toFixed(1)}:1; it needs ${AA}:1). Darken the text color or lighten the background.`);
  if (contrast(c.text, c.surface) < AA) out.push(`Text on cards is too faint to read (${contrast(c.text, c.surface).toFixed(1)}:1; it needs ${AA}:1).`);
  if (contrast(onColor(c.primary), c.primary) < AA) out.push("Button text can't be read on the main color. Pick a darker or lighter main color.");
  if (contrast(c.primary, c.background) < AA) out.push(`Links in the main color are too faint on the background (${contrast(c.primary, c.background).toFixed(1)}:1; it needs ${AA}:1).`);
  if (!doc.pages.some((p) => p.kind === "home" && p.blocks.length)) out.push("The home page has nothing on it yet.");
  return out;
}

export async function publish(actor: SiteActor, conversationId?: string) {
  needEdit(actor);
  const book = await updateSite(actor.leader.churchId, ["published", "versions", "meta"], (book) => {
    const problems = publishProblems(book.draft);
    if (problems.length) fail(`Not published yet: ${problems.join(" ")}`);
    book.published = structuredClone(book.draft);
    book.meta.publishedAt = Date.now();
    book.meta.publishedBy = actor.leader.name;
    book.meta.publishedById = actor.leader.leaderId;
    pushVersion(book, actor, "publish", "Published", book.draft);
    return book;
  });
  await log(actor.leader, "publish", `${book.draft.pages.length} pages`, conversationId);
  return book.meta;
}

/** Takes the site down: visitors get a 404 again and it goes back to noindex. The draft stays. */
export async function unpublish(actor: SiteActor) {
  needEdit(actor);
  await updateSite(actor.leader.churchId, ["published", "meta"], (book) => {
    if (!book.published) fail("The site isn't published.");
    book.published = null;
    book.meta.publishedAt = undefined;
  });
  await log(actor.leader, "unpublish", "Site taken offline");
}

export async function restoreVersion(actor: SiteActor, versionId: string) {
  needEdit(actor);
  const doc = await updateSite(actor.leader.churchId, ["draft", "versions", "meta"], (book) => {
    const v = book.versions.find((x) => x.id === versionId) ?? fail("That version isn't in the history anymore.");
    book.draft = DocSchema.parse(structuredClone(v.doc));
    book.meta.updatedAt = Date.now();
    book.meta.updatedBy = actor.leader.name;
    pushVersion(book, actor, "restore", `Restored the version from ${new Date(v.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`, book.draft);
    return book.draft;
  });
  await log(actor.leader, "restore", versionId);
  return doc;
}

export async function newPreviewLink(actor: SiteActor) {
  needEdit(actor);
  const token = await updateSite(actor.leader.churchId, ["meta"], (book) => {
    book.meta.previewToken = newToken();
    return book.meta.previewToken;
  });
  await log(actor.leader, "preview.new", "New preview link");
  return token;
}

export async function clearDemoSite(actor: SiteActor) {
  needEdit(actor);
  const book = await loadSite(actor.leader.churchId);
  if (!book.meta.demo) fail("There's no demo site to clear.");
  if (book.published) fail("Take the site offline before starting over.");
  await resetSite(actor.leader.churchId);
  await log(actor.leader, "demo.clear", "Started from a blank site");
}

/* ---------- Announcements ---------- */

export const AnnouncementInput = z.object({
  title: z.string().trim().min(1, "Give the announcement a title.").max(80),
  body: z.string().trim().min(1, "Say what's happening.").max(500),
  link: z.object({ label: z.string().trim().min(1).max(40), href: Href }).optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-22.").optional().or(z.literal("")),
});

/**
 * Publishes an announcement to the member app and announcement blocks. From the leader app the form
 * itself is the confirmation; from Barnabas, the tool's confirmation gate runs first.
 */
export async function postAnnouncement(actor: SiteActor, input: z.input<typeof AnnouncementInput>, conversationId?: string) {
  needEdit(actor);
  const v = AnnouncementInput.parse(input);
  const a: Announcement = { id: newId("ann"), title: v.title, body: v.body, link: v.link, expiresOn: v.expiresOn || undefined, publishedAt: Date.now(), by: actor.leader.name };
  await updateSite(actor.leader.churchId, ["announcements"], (book) => {
    book.announcements = [a, ...book.announcements].slice(0, 100);
  });
  await log(actor.leader, "announcement.post", `${a.id} ${a.title}`, conversationId);
  return a;
}

export async function removeAnnouncement(actor: SiteActor, id: string) {
  needEdit(actor);
  await updateSite(actor.leader.churchId, ["announcements"], (book) => {
    if (!book.announcements.some((a) => a.id === id)) fail("That announcement is already gone.");
    book.announcements = book.announcements.filter((a) => a.id !== id);
  });
  await log(actor.leader, "announcement.remove", id);
}

/** Announcements still showing (not past their end date), newest first. */
export function currentAnnouncements(book: Pick<SiteBook, "announcements">, asOf = new Date().toISOString().slice(0, 10)) {
  return book.announcements.filter((a) => !a.expiresOn || a.expiresOn >= asOf);
}

/* ---------- Inbox ---------- */

export async function markMessage(actor: SiteActor, id: string, handled: boolean) {
  needEdit(actor);
  await updateSite(actor.leader.churchId, ["inbox"], (book) => {
    const m = book.inbox.find((x) => x.id === id) ?? fail("That message is gone.");
    m.handledAt = handled ? Date.now() : undefined;
    m.handledBy = handled ? actor.leader.name : undefined;
  });
  await log(actor.leader, handled ? "inbox.handled" : "inbox.reopen", id);
}

export async function deleteMessage(actor: SiteActor, id: string) {
  needEdit(actor);
  await updateSite(actor.leader.churchId, ["inbox"], (book) => {
    if (!book.inbox.some((m) => m.id === id)) fail("That message is already gone.");
    book.inbox = book.inbox.filter((m) => m.id !== id);
  });
  await log(actor.leader, "inbox.delete", id);
}

/** Whether the draft has changes visitors don't see yet. */
export function hasUnpublishedChanges(book: Pick<SiteBook, "draft" | "published">) {
  return !book.published || JSON.stringify(book.draft) !== JSON.stringify(book.published);
}

export { loadSite };
