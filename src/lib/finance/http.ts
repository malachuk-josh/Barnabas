import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { FinanceError } from "./service";

/** Turns finance errors into plain 400 responses; anything unexpected is a 500 with a kind message. */
export async function respond(fn: () => Promise<unknown>) {
  try {
    const body = await fn();
    return body instanceof NextResponse ? body : NextResponse.json(body);
  } catch (err) {
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] finance request failed", err);
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}

export function zodMessage(err: ZodError) {
  const first = err.issues[0];
  return first ? `Check ${first.path.join(".") || "the form"}: ${first.message}` : "Check the form.";
}

export async function body<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  const raw = await request.json().catch(() => ({}));
  return schema.parse(raw);
}

export async function rawBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.json().catch(() => ({}));
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export const isoParam = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback);
