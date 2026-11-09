import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "../finance/http";
import { InboxError } from "./service";

/** Inbox errors keep their status (403, 404); a bad form is a 400; anything unexpected is a kind 500. */
export async function respondInbox(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (err) {
    if (err instanceof InboxError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] messages request failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}
