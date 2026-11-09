import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { today } from "@/lib/dates";
import { isoParam, rawBody, respond } from "@/lib/finance/http";
import { GiftBatchInput, RecurringInput, addRecurring, deleteGift, recordDueRecurring, recordGifts, setRecurringActive } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";
import { givingSummary } from "@/lib/finance/views";

export const runtime = "nodejs";

/** Giving totals and trends for everyone with finance access; donor names and gifts only for pastors and treasurers. */
export async function GET(request: Request) {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  const params = new URL(request.url).searchParams;
  const to = isoParam(params.get("to"), today());
  const from = isoParam(params.get("from"), `${to.slice(0, 4)}-01-01`);
  return respond(async () => ({ giving: givingSummary(await loadBooks(leader.churchId), leader.access, from, to) }));
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record"), ...GiftBatchInput.shape }),
  z.object({ action: z.literal("delete-gift"), id: z.string().min(1).max(60) }),
  z.object({ action: z.literal("add-recurring"), recurring: RecurringInput }),
  z.object({ action: z.literal("set-recurring"), id: z.string().min(1).max(60), active: z.boolean() }),
  z.object({ action: z.literal("record-due") }),
]);

export async function POST(request: Request) {
  // Entering gifts means handling donor names, so it needs both edit rights and donor access.
  const leader = await requirePermission("giving.donors");
  if (isResponse(leader)) return leader;
  const editor = await requirePermission("finance.edit");
  if (isResponse(editor)) return editor;
  return respond(async () => {
    const input = Action.parse(await rawBody(request));
    switch (input.action) {
      case "record": {
        const r = await recordGifts(leader, input);
        return { recorded: r.gifts.length, total: r.total, depositId: r.txn.id };
      }
      case "delete-gift":
        await deleteGift(leader, input.id);
        return { ok: true };
      case "add-recurring":
        return { recurring: await addRecurring(leader, input.recurring) };
      case "set-recurring":
        return { recurring: await setRecurringActive(leader, input.id, input.active) };
      case "record-due":
        return await recordDueRecurring(leader, today());
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  });
}
