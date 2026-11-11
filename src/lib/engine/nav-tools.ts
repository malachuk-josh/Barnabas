import { z } from "zod";
import { levelMayUse } from "../auth/roles";
import { accessFor } from "../team";
import type { ActionLink } from "./links";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";
import { parsePassage, RefError, wordLink } from "./word-tools";

/**
 * Opening a page for the leader. The conversation lives above the pages, so it carries on (and keeps
 * listening) while the app moves. Barnabas opens a page only when the leader asks.
 */

const ok = (content: unknown, extra: Partial<ToolResult> = {}): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false, ...extra });
const fail = (content: string): ToolResult => ({ content, isError: true });

/** The app's pages Barnabas may open, by their first path segment. */
const PAGES = ["", "word", "calendar", "people", "shepherding", "serve", "services", "journal", "events", "kids", "inbox", "drafts", "finance", "reports", "network", "site", "memory", "settings", "admin"];

/** A path inside the app, or null: no other site, no API, nothing but the app's own pages. */
export function appPath(href: string): string | null {
  const h = href.trim();
  if (!h.startsWith("/") || h.startsWith("//") || h.length > 300 || /[\s<>"']/.test(h)) return null;
  const first = h.split(/[/?#]/)[1] ?? "";
  return PAGES.includes(first) ? h : null;
}

const openPage = {
  def: {
    name: "open_page",
    description:
      "Open a page in the app for the leader, when they ask you to (\"open it\", \"take me to John 3\", \"show me Ruth's record\", or yes to your offer). Give a scripture reference to open The Word there, or an href: a link another tool returned (a person's record, a Journal entry, an event) or a page such as /calendar or /inbox. " +
      "Your conversation carries on while the page opens, still listening if they're hands-free. Then say in a few words what you opened. Never open a page they didn't ask for.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        reference: { type: "string", description: "A Bible reference to open in The Word, e.g. 'John 3:16' or 'Psalm 23'" },
        href: { type: "string", description: "An app path from a tool's link, e.g. /people/p_123 or /calendar" },
      },
    },
  },
  schema: z.object({ reference: z.string().max(80).optional(), href: z.string().max(300).optional() }),
  phrase: undefined,
  async run(input: { reference?: string; href?: string }, ctx: ToolContext): Promise<ToolResult> {
    let link: ActionLink | null = null;
    if (input.reference?.trim()) {
      try {
        const p = parsePassage(input.reference);
        link = wordLink(p.book, p.chapter, p.verse);
      } catch (err) {
        return fail(err instanceof RefError ? err.message : `I couldn't read "${input.reference}" as a Bible reference.`);
      }
    } else if (input.href?.trim()) {
      const path = appPath(input.href);
      if (!path) return fail("That isn't a page in the app. Use a link a tool returned, or a page like /calendar.");
      link = { label: "Open", href: path };
    } else {
      return fail("Say which page: a Bible reference, or a link from a tool.");
    }
    const access = await accessFor(ctx.leader);
    if (!levelMayUse(access, link.href.split("?")[0]!)) return fail("That page isn't part of their access, so it can't be opened for them.");
    return ok({ opened: link.href, say: "Say in a few words what you opened; the conversation carries on." }, { navigate: link.href, links: [link] });
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const NAV_TOOLS: ToolSpec<any>[] = [openPage as ToolSpec<any>];
