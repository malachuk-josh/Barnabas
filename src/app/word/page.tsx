import type { Metadata } from "next";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import WordApp from "@/components/WordApp";
import { getBook } from "@/lib/bible";
import "./word.css";
import "./word-shell.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "The Word · Barnabas" };

/**
 * The Word: Communion's study Bible. Takes the same deep link Communion's
 * root route did: ?b=<book number 1–66>&c=<chapter>&v=<verse>&from=talk.
 */
export default async function WordPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; c?: string; v?: string; from?: string }>;
}) {
  const { profile } = await requirePageLeader();
  const { b, c, v, from } = await searchParams;
  const book = getBook(Number(b));
  const chapter = Number(c);
  const verse = Number(v);
  const valid = book && Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters;
  return (
    <AppShell profile={profile} fill>
      <WordApp
        initialBook={valid ? book.nr : undefined}
        initialChapter={valid ? chapter : undefined}
        initialVerse={valid && Number.isInteger(verse) && verse >= 1 ? verse : undefined}
        // where the reader was sent from, so the way back is offered. An
        // allowlist and not the raw value: this ends up in an href.
        initialFrom={from === "talk" ? "talk" : undefined}
      />
    </AppShell>
  );
}
