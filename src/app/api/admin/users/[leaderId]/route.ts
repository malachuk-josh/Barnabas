import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse } from "@/lib/auth/require";
import { ROLES } from "@/lib/auth/roles";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { adminOverview, makeLink, removeUser, setTemporaryPassword, signOutEverywhere, unlockUser, updateUser } from "@/lib/auth/admin";
import { LEADER_ID_RE, adminFailure, requireOwner } from "@/lib/auth/adminHttp";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ leaderId: string }> };

async function targetId(ctx: Ctx) {
  const { leaderId } = await ctx.params;
  return LEADER_ID_RE.test(leaderId) ? leaderId : null;
}

const Update = z.object({ access: z.enum(ROLES).optional(), admin: z.boolean().optional() }).refine((v) => v.access !== undefined || v.admin !== undefined);

/** Change a user's access role or admin flag. */
export async function PATCH(request: Request, ctx: Ctx) {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;
  const id = await targetId(ctx);
  const parsed = Update.safeParse(await request.json().catch(() => ({})));
  if (!id || !parsed.success) return NextResponse.json({ error: "Pick a role or the admin setting." }, { status: 400 });
  try {
    await updateUser(owner, id, parsed.data);
    return NextResponse.json(await adminOverview(owner.churchId));
  } catch (err) {
    return adminFailure(err);
  }
}

const Action = z.object({ action: z.enum(["invite-link", "reset-link", "temporary-password", "unlock", "sign-out-everywhere"]) });

/** One-time links, a temporary password, unlock and sign out everywhere. */
export async function POST(request: Request, ctx: Ctx) {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;
  const id = await targetId(ctx);
  const parsed = Action.safeParse(await request.json().catch(() => ({})));
  if (!id || !parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const origin = new URL(request.url).origin;
  try {
    switch (parsed.data.action) {
      case "invite-link":
      case "reset-link": {
        const link = await makeLink(owner, id, parsed.data.action === "invite-link" ? "invite" : "reset", origin);
        return NextResponse.json({ ...link, ...(await adminOverview(owner.churchId)) });
      }
      case "temporary-password": {
        const temp = await setTemporaryPassword(owner, id);
        const response = NextResponse.json({ ...temp, ...(await adminOverview(owner.churchId)) }, { headers: { "Cache-Control": "no-store" } });
        return response;
      }
      case "unlock":
        await unlockUser(owner, id);
        return NextResponse.json(await adminOverview(owner.churchId));
      case "sign-out-everywhere": {
        const sv = await signOutEverywhere(owner, id);
        const response = NextResponse.json(await adminOverview(owner.churchId));
        // The owner signing themselves out everywhere keeps this session.
        if (id === owner.leaderId) response.cookies.set(SESSION_COOKIE, await signSession({ ...owner, sv }), sessionCookieOptions);
        return response;
      }
    }
  } catch (err) {
    return adminFailure(err);
  }
}

const Remove = z.object({ confirm: z.literal(true), deleteData: z.boolean().optional().default(false) });

/** Remove a user: access ends at once. Optionally delete all their Barnabas data. */
export async function DELETE(request: Request, ctx: Ctx) {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;
  const id = await targetId(ctx);
  const parsed = Remove.safeParse(await request.json().catch(() => ({})));
  if (!id || !parsed.success) return NextResponse.json({ error: "Confirm the removal." }, { status: 400 });
  try {
    await removeUser(owner, id, parsed.data.deleteData);
    return NextResponse.json(await adminOverview(owner.churchId));
  } catch (err) {
    return adminFailure(err);
  }
}
