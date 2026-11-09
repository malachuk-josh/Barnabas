import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { can } from "@/lib/auth/roles";
import { zodMessage, rawBody } from "@/lib/finance/http";
import {
  addExampleChurch, answerRequest, createInvite, disconnect, networkState, NetworkError, previewShare, redeemInvite, searchNetwork, share, shareStarters, ShareInput, unshare,
} from "@/lib/network/service";
import { ITEM_KINDS } from "@/lib/network/types";
import { accessFor } from "@/lib/team";

export const runtime = "nodejs";

async function respond(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (err) {
    if (err instanceof NetworkError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
    console.error("[barnabas] network request failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "That didn't work on our side. Try again." }, { status: 500 });
  }
}

/** The network as this church sees it: its connections, what it shares, and (with ?q=) a search. */
export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const url = new URL(request.url);
  return respond(async () => {
    if (url.searchParams.has("q")) {
      const kind = z.enum(ITEM_KINDS).optional().catch(undefined).parse(url.searchParams.get("kind") ?? undefined);
      return searchNetwork(leader, url.searchParams.get("q")!.slice(0, 200), kind);
    }
    const access = await accessFor(leader);
    return { ...(await networkState(leader)), canShare: can(access, "network.share"), admin: access.admin, starters: can(access, "network.share") ? await shareStarters(leader) : null };
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite") }),
  z.object({ action: z.literal("redeem"), code: z.string().trim().min(6).max(40) }),
  z.object({ action: z.literal("answer"), peer: z.string().min(1).max(80), approve: z.boolean() }),
  z.object({ action: z.literal("disconnect"), peer: z.string().min(1).max(80) }),
  z.object({ action: z.literal("example") }),
  z.object({ action: z.literal("preview"), item: ShareInput }),
  z.object({ action: z.literal("share"), item: ShareInput }),
  z.object({ action: z.literal("unshare"), id: z.string().min(1).max(60) }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respond(async () => {
    const input = Action.parse(await rawBody(request));
    const access = await accessFor(leader);
    switch (input.action) {
      case "invite":
        return createInvite(leader, access);
      case "redeem":
        return redeemInvite(leader, access, input.code);
      case "answer":
        return answerRequest(leader, access, input.peer, input.approve);
      case "disconnect":
        return disconnect(leader, access, input.peer);
      case "example":
        return addExampleChurch(leader, access);
      case "preview":
        if (!can(access, "network.share")) throw new NetworkError("Sharing with other churches is for pastors and staff.");
        return previewShare(leader, input.item);
      case "share":
        return share(leader, access, input.item);
      case "unshare":
        return unshare(leader, access, input.id);
    }
  });
}
