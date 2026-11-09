import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse } from "@/lib/auth/require";
import { ROLES } from "@/lib/auth/roles";
import { adminOverview, createUser } from "@/lib/auth/admin";
import { adminFailure, requireOwner } from "@/lib/auth/adminHttp";

export const runtime = "nodejs";

/** Everyone with a leader record, the join setting and recent admin activity. Owners only. */
export async function GET() {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;
  return NextResponse.json({ ...(await adminOverview(owner.churchId)), me: owner.leaderId });
}

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  access: z.enum(ROLES),
  admin: z.boolean().optional().default(false),
});

/** Create a user (status invited) and return their one-time invite link. */
export async function POST(request: Request) {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;
  const parsed = Create.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name, a valid email and a role." }, { status: 400 });
  try {
    const created = await createUser(owner, parsed.data, new URL(request.url).origin);
    return NextResponse.json({ ...created, ...(await adminOverview(owner.churchId)) });
  } catch (err) {
    return adminFailure(err);
  }
}
