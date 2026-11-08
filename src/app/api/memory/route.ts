import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { config } from "@/lib/config";
import { audit } from "@/lib/data/records";
import { MemoryFS } from "@/lib/memory/fs";
import { MemoryPathError, normalizeMemoryPath } from "@/lib/memory/paths";
import { checkMemoryText } from "@/lib/policy/privacy";

export const runtime = "nodejs";

function memory(leaderId: string, churchId: string) {
  return new MemoryFS({ churchId, leaderId }, (text) => checkMemoryText(text, { allowSensitive: config.allowSensitiveMemory }));
}

/** Everything Barnabas remembers about the signed-in leader. Only that leader can see it. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const fs = memory(leader.leaderId, leader.churchId);
  const files = await Promise.all((await fs.paths()).map(async (path) => ({ path, content: (await fs.read(path)) ?? "" })));
  return NextResponse.json({ files });
}

const Put = z.object({ path: z.string(), content: z.string().max(20000) });

export async function PUT(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = Put.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid memory file." }, { status: 400 });
  const result = await memory(leader.leaderId, leader.churchId).run({ command: "create", path: parsed.data.path, file_text: parsed.data.content });
  if (result.isError) return NextResponse.json({ error: result.text.replace(/^Error: /, "") }, { status: 400 });
  await audit(leader, { action: "memory.edit_by_leader", detail: parsed.data.path });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const raw = new URL(request.url).searchParams.get("path");
  try {
    const path = normalizeMemoryPath(raw);
    const result = await memory(leader.leaderId, leader.churchId).run({ command: "delete", path });
    if (result.isError) return NextResponse.json({ error: result.text.replace(/^Error: /, "") }, { status: 400 });
    await audit(leader, { action: "memory.delete_by_leader", detail: path });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof MemoryPathError ? err.message : "Couldn't delete that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
