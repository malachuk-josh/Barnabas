import { NextResponse } from "next/server";
import { STUDY_IDS, getBook, isLicensed, isTranslation } from "@/lib/bible";
import { fetchLicensed, licensedKey, reportFums } from "@/lib/licensed";
import { getUserId } from "@/lib/wordAuth";

const GETBIBLE_BASE = "https://api.getbible.net/v2";

interface GetBibleVerse {
  verse: number;
  text: string;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ translation: string; book: string; chapter: string }> }
) {
  // Barnabas: The Word is for signed-in leaders only
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { translation, book, chapter } = await params;
  const bookNr = Number(book);
  const chapterNr = Number(chapter);
  const bookMeta = getBook(bookNr);

  if (
    (!isTranslation(translation) && !STUDY_IDS.includes(translation)) ||
    !bookMeta ||
    !Number.isInteger(chapterNr) ||
    chapterNr < 1 ||
    chapterNr > bookMeta.chapters
  ) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  // A translation still in copyright, fetched from its publisher with a key
  // that stays here. Cached at the edge for an hour and no longer: it keeps
  // this app inside a free tier measured in thousands of calls, without ever
  // amounting to a copy of a book sitting somewhere it should not.
  if (isLicensed(translation)) {
    const key = licensedKey(translation);
    if (!key) {
      return NextResponse.json({ error: "Not configured" }, { status: 501 });
    }
    try {
      const passage = await fetchLicensed(translation, key, bookNr, chapterNr);
      if (passage.fumsId) void reportFums(passage.fumsId);
      return NextResponse.json(
        {
          translation,
          bookNr,
          chapter: chapterNr,
          verses: passage.verses,
        },
        {
          headers: {
            "cache-control":
              "public, s-maxage=3600, stale-while-revalidate=600",
          },
        }
      );
    } catch {
      return NextResponse.json(
        { error: "Scripture source unavailable" },
        { status: 502 }
      );
    }
  }

  try {
    const upstream = await fetch(
      `${GETBIBLE_BASE}/${translation}/${bookNr}/${chapterNr}.json`,
      { next: { revalidate: 60 * 60 * 24 * 30 } } // scripture doesn't change
    );
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const data = (await upstream.json()) as { verses: GetBibleVerse[] };

    return NextResponse.json(
      {
        translation,
        bookNr,
        chapter: chapterNr,
        verses: data.verses.map((v) => ({ verse: v.verse, text: v.text.trim() })),
      },
      {
        headers: {
          "cache-control": "public, s-maxage=2592000, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Scripture source unavailable" },
      { status: 502 }
    );
  }
}
