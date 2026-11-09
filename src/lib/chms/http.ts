import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { FinanceError } from "../finance/service";
import { zodMessage } from "../finance/http";
import { ImportError } from "./import";
import { SyncError } from "./sync";

/** Church-data errors (sync, import, export) become plain 400s; anything unexpected is a kind 500 with no detail. */
export async function respondData(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (err) {
    if (err instanceof ImportError || err instanceof SyncError || err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] church data request failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}
