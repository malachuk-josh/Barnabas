import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "../finance/http";
import { EventsError } from "../events/service";
import { KidsError } from "../kids/service";
import { ServeError } from "../serve/service";
import { ServicesError } from "../services/service";

export { body, rawBody } from "../finance/http";

export function isOpsError(err: unknown): err is Error {
  return err instanceof ServeError || err instanceof ServicesError || err instanceof EventsError || err instanceof KidsError;
}

/** Operations errors (scheduling, services, events, kids) become plain 400s; anything unexpected is a kind 500. */
export async function respondOps(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (err) {
    if (isOpsError(err)) return NextResponse.json({ error: err.message }, { status: err instanceof KidsError && /limited to|Only kids/.test(err.message) ? 403 : 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] operations request failed", err);
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}
