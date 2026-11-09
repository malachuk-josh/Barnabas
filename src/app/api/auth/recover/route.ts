import { NextResponse } from "next/server";
import { clientAddress } from "@/lib/care/welcome";
import { RECOVERY_MESSAGES, RecoverBody, recoverOwner, recoveryCode } from "@/lib/auth/recovery";

export const runtime = "nodejs";

/** Public: owner recovery with BARNABAS_RECOVERY_CODE. See src/lib/auth/recovery.ts. */
export async function POST(request: Request) {
  if (!recoveryCode()) return NextResponse.json({ error: RECOVERY_MESSAGES.off }, { status: 404 });
  const parsed = RecoverBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: RECOVERY_MESSAGES.failed }, { status: 400 });
  const result = await recoverOwner(parsed.data, clientAddress(request));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
