import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { toCsv } from "@/lib/csv/columns";
import { audit } from "@/lib/data/records";
import { csvResponse } from "@/lib/exports";
import { SECTION_IDS, sectionFor } from "@/lib/reports/service";
import type { SectionId } from "@/lib/reports/types";
import { accessFor } from "@/lib/team";
import { today } from "@/lib/dates";

export const runtime = "nodejs";

/** The table behind one report chart, as CSV. Built with the same permission checks as the page. */
export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const id = new URL(request.url).searchParams.get("section") as SectionId | null;
  if (!id || !SECTION_IDS.includes(id)) return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  const section = await sectionFor(id, leader, await accessFor(leader));
  if (!section.allowed) return NextResponse.json({ error: section.locked }, { status: 403 });
  await audit(leader, { action: "export.csv", detail: `report ${id}: ${section.table.rows.length} rows` });
  return csvResponse(`barnabas-report-${id}-${today()}.csv`, toCsv(section.table.header, section.table.rows));
}
