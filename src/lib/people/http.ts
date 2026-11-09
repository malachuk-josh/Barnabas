import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "../finance/http";
import { MigrateError } from "../migrate/run";
import { PeopleError } from "./service";

/** People and migration errors become plain 400s; anything unexpected is a kind 500 with no detail. */
export async function respondPeople(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
  } catch (err) {
    if (err instanceof PeopleError || err instanceof MigrateError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] people request failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}
