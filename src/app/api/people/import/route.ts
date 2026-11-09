import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { can } from "@/lib/auth/roles";
import { rawBody } from "@/lib/finance/http";
import { FILE_KINDS, SYSTEMS } from "@/lib/migrate/columns";
import { runImport, undoImport } from "@/lib/migrate/run";
import { respondPeople } from "@/lib/people/http";
import { loadPeople } from "@/lib/people/store";
import { accessFor } from "@/lib/team";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The import log: every batch with its counts, skip reasons and whether it was undone. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!can(await accessFor(leader), "people.edit")) return NextResponse.json({ error: "Only pastors and staff move the church's records in." }, { status: 403 });
  const book = await loadPeople(leader.churchId);
  return NextResponse.json({ imports: [...book.imports].reverse().map(({ before: _b, created, ...b }) => ({ ...b, created: Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.length])) })) });
}

const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["preview", "dryrun", "commit"]),
    system: z.enum(SYSTEMS),
    file: z.enum(FILE_KINDS),
    csv: z.string().min(1).max(10_000_000),
    fileName: z.string().max(200).optional(),
    mapping: z.record(z.string().max(30), z.number().int().min(-1).max(500)).optional(),
    extraAsCustom: z.boolean().optional(),
  }),
  z.object({ action: z.literal("undo"), batchId: z.string().min(1).max(60) }),
]);

/**
 * "Move your church to Barnabas": preview (the column mapping, what each row will do, and why rows are
 * skipped), a dry run (exact counts, nothing saved), commit (one batch in the log), and undo of a batch.
 * People, groups and attendance need people.edit; giving also needs finance.edit and giving.donors.
 */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const access = await accessFor(leader);
  if (!can(access, "people.edit")) return NextResponse.json({ error: "Only pastors and staff move the church's records in." }, { status: 403 });
  return respondPeople(async () => {
    const input = Input.parse(await rawBody(request));
    if (input.action === "undo") {
      const book = await loadPeople(leader.churchId);
      const b = book.imports.find((x) => x.id === input.batchId);
      if (b?.file === "giving" && !(can(access, "finance.edit") && can(access, "giving.donors"))) return NextResponse.json({ error: "Only the pastor or treasurer can undo a giving import." }, { status: 403 });
      return undoImport(leader, input.batchId);
    }
    if (input.file === "giving" && !(can(access, "finance.edit") && can(access, "giving.donors"))) return NextResponse.json({ error: "Only the pastor or treasurer can move giving history in." }, { status: 403 });
    return runImport(leader, input, input.action === "commit");
  });
}
