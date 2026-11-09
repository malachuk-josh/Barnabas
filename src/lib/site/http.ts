import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CareError } from "../care/service";
import { PublicFormError } from "./public";
import { SiteError } from "./service";

/** A friendly line for the first problem zod found. */
export function zodMessage(err: ZodError) {
  const first = err.issues[0];
  return first ? first.message : "Check the form.";
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.json().catch(() => ({}));
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Website errors become plain 400s (or their own status); anything unexpected is a kind 500. */
export async function respondSite(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
  } catch (err) {
    if (err instanceof PublicFormError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SiteError || err instanceof CareError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] website request failed", err);
    return NextResponse.json({ error: "That didn't work on our side. Please try again." }, { status: 500 });
  }
}
