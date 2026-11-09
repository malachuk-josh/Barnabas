import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { zodMessage } from "../finance/http";
import { CareError } from "./service";

export { body, rawBody } from "../finance/http";

/** Care errors become plain 400s; anything unexpected is a 500 with a kind message. */
export async function respondCare(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof NextResponse ? out : NextResponse.json(out);
  } catch (err) {
    if (err instanceof CareError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] care request failed", err);
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}
