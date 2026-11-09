import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { can } from "@/lib/auth/roles";
import { churchData } from "@/lib/chms";
import { respondData } from "@/lib/chms/http";
import { clearImported, commitPeople, PEOPLE_FIELDS, previewPeople } from "@/lib/chms/import";
import { rawBody } from "@/lib/finance/http";
import { GIVING_FIELDS, readGiving } from "@/lib/finance/giving-import";
import { importGifts } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";
import { accessFor } from "@/lib/team";

export const runtime = "nodejs";

const Csv = z.string().min(1).max(5_000_000);
const Step = z.enum(["preview", "dryrun", "commit"]);
const Input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("people"), action: Step, csv: Csv, mapping: z.record(z.enum(PEOPLE_FIELDS), z.number().int().min(-1).max(200)).optional() }),
  z.object({ kind: z.literal("giving"), action: Step, csv: Csv, mapping: z.record(z.enum(GIVING_FIELDS), z.number().int().min(-1).max(200)).optional(), bankAccountId: z.string().max(40).optional() }),
  z.object({ kind: z.literal("people-clear"), confirm: z.literal("CLEAR") }),
]);

/**
 * CSV import from ChurchTrac (or any spreadsheet): preview (with the column mapping and what each row will
 * do), a dry run (counts only), then commit. People need an admin; giving needs finance.edit and giving.donors.
 */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const access = await accessFor(leader);
  return respondData(async () => {
    const input = Input.parse(await rawBody(request));
    if (input.kind === "people" || input.kind === "people-clear") {
      if (!can(access, "team.manage")) return NextResponse.json({ error: "Only an administrator can import the church's people." }, { status: 403 });
      if (input.kind === "people-clear") return clearImported(leader);
      if (input.action === "preview") return previewPeople(leader.churchId, input.csv, input.mapping);
      return commitPeople(leader, input.csv, input.mapping, input.action === "dryrun");
    }
    if (!can(access, "finance.edit") || !can(access, "giving.donors")) return NextResponse.json({ error: "Only the pastor or treasurer can import giving." }, { status: 403 });
    const [books, people] = await Promise.all([loadBooks(leader.churchId), churchData().listPeople()]);
    const read = readGiving(input.csv, books, people, input.mapping);
    if (input.action === "preview") return { header: read.header, columns: read.columns, counts: read.counts, rows: read.rows.slice(0, 200) };
    const result = await importGifts(leader, read.gifts, { dryRun: input.action === "dryrun", bankAccountId: input.bankAccountId });
    return { ...result, counts: read.counts };
  });
}
