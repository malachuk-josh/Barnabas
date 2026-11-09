import { z } from "zod";
import { searchNetwork } from "../network/service";
import { ITEM_KINDS, KIND_LABELS } from "../network/types";
import { draftMonthlyReport, ReportError } from "../reports/monthly";
import { SECTION_IDS, sectionFor } from "../reports/service";
import { accessFor } from "../team";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * Barnabas's reports and network tools. Reports return aggregates only, built with the same role checks
 * as the Reports page; the monthly report is drafted into the leader's Drafts queue, never sent; network
 * search sees only this church's and connected churches' shared resources.
 */

const ok = (content: unknown): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;

const howAreWeDoing = tool({
  phrase: "Let me look at the numbers.",
  def: {
    name: "how_are_we_doing",
    description:
      "Totals for 'how are we doing on X' questions: attendance, giving vs budget, co-laborer health (the weariness watch over time, serving load per team), the shepherding pipeline, guest follow-up, events, kids check-in, or all. Aggregates only (no names); areas the leader's role doesn't include say so.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { area: { type: "string", enum: [...SECTION_IDS, "all"] } }, required: ["area"] },
  },
  schema: z.object({ area: z.enum(["attendance", "giving", "volunteers", "care", "guests", "events", "kids", "all"]) }),
  async run({ area }, ctx: ToolContext) {
    const access = await accessFor(ctx.leader);
    const ids = area === "all" ? SECTION_IDS : SECTION_IDS.filter((s) => s === area);
    const sections = await Promise.all(ids.map((id) => sectionFor(id, ctx.leader, access)));
    return ok({
      sections: sections.map((s) =>
        !s.allowed
          ? { area: s.title, not_available: `${s.locked} Say so kindly.` }
          : s.empty
            ? { area: s.title, no_data_yet: s.empty.title, first_step: s.empty.text }
            : { area: s.title, summary: s.summary, numbers: Object.fromEntries(s.stats.map((x) => [x.label, x.value])), source: s.source },
      ),
      note: "Lead with what's going well, give one or two numbers the way people say them, then one gentle next step. The Reports page has charts and CSV downloads.",
    });
  },
});

const draftMonthlyReportTool = tool({
  phrase: "Writing up the month.",
  def: {
    name: "draft_monthly_report",
    description:
      "Draft this month's ministry report into the leader's Drafts queue as an email to themselves (nothing is sent). Call how_are_we_doing with area 'all' first, then pass a warm narrative of a few short paragraphs in your own words from those totals: no names, no individual giving, no care or children's details. The exact numbers are appended by the app.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { narrative: { type: "string", description: "The report's narrative, plain text" } } },
  },
  schema: z.object({ narrative: z.string().max(6000).optional() }),
  async run({ narrative }, ctx) {
    try {
      const draft = await draftMonthlyReport(ctx.leader, { narrative, conversationId: ctx.meta.offRecord ? undefined : ctx.meta.id });
      return ok({ draft_id: draft.id, status: "In the leader's Drafts, addressed to them, with the numbers added underneath. Nothing was sent. Tell them in one sentence." });
    } catch (err) {
      if (err instanceof ReportError) return fail(err.message);
      throw err;
    }
  },
});

const searchNetworkTool = tool({
  phrase: "Let me look through the network.",
  def: {
    name: "search_network",
    description:
      "Search Mesa, the network of connected churches, for shared resources: sermon series outlines, service templates, co-laborer training, event ideas, prayer needs and mission partner needs (e.g. 'a series on James'). Only this church's and connected churches' items; nothing about people.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { query: { type: "string" }, kind: { type: "string", enum: [...ITEM_KINDS] } }, required: ["query"] },
  },
  schema: z.object({ query: z.string().min(1).max(200), kind: z.enum(ITEM_KINDS).optional() }),
  async run({ query, kind }, ctx) {
    const r = await searchNetwork(ctx.leader, query, kind);
    if (!r.peers && !r.results.length) return ok("This church isn't connected to any other churches on Mesa yet. Say so, and that an administrator can connect from the Mesa page with an invite code.");
    if (!r.results.length) return ok(`Nothing in the network matches "${query}". Say so; don't suggest a church that isn't listed.`);
    return ok({
      results: r.results.slice(0, 6).map((i) => ({ church: i.mine ? "your church" : i.churchName, kind: KIND_LABELS[i.kind], title: i.title, scripture: i.scripture, preview: i.body.slice(0, 280) })),
      note: "Name the church and the resource; the leader can read it in full on the Mesa page. Example church (demo) is fictional; say so if it comes up.",
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GROWTH_TOOLS: ToolSpec<any>[] = [howAreWeDoing, draftMonthlyReportTool, searchNetworkTool];
