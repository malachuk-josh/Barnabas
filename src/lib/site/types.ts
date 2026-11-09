import { z } from "zod";
import { HEX_RE, parseVideo } from "./media";
import { isSafeHref, isSafeImageUrl, sanitizeHtml } from "./sanitize";

/**
 * The church website and member app, as data. Every block, page and setting is validated with zod on
 * every save; rich text is sanitized as part of parsing, so a parsed document is always safe to render.
 */

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Invalid id.");
const Text = (max: number) => z.string().trim().max(max);
const Req = (max: number, message: string) => z.string().trim().min(1, message).max(max);

export const Href = z
  .string()
  .trim()
  .max(500)
  .refine(isSafeHref, "Use a web address (https://...), a page on this site (/visit), mailto: or tel:.");
const HttpsHref = z
  .string()
  .trim()
  .max(500)
  .refine((s) => /^https:\/\/[^\s"'<>]+$/i.test(s), "Use a full web address starting with https://.");

export const RichText = z
  .string()
  .max(20_000, "That's too long for one block. Split it into two.")
  .transform((s) => sanitizeHtml(s));

export const ImageSchema = z.object({
  url: z.string().trim().max(800).refine(isSafeImageUrl, "Use an image address starting with https://, or upload one."),
  alt: Req(200, "Describe the image for people who can't see it (alt text)."),
});
export type SiteImage = z.infer<typeof ImageSchema>;

const Button = z.object({ label: Req(40, "Every button needs a label."), href: Href, style: z.enum(["primary", "secondary"]).default("primary") });

/* ---------- Blocks ---------- */

export const BLOCK_TYPES = ["hero", "richtext", "image", "columns", "service_times", "events", "leadership", "sermons", "visit", "give", "contact", "map", "video", "announcement"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero",
  richtext: "Text",
  image: "Image",
  columns: "Two columns",
  service_times: "Service times",
  events: "Upcoming events",
  leadership: "Leadership",
  sermons: "Sermon series",
  visit: "Plan a visit",
  give: "Give",
  contact: "Contact form",
  map: "Map",
  video: "Video",
  announcement: "Announcement",
};

export const BLOCK_HINTS: Record<BlockType, string> = {
  hero: "A large heading with a short line, an optional picture and up to three buttons.",
  richtext: "Paragraphs, headings, lists and links.",
  image: "One picture with a caption.",
  columns: "Two columns side by side (stacked on phones).",
  service_times: "Your weekly gatherings, read from the church schedule.",
  events: "Upcoming events from Events and the church calendar, with sign-up links.",
  leadership: "Your pastors and deacons from the leadership list, with website bios.",
  sermons: "Sermon series and who's preaching, from Services.",
  visit: "Plan-a-visit details with a guest card that goes to your shepherding team.",
  give: "A giving button: your giving link, or \"online giving coming soon\".",
  contact: "A contact form. Messages arrive in the website inbox.",
  map: "A map of an address. No API key needed.",
  video: "A YouTube or Vimeo video.",
  announcement: "A highlighted notice: your latest announcement or your own text.",
};

const base = { id: Id };
const Heading = Text(120).optional();

const Column = z.object({ heading: Text(120).optional(), html: RichText, image: ImageSchema.optional() });

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("hero"), heading: Req(120, "The hero needs a heading."), text: Text(400).optional(), image: ImageSchema.optional(), buttons: z.array(Button).max(3).default([]) }),
  z.object({ ...base, type: z.literal("richtext"), html: RichText }),
  z.object({ ...base, type: z.literal("image"), image: ImageSchema, caption: Text(200).optional(), wide: z.boolean().default(false) }),
  z.object({ ...base, type: z.literal("columns"), columns: z.array(Column).length(2) }),
  z.object({ ...base, type: z.literal("service_times"), heading: Heading, note: Text(300).optional() }),
  z.object({ ...base, type: z.literal("events"), heading: Heading, limit: z.number().int().min(1).max(12).default(6), registrationOnly: z.boolean().default(false) }),
  z.object({
    ...base,
    type: z.literal("leadership"),
    heading: Heading,
    intro: Text(400).optional(),
    showBios: z.boolean().default(true),
    /** Website bios by leader name. Only these are shown; internal notes in church records never are. */
    bios: z.array(z.object({ name: Req(100, "Name needed."), bio: Text(800) })).max(40).default([]),
  }),
  z.object({ ...base, type: z.literal("sermons"), heading: Heading, limit: z.number().int().min(1).max(12).default(4) }),
  z.object({ ...base, type: z.literal("visit"), heading: Heading, text: Text(600).optional(), showForm: z.boolean().default(true) }),
  z.object({ ...base, type: z.literal("give"), heading: Heading, text: Text(400).optional(), buttonLabel: Text(40).default("Give online") }),
  z.object({ ...base, type: z.literal("contact"), heading: Heading, text: Text(400).optional(), toDrafts: z.boolean().default(false) }),
  z.object({ ...base, type: z.literal("map"), heading: Heading, address: Req(200, "Add the address to show on the map.") }),
  z.object({ ...base, type: z.literal("video"), heading: Heading, url: z.string().trim().max(300).refine((s) => Boolean(parseVideo(s)), "Use a YouTube or Vimeo link."), title: Req(120, "Give the video a title (screen readers announce it).") }),
  z.object({
    ...base,
    type: z.literal("announcement"),
    source: z.enum(["latest", "text"]).default("latest"),
    text: Text(400).optional(),
    link: z.object({ label: Req(40, "The link needs a label."), href: Href }).optional(),
  }),
]);
export type Block = z.infer<typeof BlockSchema>;
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

/* ---------- Pages ---------- */

export const PAGE_KINDS = ["home", "about", "visit", "times", "events", "sermons", "give", "contact", "custom"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export const PAGE_KIND_LABELS: Record<PageKind, string> = {
  home: "Home",
  about: "About and leadership",
  visit: "Plan a visit",
  times: "Service times",
  events: "Events",
  sermons: "Sermons",
  give: "Give",
  contact: "Contact",
  custom: "Custom page",
};

/** Paths the site can't use for a page. */
export const RESERVED_SLUGS = ["s", "m", "api", "sitemap.xml", "robots.txt", "preview", "register", "welcome", "_next", "signin", "word"];

export const PageSchema = z
  .object({
    id: Id,
    kind: z.enum(PAGE_KINDS),
    slug: z.string().trim().max(60).regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens for the address, like plan-a-visit."),
    title: Req(80, "Give the page a title."),
    description: Text(300).optional(),
    nav: z.boolean().default(true),
    blocks: z.array(BlockSchema).max(40, "A page can have up to 40 blocks."),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "home" && p.slug !== "") ctx.addIssue({ code: "custom", message: "The home page lives at the site's main address.", path: ["slug"] });
    if (p.kind !== "home" && p.slug === "") ctx.addIssue({ code: "custom", message: "Give the page an address, like plan-a-visit.", path: ["slug"] });
    if (RESERVED_SLUGS.includes(p.slug)) ctx.addIssue({ code: "custom", message: `"${p.slug}" is reserved. Pick another address.`, path: ["slug"] });
    const ids = new Set<string>();
    for (const b of p.blocks) {
      if (ids.has(b.id)) ctx.addIssue({ code: "custom", message: "Two blocks share an id.", path: ["blocks"] });
      ids.add(b.id);
    }
  });
export type SitePage = z.infer<typeof PageSchema>;

/* ---------- Theme ---------- */

export const FONTS = ["Young Serif", "Figtree", "Lora", "Merriweather", "Source Serif 4", "Inter", "Open Sans", "Lato", "Montserrat"] as const;
export type Font = (typeof FONTS)[number];

export const SOCIAL_KINDS = ["facebook", "instagram", "youtube", "vimeo", "x", "tiktok", "website"] as const;
export const SOCIAL_LABELS: Record<(typeof SOCIAL_KINDS)[number], string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", vimeo: "Vimeo", x: "X", tiktok: "TikTok", website: "Website" };

const Color = z.string().regex(HEX_RE, "Use a color like #1E4543.");

export const ThemeSchema = z.object({
  churchName: Req(100, "Add the church's name."),
  tagline: Text(140).optional(),
  logo: ImageSchema.optional(),
  colors: z.object({ primary: Color, accent: Color, background: Color, surface: Color, text: Color }),
  fonts: z.object({ heading: z.enum(FONTS), body: z.enum(FONTS) }),
  footer: z.object({
    text: Text(300).optional(),
    address: Text(200).optional(),
    phone: Text(40).regex(/^[0-9 ()+.\-]*$/, "Use digits for the phone number.").optional(),
    email: z.string().trim().email("Check the email address.").max(200).optional().or(z.literal("")),
  }),
  social: z.array(z.object({ kind: z.enum(SOCIAL_KINDS), url: HttpsHref })).max(8).default([]),
});
export type SiteTheme = z.infer<typeof ThemeSchema>;

/* ---------- Member app and giving ---------- */

export const APP_TABS = ["events", "sermons", "give", "connect"] as const;
export type AppTab = (typeof APP_TABS)[number];

export const AppSchema = z.object({
  name: Req(45, "Name the app."),
  shortName: Req(12, "Add a short name (12 letters or fewer) for the home screen."),
  /** A square image for the home-screen icon; without one, an icon is drawn from the church's initials. */
  icon: z.string().trim().max(800).refine(isSafeImageUrl, "Use an image address starting with https://.").optional().or(z.literal("")),
  welcome: Text(300).optional(),
  tabs: z.object({ events: z.boolean(), sermons: z.boolean(), give: z.boolean(), connect: z.boolean() }),
});
export type MemberApp = z.infer<typeof AppSchema>;

/**
 * Giving. Today: an outside giving page (`url`) or "online giving is coming soon". Stripe plugs in at
 * `giveTarget()` in ./give.ts; nothing here needs to change.
 */
export const GiveSchema = z.object({ url: HttpsHref.optional().or(z.literal("")), note: Text(300).optional() });
export type GiveSettings = z.infer<typeof GiveSchema>;

/* ---------- The whole document ---------- */

export const DocSchema = z
  .object({
    theme: ThemeSchema,
    pages: z.array(PageSchema).min(1).max(30, "A site can have up to 30 pages."),
    app: AppSchema,
    give: GiveSchema,
  })
  .superRefine((d, ctx) => {
    const homes = d.pages.filter((p) => p.kind === "home");
    if (homes.length !== 1) ctx.addIssue({ code: "custom", message: "The site needs exactly one home page.", path: ["pages"] });
    const slugs = new Set<string>();
    const ids = new Set<string>();
    for (const p of d.pages) {
      if (slugs.has(p.slug)) ctx.addIssue({ code: "custom", message: `Two pages use the address "/${p.slug}".`, path: ["pages"] });
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: "Two pages share an id.", path: ["pages"] });
      slugs.add(p.slug);
      ids.add(p.id);
    }
  });
export type SiteDoc = z.infer<typeof DocSchema>;

/* ---------- Stored records ---------- */

export type SiteVersion = { id: string; at: number; by: string; byId: string; label: string; kind: "edit" | "publish" | "restore"; doc: SiteDoc };

export type InboxMessage = {
  id: string;
  kind: "contact";
  name: string;
  email?: string;
  phone?: string;
  message: string;
  page?: string;
  createdAt: number;
  handledAt?: number;
  handledBy?: string;
  draftId?: string;
  /** The People record whose email matches, when exactly one does. */
  personId?: string;
};

export type Announcement = { id: string; title: string; body: string; link?: { label: string; href: string }; publishedAt: number; by: string; expiresOn?: string; pushedAt?: number };

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string }; createdAt: number };

export type SiteMeta = {
  demo: boolean;
  createdAt: number;
  clearedAt?: number;
  publishedAt?: number;
  publishedBy?: string;
  publishedById?: string;
  updatedAt?: number;
  updatedBy?: string;
  updatedById?: string;
  /** Opens the draft without signing in: /s?preview={token}. A new one turns the old one off. */
  previewToken: string;
};

export type SiteBook = {
  meta: SiteMeta;
  draft: SiteDoc;
  published: SiteDoc | null;
  versions: SiteVersion[];
  inbox: InboxMessage[];
  announcements: Announcement[];
  push: PushSub[];
};
