import { NextResponse } from "next/server";
import { DEFAULT_TRANSLATION, isLicensed, isTranslation, parseBooksParam } from "@/lib/bible";
import { normalizeText, searchText } from "@/lib/bibleText";
import { getUserId } from "@/lib/wordAuth";

// Whole translations are read from the static files this app ships
// (public/bible/<id>/<book>.json, through lib/bibleText) rather than fetched
// from an upstream API, so search keeps working when that API doesn't.

const MAX_RESULTS = 50;

export async function GET(req: Request) {
  // Barnabas: The Word is for signed-in leaders only
  if (!(await getUserId(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const translation = searchParams.get("t") ?? "";
  const query = (searchParams.get("q") ?? "").trim();
  // the books to look in (lib/bible's booksParam), or all of them
  const only = parseBooksParam(searchParams.get("b"));

  if (!isTranslation(translation) || normalizeText(query).length < 3) {
    return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  }

  // A borrowed translation ships no files to scan, and fetching all sixty-six
  // books from its publisher to search them is both a quota and a breach. The
  // King James answers instead — a search is for finding the place, and the
  // reader shows the place in whatever is open — and the reply says so.
  const from = isLicensed(translation) ? DEFAULT_TRANSLATION : translation;

  try {
    const { results, total } = await searchText(from, query, { max: MAX_RESULTS, only });
    return NextResponse.json({ results, total, searchedIn: from });
  } catch {
    return NextResponse.json(
      { error: "Scripture source unavailable" },
      { status: 502 }
    );
  }
}
