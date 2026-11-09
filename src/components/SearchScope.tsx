"use client";

// The word search's filters: the Old Testament, the New, and books of the
// reader's choosing — under the search field in the navigator, and again over
// the results. The choices add up (SearchScope in lib/bible), and nothing
// chosen is the whole Bible.
//
// Books are picked in a sheet of all sixty-six, by testament, as the
// navigator lists them. The sheet is put on the page's body rather than where
// the row is: inside the navigator it would be held to the panel's box, since
// a glass surface is the containing block for anything fixed within it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { BOOKS, LAST_OT_BOOK, type SearchScope } from "@/lib/bible";
import { useI18n } from "@/lib/i18n";

export function useBookName() {
  const { lang } = useI18n();
  return (nr: number) => {
    const book = BOOKS[nr - 1];
    return lang === "es" ? book.es : book.en;
  };
}

/** "the Old Testament, John" — what a scope searches, for over the results. */
export function useScopeName() {
  const { t } = useI18n();
  const name = useBookName();
  return (scope: SearchScope) => {
    const parts: string[] = [];
    if (scope.ot) parts.push(t("reader.oldTestament"));
    if (scope.nt) parts.push(t("reader.newTestament"));
    // a book a chosen testament already covers says nothing more
    const besides = scope.books.filter((nr) => (nr <= LAST_OT_BOOK ? !scope.ot : !scope.nt));
    if (besides.length > 3) parts.push(t("search.booksN", { n: String(besides.length) }));
    else parts.push(...besides.map(name));
    return parts.join(", ");
  };
}

export default function SearchScopeRow({
  scope,
  onChange,
}: {
  scope: SearchScope;
  onChange: (next: SearchScope) => void;
}) {
  const { t } = useI18n();
  const name = useBookName();
  const [picking, setPicking] = useState(false);
  const books =
    scope.books.length === 0
      ? t("search.books")
      : scope.books.length === 1
        ? name(scope.books[0])
        : t("search.booksN", { n: String(scope.books.length) });

  return (
    <>
      <div className="search-scope" role="group" aria-label={t("search.scope")}>
        <button
          type="button"
          aria-pressed={scope.ot}
          className={`chip${scope.ot ? " chip-active" : ""}`}
          onClick={() => onChange({ ...scope, ot: !scope.ot })}
        >
          {t("reader.oldTestament")}
        </button>
        <button
          type="button"
          aria-pressed={scope.nt}
          className={`chip${scope.nt ? " chip-active" : ""}`}
          onClick={() => onChange({ ...scope, nt: !scope.nt })}
        >
          {t("reader.newTestament")}
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          className={`chip${scope.books.length ? " chip-active" : ""}`}
          onClick={() => setPicking(true)}
        >
          <Icon name="books" /> {books}
        </button>
      </div>
      {picking && (
        <BookPicker
          chosen={scope.books}
          onDone={(next) => {
            onChange({ ...scope, books: next });
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </>
  );
}

function BookPicker({
  chosen,
  onDone,
  onCancel,
}: {
  chosen: number[];
  onDone: (books: number[]) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const name = useBookName();
  const [picked, setPicked] = useState(() => new Set(chosen));

  // Escape closes this sheet and not the navigator under it, which listens on
  // the window too: this hears it first, on the way down, and keeps it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const toggle = (nr: number) =>
    setPicked((all) => {
      const next = new Set(all);
      if (next.has(nr)) next.delete(nr);
      else next.add(nr);
      return next;
    });

  const testament = (label: string, books: typeof BOOKS) => (
    <section>
      <h3>{label}</h3>
      <div className="book-picker-grid">
        {books.map((b) => (
          <button
            key={b.nr}
            type="button"
            aria-pressed={picked.has(b.nr)}
            className={`chip${picked.has(b.nr) ? " chip-active" : ""}`}
            onClick={() => toggle(b.nr)}
          >
            {name(b.nr)}
          </button>
        ))}
      </div>
    </section>
  );

  return createPortal(
    <div className="modal-overlay over-panel" onClick={onCancel}>
      <div
        className="glass modal book-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="book-picker-title">
          <Icon name="books" /> {t("search.pickBooks")}
        </h2>
        {testament(t("reader.oldTestament"), BOOKS.filter((b) => b.nr <= LAST_OT_BOOK))}
        {testament(t("reader.newTestament"), BOOKS.filter((b) => b.nr > LAST_OT_BOOK))}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            disabled={picked.size === 0}
            onClick={() => setPicked(new Set())}
          >
            {t("search.clearBooks")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onDone([...picked].sort((a, b) => a - b))}
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
