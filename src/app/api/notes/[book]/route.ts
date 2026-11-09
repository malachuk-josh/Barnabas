import { NextResponse } from "next/server";
import { getUserId } from "@/lib/wordAuth";
import { NOTE_MAX, getBook } from "@/lib/bible";
import { db, keys } from "@/lib/wordDb";

// Personal study notes, keyed per user per book: { "chapter:verse": text }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ book: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bookNr = Number((await params).book);
  if (!getBook(bookNr)) {
    return NextResponse.json({ error: "Invalid book" }, { status: 400 });
  }
  const notes = (await db().hgetall(keys.userNotes(userId, bookNr))) ?? {};
  return NextResponse.json({ notes });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ book: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bookNr = Number((await params).book);
  const book = getBook(bookNr);
  const body = (await req.json().catch(() => null)) as {
    ref?: string;
    text?: string;
  } | null;
  const ref = body?.ref ?? "";
  if (!book || !/^\d{1,3}:\d{1,3}$/.test(ref)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }
  const chapter = Number(ref.split(":")[0]);
  if (chapter < 1 || chapter > book.chapters) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }
  const text = (body?.text ?? "").trim().slice(0, NOTE_MAX);
  const key = keys.userNotes(userId, bookNr);
  if (text) {
    await db().hset(key, { [ref]: text });
  } else {
    await db().hdel(key, ref);
  }
  return NextResponse.json({ ok: true });
}
