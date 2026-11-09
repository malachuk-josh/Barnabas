import { NextResponse } from "next/server";
import { clientAddress } from "@/lib/care/welcome";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { SignInBody, attemptSignIn } from "@/lib/auth/signin";

export const runtime = "nodejs";

/**
 * Sign in with email, password and the church access code. Answers with a session cookie, or a next step
 * ("create-password" or "create-account") once the email and access code are right, or one generic error.
 */
export async function POST(request: Request) {
  const parsed = SignInBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email, your password and the church access code." }, { status: 400 });
  }
  const result = await attemptSignIn(parsed.data, clientAddress(request));
  if (result.kind === "error") return NextResponse.json({ error: result.error, field: result.field }, { status: result.status });
  if (result.kind === "step") return NextResponse.json({ step: result.step, reason: "reason" in result ? result.reason : undefined });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions);
  return response;
}
