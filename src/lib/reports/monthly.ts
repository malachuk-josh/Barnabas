import type { Leader } from "../auth/session";
import { config } from "../config";
import { audit, saveDraft, type Draft } from "../data/records";
import { newId } from "../data/ids";
import { today } from "../dates";
import { monthLabel } from "../finance/giving";
import { checkMemoryText } from "../policy/privacy";
import { buildReports, monthlyNarrative } from "./service";
import type { Section } from "./types";

export class ReportError extends Error {}

/** The numbers block appended to every monthly report, written by code so the figures are exact. */
export function numbersBlock(sections: Section[]) {
  const out: string[] = ["The numbers"];
  for (const s of sections) {
    if (!s.allowed || s.empty || !s.stats.length) continue;
    out.push(`${s.title}: ${s.stats.map((x) => `${x.label} ${x.value}`).join("; ")}`);
  }
  return out.length > 1 ? out.join("\n") : "";
}

/**
 * "Monthly ministry report": a narrative of the month from the report numbers, as an email draft to the
 * leader themselves in the Drafts queue (they forward it, or send it to themselves with Send). Barnabas may
 * pass its own narrative; it's checked like any note (no sensitive details), and the numbers are added by code.
 */
export async function draftMonthlyReport(leader: Leader, opts: { narrative?: string; conversationId?: string; asOf?: string } = {}) {
  const asOf = opts.asOf ?? today();
  const { sections } = await buildReports(leader, { asOf });
  const month = monthLabel(asOf.slice(0, 7), "long");
  const church = config.churchName.replace(/\s*\(demo\)\s*$/i, "");
  if (opts.narrative) {
    const problem = checkMemoryText(opts.narrative, { allowSensitive: false });
    if (problem) throw new ReportError(problem.replace(/^Not saved/, "Not drafted"));
  }
  const narrative = opts.narrative?.trim() || monthlyNarrative(sections, month, church);
  const numbers = numbersBlock(sections);
  const text = numbers ? `${narrative}\n\n${numbers}` : narrative;
  const draft: Draft = {
    id: newId("draft"),
    leaderId: leader.leaderId,
    conversationId: opts.conversationId ?? `report:${asOf.slice(0, 7)}`,
    channel: "email",
    kind: "report",
    subject: `Ministry report: ${month}`,
    baseText: text,
    recipients: [{ personId: `leader:${leader.leaderId}`, name: `${leader.name} (you)`, language: "en", text, email: leader.email }],
    status: "needs_review",
    createdAt: Date.now(),
  };
  await saveDraft(leader, draft);
  await audit(leader, { action: "draft.create", detail: `${draft.id} monthly report ${asOf.slice(0, 7)}`, conversationId: opts.conversationId });
  return draft;
}
