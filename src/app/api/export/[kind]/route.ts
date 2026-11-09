import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { buildExport, csvResponse, EXPORT_KINDS, ExportError, type ExportKind } from "@/lib/exports";
import { accessFor } from "@/lib/team";

export const runtime = "nodejs";

type Params = { params: Promise<{ kind: string }> };

/** A CSV download (people, rosters, registrations, giving summaries), checked against the leader's role. */
export async function GET(_request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { kind } = await params;
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  try {
    const out = await buildExport(leader, await accessFor(leader), kind as ExportKind);
    return csvResponse(out.filename, out.csv);
  } catch (err) {
    if (err instanceof ExportError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("[barnabas] export failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "That export didn't work. Try again." }, { status: 500 });
  }
}
