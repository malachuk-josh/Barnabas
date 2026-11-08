import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { getConversation, getMessages } from "@/lib/data/conversations";
import { forgetConversation } from "@/lib/engine/memory-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  const meta = await getConversation(leader, id);
  if (!meta) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const messages = await getMessages(leader, id);
  const turns: { role: "leader" | "barnabas"; text: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const blocks = typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content ?? [];
    const text = blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    if (!text) continue;
    const role = m.role === "user" ? "leader" : "barnabas";
    const last = turns[turns.length - 1];
    if (last && last.role === role && role === "barnabas") last.text = `${last.text} ${text}`;
    else turns.push({ role, text });
  }
  return NextResponse.json({ id, title: meta.title, offRecord: meta.offRecord, turns });
}

/** Delete a conversation and have Barnabas remove what it learned from it. */
export async function DELETE(_request: Request, { params }: Params) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const { id } = await params;
  const result = await forgetConversation(leader, id);
  if (!result.removed) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json(result);
}
