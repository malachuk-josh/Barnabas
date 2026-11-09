import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { today } from "@/lib/dates";
import { body, rawBody, respond } from "@/lib/finance/http";
import { BudgetInput, copyBudgetYear, saveBudget } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";
import { budgetView } from "@/lib/finance/views";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const leader = await requirePermission("finance.view");
  if (isResponse(leader)) return leader;
  const year = Number(new URL(request.url).searchParams.get("year")) || Number(today().slice(0, 4));
  return respond(async () => ({ budget: budgetView(await loadBooks(leader.churchId), year, today()) }));
}

export async function PUT(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => ({ budget: await saveBudget(leader, await body(request, BudgetInput)) }));
}

const Copy = z.object({ action: z.literal("copy"), from: z.number().int(), to: z.number().int() });

export async function POST(request: Request) {
  const leader = await requirePermission("finance.edit");
  if (isResponse(leader)) return leader;
  return respond(async () => {
    const input = Copy.parse(await rawBody(request));
    return { budget: await copyBudgetYear(leader, input.from, input.to) };
  });
}
