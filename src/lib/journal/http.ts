import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "../finance/http";
import { JournalError } from "./service";

/** Journal errors become plain 4xx responses with a kind message; anything unexpected is a 500. */
export async function respondJournal(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (err) {
    if (err instanceof JournalError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] journal request failed", err);
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}
