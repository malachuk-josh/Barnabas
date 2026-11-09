import { NextResponse } from "next/server";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { audit } from "@/lib/data/records";
import { newId } from "@/lib/data/ids";
import { blobConfigured, checkUpload, UPLOAD_TYPES } from "@/lib/site/upload";

export const runtime = "nodejs";

/** Uploads a website image to Vercel Blob (site.edit). Returns its public https address. */
export async function POST(request: Request) {
  const leader = await requirePermission("site.edit");
  if (isResponse(leader)) return leader;
  if (!blobConfigured()) return NextResponse.json({ error: "Image upload isn't set up. Add a Vercel Blob store (BLOB_READ_WRITE_TOKEN), or paste an image address." }, { status: 400 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = checkUpload(file, bytes);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const { put } = await import("@vercel/blob");
  const ext = UPLOAD_TYPES[file.type as keyof typeof UPLOAD_TYPES];
  const blob = await put(`site/${leader.churchId}/${newId("img")}.${ext}`, Buffer.from(bytes), { access: "public", contentType: file.type, addRandomSuffix: true });
  await audit(leader, { action: "site.image.upload", detail: blob.pathname });
  return NextResponse.json({ url: blob.url });
}
