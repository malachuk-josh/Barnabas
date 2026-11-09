"use client";

// The book-and-chapter navigator inside the reader's fold-out panel.
// Testaments open and close; opening a book unfolds its chapters in place,
// and opening a chapter unfolds its verses under it — so finding a passage
// feels like turning to it rather than picking from three dropdowns.

import { Fragment, useEffect, useRef, useState } from "react";
import { BOOKS, DEFAULT_TRANSLATION, LAST_OT_BOOK, getBook, isLicensed } from "@/lib/bible";
import { readHistory, type Visit } from "@/lib/history";
import { useI18n } from "@/lib/i18n";
import { fetchBook } from "@/lib/scripture";

/** Chapters to a row. Must match repeat(N) on .bn-ch-row in globals.css. */
const PER_ROW = 5;

export default function BookNav({
  bookNr,
  chapter,
  translation,
  onChapter,
  onVerse,
}: {
  bookNr: number;
  chapter: number;
  /** which text to count verses from — they differ between translations */
  translation: string;
  /** move the reader to a chapter, leaving the panel open for a verse */
  onChapter: (bookNr: number, chapter: number) => void;
  /** go to one verse, and close */
  onVerse: (bookNr: number, chapter: number, verse: number) => void;
}) {
  const { lang, t } = useI18n();
  // Both testaments start folded, every time the panel opens: two rows to
  // choose between rather than a long list already scrolled. The book being
  // read is still marked open inside its testament, so unfolding it lands
  // there.
  const [openTestaments, setOpenTestaments] = useState({ ot: false, nt: false });
  const [openBook, setOpenBook] = useState<number | null>(bookNr);
  const [openChapter, setOpenChapter] = useState<number | null>(null);
  /** verse counts per chapter, by book — filled in as books are opened */
  const [counts, setCounts] = useState<Record<number, Record<number, number>>>(
    {}
  );
  /** books whose text could not be read, so the grid can say so */
  const [noCounts, setNoCounts] = useState<Record<number, boolean>>({});
  /** where the reader has been sent, read once when the navigator opens */
  const [history, setHistory] = useState<Visit[]>([]);
  const currentRef = useRef<HTMLDivElement>(null);
  const asked = useRef(new Set<string>());

  // localStorage is not readable while rendering on the server, and the list
  // cannot change underneath an open navigator — every way of adding to it
  // closes the panel first — so once, on mount, is exactly right.
  useEffect(() => {
    setHistory(readHistory());
  }, []);

  // Bring the open book a third of the way down the panel, but never scroll
  // past the top — for Genesis that would push the search field out of view.
  useEffect(() => {
    const el = currentRef.current;
    const box = el?.closest<HTMLElement>(".sp-body");
    if (!el || !box) return;
    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop = Math.max(0, box.scrollTop + delta - box.clientHeight / 3);
    // only on mount: later taps should leave the scroll where the finger put it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * How many verses each chapter of a book has. Nothing ships that as a
   * table, so it is counted from the text itself — one request for the whole
   * book, which is the same file the reader is about to want anyway, and
   * already in hand for the book being read. Offline without it, no verse
   * grid appears and the chapter tap stands on its own.
   */
  const loadCounts = (book: number) => {
    // A borrowed translation has no book to count from, and asking its
    // publisher for one is exactly what it does not permit. The King James
    // stands in: these translations follow the same versification, and where
    // one of them omits a verse the grid offers a number that lands on the
    // verse before it, which is what a printed Bible does too.
    const from = isLicensed(translation) ? DEFAULT_TRANSLATION : translation;
    const key = `${from}/${book}`;
    if (asked.current.has(key)) return;
    asked.current.add(key);
    setNoCounts((prev) => (prev[book] ? { ...prev, [book]: false } : prev));
    fetchBook(from, book)
      .then((data) => {
        const perChapter: Record<number, number> = {};
        for (const ch of data.chapters) {
          // the last verse number, not the row count: a chapter missing a
          // verse in some edition must not shorten the grid
          perChapter[ch.chapter] = ch.verses.reduce(
            (max, v) => Math.max(max, v.verse),
            0
          );
        }
        setCounts((prev) => ({ ...prev, [book]: perChapter }));
      })
      .catch(() => {
        // not downloaded and no signal. Say so rather than spin, and let it
        // be asked for again the next time the chapter is opened.
        asked.current.delete(key);
        setNoCounts((prev) => ({ ...prev, [book]: true }));
      });
  };

  const pickChapter = (book: number, c: number) => {
    const alreadyOpen = openBook === book && openChapter === c;
    setOpenChapter(alreadyOpen ? null : c);
    if (alreadyOpen) return;
    loadCounts(book);
    // the reader moves now; the panel stays for a verse, or a tap on the
    // scrim, whichever the reader wanted
    onChapter(book, c);
  };

  /** The chapters of a book, in the rows they are drawn in. */
  const chapterRows = (chapters: number): number[][] => {
    const rows: number[][] = [];
    for (let c = 1; c <= chapters; c += PER_ROW) {
      rows.push(
        Array.from(
          { length: Math.min(PER_ROW, chapters - c + 1) },
          (_, i) => c + i
        )
      );
    }
    return rows;
  };

  const verseGrid = (book: number, c: number) => {
    const n = counts[book]?.[c];
    return (
      <div className="bn-verses" aria-label={`${t("reader.chapter")} ${c}`}>
        {n ? (
          Array.from({ length: n }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              className="bn-v"
              onClick={() => onVerse(book, c, v)}
            >
              {v}
            </button>
          ))
        ) : (
          <span className="bn-v-wait">
            {noCounts[book] ? t("reader.versesOffline") : t("common.loading")}
          </span>
        )}
      </div>
    );
  };

  const testament = (key: "ot" | "nt", label: string, books: typeof BOOKS) => (
    <div key={key}>
      <button
        type="button"
        className="bn-testament"
        aria-expanded={openTestaments[key]}
        onClick={() =>
          setOpenTestaments((open) => ({ ...open, [key]: !open[key] }))
        }
      >
        <span>{label}</span>
        <span className={`bn-caret${openTestaments[key] ? " open" : ""}`}>
          ⌄
        </span>
      </button>
      {openTestaments[key] &&
        books.map((book) => {
          const open = openBook === book.nr;
          const here = book.nr === bookNr;
          return (
            <div key={book.nr} ref={here ? currentRef : undefined}>
              <button
                type="button"
                className={`bn-book${here ? " current" : ""}`}
                aria-expanded={open}
                onClick={() => {
                  setOpenBook(open ? null : book.nr);
                  setOpenChapter(null);
                }}
              >
                <span>{lang === "es" ? book.es : book.en}</span>
                <span className={`bn-caret${open ? " open" : ""}`}>
                  {open ? "⌄" : "›"}
                </span>
              </button>
              {open && (
                <div className="bn-chapters">
                  {/* The rows are drawn one at a time rather than left to one
                      grid's auto-placement, so the verses can open between
                      two of them. Inside a single grid a full-width row can
                      only land in the next free cell, which splits the
                      tapped chapter's row and restarts the rest below it. */}
                  {chapterRows(book.chapters).map((row) => (
                    <Fragment key={row[0]}>
                      <div className="bn-ch-row">
                        {row.map((c) => {
                          const chapterOpen = openChapter === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              className={`bn-ch${
                                here && c === chapter ? " current" : ""
                              }${chapterOpen ? " open" : ""}`}
                              onClick={() => pickChapter(book.nr, c)}
                              aria-expanded={chapterOpen}
                              aria-current={
                                here && c === chapter ? "page" : undefined
                              }
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                      {openChapter !== null &&
                        row.includes(openChapter) &&
                        verseGrid(book.nr, openChapter)}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <nav className="book-nav" aria-label={t("reader.books")}>
      <p className="bn-title">{t("reader.books")}</p>
      {testament(
        "ot",
        t("reader.oldTestament"),
        BOOKS.filter((b) => b.nr <= LAST_OT_BOOK)
      )}
      {testament(
        "nt",
        t("reader.newTestament"),
        BOOKS.filter((b) => b.nr > LAST_OT_BOOK)
      )}

      {/* Below the two testaments, and sticky like them: where you have been
          sent, as opposed to where you have scrolled.

          Not collapsible, and it used to be. A testament folds because it is
          sixty-six books and you want one of them; ten references fold to save
          nothing anybody wanted saved, and the whole reason to look at a
          history is to catch sight of the passage you left — which cannot
          happen behind a caret you have to press first. So it is simply
          there, the way the list of books is. */}
      {history.length > 0 && (
        <div>
          <h3 className="bn-testament bn-history-head">
            <span>
              {t("reader.history")}
              <span className="bn-history-count">{history.length}</span>
            </span>
          </h3>
          <div className="bn-history">
            {history.map((h) => {
              const book = getBook(h.b);
              if (!book) return null;
              return (
                <button
                  key={`${h.b}:${h.c}:${h.v}`}
                  type="button"
                  className="bn-history-row"
                  onClick={() => onVerse(h.b, h.c, h.v)}
                >
                  {lang === "es" ? book.es : book.en} {h.c}:{h.v}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
