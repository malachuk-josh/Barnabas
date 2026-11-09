import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody, respondCare } from "@/lib/care/http";
import { assignCase, closeCase, ContactInput, logContact, OpenCaseInput, openCase, reopenCase, updateCase, UpdateCaseInput } from "@/lib/care/service";
import { CASE_TYPES } from "@/lib/care/types";
import { caseDetail, caseRows, careFor } from "@/lib/care/views";

export const runtime = "nodejs";

/** Cases this leader may see (filters: scope=mine|all, type, overdue=1, closed=1), or one case with ?id=. */
export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const q = new URL(request.url).searchParams;
    const { actor, book } = await careFor(leader);
    const id = q.get("id");
    if (id) {
      const c = caseDetail(book, actor, id);
      return c ? { case: c } : NextResponse.json({ error: "That case isn't one you can see." }, { status: 404 });
    }
    const type = q.get("type");
    return {
      cases: caseRows(book, actor, {
        scope: q.get("scope") === "all" ? "all" : "mine",
        type: (CASE_TYPES as readonly string[]).includes(type ?? "") ? (type as (typeof CASE_TYPES)[number]) : undefined,
        overdue: q.get("overdue") === "1",
        includeClosed: q.get("closed") === "1",
      }),
    };
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), case: OpenCaseInput }),
  z.object({ action: z.literal("contact"), id: Id, contact: ContactInput }),
  z.object({ action: z.literal("update"), id: Id, patch: UpdateCaseInput }),
  z.object({ action: z.literal("assign"), id: Id, assigneeId: z.string().max(80).nullable() }),
  z.object({ action: z.literal("close"), id: Id, note: z.string().max(400).optional() }),
  z.object({ action: z.literal("reopen"), id: Id }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const input = Action.parse(await rawBody(request));
    const { actor } = await careFor(leader);
    switch (input.action) {
      case "open":
        return { case: await openCase(actor, input.case) };
      case "contact":
        return { case: await logContact(actor, input.id, input.contact) };
      case "update":
        return { case: await updateCase(actor, input.id, input.patch) };
      case "assign":
        return { case: await assignCase(actor, input.id, input.assigneeId) };
      case "close":
        return { case: await closeCase(actor, input.id, input.note) };
      case "reopen":
        return { case: await reopenCase(actor, input.id) };
    }
  });
}
