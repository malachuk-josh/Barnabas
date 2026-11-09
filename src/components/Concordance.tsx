"use client";

// Every verse where an original-language word appears, as a sidebar that
// folds out from the right edge — the navigator's mirror. Opened from the
// word popup's "Found in N verses" pill.
//
// Two lists: the King James occurrences of a Strong's number, and the
// Septuagint occurrences of the same Greek lemma. Both show the whole verse,
// and both show it in English. A reference on its own tells you where to look;
// the verse tells you what the word is doing, which is the reason to open a
// concordance at all — and a verse you cannot read tells you neither.
//
// The Greek and the English do not share an address. Septuagint rows are
// stored at Septuagint addresses, so every one of them goes through
// kjvFromLxx() before anything is fetched or opened. Getting that the wrong
// way round shows one verse and lands on another, and both read as plausible.
//
// What can be marked differs between the two. The King James list records the
// exact words each verse used, so the mark is exact. The Septuagint list
// records only that the lemma occurs, and the English shown is a translation
// of the Hebrew rather than of the Greek, so the mark falls back to this
// word's known English renderings and stays quiet where they part company.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import HighlightedText from "@/components/HighlightedText";
import Icon from "@/components/Icon";
import { getBook, kjvFromLxx } from "@/lib/bible";
import { useI18n } from "@/lib/i18n";
import { fetchVerses, verseKey, type VerseRef } from "@/lib/scripture";
import { usageWords } from "@/lib/usage";

export interface ConcordanceEntry {
  n: number;
  kjv: [number, number, number, string][];
  lxx?: [number, number, number][];
  lxxN?: number;
}

const BUCKET = 500;
const PAGE = 60;

type Tab = "kjv" | "lxx";

interface Row {
  b: number;
  /** the reference as the list stores it — a Septuagint one on the LXX tab */
  c: number;
  v: number;
  /** where the verse is read from, and where a tap lands: King James, always */
  kc: number;
  kv: number;
  /** true when the two differ and the seam is known */
  mapped: boolean;
  word: string;
}

export default function Concordance({
  num,
  lemma,
  translit,
  usage,
  onPick,
  onClose,
}: {
  num: string;
  lemma: string;
  translit: string;
  /** the lexicon's King James usage line, for marking Septuagint verses */
  usage?: string;
  /** already a King James address — the mapping happens in here */
  onPick: (b: number, c: number, v: number) => void;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();
  const [entry, setEntry] = useState<ConcordanceEntry | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("kjv");
  const [limit, setLimit] = useState(PAGE);
  /** verse text, keyed "src:book:chapter:verse" */
  const [texts, setTexts] = useState<Record<string, string>>({});
  /** books whose file could not be read, keyed "src:book" */
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  /** verses whose request has come back, keyed like `texts` — so a verse with
   *  no text can say which it is: still coming, or not in this text at all */
  const [settled, setSettled] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /** rows the clamp actually cut off, measured rather than guessed */
  const [clipped, setClipped] = useState<Record<string, boolean>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** verses already asked for, so paging never asks for the same one twice */
  const requested = useRef(new Set<string>());
  /** bumped when the word changes, so a slow reply for the old one is dropped */
  const generation = useRef(0);

  // A different word is a different list. Resetting and fetching have to be
  // the same effect: split in two, a slow reply for the old word arrives
  // after the reset and repopulates it.
  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    requested.current = new Set();
    setEntry(null);
    setMissing(false);
    setTab("kjv");
    setLimit(PAGE);
    setTexts({});
    setFailed({});
    setSettled({});
    setExpanded({});
    setClipped({});

    const prefix = num.slice(0, 1);
    const bucket = Math.floor(Number(num.slice(1)) / BUCKET);
    fetch(`/concordance/${prefix}${bucket}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Record<string, ConcordanceEntry>) => {
        if (mine !== generation.current) return;
        if (data[num]) setEntry(data[num]);
        else setMissing(true);
      })
      .catch(() => {
        if (mine === generation.current) setMissing(true);
      });
  }, [num]);

  // The panel takes focus when it opens — on mount, and only on mount. Reader
  // passes a fresh arrow for onClose on every one of its renders, so hanging
  // this off [onClose] would re-focus the container each time the reader
  // re-rendered underneath, stealing focus back from whatever the user had
  // tabbed to inside the panel.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bookName = (b: number) => {
    const book = getBook(b);
    return book ? (lang === "es" ? book.es : book.en) : "";
  };

  const rows: Row[] = useMemo(() => {
    if (tab === "kjv") {
      return (entry?.kjv ?? []).map((r) => ({
        b: r[0],
        c: r[1],
        v: r[2],
        kc: r[1],
        kv: r[2],
        mapped: false,
        word: r[3],
      }));
    }
    return (entry?.lxx ?? []).map((r) => {
      const k = kjvFromLxx(r[0], r[1], r[2]);
      return {
        b: r[0],
        c: r[1],
        v: r[2],
        kc: k.chapter,
        kv: k.verse,
        mapped: k.mapped,
        word: "",
      };
    });
  }, [entry, tab]);

  const shown = rows.slice(0, limit);
  const total = tab === "kjv" ? (entry?.n ?? 0) : (entry?.lxxN ?? 0);
  const hasLxx = (entry?.lxx?.length ?? 0) > 0;
  /** Both tabs read the King James — only the list of references differs. */
  const src = "kjv";
  const marks = useMemo(() => usageWords(usage ?? ""), [usage]);

  // Text for what is on screen, grouped by book. Only the visible slice: an
  // entry holds up to 250 references, and pulling every book they touch would
  // be megabytes for verses nobody has scrolled to.
  //
  // What is skipped is tracked per VERSE, not per book. "Show more" often
  // reveals further verses in a book already fetched, and a per-book guard
  // would leave those permanently blank. Asking again is nearly free —
  // fetchVerses goes through the module-level book cache, so a second ask for
  // a resident book never touches the network.
  useEffect(() => {
    if (shown.length === 0) return;
    const mine = generation.current;
    const wanted = new Map<number, VerseRef[]>();
    for (const r of shown) {
      const key = `${src}:${verseKey(r.b, r.kc, r.kv)}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      const ref = { bookNr: r.b, chapter: r.kc, verse: r.kv };
      const list = wanted.get(r.b);
      if (list) list.push(ref);
      else wanted.set(r.b, [ref]);
    }
    for (const [book, refs] of wanted) {
      void fetchVerses(src, refs).then((batch) => {
        if (mine !== generation.current) return;
        if (batch.verses.size > 0) {
          setTexts((prev) => {
            const next = { ...prev };
            for (const [key, text] of batch.verses) next[`${src}:${key}`] = text;
            return next;
          });
        }
        if (batch.missingBooks.size > 0) {
          setFailed((prev) => ({ ...prev, [`${src}:${book}`]: true }));
        }
        // every verse in this batch now has its answer, text or no text
        setSettled((prev) => {
          const next = { ...prev };
          for (const ref of refs) {
            next[`${src}:${verseKey(ref.bookNr, ref.chapter, ref.verse)}`] = true;
          }
          return next;
        });
      });
    }
    // `texts` is written here and must not be read here, or every reply
    // schedules the next one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, tab, limit]);

  // Which verses the four-line clamp actually cut off. A character count
  // cannot answer this: the same verse wraps to three lines in the 460px
  // panel and five in the 92vw one on a phone, so the button would appear
  // over rows with nothing to open and miss rows that need it. Measured after
  // paint, and only for rows still collapsed — an open row always fits.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const next: Record<string, boolean> = {};
      for (const el of list.querySelectorAll<HTMLElement>(".conc-text")) {
        const id = el.dataset.row;
        if (!id) continue;
        // an open row always fits, so it can only be believed while collapsed
        if (el.classList.contains("open")) next[id] = true;
        else if (el.scrollHeight > el.clientHeight + 1) next[id] = true;
      }
      setClipped((prev) => {
        const keys = Object.keys(next);
        const same =
          keys.length === Object.keys(prev).length &&
          keys.every((k) => prev[k] === next[k]);
        return same ? prev : next;
      });
    };
    measure();
    // The panel is min(92vw, 460px), so a rotation or a window drag changes
    // how many lines a verse takes. Without this the answer is frozen at
    // whatever width it was first measured at, and the button appears on
    // rows with nothing to open — or, worse, hides a verse with no way in.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [texts, shown.length, tab, expanded]);

  // (Communion offered its offline download here when books were missing;
  // Barnabas has no offline mode.)

  /** The verse, the reason it is not here yet, or the reason it never will be. */
  const bodyOf = (r: Row) => {
    const key = `${src}:${verseKey(r.b, r.kc, r.kv)}`;
    const text = texts[key];
    if (text) {
      // the King James list knows the words this verse used; the Septuagint
      // list knows only the lemma, so it marks by this word's renderings
      return tab === "kjv" ? (
        <HighlightedText text={text} needle={r.word} />
      ) : (
        <HighlightedText text={text} words={marks} />
      );
    }
    if (failed[`${src}:${r.b}`]) {
      // one message now, because both tabs are waiting on the same book
      return <span className="conc-status">{t("reader.concOffline")}</span>;
    }
    if (settled[key]) {
      // the book came back and this verse was not in it — the Greek runs past
      // the English in a few chapters, and a handful of psalm titles are not
      // carried as verses here
      return <span className="conc-status">{t("reader.concNoVerse")}</span>;
    }

    return <span className="conc-waiting">&nbsp;</span>;
  };

  return (
    <>
      <div
        className="panel-scrim conc-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="concordance-panel"
        ref={panelRef}
        tabIndex={-1}
        className="glass side-panel conc-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("reader.concPanel")}
      >
        <div className="sp-head">
          <span className="sp-where" dir="auto">
            {lemma || num}
          </span>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("search.close")}
          >
            ✕
          </button>
        </div>

        {/* pinned: what this word is, and which list you are looking at */}
        <div className="sp-fixed">
          <p className="conc-meta lex-meta">
            {translit ? `[${translit}] · ` : ""}
            {num}
          </p>
          {hasLxx && (
            <div className="plan-filters conc-tabs">
              <button
                type="button"
                className={`chip${tab === "kjv" ? " chip-active" : ""}`}
                aria-pressed={tab === "kjv"}
                onClick={() => {
                  setTab("kjv");
                  setLimit(PAGE);
                }}
              >
                {t("reader.concKjv")} ({entry?.n ?? 0})
              </button>
              <button
                type="button"
                className={`chip${tab === "lxx" ? " chip-active" : ""}`}
                aria-pressed={tab === "lxx"}
                onClick={() => {
                  setTab("lxx");
                  setLimit(PAGE);
                }}
              >
                <Icon name="cross" /> {t("reader.lxx")} ({entry?.lxxN ?? 0})
              </button>
            </div>
          )}
          {tab === "lxx" && (
            <>
              <p className="conc-note cal-hint">{t("reader.concLxxNote")}</p>
              <p className="conc-note cal-hint">
                {t("reader.concLxxNumbering")}
              </p>
            </>
          )}
        </div>

        <div className="sp-body conc-body">
          {missing ? (
            <p className="conc-note notice">{t("reader.concEmpty")}</p>
          ) : !entry ? (
            <p className="conc-note skeleton">{t("common.loading")}</p>
          ) : (
            <>
              <div className="conc-list" ref={listRef}>
                {shown.map((r, i) => {
                  const id = `${r.b}-${r.c}-${r.v}-${i}`;
                  const open = !!expanded[id];
                  const long = !!clipped[id];
                  const ref = `${bookName(r.b)} ${r.c}:${r.v}`;
                  return (
                    <div key={id} className="conc-row">
                      <button
                        type="button"
                        className="conc-go"
                        onClick={() => onPick(r.b, r.kc, r.kv)}
                        title={t("reader.concJump", { ref })}
                      >
                        <span className="conc-ref">
                          {ref}
                          {r.mapped && (
                            <span className="conc-kjv-ref">
                              {t("reader.concKjvRef", {
                                ref: `${r.kc}:${r.kv}`,
                              })}
                            </span>
                          )}
                        </span>
                        <span
                          data-row={id}
                          className={`conc-text${open ? " open" : ""}`}
                        >
                          {bodyOf(r)}
                        </span>
                      </button>
                      {long && (
                        <button
                          type="button"
                          className="conc-expand"
                          aria-expanded={open}
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [id]: !open }))
                          }
                        >
                          {open
                            ? t("reader.concCollapse")
                            : t("reader.concExpand")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>


              {rows.length > limit ? (
                <div className="conc-note">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setLimit((n) => n + PAGE)}
                  >
                    {t("reader.concMore")}
                  </button>
                </div>
              ) : (
                total > rows.length && (
                  <p className="conc-note cal-hint">
                    {t("reader.concCapped", {
                      shown: String(rows.length),
                      total: String(total),
                    })}
                  </p>
                )
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
