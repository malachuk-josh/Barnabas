"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_TRANSLATION,
  NOTE_MAX,
  TRANSLATIONS,
  WHOLE_BIBLE,
  booksParam,
  getBook,
  getTranslation,
  isLicensed,
  scopeBooks,
  type ChapterData,
  type SearchScope,
  type Verse,
} from "@/lib/bible";
import { acrosticAt } from "@/lib/acrostic";
import {
  alignVerse,
  kjvTokens,
  type AlignedToken,
  type GlossEntry,
  type GlossVocab,
} from "@/lib/align";
import {
  bmIndex,
  bmKeyOf,
  bmRefLabel,
  parseBmKey,
} from "@/lib/bookmarkKey";
import { api } from "@/lib/client";
import BookNav from "@/components/BookNav";
import Icon from "@/components/Icon";
import ChapterMap from "@/components/ChapterMap";
import StudyPictures from "@/components/StudyPictures";
import { useI18n } from "@/lib/i18n";
import {
  onScroll as onPageScroll,
  scrollByY,
  scrollToY,
  scrollY,
  scrollerTop,
  viewportH,
} from "@/lib/scroller";
import { STUDY_WILL_CHANGE, useReading } from "@/lib/reading";
import {
  RED_LETTER_CHANGED,
  fetchRedLetter,
  paintRed,
  readRedLetter,
  redWordsOf,
  type RedCursor,
  type RedRuns,
} from "@/lib/redletter";
import { fetchBook, fetchChapter, searchLocal } from "@/lib/scripture";
import { pushVisit } from "@/lib/history";
import { readOutbox } from "@/lib/localStore";
import {
  adoptIdentity,
  enqueue,
  flush,
  readLocalNotes,
  readLocalState,
  startSync,
  writeLocalNotes,
  writeLocalState,
} from "@/lib/sync";
import AskVerse, { useAskStatus } from "@/components/AskVerse";
import SearchScopeRow, { useScopeName } from "@/components/SearchScope";
import Concordance from "@/components/Concordance";
import ReadingSliders from "@/components/ReadingSliders";
import TypefacePicker from "@/components/TypefacePicker";
import ThemeToggle from "@/components/ThemeToggle";
import { readLocal, writeLocal } from "@/lib/storage";
import { intoParagraphs } from "@/lib/paragraphs";
import { faceReady, faceStack } from "@/lib/typefaces";
import {
  PT_DEFAULT,
  PT_MAX,
  PT_MIN,
  readTextPt,
  readTextFace,
  readTextWeight,
  strokeOf,
  WEIGHT_DEFAULT,
  type Face,
  writeTextPt,
  writeTextFace,
  writeTextWeight,
} from "@/lib/readingText";

const DEFAULT_BOOK = 40; // Matthew — the app opens on its founding verse
const DEFAULT_CHAPTER = 18;
const DEFAULT_VERSE = 20;

// Text size is a point size, the way type has always been set — 14 pt, not
// 112%. A multiplier had no natural stopping places, so a pinch slid through
// a continuum and the smallest movement changed the text. The limits, and
// the weight Settings can add, are in lib/readingText.
/** How far you must spread your fingers to gain one point. */
const PINCH_STEP = 1.12;

interface SearchResult {
  bookNr: number;
  chapter: number;
  verse: number;
  text: string;
  /** a passage Claude found can run on to here */
  end?: number;
  /** and comes with a line on why it answers the request */
  why?: string;
}

interface LexEntry {
  lemma: string;
  translit: string;
  pron: string;
  derivation: string;
  def: string;
  kjv: string;
  /** STEPBible grammar code, e.g. "G:N-F" (Greek noun, feminine) */
  gram?: string;
}

interface BmEntry {
  t: number;
  l?: string;
  c?: string;
  /** position within a hand-sorted collection — set in the journal */
  o?: number;
}

interface BmCollection {
  name: string;
  share?: string;
}

/**
 * The passage named in the address bar, if any. The page is server-rendered
 * with these already resolved — but the service worker may answer any URL
 * with its cached copy of "/", whose props were baked at some other visit,
 * so offline the address bar is the only trustworthy source.
 */
function deepLinkFromUrl():
  | { bookNr: number; chapter: number; verse?: number }
  | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const book = getBook(Number(params.get("b")));
  const chapter = Number(params.get("c"));
  const verse = Number(params.get("v"));
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
    return null;
  }
  return {
    bookNr: book.nr,
    chapter,
    verse: Number.isInteger(verse) && verse >= 1 ? verse : undefined,
  };
}

/** The study-mode star, drawn so it sits centred in its box at any size. */
function StudyStar() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1.4c.62 5.98 4.6 9.96 10.6 10.6-6 .62-9.98 4.6-10.6 10.6-.62-6-4.6-9.98-10.6-10.6C7.4 11.36 11.38 7.38 12 1.4Z"
      />
    </svg>
  );
}

export default function Reader({
  initialBook,
  initialChapter,
  initialVerse,
  initialFrom,
}: {
  initialBook?: number;
  initialChapter?: number;
  initialVerse?: number;
  /** the screen that sent the reader here, if it wants a way back offered */
  initialFrom?: "talk";
} = {}) {
  const { lang, t } = useI18n();
  const deepLinked = initialBook !== undefined;
  /*
   * The way back to where this reading came from.
   *
   * A plan in the Journal sends you into the Word, and the Word is a full
   * screen with a bottom bar that does not know it was sent for — so the way
   * back was the browser's own, or four taps through the menu. The same pill
   * a cross-reference leaves behind, for the same reason.
   *
   * Read once, from the props and then from the address bar: the service
   * worker may answer any URL with its cached copy of "/", whose props were
   * baked at some other visit, so offline the address is the only source that
   * knows about this one. Kept in state and never rewritten, because the
   * reader may read on past the chapter they landed on and the way home does
   * not stop being the way home.
   */
  const [cameFrom, setCameFrom] = useState<"talk" | null>(
    initialFrom ?? null
  );
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [bookNr, setBookNr] = useState(initialBook ?? DEFAULT_BOOK);
  const [chapter, setChapter] = useState(initialChapter ?? DEFAULT_CHAPTER);
  // The whole book, every chapter, in order. Scrolling never loads anything:
  // the file on disk holds the book entire, so there is nothing left to fetch
  // once you have arrived, in either direction.
  const [chapters, setChapters] = useState<{ ch: number; verses: Verse[] }[]>(
    []
  );
  // the chapter currently in view — trails the scroll, drives the pager,
  // the header indicator, and the saved reading position
  const [viewChapter, setViewChapter] = useState(
    initialChapter ?? DEFAULT_CHAPTER
  );
  /**
   * Which chapters are dressed for study, and why it is not all of them.
   *
   * The whole book is in the page at once — that is what makes scrolling from
   * Matthew 1 to Matthew 28 a scroll rather than a series of loads. Study mode
   * rebuilds every verse into a block with a tap target on every word, and
   * doing that to a whole book is a great deal of work for one tap: measured
   * on a phone, turning it on inside Psalms took nearly five seconds during
   * which nothing on screen moved at all.
   *
   * The reader can see one chapter. So the star dresses the chapter they are
   * in and the one either side, and the rest stay as they were until they are
   * scrolled to. Both layouts carry `data-v`, so everything that finds a verse
   * — jumps, bookmarks, holding your place — works across the boundary
   * without knowing it is there.
   *
   * The range only ever grows. Undressing a chapter behind the reader would
   * save nothing they can see and would shift the page under them.
   */
  const STUDY_SPAN = 1;
  const [studyRange, setStudyRange] = useState({ key: "", lo: 1, hi: 0 });
  /** where a chapter heading sat before something grew above it */
  const holdRef = useRef<{ sel: string; top: number } | null>(null);
  /** the chapter on screen, readable from inside a fetch callback */
  const viewChapterRef = useRef(1);
  /** the chapter asked for, readable from the book load that ignores it */
  const chapterRef = useRef(initialChapter ?? DEFAULT_CHAPTER);
  chapterRef.current = chapter;
  // bumped on every jump so a stale book load drops itself
  const genRef = useRef(0);
  /** the chapter this reader has already been placed at */
  const placedRef = useRef<string | null>(null);
  /** the verse to come back to, read once from the remembered position */
  const restoreVerseRef = useRef<number | null>(null);
  /** ends the placement still correcting itself, if there is one */
  const stopPlacing = useRef<(() => void) | null>(null);
  const readRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pt, setPt] = useState(PT_DEFAULT);
  /** how much heavier than regular the letters are set, from Settings */
  const [weight, setWeight] = useState(WEIGHT_DEFAULT);
  /** the typeface it is set in, from Settings; switched to once it has loaded */
  const [face, setFace] = useState<Face>("default");
  /** the typeface last picked, shown chosen at once while its file arrives */
  const [pickedFace, setPickedFace] = useState<Face>("default");
  const pickedFaceRef = useRef<Face>("default");
  const ptRef = useRef(PT_DEFAULT);
  const pinchRef = useRef<{ d: number; pt: number } | null>(null);
  /** The verse held still for the length of a pinch — see the handler. */
  const pinchAnchor = useRef<{ sel: string; top: number } | null>(null);
  const [pinchShow, setPinchShow] = useState<number | null>(null);
  const [xrefs, setXrefs] = useState<Record<string, number[][]> | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  /** aligned tokens per verse, built once and thrown away with their inputs */
  const alignCache = useRef(new Map<string, AlignedToken[]>());
  /** the Berean's tagging of this book, and its whole-Bible vocabulary */
  const [gloss, setGloss] = useState<Record<string, GlossEntry[]> | null>(null);
  const [glossVocab, setGlossVocab] = useState<GlossVocab | null>(null);
  /** the verse held up beside every other translation, if any */
  const [compareAt, setCompareAt] = useState<{ ch: number; v: number } | null>(
    null
  );
  /** what each translation says there: undefined while it is still being asked */
  const [compareRows, setCompareRows] = useState<
    Record<string, string | null>
  >({});
  // tap-a-word originals: tokenized KJV with Strong's numbers per word
  const [strongsTokens, setStrongsTokens] = useState<Record<
    string,
    [string, string[] | null][]
  > | null>(null);
  /** whether this reader wants Christ's words in red, and where they are */
  const [redLetter, setRedLetter] = useState(false);
  const [redRuns, setRedRuns] = useState<RedRuns | null>(null);
  const [lexHeb, setLexHeb] = useState<Record<string, LexEntry> | null>(null);
  const [lexGrk, setLexGrk] = useState<Record<string, LexEntry> | null>(null);
  const [lexCounts, setLexCounts] = useState<Record<string, number> | null>(
    null
  );
  const [wordSel, setWordSel] = useState<{
    ch: number;
    text: string;
    nums: string[];
    verse: number;
    /** true when the word was lined up rather than tagged — see lib/align */
    approx?: boolean;
  } | null>(null);
  const [wordAction, setWordAction] = useState("");
  const [concFor, setConcFor] = useState<string | null>(null);
  // Abbott-Smith (Greek) / brief lexicon (Hebrew), loaded per bucket
  const [deepSource, setDeepSource] = useState<"strongs" | "absmith">(
    "strongs"
  );
  const [deep, setDeep] = useState<
    Record<string, { d: string; extra?: string }>
  >({});
  /** how many lexicon files are in flight, so two never cancel each other */
  const [deepLoading, setDeepLoading] = useState(0);
  const [context, setContext] = useState<Record<
    string,
    Record<string, { practical: string; spiritual: string }>
  > | null>(null);
  // which chapter's context modal is open (null: closed)
  const [contextOpen, setContextOpen] = useState<number | null>(null);
  /**
   * Matthew Henry, one file per book: chapter -> the sections of that chapter.
   *
   * A section is a run of verses rather than a single one — Henry wrote about
   * passages, not lines — so a verse is looked up by which run contains it.
   * A missing `to` means the section runs to the end of the chapter.
   */
  const [commentary, setCommentary] = useState<Record<
    string,
    { from: number; to?: number; title?: string; text: string }[]
  > | null>(null);
  /** the verse whose commentary is open, as [chapter, verse] */
  const [henryOn, setHenryOn] = useState<[number, number] | null>(null);
  // section headings per chapter: [{ v: first verse, en, es? }, …]. Spanish is
  // optional: the hand-written books have it, the Berean ones do not.
  const [heads, setHeads] = useState<Record<
    string,
    { v: number; en: string; es?: string }[]
  > | null>(null);
  /** [verse, 1 for poetry] for every run of every chapter of the open book. */
  const [paras, setParas] = useState<Record<string, [number, number][]> | null>(
    null
  );
  const [highlightVerse, setHighlightVerse] = useState<number | null>(
    initialVerse ?? null
  );
  const [bookmarks, setBookmarks] = useState<Record<string, BmEntry>>({});
  const [collections, setCollections] = useState<
    Record<string, BmCollection>
  >({});
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [newCollFor, setNewCollFor] = useState<string | null>(null);
  const [newCollDraft, setNewCollDraft] = useState("");
  /** the bookmark being organised: where it starts, and where it runs to */
  const [bmSheet, setBmSheet] = useState<{
    c: number;
    v: number;
    end: number;
  } | null>(null);
  const [bmSheetColl, setBmSheetColl] = useState("");
  const [bmSheetMsg, setBmSheetMsg] = useState("");
  /**
   * The bookmark sheet's note while it is being written: null until a key is
   * pressed, with the saved note showing through until then.
   *
   * Its own, and not the inline editor's. The sheet used to write into
   * editingNote, which is the state that means "the editor under this verse
   * is open" — so the first key pressed in the sheet opened a second editor
   * in the page behind it, and that editor's autoFocus took the cursor. The
   * sheet's field lost focus, saved the one letter on its way out, which
   * closed the editor that had just taken focus, and left the keyboard with
   * nothing to type into.
   *
   * It was reported on Android first and taken for an Android quirk; it was
   * not one. React applies a typed letter before the keystroke that typed it
   * has finished, so the second editor's focus() arrived as part of the
   * reader's own key press, and iPhones honoured it the same way.
   */
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const [editingBm, setEditingBm] = useState<string | null>(null);
  const [bmLabelDraft, setBmLabelDraft] = useState("");
  const [backStack, setBackStack] = useState<
    { b: number; c: number; v: number }[]
  >([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  /** which text answered the search — not always the one being read */
  const [searchedIn, setSearchedIn] = useState("");
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  /** where a word search looks: a testament, books, or everything */
  const [scope, setScope] = useState<SearchScope>(WHOLE_BIBLE);
  const scopeName = useScopeName();
  /** the latest word search, so an answer to an earlier one is dropped */
  const searchSeq = useRef(0);
  /**
   * Search by describing, for the people with Ask: the request goes to Claude,
   * which answers with references (app/api/study/find). The reader's choice
   * between that and the word search is remembered on the device.
   *
   * It is the default for them: a reader with Ask starts in Illuminated
   * Search, and only a reader who has chosen By Word is kept there. Without
   * Ask this is never read (see `describing`), so it costs nobody anything.
   */
  const [findMode, setFindMode] = useState(true);
  /** whether the results showing came from Claude rather than the words */
  const [foundByClaude, setFoundByClaude] = useState(false);
  /** what Claude said with them, or why there are none */
  const [findNote, setFindNote] = useState("");
  const { setPosition, panelOpen, setPanelOpen, study, toggleStudy } = useReading();
  // Ask lives inside Compare, for the people the owner has switched on, and
  // the one pill's lamp says so rather than a second pill joining the row
  const [askStatus, setAskStatus] = useAskStatus(study);
  const sheetRef = useRef<HTMLDivElement>(null);
  /** the "Found in N verses" pill, so closing the concordance returns here */
  const concBtnRef = useRef<HTMLButtonElement>(null);

  // keep the sticky header's passage indicator in sync with the chapter
  // actually on screen, which trails continuous scrolling
  useEffect(() => {
    viewChapterRef.current = viewChapter;
    setPosition({ bookNr, chapter: viewChapter });
  }, [bookNr, viewChapter, setPosition]);

  // the control sheet lives in the header's context, which outlives this
  // component — leaving The Word must not strand it open
  useEffect(() => () => setPanelOpen(false), [setPanelOpen]);

  // the control sheet, the word study and the bookmark sheet all sit at the
  // bottom of the screen: only one of them may be up at a time
  useEffect(() => {
    if (!panelOpen) return;
    setWordSel(null);
    setConcFor(null);
    setBmSheet(null);
    setContextOpen(null);
    setEditingNote(null);
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // the keyboard is measured once for the whole app, in lib/viewport.tsx,
    // and the panel clears it from CSS
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, setPanelOpen]);

  // bookmarks sync across devices per user (guests: per browser)
  useEffect(() => {
    let cancelled = false;
    // paint from this device first — instant, and all there is offline
    readLocalState().then((local) => {
      if (cancelled || !local) return;
      setBookmarks(local.bookmarks);
      setCollections(local.collections);
    });
    // then send anything queued and take the server's answer as the truth
    startSync();
    (async () => {
      try {
        const synced = await flush();
        if (cancelled) return;
        if (synced) {
          setBookmarks(synced.bookmarks);
          setCollections(synced.collections);
          return;
        }
        // Nothing flushed. If bookmark or collection changes are still queued
        // this device is ahead of the server, and reading would undo them.
        // A queued note doesn't block this — it touches nothing here.
        const queued = await readOutbox();
        if (queued.some((op) => op.kind.startsWith("bookmark.") || op.kind.startsWith("collection."))) {
          return;
        }
        const res = await api<{
          who?: string;
          bookmarks: Record<string, BmEntry>;
          collections: Record<string, BmCollection>;
        }>(`/api/bookmarks?lang=${lang}`);
        if (cancelled) return;
        // a different account than the one this device was holding: drop the
        // old copy rather than let two people's notes mingle
        await adoptIdentity(res.who);
        setBookmarks(res.bookmarks);
        setCollections(res.collections);
        void writeLocalState(res);
      } catch {
        // offline: the local snapshot above is what we read from
      }
    })();
    return () => {
      cancelled = true;
    };
    // lang only decides the wording of the seeded default collection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // restore last reading position and text size
  useEffect(() => {
    // offline the server-rendered props can belong to a different visit
    const urlLink = deepLinkFromUrl();
    const linked = deepLinked || !!urlLink;
    if (urlLink && (urlLink.bookNr !== initialBook || urlLink.chapter !== initialChapter)) {
      setBookNr(urlLink.bookNr);
      setChapter(urlLink.chapter);
      setViewChapter(urlLink.chapter);
      if (urlLink.verse) setHighlightVerse(urlLink.verse);
    }
    try {
      const saved = JSON.parse(
        readLocal("barnabas.word.reading") ?? "null"
      ) as {
        translation: string;
        bookNr: number;
        chapter: number;
        verse?: number;
      } | null;
      if (saved && getBook(saved.bookNr)) {
        if (TRANSLATIONS.some((tr) => tr.id === saved.translation)) {
          setTranslation(saved.translation);
        }
        // a deep link (?b=&c=) outranks the remembered reading position
        if (!linked) {
          setBookNr(saved.bookNr);
          setChapter(saved.chapter);
          setViewChapter(saved.chapter);
          // consumed by the first placement, so coming back lands where they
          // left rather than at the top of the chapter they left from
          if (saved.verse) restoreVerseRef.current = saved.verse;
        }
      } else if (!linked) {
        // first visit: land on the founding verse, gently highlighted
        setHighlightVerse(DEFAULT_VERSE);
      }
      const savedPt = readTextPt();
      setPt(savedPt);
      ptRef.current = savedPt;
      setWeight(readTextWeight());
      // A chosen typeface is a web font, and its file may not be here yet.
      // Set in it straight away, the column would be laid out in the
      // fallback and then again whenever the file arrived — a reflow under
      // the reader at a moment nobody chose. So the page opens in the app's
      // own face, and switches once, with the verse being read held in place.
      const wantedFace = readTextFace();
      setPickedFace(wantedFace);
      pickedFaceRef.current = wantedFace;
      if (wantedFace !== "default") {
        void faceReady(wantedFace).then(() => {
          if (pickedFaceRef.current !== wantedFace) return;
          holdVerse();
          setFace(wantedFace);
        });
      }
      setFindMode(readLocal("barnabas.word.findMode") !== "0");
    } catch {
      // corrupted storage — start fresh at the default passage
    }
  }, []);

  // The reader is the one screen where chrome is pure cost. This marks the
  // document while it is open so the stylesheet can strip the page gutter and
  // the scrollbar for scripture and nothing else.
  useEffect(() => {
    document.documentElement.classList.add("reading");
    return () => document.documentElement.classList.remove("reading");
  }, []);

  // a placement still correcting itself has no page left to correct
  useEffect(() => () => stopPlacing.current?.(), []);

  /**
   * Remember where a chapter heading is sitting, so the layout effect below
   * can put it back after the DOM grows above it. Call this immediately
   * before the setState that causes the growth.
   */
  const holdAnchor = (ch: number) => {
    const sel = `.chap-head[data-ch="${ch}"]`;
    const el = document.querySelector<HTMLElement>(sel);
    if (el) holdRef.current = { sel, top: el.getBoundingClientRect().top };
  };

  /**
   * Pin the verse the reader is actually looking at, rather than the chapter
   * heading above it. A heading is enough when a whole chapter moves, but not
   * when the text between the heading and their eyes grows — turning study
   * mode on inside Psalm 119 carried the reader seventeen verses back with
   * the heading held perfectly still.
   *
   * The anchor is `data-v`, which both the plain and the study markup carry:
   * the elements themselves are not the same ones across that switch.
   */
  const holdVerse = () => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-v]")) {
      const top = el.getBoundingClientRect().top;
      // the first one at or below the top edge is the one being read
      if (top >= 0) {
        holdRef.current = { sel: `[data-v="${el.dataset.v}"]`, top };
        return;
      }
    }
  };

  /** The verse crossing a given height — where the fingers are, in a pinch. */
  const verseAt = (y: number): { sel: string; top: number } | null => {
    let best: { sel: string; top: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>("[data-v]")) {
      const box = el.getBoundingClientRect();
      if (box.bottom < 0) continue;
      best ??= { sel: `[data-v="${el.dataset.v}"]`, top: box.top };
      if (box.top <= y) best = { sel: `[data-v="${el.dataset.v}"]`, top: box.top };
      if (box.top > y) break;
    }
    return best;
  };

  /** Put a held verse back where it was. Safe to call as often as you like. */
  const restore = (held: { sel: string; top: number } | null) => {
    if (!held) return;
    const el = document.querySelector<HTMLElement>(held.sel);
    if (!el) return;
    const moved = el.getBoundingClientRect().top - held.top;
    if (moved !== 0) scrollByY(moved);
  };

  // The star in the header says so a moment before the switch lands, which
  // is the only moment the old layout can still be measured.
  useEffect(() => {
    const onWillChange = () => holdVerse();
    window.addEventListener(STUDY_WILL_CHANGE, onWillChange);
    return () => window.removeEventListener(STUDY_WILL_CHANGE, onWillChange);
  }, []);

  /**
   * Widen the dressed range to take in wherever the reader has scrolled to.
   *
   * Downwards this adds a chapter below the fold and moves nothing. Upwards it
   * grows the page above them, so the verse they are on is pinned first and
   * put back by the layout effect that follows.
   */
  useEffect(() => {
    if (!study) return;
    setStudyRange((prev) => {
      const lo = Math.min(prev.lo, viewChapter - STUDY_SPAN);
      const hi = Math.max(prev.hi, viewChapter + STUDY_SPAN);
      if (lo === prev.lo && hi === prev.hi) return prev;
      if (lo < prev.lo) holdVerse(); // the page is about to grow above them
      return { ...prev, lo, hi };
    });
  }, [study, viewChapter]);

  /**
   * Put the reader at the top of a chapter, and keep them there until the
   * page stops moving underneath them.
   *
   * One scroll was not enough, and the way it failed was the worst way it
   * could have. Everything this measures against is still settling when it
   * first runs: the chapter heights are whatever the browser has arrived at
   * so far, and the study extras — section headings, cross-references, the
   * context chips — are not in the page at all yet. Measure once against
   * that and the answer is short by however much grows above the chapter
   * afterwards. Short of Psalm 119 is Psalm 117 and nobody notices. Short of
   * Colossians 4 is the top of Colossians, because the whole book is only
   * four chapters and the error is bigger than the book.
   *
   * So it aims, and then goes on checking its aim frame by frame and
   * correcting, until the number it wants stops changing. It gives up the
   * instant the reader touches the page — their thumb outranks anything this
   * was in the middle of — and after a second regardless, so it can never
   * turn into the thing fighting a scroll.
   */
  const placeAt = (ch: number, verse?: number) => {
    // any placement still in flight was for somewhere else
    stopPlacing.current?.();

    // a remembered verse if there is one, the chapter's heading otherwise
    const find = () =>
      (verse
        ? document.querySelector<HTMLElement>(`[data-v="${ch}:${verse}"]`)
        : null) ??
      document.querySelector<HTMLElement>(`.chap-head[data-ch="${ch}"]`);

    /*
     * Where the scroller would have to be for that line to sit at the top.
     *
     * A rect is measured from the top of the WINDOW and a scroll position
     * from the top of the SCROLLER, and those are no longer the same place —
     * the header sits between them. Taking the scroller's own top off first
     * converts one to the other.
     *
     * The header's height used to be subtracted here as well, because a
     * sticky header overlays whatever scrolls under it and the chapter
     * heading would have landed beneath it. Outside the scroller it overlays
     * nothing, so all that is wanted now is a little air above the heading.
     *
     * null means the line is not in the page yet, which is a reason to wait,
     * never a reason to scroll. Sending the reader to the top of the book
     * because the chapter could not be found is how they ended up at chapter
     * one every time, and being told nothing about it.
     */
    const wanted = (): number | null => {
      const target = find();
      if (!target) return null;
      const top =
        target.getBoundingClientRect().top - scrollerTop() + scrollY() - 10;
      return Math.max(0, top);
    };

    let frames = 0;
    let settledAt: number | null = null;
    let raf = 0;
    const started = Date.now();

    const stop = () => {
      cancelAnimationFrame(raf);
      for (const ev of ["touchstart", "wheel", "keydown", "pointerdown"]) {
        window.removeEventListener(ev, stop);
      }
      stopPlacing.current = null;
    };
    // the reader's own hand ends this, wherever it had got to
    for (const ev of ["touchstart", "wheel", "keydown", "pointerdown"]) {
      window.addEventListener(ev, stop, { passive: true });
    }
    stopPlacing.current = stop;

    const aim = () => {
      const want = wanted();
      if (want !== null) {
        if (Math.abs(scrollY() - want) > 1) scrollToY(want);
        // the target stops moving once the page below has finished arriving;
        // two frames agreeing is the page holding still, not a coincidence
        if (settledAt !== null && Math.abs(want - settledAt) <= 1) frames += 1;
        else frames = 0;
        settledAt = want;
      }
      // a second is far longer than any of this takes and still short enough
      // that a page which never settles cannot hold the scroll hostage
      if (frames >= 2 || Date.now() - started > 1000) stop();
      else raf = requestAnimationFrame(aim);
    };
    aim();
  };

  /**
   * Remember where the reader is, to the verse.
   *
   * The chapter alone was not enough: leaving from the middle of Psalm 119
   * and coming back put them at verse 1, and the longer the chapter the more
   * of it they had to find again. The verse is only worked out here, when
   * there is something to save — scanning every verse on every scroll frame
   * would cost far more than it is worth.
   */
  const saveReading = () => {
    const ch = viewChapterRef.current;
    const shown = document.querySelectorAll<HTMLElement>("[data-v]");
    // Nothing on screen to read a verse from: the text has not arrived yet,
    // or React has already taken it away on the way out. Either way, writing
    // now would replace a good record with a chapter and no verse.
    if (shown.length === 0) return;
    const nav = document.querySelector<HTMLElement>(".nav");
    // The same line placeAt() aligns to, and for the same reason: save by one
    // rule and restore by another and every trip through loses a verse. This
    // asks which verse placeAt() would have to put here to reproduce the
    // page as it stands, so saving and restoring are inverses.
    const edge = (nav?.getBoundingClientRect().height ?? 0) + 10;
    let verse: number | undefined;
    for (const el of shown) {
      // the first verse whose top has not yet passed under the header
      if (el.getBoundingClientRect().top < edge - 4) continue;
      const [c, v] = (el.dataset.v ?? "").split(":").map(Number);
      if (c === ch) verse = v;
      break;
    }
    writeLocal(
      "barnabas.word.reading",
      JSON.stringify({ translation, bookNr, chapter: ch, verse })
    );
  };

  // A licensed translation is read a chapter at a time, so a change of
  // chapter is a new fetch — for the ones shipped as files the whole book is
  // already here and this must not fire on a scroll.
  const streamed = isLicensed(translation);
  const streamedChapter = streamed ? chapter : 0;

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    setChapters([]);
    placedRef.current = null;
    setLoading(true);
    setError(false);
    fetchBook(translation, bookNr)
      .then((book) =>
        book.chapters.map((c) => ({ ch: c.chapter, verses: c.verses }))
      )
      // no book to be had — a study text with no static file, or one of the
      // borrowed translations, which are only ever served a chapter at a time
      .catch(() =>
        fetchChapter(translation, bookNr, chapterRef.current).then((json) => [
          { ch: json.chapter, verses: json.verses },
        ])
      )
      .then((list) => {
        if (genRef.current !== gen) return; // reader jumped meanwhile
        setChapters(list);
        setLoading(false);
      })
      .catch(() => {
        if (genRef.current !== gen) return;
        setError(true);
        setLoading(false);
      });
  }, [translation, bookNr, streamedChapter]);

  /**
   * Put the reader at the chapter they asked for. This runs before paint, so
   * arriving at Psalm 40 never shows Psalm 1 first. It fires only when the
   * requested chapter actually changes — never on a scroll — so it cannot
   * fight the reader's own thumb.
   */
  useLayoutEffect(() => {
    if (loading || error || chapters.length === 0) return;
    const want = `${translation}/${bookNr}/${chapter}`;
    if (placedRef.current === want) return;
    placedRef.current = want;
    setViewChapter(chapter);
    viewChapterRef.current = chapter;
    const back = restoreVerseRef.current;
    restoreVerseRef.current = null;
    placeAt(chapter, back ?? undefined);
    saveReading();
  }, [loading, error, chapters, translation, bookNr, chapter]);

  // Hold the reader's place when something grows above them. Nothing is
  // inserted by scrolling any more, but the study extras — cross-references,
  // section headings, the tagged text, the context chips — still arrive after
  // the first paint and change heights all over the column. Measuring the
  // page height is not enough, so this pins one chapter heading and corrects
  // by how far it actually moved.
  useLayoutEffect(() => {
    const held = holdRef.current;
    if (!held) return;
    // A pinch keeps one anchor for the whole gesture and clears it at
    // touchend; everything else pins once and is done.
    if (!pinchAnchor.current) holdRef.current = null;
    restore(held);
  }, [study, studyRange, pt, face, heads, xrefs, strongsTokens, notes, context]);

  // as chapter headings scroll past, remember which chapter is being read
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        let current = chapter;
        // Capped, not a plain fraction of the screen. At 40% of an iPad's
        // 1366px a chapter counted as "the one being read" while its heading
        // was still 546px down the page — so the reader was marked a chapter
        // ahead of their eyes, and that was the chapter they came back to.
        const edge = Math.min(viewportH() * 0.4, 320);
        // measured down from the top of the scroller, not of the window: the
        // header is above it and is not part of what is being read
        const from = scrollerTop();
        for (const head of document.querySelectorAll<HTMLElement>(
          ".chap-head"
        )) {
          if (head.getBoundingClientRect().top - from < edge) {
            current = Number(head.dataset.ch) || current;
          }
        }
        setViewChapter((prev) => (prev === current ? prev : current));
        // and remember the verse, once the thumb has come to rest
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveReading, 600);
      });
    };
    // Leaving is the moment this has to be right, and it is the one moment a
    // debounce can miss: a tab going away never gets its trailing timer.
    const onHide = () => {
      if (document.visibilityState === "hidden") saveReading();
    };
    let saveTimer = 0;
    const offScroll = onPageScroll(onScroll);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", saveReading);
    return () => {
      window.clearTimeout(saveTimer);
      offScroll();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", saveReading);
      // navigating away inside the app unmounts the reader without ever
      // hiding the tab, so this is the pass that catches it
      saveReading();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, translation, bookNr]);

  // pinch-to-zoom on the scripture column replaces text-size buttons on
  // touch screens; page zoom itself is disabled app-wide, so the gesture
  // is free for this. Native listeners: React's synthetic touch events are
  // passive and can't preventDefault the two-finger pan.
  useEffect(() => {
    const el = readRef.current;
    if (!el) return;
    const dist = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { d: dist(e.touches), pt: ptRef.current };
        // The verse between the fingers, chosen once and kept for the whole
        // gesture. Both halves of that matter.
        //
        // Between the fingers, because that is what the reader is looking at
        // — anchoring the top edge instead lets the words under their thumb
        // slide away as the column above it changes height.
        //
        // Once, because re-deriving it every step is what made zooming out
        // drift. Each step aimed at wherever the page had just landed, so a
        // correction that fell a fraction short was never recovered — and
        // worse, shrinking the text lifts the anchor towards the top edge, so
        // the moment it crossed, the search picked the NEXT verse down and
        // the anchor walked forward through the book a step at a time.
        // Zooming in pushes it the other way, which is why growing the text
        // always looked fine. One anchor, one fixed goal, no accumulation.
        pinchAnchor.current = verseAt(
          (e.touches[0].clientY + e.touches[1].clientY) / 2
        );
      }
    };
    const onMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      // Whole points, counted from where the pinch began. Each point costs a
      // deliberate 12% spread, and the log keeps closing your fingers worth
      // exactly as much as opening them.
      const steps = Math.round(
        Math.log(dist(e.touches) / pinch.d) / Math.log(PINCH_STEP)
      );
      const next = Math.min(PT_MAX, Math.max(PT_MIN, pinch.pt + steps));
      if (next !== ptRef.current) {
        // Resizing the type reflows the whole column, so the scroll offset
        // stops meaning what it meant — the verse under your thumb walks up
        // or down the page, by chapters if you are deep into a book. The
        // layout effect below puts the anchor back after every step.
        if (!pinchAnchor.current) {
          pinchAnchor.current = verseAt(
            (e.touches[0].clientY + e.touches[1].clientY) / 2
          );
        }
        holdRef.current = pinchAnchor.current;
        ptRef.current = next;
        setPt(next);
      }
      setPinchShow(next);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchRef.current) {
        pinchRef.current = null;
        const anchor = pinchAnchor.current;
        // Only the gesture ends here. holdRef is deliberately left alone: the
        // last touchmove can land in the same frame as touchend, so a commit
        // for it may still be pending, and clearing the anchor now would
        // throw away the correction for the final — largest — step. The
        // layout effect clears it once pinchAnchor is gone.
        pinchAnchor.current = null;
        // And once more with the fingers off. A programmatic scroll made
        // during a live touch gesture is not always honoured — iOS owns the
        // scroller until the gesture ends — so this is the pass that is
        // guaranteed to land.
        if (anchor) {
          // Twice, a frame apart. Once is enough when the steps of a gesture
          // arrive on separate frames, but a fast pinch can land several in
          // one — and then the commit for the last and largest of them is
          // still settling when the first pass measures. The second is a
          // no-op whenever the first was right.
          requestAnimationFrame(() => {
            restore(anchor);
            requestAnimationFrame(() => {
              restore(anchor);
              holdRef.current = null;
            });
          });
        }
        writeTextPt(ptRef.current);
        window.setTimeout(() => setPinchShow(null), 800);
      }
    };
    // WebKit's own pinch-to-zoom, which is a separate gesture stack from
    // touch events: preventDefault on touchmove does not touch it, and
    // Safari has ignored user-scalable=no in a browser tab since iOS 10. Left
    // alone it magnifies the page underneath the resize, which pans the
    // visual viewport and reads as losing your place — worst on an iPad,
    // where the spread is wide enough to cross Safari's threshold. Only on
    // the reading column, and only because the app answers the same gesture
    // with something better.
    const stopGesture = (e: Event) => e.preventDefault();
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    el.addEventListener("gesturestart", stopGesture);
    el.addEventListener("gesturechange", stopGesture);
    el.addEventListener("gestureend", stopGesture);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", stopGesture);
      el.removeEventListener("gesturechange", stopGesture);
      el.removeEventListener("gestureend", stopGesture);
    };
  }, []);

  // study mode: load the KJV-keyed cross-reference set for the open book.
  // The same keys apply to every translation sharing KJV versification.
  useEffect(() => {
    if (!study) return;
    let cancelled = false;
    setXrefs(null);
    fetch(`/xref/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json: Record<string, number[][]>) => {
        if (cancelled) return;
        holdVerse();
        setXrefs(json);
      })
      .catch(() => {
        if (!cancelled) setXrefs({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, bookNr]);

  // this user's notes for the open book. Loaded in plain mode as well as
  // study mode: a verse you have written on is marked in both.
  useEffect(() => {
    let cancelled = false;
    setNotes({});
    setEditingNote(null);
    readLocalNotes(bookNr).then((local) => {
      if (cancelled || !local) return;
      holdVerse();
      setNotes(local);
    });
    readOutbox()
      .then((queued) => {
        // an unsent note for this book means the device is ahead of the
        // server; a queued bookmark, or a note in another book, does not
        const ahead = queued.some(
          (op) => op.kind === "note.set" && op.book === bookNr
        );
        if (ahead) return null;
        return api<{ notes: Record<string, string> }>(`/api/notes/${bookNr}`);
      })
      .then((res) => {
        if (cancelled || !res) return;
        holdVerse();
        setNotes(res.notes);
        void writeLocalNotes(bookNr, res.notes);
      })
      .catch(() => {
        // offline or signed out — the local copy above stands
      });
    return () => {
      cancelled = true;
    };
  }, [bookNr]);

  /*
   * Study mode: the King James tagged word by word with Strong's numbers.
   *
   * Loaded for every translation, not only the King James. It is two things at
   * once — the King James's own wording, and the list of originals behind each
   * verse — and only the first of those is translation-bound. Every
   * translation here counts verses the same way, so the second is true of all
   * of them, and it is what the sheet offers a reader of the ESV.
   *
   * What must never happen is the first being used for the second's sake: the
   * renderer draws a verse from these tokens when it has them, so leaving them
   * in place across a change of translation once put King James wording on
   * screen under another translation's name and licence notice. That is why
   * the guard against it lives at the point of rendering (see tapWords) rather
   * than here.
   */
  useEffect(() => {
    setStrongsTokens(null);
    alignCache.current.clear();
    if (!study) return;
    let cancelled = false;
    fetch(`/strongs/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (cancelled) return;
        holdVerse();
        setStrongsTokens(json);
      })
      .catch(() => {
        if (!cancelled) setStrongsTokens({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, bookNr]);

  // the setting itself, read after mount and again whenever it is changed on
  // the settings screen — which is a different route, but the reader is often
  // still mounted behind it
  useEffect(() => {
    const read = () => setRedLetter(readRedLetter());
    read();
    window.addEventListener(RED_LETTER_CHANGED, read);
    return () => window.removeEventListener(RED_LETTER_CHANGED, read);
  }, []);

  /*
   * Where Christ speaks in this book.
   *
   * Only under the King James. The spans are word indices into the King
   * James's own wording, and every other translation words the verse
   * differently — the same index would land on a different word, which is a
   * claim about who said something, made wrongly. The setting says so plainly
   * where it is switched on.
   */
  const redOn = redLetter && translation === "kjv";
  useEffect(() => {
    if (!redOn) {
      setRedRuns(null);
      return;
    }
    let cancelled = false;
    fetchRedLetter(bookNr).then((runs) => {
      if (!cancelled) setRedRuns(runs);
    });
    return () => {
      cancelled = true;
    };
  }, [redOn, bookNr]);

  /** The words Christ speaks in one verse, or null where he speaks none. */
  const redAt = (ch: number, verse: number): Set<number> | null =>
    redRuns ? redWordsOf(redRuns, ch, verse) : null;

  /**
   * Whether this translation's words can be lined up against the evidence.
   *
   * The Berean's tagging is English, and lib/align.ts stems by throwing away
   * everything that is not a-z — which turns Spanish into a near-miss of
   * English rather than a language of its own. So: English only, and
   * everything else falls through to the Original text chip.
   */
  const aligned = (getTranslation(translation)?.lang ?? "en") === "en";

  /*
   * The evidence for reading an untagged translation word by word: the
   * Berean's tagging of this book, and the vocabulary it uses across the whole
   * Bible. Neither is fetched while reading the King James, which carries its
   * own tagging.
   *
   * The book file is fetched for the Spanish too, even though the Spanish is
   * never aligned: it is also what the Original text chip lists, and that is
   * the one thing study mode can honestly offer a Reina Valera reader. The
   * vocabulary below is not — it exists only to match English words, so
   * downloading half a megabyte of it would buy a Spanish reader nothing.
   */
  useEffect(() => {
    if (!study || translation === "kjv") return;
    let cancelled = false;
    setGloss(null);
    fetch(`/gloss/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (cancelled) return;
        holdVerse();
        setGloss(json);
      })
      .catch(() => {
        if (!cancelled) setGloss({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, translation, bookNr]);

  // the same vocabulary serves every book, so it is fetched once
  useEffect(() => {
    if (!study || translation === "kjv" || glossVocab) return;
    if (!aligned) return; // English words only; see the note above
    let cancelled = false;
    fetch("/gloss/vocab.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (!cancelled) setGlossVocab(json);
      })
      .catch(() => {
        if (!cancelled) setGlossVocab({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, translation, glossVocab]);

  // chapter context (practical + spiritual), one static file per book
  useEffect(() => {
    if (!study) return;
    let cancelled = false;
    setContext(null);
    fetch(`/context/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (cancelled) return;
        // this adds a context chip to every verse in the column, including the
        // ones above the viewport — hold the reader's place across it
        holdVerse();
        setContext(json);
      })
      .catch(() => {
        if (!cancelled) setContext({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, bookNr]);

  // Matthew Henry's commentary, one static file per book — same shape and the
  // same reason as the context above it, and only fetched in study mode
  useEffect(() => {
    if (!study) return;
    let cancelled = false;
    setCommentary(null);
    fetch(`/commentary/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (cancelled) return;
        // as with the context: this adds a chip to every verse on screen,
        // including the ones above the fold, so hold the reader's place
        holdVerse();
        setCommentary(json);
      })
      .catch(() => {
        if (!cancelled) setCommentary({});
      });
    return () => {
      cancelled = true;
    };
    // holdVerse is deliberately not a dependency: it is redeclared on every
    // render, so listing it makes this effect re-run for ever — which it did,
    // fetching the book a hundred times and blanking the state each time, so
    // no chip ever survived long enough to appear. The context effect above
    // omits it for the same reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study, bookNr]);

  /**
   * Spurgeon's Treasury of David, which is the Psalms and nothing else.
   *
   * Shaped differently from Henry because the book is: each psalm carries an
   * overview of the whole, verse-by-verse exposition, and sermon outlines.
   */
  const [treasury, setTreasury] = useState<Record<
    string,
    {
      overview?: string;
      verses: { from: number; to?: number; text: string }[];
      hints?: { from: number; to?: number; text: string }[];
    }
  > | null>(null);

  // Only ever fetched in the Psalms — there is no Treasury of anything else.
  useEffect(() => {
    if (!study || bookNr !== 19) {
      setTreasury(null);
      return;
    }
    let cancelled = false;
    fetch("/treasury/19.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (cancelled) return;
        holdVerse();
        setTreasury(json);
      })
      .catch(() => {
        if (!cancelled) setTreasury({});
      });
    return () => {
      cancelled = true;
    };
    // holdVerse is redeclared every render; see the note on the effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study, bookNr]);

  /** What Spurgeon has on this verse: his exposition, and any outlines. */
  const spurgeonFor = useCallback(
    (ch: number, verse: number) => {
      const psalm = treasury?.[String(ch)];
      if (!psalm) return null;
      const covers = (x: { from: number; to?: number }) =>
        verse >= x.from && (x.to === undefined || verse <= x.to);
      const exposition = psalm.verses.find(covers) ?? null;
      const hints = (psalm.hints ?? []).filter(
        (h) => h.from === 0 || covers(h)
      );
      if (!exposition && hints.length === 0) return null;
      return { exposition, hints, overview: psalm.overview };
    },
    [treasury]
  );

  /** Which of a chapter's sections covers this verse, if any. */
  const henryFor = useCallback(
    (ch: number, verse: number) =>
      (commentary?.[String(ch)] ?? []).find(
        (sec) => verse >= sec.from && (sec.to === undefined || verse <= sec.to)
      ) ?? null,
    [commentary]
  );

  // section headings, one static file per book — the same shape as the
  // chapter context, keyed by chapter then by the verse a section opens on.
  // Not gated on study mode: these read as part of the text.
  useEffect(() => {
    let cancelled = false;
    setHeads(null);
    fetch(`/headings/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (cancelled) return;
        holdVerse();
        setHeads(json);
      })
      .catch(() => {
        if (!cancelled) setHeads({});
      });
    return () => {
      cancelled = true;
    };
  }, [bookNr]);


  // Where the paragraphs are, and which runs are poetry. One file per book,
  // derived from the World English Bible's own markup — see
  // scripts/build-paragraphs.mjs. Until it arrives the reader stays on a line
  // per verse: laying a psalm out as prose for a moment and then correcting
  // itself would be worse than waiting.
  useEffect(() => {
    let cancelled = false;
    setParas(null);
    fetch(`/paragraphs/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (cancelled) return;
        holdVerse();
        setParas(json);
      })
      .catch(() => {
        if (!cancelled) setParas({});
      });
    return () => {
      cancelled = true;
    };
  }, [bookNr]);

  /**
   * Which bookmark holds a given verse — the verse's own, or the range it
   * falls inside. Built once per change to the set rather than searched per
   * verse: every verse on screen asks this while it renders.
   */
  const bmAt = useMemo(() => bmIndex(Object.keys(bookmarks)), [bookmarks]);
  const bmKeyAt = (ch: number, verse: number): string | undefined =>
    bmAt.get(`${bookNr}:${ch}:${verse}`);

  /**
   * What this verse is marked with, if anything — the note's own text, or
   * "Bookmark". Used to put a small star where an asterisk would go, so a
   * verse you have written on is findable without turning study mode on.
   */
  const markOf = (ch: number, verse: number): string | null =>
    notes[`${ch}:${verse}`] ||
    (bmKeyAt(ch, verse) ? t("reader.bookmark") : null);

  /** Section title opening at this verse, if any. */
  /**
   * The heading standing over a verse, in the language being read — and in no
   * other.
   *
   * Genesis and the New Testament carry headings written by hand in both
   * languages. The other thirty-eight books take theirs from the Berean
   * Standard Bible, which has three thousand of them and all in English. This
   * used to fall back to English when there was no Spanish, which was right
   * when every heading had both; now it would drop an English title into the
   * middle of the Reina Valera. A Spanish reading gets the headings it has and
   * silence where it has none, which is what it had before either way.
   */
  const headAt = (ch: number, verse: number): string | undefined => {
    const entry = heads?.[String(ch)]?.find((s) => s.v === verse);
    if (!entry) return undefined;
    return (lang === "es" ? entry.es : entry.en) || undefined;
  };

  /**
   * The Hebrew letter opening a stanza, centred above it — Psalm 119 and
   * Lamentations 3, the two poems built in stanzas rather than lines. The
   * letter and not its name: "Aleph" is a transliteration of the mark, and it
   * is the mark that the poem is built on.
   */
  const stanzaMark = (ch: number, verse: number) => {
    const mark = acrosticAt(bookNr, ch, verse);
    if (mark?.style !== "stanza") return null;
    return (
      <div className="acrostic" lang="he" dir="rtl">
        {mark.letters.join("")}
      </div>
    );
  };

  /**
   * The same thing for the poems that turn every line rather than every
   * stanza: a letter beside the verse number instead of a heading over it.
   * Twenty-two headings down a twenty-two verse chapter would read as
   * twenty-two chapters, and the shape would be lost in the marking of it.
   *
   * Psalms 111 and 112 turn twice or three times inside one verse; there is no
   * way to split an English verse where the Hebrew half-line falls, so the
   * verse carries the letters it covers.
   */
  const lineMark = (ch: number, verse: number) => {
    const mark = acrosticAt(bookNr, ch, verse);
    if (mark?.style !== "verse") return null;
    return (
      <span className="acrostic-line" lang="he">
        {/* Thin space, spelled out: a word space between two letters reads as
            two marks rather than one verse's worth. The order they end up in
            is settled in CSS \u2014 left to itself a run of Hebrew turns round, and
            a verse marked aleph-beth would read beth-aleph. */}
        {mark.letters.join("\u2009")}
      </span>
    );
  };

  /**
   * Split a chapter into the runs it is actually written in: a paragraph of
   * prose, a stanza of poetry, or a section under its own title.
   *
   * Two sources, and either can open a run. The headings are the hand-written
   * ones in public/headings; the paragraph marks come from public/paragraphs,
   * which knows where every paragraph in the Bible begins and whether it is
   * verse or prose. A run with no mark of its own carries on as whatever the
   * run before it was — a heading dropped into the middle of a psalm starts a
   * new section, not a change of genre.
   */
  const runsOf = (ch: number, verses: Verse[]) => {
    const marks = new Map(
      (paras?.[ch] ?? []).map(([v, poetry]) => [v, poetry === 1])
    );
    const runs: { title?: string; poetry: boolean; verses: Verse[] }[] = [];
    for (const v of verses) {
      const title = headAt(ch, v.verse);
      const opens = marks.has(v.verse);
      if (title || opens || runs.length === 0) {
        runs.push({
          title,
          poetry: opens
            ? marks.get(v.verse)!
            : (runs[runs.length - 1]?.poetry ?? false),
          verses: [v],
        });
      } else runs[runs.length - 1].verses.push(v);
    }
    return runs;
  };

  /** The cross-references opening from a verse. */
  const refsAt = (ch: number, verse: number): number[][] =>
    xrefs?.[`${ch}:${verse}`] ?? [];

  /** The lexicon for this testament, and the occurrence counts. Once each. */
  const loadLexicons = () => {
    if (bookNr <= 39 && !lexHeb) {
      fetch("/lexicon/hebrew.json")
        .then((res) => (res.ok ? res.json() : {}))
        .then(setLexHeb)
        .catch(() => setLexHeb(null));
    }
    if (bookNr > 39 && !lexGrk) {
      fetch("/lexicon/greek.json")
        .then((res) => (res.ok ? res.json() : {}))
        .then(setLexGrk)
        .catch(() => setLexGrk(null));
    }
    if (!lexCounts) {
      fetch("/strongs/counts.json")
        .then((res) => (res.ok ? res.json() : {}))
        .then(setLexCounts)
        .catch(() => setLexCounts({}));
    }
  };

  /**
   * The originals behind a verse, in the order the original stands.
   *
   * The way in for a verse whose words could not be matched to anything — a
   * translation with no evidence behind it at all, like the Spanish, and the
   * occasional English verse worded far enough from the Berean that nothing
   * lines up. The list itself is exact: it is what the tagging says stands
   * behind the verse, with no claim about which English word carries which.
   */
  const originalsAt = (
    ch: number,
    verse: number
  ): { num: string; word: string }[] => {
    const ref = `${ch}:${verse}`;
    const out: { num: string; word: string }[] = [];
    const seen = new Set<string>();
    const add = (num: string | null, word: string) => {
      if (!num || seen.has(num)) return;
      seen.add(num);
      out.push({ num, word: word.trim() });
    };
    if (translation === "kjv") {
      for (const [text, nums] of strongsTokens?.[ref] ?? []) {
        for (const num of nums ?? []) add(num, text);
      }
    } else {
      for (const [num, phrase] of gloss?.[ref] ?? []) add(num, phrase);
    }
    return out;
  };

  /**
   * The sheet, opened on a verse rather than a word.
   *
   * Offered only where no word of the verse could be underlined, so that a
   * reader is never left with a verse study mode has nothing to say about.
   */
  const openVerseRefs = (ch: number, verse: number) => {
    setPanelOpen(false);
    setWordSel({ ch, text: "", nums: [], verse });
    setWordAction("");
    loadLexicons();
  };

  const openWord = (
    ch: number,
    text: string,
    nums: string[],
    verse: number,
    approx = false
  ) => {
    setPanelOpen(false);
    setWordSel({ ch, text, nums, verse, approx });
    setWordAction("");
    loadLexicons();
  };

  const lexFor = (num: string): LexEntry | undefined =>
    (num.startsWith("H") ? lexHeb : lexGrk)?.[num];

  /**
   * Load the fuller lexicon bucket for this number: Abbott-Smith for Greek,
   * and for Hebrew both Brown-Driver-Briggs and the brief entry.
   */
  /**
   * Fetch the fuller lexicon for these numbers.
   *
   * The entries are stored five hundred to a file, so one fetch answers for a
   * whole neighbourhood of words. Which files have already been asked for is
   * kept in a ref rather than inferred from what came back: a word genuinely
   * absent from Abbott-Smith leaves no trace in `deep`, and testing for that
   * absence would refetch the same two hundred kilobytes every time the sheet
   * opened on it.
   *
   * Loads are counted, not flagged. A single boolean meant that a word whose
   * numbers fell in two different files loaded the first and silently skipped
   * the second, and the second would then read as having no entry.
   */
  const deepAsked = useRef(new Set<string>());

  const loadDeep = (nums: string[]) => {
    const buckets = new Set<string>();
    for (const num of nums) {
      if (!/^[HG]\d+$/.test(num)) continue;
      const bucket = `${num.slice(0, 1)}${Math.floor(Number(num.slice(1)) / 500)}`;
      if (!deepAsked.current.has(bucket)) buckets.add(bucket);
    }
    if (buckets.size === 0) return;

    for (const bucket of buckets) deepAsked.current.add(bucket);
    setDeepLoading((n) => n + buckets.size);

    for (const bucket of buckets) {
      // Hebrew has two: Brown-Driver-Briggs proper, and a briefer gloss that
      // is shown under it. Greek has Abbott-Smith alone.
      const sources = bucket.startsWith("H")
        ? [`/bdb/${bucket}.json`, `/absmith/${bucket}.json`]
        : [`/absmith/${bucket}.json`];
      Promise.all(
        sources.map((url) =>
          fetch(url)
            .then((res) => (res.ok ? res.json() : {}))
            .catch(() => ({}))
        )
      )
        .then(([primary, secondary]) => {
          const merged: Record<string, { d: string; extra?: string }> = {};
          for (const [key, value] of Object.entries(
            primary as Record<string, { d: string }>
          )) {
            merged[key] = { d: value.d };
          }
          for (const [key, value] of Object.entries(
            (secondary ?? {}) as Record<string, { d: string }>
          )) {
            if (merged[key]) merged[key].extra = value.d;
            else merged[key] = { d: value.d };
          }
          setDeep((prev) => ({ ...prev, ...merged }));
        })
        .catch(() => {
          // the file is gone or the connection is: let it be asked for again
          deepAsked.current.delete(bucket);
        })
        .finally(() => setDeepLoading((n) => Math.max(0, n - 1)));
    }
  };

  const showDeep = (nums: string[]) => {
    setDeepSource("absmith");
    loadDeep(nums);
  };

  /**
   * Fetch the fuller entry the moment a word is opened, not when it is asked
   * for.
   *
   * Which tab you were last on is remembered, so opening a second word while
   * that tab is up used to show the sheet already switched to a lexicon that
   * had never been fetched — and an unfetched entry renders exactly like a
   * word the lexicon does not have. It read as "no fuller entry for this
   * word" for words the lexicon plainly has, and tapping the pill a second
   * time was the only way to make it appear.
   *
   * Loading up front fixes that and makes the tab instant besides.
   */
  useEffect(() => {
    if (!wordSel || wordSel.nums.length === 0) return;
    loadDeep(wordSel.nums);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordSel]);

  /** The verses of any chapter of the open book. */
  const chDataOf = (ch: number): ChapterData | null => {
    const found = chapters.find((c) => c.ch === ch);
    return found
      ? { translation, bookNr, chapter: ch, verses: found.verses }
      : null;
  };

  /** Plain-text rendering of the open word study, for copy/share/note. */
  const wordSummary = (): string => {
    if (!wordSel) return "";
    const ref = `${bookName} ${wordSel.ch}:${wordSel.verse}`;
    const parts = [`"${wordSel.text}" — ${ref}`];
    for (const num of wordSel.nums) {
      const entry = lexFor(num);
      if (!entry) continue;
      const gram = entry.gram ? gramLabel(entry.gram) : null;
      parts.push(
        `${entry.lemma} [${entry.translit}] · ${num}${gram ? ` · ${gram}` : ""}`
      );
      if (entry.def) parts.push(entry.def.trim());
    }
    parts.push("— Barnabas");
    return parts.join("\n");
  };

  const flashWord = (msg: string) => {
    setWordAction(msg);
    setTimeout(() => setWordAction(""), 2200);
  };

  const copyWord = async () => {
    try {
      await navigator.clipboard.writeText(wordSummary());
      flashWord(t("reader.copied"));
    } catch {
      flashWord(t("reader.error"));
    }
  };

  const shareWord = async () => {
    const text = wordSummary();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // cancelled — fall through to a text message / clipboard
      }
    }
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isMobile) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      window.location.href = isIOS
        ? `sms:&body=${encodeURIComponent(text)}`
        : `sms:?body=${encodeURIComponent(text)}`;
      return;
    }
    void copyWord();
  };

  const saveWordNote = async () => {
    if (!wordSel) return;
    const key = `${wordSel.ch}:${wordSel.verse}`;
    const existing = notes[key] ?? "";
    const addition = wordSummary().replace(/\n— Barnabas$/, "");
    const text = (existing ? `${existing}\n\n${addition}` : addition).slice(
      0,
      1000
    );
    setNotes((prev) => {
      const next = { ...prev, [key]: text };
      void writeLocalNotes(bookNr, next);
      return next;
    });
    void enqueue({ kind: "note.set", book: bookNr, ref: key, text, ts: Date.now() });
    flashWord(t("reader.savedToNote"));
  };

  // Human-readable part of speech (+ gender) from a STEPBible grammar code
  // like "G:N-F", "H:V", "N:N--L", "G:P-1", "H:PerP-CS".
  const gramLabel = (code: string): string | null => {
    const [origin, rest] = code.split(":");
    if (!rest) return null;
    const segs = rest.split("-");
    const head = segs[0];
    const out: string[] = [];
    if (head === "N") {
      out.push(t(origin === "N" ? "gram.properNoun" : "gram.noun"));
      const g = segs[1];
      if (g === "M") out.push(t("gram.masculine"));
      else if (g === "F") out.push(t("gram.feminine"));
      else if (g === "N") out.push(t("gram.neuter"));
      else if (g === "M/F") out.push(t("gram.mascFem"));
      const tag = segs[2] ?? "";
      if (tag.includes("P")) out.push(t("gram.person"));
      else if (tag.includes("L")) out.push(t("gram.place"));
      else if (tag.includes("G")) out.push(t("gram.peopleGroup"));
      else if (tag.includes("T")) out.push(t("gram.title"));
    } else if (head === "V") out.push(t("gram.verb"));
    else if (head === "A")
      out.push(segs[1] === "NUI" ? t("gram.numeral") : t("gram.adjective"));
    else if (/^adv/i.test(head)) out.push(t("gram.adverb"));
    else if (/^prep/i.test(head)) out.push(t("gram.preposition"));
    else if (/^conj/i.test(head)) out.push(t("gram.conjunction"));
    else if (/^(prt|part)$/i.test(head)) out.push(t("gram.particle"));
    else if (/^intj/i.test(head)) out.push(t("gram.interjection"));
    else if (/^intg/i.test(head)) out.push(t("gram.interrogative"));
    else if (head === "T") out.push(t("gram.article"));
    else if (head === "COND") out.push(t("gram.conditional"));
    else if (head === "P" || /^perp/i.test(head))
      out.push(t("gram.pronounPersonal"));
    else if (head === "R" || /^rel/i.test(head))
      out.push(t("gram.pronounRelative"));
    else if (head === "D" || /^demp/i.test(head))
      out.push(t("gram.pronounDemonstrative"));
    else if (head === "X") out.push(t("gram.pronounIndefinite"));
    else return null;
    return out.join(" · ");
  };

  const ctxOf = (ch: number) =>
    context?.[String(ch)]?.[lang === "es" ? "es" : "en"];

  const startNote = (key: string) => {
    setPanelOpen(false);
    setNoteDraft(notes[key] ?? "");
    setEditingNote(key);
  };

  /**
   * Hold one verse up against every translation the app has.
   *
   * Each is asked for separately and lands as it arrives, because they do not
   * arrive together: the ones shipped as files answer from disk or the service
   * worker, and the licensed ones are a request to a publisher apiece. Waiting
   * for the slowest before showing any would make the whole thing feel like the
   * slowest. A translation that cannot answer says so rather than vanishing —
   * an absent row reads as "this verse is not in it", which would be a lie.
   *
   * Nothing is cached here beyond what fetchChapter already keeps, so the
   * licensed ceiling on stored verses is the same one it has always been.
   */
  const openCompare = (ch: number, verse: number) => {
    setPanelOpen(false);
    setCompareAt({ ch, v: verse });
    setCompareRows({});
    for (const tr of TRANSLATIONS) {
      fetchChapter(tr.id, bookNr, ch)
        .then((json) => {
          const line = json.verses.find((x) => x.verse === verse);
          setCompareRows((prev) => ({ ...prev, [tr.id]: line?.text ?? null }));
        })
        .catch(() => setCompareRows((prev) => ({ ...prev, [tr.id]: null })));
    }
  };

  /** Keep what was written on a verse — or forget the note, if it is empty. */
  const commitNote = (key: string, draft: string) => {
    const text = draft.trim();
    setNotes((prev) => {
      const next = { ...prev };
      if (text) next[key] = text;
      else delete next[key];
      void writeLocalNotes(bookNr, next);
      return next;
    });
    void enqueue({ kind: "note.set", book: bookNr, ref: key, text, ts: Date.now() });
  };

  /** The inline editor's save: keep the note, and close the editor. */
  const saveNote = (key: string) => {
    commitNote(key, noteDraft);
    setEditingNote(null);
  };

  const jumpToRef = (fromCh: number, ref: number[], fromVerse: number) => {
    // the sheet would cover both the landing verse and the back pill
    setPanelOpen(false);
    // remember where we came from so the reader can jump straight back
    setBackStack((prev) =>
      [...prev, { b: bookNr, c: fromCh, v: fromVerse }].slice(-10)
    );
    setBookNr(ref[0]);
    setChapter(ref[1]);
    setHighlightVerse(ref[2]);
    pushVisit(ref[0], ref[1], ref[2]);
  };

  // the address bar, for the visit the cached shell could not know about
  useEffect(() => {
    if (cameFrom) return;
    const from = new URLSearchParams(window.location.search).get("from");
    if (from === "talk") setCameFrom("talk");
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => {
    const last = backStack[backStack.length - 1];
    if (!last) return;
    setBackStack((prev) => prev.slice(0, -1));
    setBookNr(last.b);
    setChapter(last.c);
    setHighlightVerse(last.v);
  };

  /**
   * Open a verse's page of the journal: its bookmark, its note, its
   * collection and its place on the wall, all in the one sheet.
   *
   * Opening it changes nothing. The pill under the verse used to be the
   * bookmark itself, and one press on a kept verse un-kept it, with nothing on
   * the screen to say so; keeping is now a toggle inside, where it is seen.
   * A verse inside a kept run opens the run, because the run is what is kept.
   */
  const openJournal = (ch: number, verse: number) => {
    const held = bmKeyAt(ch, verse);
    const run = held ? parseBmKey(held) : null;
    setPanelOpen(false);
    setBmSheet(
      run ? { c: run.c, v: run.v, end: run.end } : { c: ch, v: verse, end: verse }
    );
    setBmSheetColl("");
    setBmSheetMsg("");
    setSheetNote(null);
  };

  /**
   * Keep the verse, or the run the sheet is showing, or stop keeping it.
   *
   * A verse that is part of a run takes the whole run: the run is the
   * bookmark, and half of one is not a thing that can be kept.
   */
  const toggleBookmark = (ch: number, verse: number, end = verse) => {
    const held = bmKeyAt(ch, verse);
    const key = held ?? bmKeyOf(bookNr, ch, verse, end);
    const removing = !!held;
    const next = { ...bookmarks };
    if (removing) delete next[key];
    else next[key] = { t: Date.now() };
    setBookmarks(next);
    void writeLocalState({ bookmarks: next });
    void enqueue(
      removing
        ? { kind: "bookmark.del", key, ts: Date.now() }
        : { kind: "bookmark.set", key, t: Date.now(), ts: Date.now() }
    );
  };

  /**
   * Stretch or shrink the run this bookmark holds.
   *
   * The range lives in the key, so changing it is a different bookmark: the
   * old key goes and the new one arrives carrying everything the old one had —
   * when it was saved, what it was called, which collection it was filed in,
   * and where it sat in that collection's order.
   */
  const setBookmarkEnd = (ch: number, verse: number, end: number) => {
    const from = bmKeyOf(bookNr, ch, verse);
    const to = bmKeyOf(bookNr, ch, verse, end);
    /*
     * Is there anything here to change?
     *
     * Asked of the bookmark that actually exists, not of the key this would
     * write. Those come apart in exactly one case, and it is the useful one:
     * shrinking a run back to a single verse. "Through: this verse" makes a
     * key with no range in it, which is character for character the key a
     * lone verse has — so the old test saw a write that changed nothing and
     * stopped, while the range it was asked to collapse was stored under a
     * different key entirely and stayed exactly as it was. Picking "this
     * verse" simply did nothing, every time.
     */
    const existing = bmKeyAt(ch, verse);
    if (!existing && from === to) return;
    const held = existing ?? from;
    const entry: BmEntry = { ...(bookmarks[held] ?? { t: Date.now() }) };
    const next = { ...bookmarks };
    delete next[held];
    next[to] = entry;
    setBookmarks(next);
    void writeLocalState({ bookmarks: next });
    if (held !== to) {
      void enqueue({ kind: "bookmark.del", key: held, ts: Date.now() });
    }
    void enqueue({
      kind: "bookmark.set",
      key: to,
      t: entry.t,
      l: entry.l,
      c: entry.c,
      o: entry.o,
      ts: Date.now(),
    });
    setBmSheet({ c: ch, v: verse, end });
  };

  /** Create a collection by name and return its id (for the bookmark sheet). */
  /**
   * Collections are named here and given their id here — waiting on the
   * server for one would mean no new collections without a connection.
   */
  const createCollectionNamed = async (
    name: string
  ): Promise<string | null> => {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) return null;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const next = { ...collections, [id]: { name: trimmed } };
    setCollections(next);
    void writeLocalState({ collections: next });
    void enqueue({ kind: "collection.set", id, name: trimmed, ts: Date.now() });
    return id;
  };

  const shareVerse = async (ch: number, verse: number, end = verse) => {
    // a run shares as a run: every verse in it, and the reference that says so
    const text = (chDataOf(ch)?.verses ?? [])
      .filter((v) => v.verse >= verse && v.verse <= end)
      .map((v) => v.text.trim())
      .join(" ");
    const ref = bmRefLabel(bookName, { b: bookNr, c: ch, v: verse, end });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // a deep link into The Word (Barnabas has no shared-verse page)
    const query = new URLSearchParams({
      b: String(bookNr),
      c: String(ch),
      v: String(verse),
    });
    const payload = `${ref} — ${text}\n${origin}/word?${query}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: payload });
        return;
      } catch {
        // cancelled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(payload);
      setBmSheetMsg(t("reader.copied"));
      setTimeout(() => setBmSheetMsg(""), 2200);
    } catch {
      setBmSheetMsg(t("reader.error"));
    }
  };

  const updateBookmark = (key: string, patch: { label?: string; coll?: string }) => {
    // filing a verse in a collection keeps it: a collection is of bookmarks
    const entry = { ...(bookmarks[key] ?? { t: Date.now() }) };
    if (patch.label !== undefined) {
      if (patch.label.trim()) entry.l = patch.label.trim();
      else delete entry.l;
    }
    if (patch.coll !== undefined) {
      if (patch.coll) entry.c = patch.coll;
      else delete entry.c;
    }
    const next = { ...bookmarks, [key]: entry };
    setBookmarks(next);
    void writeLocalState({ bookmarks: next });
    void enqueue({
      kind: "bookmark.set",
      key,
      t: entry.t,
      l: entry.l,
      c: entry.c,
      ts: Date.now(),
    });
  };

  const deleteCollection = async (id: string) => {
    if (!window.confirm(t("reader.deleteCollectionConfirm"))) return;
    const nextColls = { ...collections };
    delete nextColls[id];
    const nextMarks: Record<string, BmEntry> = {};
    for (const [key, entry] of Object.entries(bookmarks)) {
      nextMarks[key] = entry.c === id ? { ...entry, c: undefined } : entry;
    }
    setCollections(nextColls);
    setBookmarks(nextMarks);
    void writeLocalState({ bookmarks: nextMarks, collections: nextColls });
    void enqueue({ kind: "collection.del", id, ts: Date.now() });
  };


  const jumpToBookmark = (key: string) => {
    const ref = parseBmKey(key);
    if (!ref) return;
    setBookmarksOpen(false);
    setBackStack([]);
    setBookNr(ref.b);
    setChapter(ref.c);
    // a run lands on its first verse, which is where you would start reading
    setHighlightVerse(ref.v);
  };

  const refChipLabel = (ref: number[]) => {
    const refBook = getBook(ref[0]);
    if (!refBook) return "";
    const name = lang === "es" ? refBook.es : refBook.en;
    return `${name} ${ref[1]}:${ref[2]}${ref[3] ? `–${ref[3]}` : ""}`;
  };

  /*
   * Has the reader taken the scroll back?
   *
   * A ref rather than state, because it has to survive the correction effect
   * being torn down and rebuilt — which is the whole problem it solves. That
   * effect re-runs each time a piece of study data lands, and every run
   * installed a fresh once-only wheel listener, so a scroll that had already
   * said "leave me alone" was forgotten the moment the next batch of
   * cross-references arrived. In study mode those trickle in for several
   * seconds, and the page kept yanking itself back to a verse the reader had
   * deliberately scrolled away from.
   */
  const tookOverScroll = useRef(false);

  // A new target is a new jump, and nobody has taken over from it yet.
  // Declared before the correction effect so it runs first on a real jump.
  useEffect(() => {
    tookOverScroll.current = false;
  }, [highlightVerse, chapter, bookNr]);

  // After a jump, bring the target verse into view — and keep correcting
  // briefly, because study-mode extras (xref chips, original-language lines,
  // notes) load after the text and push the target further down the page.
  useEffect(() => {
    if (loading || chapters.length === 0 || highlightVerse === null) return;
    if (tookOverScroll.current) return;
    let attempts = 0;
    const settle = () => {
      const el = document.getElementById(`v-${highlightVerse}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const drift = Math.abs(
          rect.top + rect.height / 2 - (scrollerTop() + viewportH() / 2)
        );
        if (drift > 48) {
          /*
           * Smooth only when the verse is nearly here already.
           *
           * The reader holds the whole book at once, so arriving from a link
           * — a verse on a wall, a bookmark, a cross-reference — can mean a
           * target sixty thousand pixels down the page. Animating that is not
           * a transition, it is a long shudder down the length of Matthew,
           * and on a phone it was violent enough to take the app with it.
           * Worse, this effect re-runs as the chapter's extras arrive, and
           * each run reset `attempts` and started the animation again, so two
           * of them fought over the scroll position.
           *
           * A jump is a jump: land there. The short corrections that follow,
           * as headings and study-mode lines push the verse down, are what
           * smooth was actually good for.
           */
          const near = drift < viewportH() * 2;
          el.scrollIntoView({
            behavior: attempts === 0 && near ? "smooth" : "auto",
            block: "center",
          });
        }
      }
      if (++attempts >= 6) window.clearInterval(id);
    };
    const id = window.setInterval(settle, 400);
    settle();
    // the user taking over scrolling ends the correction loop immediately —
    // and for good, not just until the next batch of study data arrives
    const stop = () => {
      tookOverScroll.current = true;
      window.clearInterval(id);
    };
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchmove", stop, { passive: true, once: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
    };
    // `chapter` matters: jumping to the same verse number in another chapter
    // leaves highlightVerse untouched, and without it the jump never scrolled
  }, [
    loading,
    chapters,
    chapter,
    highlightVerse,
    study,
    xrefs,
    strongsTokens,
    notes,
  ]);

  // a new chapter closes any open word translation
  useEffect(() => {
    setWordSel(null);
  }, [bookNr, chapter, study, translation]);

  // the alignment belongs to one translation of one book, and is built from
  // the gloss: any of the three changing makes what is cached wrong
  useEffect(() => {
    alignCache.current.clear();
  }, [translation, bookNr, gloss, glossVocab]);

  // Leaving study mode, or changing translation, takes the concordance with
  // it. Deliberately not folded into the effect above: a chapter change must
  // NOT close it, or a tap on a result would shut the sidebar it came from.
  useEffect(() => {
    setConcFor(null);
  }, [study, translation]);

  const book = getBook(bookNr)!;
  const bookName = lang === "es" ? book.es : book.en;
  const transAbbrev =
    TRANSLATIONS.find((tr) => tr.id === translation)?.abbrev ?? "";
  /* Study mode keeps a line to a verse whatever the book: its whole point is
     that a verse is a thing you can look at on its own. Everywhere else the
     text is laid out the way it was written — as soon as there is a file
     saying how that is. Asked per chapter, because only the chapters around
     the reader are dressed for study at any moment. */
  /*
   * Reset during render rather than in an effect. An effect would leave one
   * commit in which study mode is on and no chapter is dressed for it — the
   * layout effect that puts the reader back where they were would fire on
   * that commit, find nothing had moved, and let go of its anchor before the
   * chapters that actually change height arrive.
   */
  const rangeKey = `${study}|${bookNr}|${translation}|${chapter}`;
  if (studyRange.key !== rangeKey) {
    setStudyRange({
      key: rangeKey,
      lo: study ? chapter - STUDY_SPAN : 1,
      hi: study ? chapter + STUDY_SPAN : 0,
    });
  }
  const studyAt = (ch: number) =>
    study && ch >= studyRange.lo && ch <= studyRange.hi;
  const proseAt = (ch: number) => !studyAt(ch) && paras !== null;
  const bookNameOf = (nr: number) => {
    const b = getBook(nr);
    return b ? (lang === "es" ? b.es : b.en) : "";
  };

  /**
   * Jump to a chapter of the open book. The whole book is already rendered,
   * so this is a move, not a load. Asking for the chapter you are nominally
   * on — after scrolling well past it — wouldn't change any state, so that
   * case clears the placement marker to make the move happen anyway.
   */
  const jumpChapter = (c: number) => {
    setHighlightVerse(null);
    setBackStack([]);
    if (c === chapter) {
      // no state changes, so nothing would re-run: move by hand
      placeAt(c);
      setViewChapter(c);
      viewChapterRef.current = c;
      return;
    }
    setChapter(c);
  };

  // the floating arrows move relative to the chapter on screen
  const go = (delta: number) => {
    const next = viewChapter + delta;
    if (next >= 1 && next <= book.chapters) {
      jumpChapter(next);
    } else if (next < 1 && bookNr > 1) {
      const prevBook = getBook(bookNr - 1)!;
      setHighlightVerse(null);
      setBackStack([]);
      setBookNr(prevBook.nr);
      setChapter(prevBook.chapters);
    } else if (next > book.chapters && bookNr < 66) {
      setHighlightVerse(null);
      setBackStack([]);
      setBookNr(bookNr + 1);
      setChapter(1);
    }
  };

  const resize = (next: number) => {
    if (next === pt || next < PT_MIN || next > PT_MAX) return;
    // same reflow as a pinch, same need to hold the reader's place
    holdVerse();
    setPt(next);
    ptRef.current = next;
    writeTextPt(next);
  };

  const askable = askStatus.allowed && askStatus.ready !== false;
  const describing = askable && findMode;

  const chooseFindMode = (on: boolean) => {
    setFindMode(on);
    writeLocal("barnabas.word.findMode", on ? "1" : "0");
    // a description can run to 300 characters and the word search takes 60;
    // left long, the words would search for nothing and say so
    if (!on) setQuery((q) => q.slice(0, 60));
  };

  /**
   * A described search: Claude names the passages, and their words come from
   * this device's own copy of the translation being read — the same way every
   * other verse on the screen does — so nothing it returns is a quotation that
   * could be wrong. A reference whose verse is not in that chapter is dropped
   * when the words are looked for.
   */
  const runFind = async (q: string) => {
    setSearching(true);
    setResults([]);
    setSearchTotal(0);
    setFoundByClaude(true);
    setFindNote("");
    try {
      const res = await fetch("/api/study/find", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, lang }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        results?: { bookNr: number; chapter: number; verse: number; end: number; why: string }[];
        note?: string;
        refused?: boolean;
        left?: number;
        error?: string;
        resetsAt?: number;
      };
      if (!res.ok) {
        if (json.error === "person-limit" || json.error === "app-limit") {
          const next = {
            ...askStatus,
            left: 0,
            limit: json.error === "app-limit" ? ("app" as const) : ("person" as const),
            resetsAt: json.resetsAt ?? askStatus.resetsAt,
          };
          setAskStatus(next);
          setFindNote(
            t(json.error === "app-limit" ? "ask.appLimit" : "ask.personLimit", {
              n: String(askStatus.perPerson ?? ""),
              time: new Date(next.resetsAt ?? Date.now()).toLocaleTimeString(
                lang === "es" ? "es" : "en-US",
                { hour: "numeric", minute: "2-digit" }
              ),
            })
          );
        } else {
          setFindNote(
            t(
              json.error === "busy"
                ? "ask.busy"
                : json.error === "not-ready" || json.error === "not-allowed"
                  ? "ask.notReady"
                  : "ask.failed"
            )
          );
        }
        return;
      }
      if (typeof json.left === "number") setAskStatus({ ...askStatus, left: json.left });
      const wordsOf = async (tr: string, f: NonNullable<typeof json.results>[number]) => {
        const chapter = await fetchChapter(tr, f.bookNr, f.chapter);
        return chapter.verses
          .filter((x) => x.verse >= f.verse && x.verse <= f.end)
          .map((x) => x.text.trim())
          .join(" ");
      };
      const rows = await Promise.all(
        (json.results ?? []).map(async (f) => {
          // the translation being read, or the King James if that one
          // cannot be had just now
          let text = await wordsOf(translation, f).catch(() => "");
          if (!text && translation !== DEFAULT_TRANSLATION) {
            text = await wordsOf(DEFAULT_TRANSLATION, f).catch(() => "");
          }
          return text
            ? { bookNr: f.bookNr, chapter: f.chapter, verse: f.verse, end: f.end, why: f.why, text }
            : null;
        })
      );
      const kept = rows.filter((r): r is NonNullable<typeof r> => r !== null);
      setResults(kept);
      setSearchTotal(kept.length);
      setSearchedIn(translation);
      setFindNote(json.refused ? t("ask.refused") : (json.note ?? ""));
    } catch {
      setFindNote(t(navigator.onLine === false ? "ask.offline" : "ask.failed"));
    } finally {
      setSearching(false);
    }
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3 || searching) return;
    if (describing) {
      void runFind(q);
      return;
    }
    await searchWords(q, scope);
  };

  /** Search the words, in the books the filters allow. */
  const searchWords = async (q: string, within: SearchScope) => {
    const seq = ++searchSeq.current;
    const only = scopeBooks(within);
    setFoundByClaude(false);
    setFindNote("");
    setSearching(true);
    setResults([]);
    setSearchTotal(0);
    let found: { results: SearchResult[]; total: number; searchedIn: string };
    try {
      const res = await fetch(
        `/api/search?t=${translation}&q=${encodeURIComponent(q)}` +
          (only ? `&b=${booksParam(only)}` : "")
      );
      if (!res.ok) throw new Error("search failed");
      const json = (await res.json()) as {
        results: SearchResult[];
        total: number;
        searchedIn?: string;
      };
      found = { ...json, searchedIn: json.searchedIn ?? translation };
    } catch {
      // offline: scan the static book files already on this device
      try {
        found = await searchLocal(translation, q, only);
      } catch {
        found = { results: [], total: 0, searchedIn: "" };
      }
    }
    // a filter changed while this was out: the newer search answers instead
    if (seq !== searchSeq.current) return;
    setResults(found.results);
    setSearchTotal(found.total);
    setSearchedIn(found.searchedIn);
    setSearching(false);
  };

  /** A filter changed: results already showing are searched again within it. */
  const chooseScope = (next: SearchScope) => {
    setScope(next);
    const q = query.trim();
    if (results !== null && !foundByClaude && !describing && q.length >= 3) {
      void searchWords(q, next);
    }
  };

  const jumpTo = (r: SearchResult) => {
    setBackStack([]);
    setBookNr(r.bookNr);
    setChapter(r.chapter);
    setHighlightVerse(r.verse);
    setResults(null);
  };

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  /** The search bar. Lives in the control sheet, and again above a result
   *  list so a query can be refined without reopening the sheet. */
  const searchBar = (fromSheet: boolean) => (
    <>
      <form
        className="glass search-bar"
        onSubmit={(e) => {
          runSearch(e);
          if (fromSheet) {
            setPanelOpen(false);
            scrollToY(0);
          }
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(describing ? "find.placeholder" : "search.placeholder")}
          maxLength={describing ? 300 : 60}
          enterKeyHint="search"
        />
        {/* In the navigator the button is its icon alone: the panel is
            narrow, and a labelled button left the field too short to show
            what to type. Above the results there is room for the word. */}
        <button
          className={`btn btn-sm${fromSheet ? " search-go-icon" : ""}`}
          type="submit"
          disabled={query.trim().length < 3 || searching}
          aria-label={t("search.button")}
          title={t("search.button")}
        >
          <Icon name={describing ? "lamp" : "search"} />
          {!fromSheet && <> {t("search.button")}</>}
        </button>
      </form>
      {/* For the people with Ask: the words as they are, or a description
          for Claude to find passages from. The lamp is Ask's, as on Compare. */}
      {askable && (
        <div className="search-modes" role="radiogroup" aria-label={t("find.mode")}>
          <button
            type="button"
            role="radio"
            aria-checked={!findMode}
            className={`chip${!findMode ? " chip-active" : ""}`}
            onClick={() => chooseFindMode(false)}
          >
            <Icon name="search" /> {t("find.words")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={findMode}
            className={`chip${findMode ? " chip-active" : ""}`}
            onClick={() => chooseFindMode(true)}
          >
            <Icon name="lamp" /> {t("find.ask")}
          </button>
        </div>
      )}
      {/* the word search's filters; a description goes to Claude whole */}
      {!describing && <SearchScopeRow scope={scope} onChange={chooseScope} />}
    </>
  );

  /**
   * Which note the bookmark sheet is editing.
   *
   * A note belongs to a verse and a bookmark may hold a run, so the note is
   * the one on the verse the run starts at. Drawing the run longer does not
   * move what was written; it stays on the verse it was written about.
   */
  const bmNoteKey = bmSheet ? `${bmSheet.c}:${bmSheet.v}` : "";
  /** whether the verse the journal sheet is open on is kept */
  const sheetKept = !!bmSheet && !!bmKeyAt(bmSheet.c, bmSheet.v);

  /** Keep whatever has been written in the bookmark sheet, if anything has. */
  const saveSheetNote = () => {
    if (!bmSheet || sheetNote === null) return;
    commitNote(bmNoteKey, sheetNote);
    setSheetNote(null);
  };

  /**
   * The words of a verse, each knowing what original stands behind it.
   *
   * The King James is tagged, so its tokens are read straight off the file.
   * Every other translation is lined up against that tagging (see lib/align),
   * which costs a pass over one verse and is cached, since a verse is drawn
   * many times over as the reader scrolls, zooms and marks it.
   */
  const tokensFor = (ch: number, verse: number): AlignedToken[] | null => {
    const ref = `${ch}:${verse}`;
    // Cached whichever translation is open, not only the aligned ones: this
    // runs for every verse in the book on every render, and even the King
    // James's path allocates an array per verse without it.
    const key = `${translation}|${ref}`;
    const held = alignCache.current.get(key);
    if (held) return held;
    let made: AlignedToken[];
    if (translation === "kjv") {
      const tagged = strongsTokens?.[ref];
      if (!tagged) return null;
      made = kjvTokens(tagged);
    } else {
      /*
       * English only, and this guard is not a nicety.
       *
       * The evidence is the Berean's English wording, reduced to stems by
       * stripping everything that is not a-z — which quietly turns Spanish
       * into a near-miss of English. Measured across the whole Reina Valera:
       * 14,707 words underlined, and the commonest of them were "los" (1,197
       * times, matched to the stem of "loss"), "les" (from "less"), "son"
       * and "sin". Solid underlines, in the strongest style the app has, on
       * the Spanish for "the".
       *
       * Worse than wrong: a verse with one spurious match is a verse the
       * Original text chip no longer offers, because that chip appears only
       * where nothing at all matched. So 31% of Spanish verses were being
       * given a false reading INSTEAD of the true one.
       */
      if (!aligned) return null;
      if (!gloss || !glossVocab) return null;
      const entries = gloss[ref];
      const line = chDataOf(ch)?.verses.find((v) => v.verse === verse);
      if (!entries || !line) return null;
      made = alignVerse(line.text, entries, glossVocab);
    }
    alignCache.current.set(key, made);
    return made;
  };

  /* The Compare pop-up's body: one verse in every translation, and the
     licences that come with them. Named here because it goes in one of two
     places — on its own, or above Ask for the people who have it. */
  const compareBody = compareAt && (
    <>
      <div className="compare-list">
        {[
          ...TRANSLATIONS.filter((tr) => tr.id === translation),
          ...TRANSLATIONS.filter((tr) => tr.id !== translation),
        ].map((tr) => {
          const said = compareRows[tr.id];
          const inner = (
            <>
              <p className="compare-abbrev">
                {tr.abbrev}
                {tr.id === translation ? (
                  <span className="compare-here">
                    {t("reader.compareReading")}
                  </span>
                ) : (
                  typeof said === "string" && (
                    <span className="compare-go">
                      {t("reader.compareOpen")}
                    </span>
                  )
                )}
              </p>
              {said === undefined ? (
                <p className="skeleton">{t("common.loading")}</p>
              ) : said === null ? (
                <p className="cal-hint">{t("reader.compareMissing")}</p>
              ) : (
                <p className="compare-text">{said}</p>
              )}
            </>
          );
          /* A verse you can read is a door you can take: any row that
             is not the one you are reading closes the window and
             carries the reading itself into that translation, still
             standing on this verse. Rows with nothing to show stay
             plain — an empty room is not a destination. */
          return tr.id !== translation && typeof said === "string" ? (
            <button
              key={tr.id}
              type="button"
              className="compare-row compare-pick"
              onClick={() => {
                setChapter(compareAt.ch);
                setHighlightVerse(compareAt.v);
                setCompareAt(null);
                setTranslation(tr.id);
              }}
            >
              {inner}
            </button>
          ) : (
            <div
              key={tr.id}
              className={`compare-row${
                tr.id === translation ? " reading" : ""
              }`}
            >
              {inner}
            </div>
          );
        })}
      </div>
      {/* the licence for each borrowed translation follows its text
          wherever that text goes, and this is one of those places */}
      {TRANSLATIONS.filter((tr) => tr.notice && compareRows[tr.id]).map(
        (tr) => (
          <p key={tr.id} className="scripture-notice">
            {tr.notice}
          </p>
        )
      )}
    </>
  );

  return (
    <div className={panelOpen || concFor ? "reader-open" : undefined}>
      {results !== null && searchBar(false)}

      {results !== null && (
        <div className="search-results">
          <div className="search-results-head">
            <span>
              {foundByClaude
                ? searching
                  ? t("find.searching")
                  : searchTotal === 0
                    ? findNote || t("find.none")
                    : t("find.results", { count: String(searchTotal) })
                : searching
                  ? t("search.searching")
                  : searchTotal === 0
                    ? t("search.none")
                    : t("search.results", { count: String(searchTotal) }) +
                      (searchTotal > results.length
                        ? ` — ${t("search.limited", { count: String(results.length) })}`
                        : "")}
            </span>
            <button
              type="button"
              className="rsvp-btn"
              onClick={() => setResults(null)}
              aria-label={t("search.close")}
            >
              ✕
            </button>
          </div>
          {/* the search may have been answered by a different text than the
              one being read; say which, rather than let the wording look
              subtly wrong against the passage it opens */}
          {searchedIn && searchedIn !== translation && (
            <p className="cal-hint search-in">
              {t("search.searchedIn", {
                name: getTranslation(searchedIn)?.abbrev ?? searchedIn,
              })}
            </p>
          )}
          {!foundByClaude && scopeBooks(scope) && (
            <p className="cal-hint search-in">{t("search.within", { where: scopeName(scope) })}</p>
          )}
          {foundByClaude && !searching && searchTotal > 0 && findNote && (
            <p className="cal-hint search-in">{findNote}</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.bookNr}-${r.chapter}-${r.verse}`}
              type="button"
              className="glass search-result"
              onClick={() => jumpTo(r)}
            >
              <span className="ref">
                {bookNameOf(r.bookNr)} {r.chapter}:{r.verse}
                {r.end && r.end > r.verse ? `–${r.end}` : ""}
              </span>
              {r.why && <span className="search-why">{r.why}</span>}
              {/* a description has no words of its own to mark in the text */}
              <p>{r.why !== undefined ? r.text : highlight(r.text)}</p>
            </button>
          ))}
          {foundByClaude && !searching && (
            <p className="ask-hint search-credit">
              {t("find.credit")}
              {typeof askStatus.left === "number" && askStatus.left > 0 && (
                <> · {t("ask.left", { n: String(askStatus.left) })}</>
              )}
            </p>
          )}
        </div>
      )}

      {/* The note explaining what an underline means used to sit here, above
          the chapter, every time study mode was on in anything but the King
          James. It is a paragraph of small print between the reader and the
          first verse — read once, then in the way forever. It has moved to
          About, where it sits with the rest of what study mode offers. */}

      <div ref={readRef}>
        {loading && (
          <article className="scripture">
            <h2 className="chap-head" data-ch={chapter}>
              {bookName} {chapter}
              <span className="chap-trans">{transAbbrev}</span>
            </h2>
            <p className="skeleton">{t("reader.loading")}</p>
          </article>
        )}
        {error && !loading && (
          <article className="scripture">
            <p className="error-text">{t("reader.error")}</p>
          </article>
        )}
        {chapters.map(({ ch, verses }) => {
          const study = studyAt(ch); // this chapter, not the mode
          const prose = proseAt(ch);
          return (
          <article
            key={`${bookNr}-${ch}`}
            className={`scripture${study ? " study" : ""}`}
            style={{
              fontSize: `${pt}pt`,
              WebkitTextStrokeWidth: strokeOf(weight),
              fontFamily: faceStack(face),
            }}
          >
            {/* Prose sets its chapter number as the drop cap that opens it,
                the way a printed Bible does, so the heading above would only
                say it twice. It stays in the document all the same: jumping to
                a chapter scrolls to this, and it is the only thing that knows
                where a chapter starts. Empty, and no taller than nothing. */}
            {prose ? (
              <h2
                className={`chap-head${ch === 1 ? " book-title" : " chap-anchor"}`}
                data-ch={ch}
              >
                {ch === 1 && (
                  <>
                    {bookName}
                    <span className="chap-trans">{transAbbrev}</span>
                  </>
                )}
              </h2>
            ) : (
              <h2 className="chap-head" data-ch={ch}>
                {bookName} {ch}
                {/* the translation picker moved into the sheet, so the heading
                    carries which text you're actually reading */}
                <span className="chap-trans">{transAbbrev}</span>
              </h2>
            )}
            {study ? (
              <div className="study-verses">
                {verses.map((v) => {
                  const key = `${ch}:${v.verse}`;
                  const note = notes[key];
                  const tokens = tokensFor(ch, v.verse);
                  const title = headAt(ch, v.verse);
                  // One cursor for the whole verse: study mode hands it over a
                  // phrase at a time, and the count of words has to carry from
                  // one phrase to the next.
                  const red = redAt(ch, v.verse);
                  const cur: RedCursor = { word: 0 };
                  return (
                    <div
                      key={v.verse}
                      id={ch === chapter ? `v-${v.verse}` : undefined}
                      data-v={`${ch}:${v.verse}`}
                      className={`verse-block${
                        ch === chapter && highlightVerse === v.verse
                          ? " verse-highlight"
                          : ""
                      }`}
                    >
                      {stanzaMark(ch, v.verse)}
                      {title && <h3 className="section-head">{title}</h3>}
                      <p>
                        <sup className="verse-num">{v.verse}</sup>
                        {lineMark(ch, v.verse)}
                        {tokens && tokens.length > 0
                          ? tokens.map((tok, i) => {
                              if (!tok[1]) {
                                return (
                                  <span key={i}>
                                    {paintRed(tok[0], red, cur)}
                                  </span>
                                );
                              }
                              // keep leading spaces/punctuation outside the tap target
                              const m = tok[0].match(
                                /^([\s,;:.!?()'"—–-]*)([\s\S]*)$/
                              )!;
                              if (!m[2]) {
                                return (
                                  <span key={i}>
                                    {paintRed(tok[0], red, cur)}
                                  </span>
                                );
                              }
                              const sel =
                                wordSel &&
                                wordSel.ch === ch &&
                                wordSel.verse === v.verse &&
                                wordSel.text === m[2] &&
                                wordSel.nums.join() === tok[1].join();
                              return (
                                <span key={i}>
                                  {paintRed(m[1], red, cur)}
                                  <button
                                    type="button"
                                    className={`w${sel ? " sel" : ""}${
                                      tok[2] ? "" : " approx"
                                    }`}
                                    onClick={() =>
                                      openWord(ch, m[2], tok[1]!, v.verse, !tok[2])
                                    }
                                  >
                                    {paintRed(m[2], red, cur)}
                                  </button>
                                </span>
                              );
                            })
                          : paintRed(v.text, red, cur)}
                      </p>
                      <span className="xref-chips">
                        {ctxOf(ch) && (
                          <button
                            type="button"
                            className="xref-chip ctx-chip"
                            onClick={() => {
                              setPanelOpen(false);
                              setContextOpen(ch);
                            }}
                            aria-label={t("reader.context")}
                            title={t("reader.context")}
                          >
                            <Icon name="pin" /> {t("reader.context")}
                          </button>
                        )}
                        {/* Second, straight after Context, out of the way of
                            a right thumb starting a swipe. Journal, not
                            Bookmark: it opens the verse's page of the journal
                            — the bookmark, the note, the collection, the wall
                            — and changes nothing by being pressed. Lit when
                            the verse is kept or written on. */}
                        <button
                          type="button"
                          className={`xref-chip note-chip${
                            bmKeyAt(ch, v.verse) || notes[`${ch}:${v.verse}`]
                              ? " has-note"
                              : ""
                          }`}
                          onClick={() => openJournal(ch, v.verse)}
                          aria-haspopup="dialog"
                          aria-label={t("reader.journal")}
                          title={t("reader.journal")}
                        >
                          <Icon name="scroll" /> {t("reader.journal")}
                        </button>
                        {/* Context is the chapter; this is the passage —
                            what is going on here, then what somebody made of
                            it. */}
                        {(henryFor(ch, v.verse) ||
                          spurgeonFor(ch, v.verse)) && (
                          <button
                            type="button"
                            className="xref-chip mh-chip"
                            onClick={() => {
                              setPanelOpen(false);
                              setHenryOn([ch, v.verse]);
                            }}
                            aria-label={t("reader.commentary")}
                            title={t("reader.commentary")}
                          >
                            <Icon name="quote" /> {t("reader.commentary")}
                          </button>
                        )}
                        {/* Normally the underlined words are the way in, so
                            there is no chip. Where nothing could be matched
                            — the Spanish, or a verse worded far from the
                            evidence — the chip is what is left.

                            Two ways to have no words to tap, and they must
                            both count. A translation that is never aligned
                            has no tokens at all, and asking only whether the
                            tokens are empty would silently withhold the chip
                            from the one language that has nothing else. */}
                        {(!aligned ||
                          (tokens !== null &&
                            !tokens.some((tok) => tok[1]))) &&
                          originalsAt(ch, v.verse).length > 0 && (
                            <button
                              type="button"
                              className="xref-chip"
                              onClick={() => openVerseRefs(ch, v.verse)}
                              aria-label={t("reader.originals")}
                              title={t("reader.originals")}
                            >
                              <Icon name="letters" /> {t("reader.originals")}
                            </button>
                          )}
                        <button
                          type="button"
                          className="xref-chip"
                          onClick={() => openCompare(ch, v.verse)}
                          aria-label={t("reader.compare")}
                          title={t("reader.compare")}
                        >
                          {/* the lamp says Ask is inside, without a word */}
                          <Icon name={askStatus.allowed ? "lamp" : "books"} />{" "}
                          {t("reader.compare")}
                        </button>
                      </span>
                      {note && editingNote !== key && (
                        <div
                          className="verse-note"
                          onClick={() => startNote(key)}
                          role="button"
                          tabIndex={0}
                        >
                          {note}
                        </div>
                      )}
                      {editingNote === key && (
                        <div className="note-edit">
                          <textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder={t("reader.notePlaceholder")}
                            maxLength={NOTE_MAX}
                            rows={3}
                            autoFocus
                          />
                          <div className="note-actions">
                            <button
                              type="button"
                              className="rsvp-btn"
                              onClick={() => setEditingNote(null)}
                            >
                              {t("common.cancel")}
                            </button>
                            {/* empties the box without closing it, and
                                saving an empty box deletes the note */}
                            <button
                              type="button"
                              className="rsvp-btn"
                              onClick={() => setNoteDraft("")}
                              disabled={noteDraft.length === 0}
                            >
                              {t("reader.clearNote")}
                            </button>
                            <button
                              type="button"
                              className="rsvp-btn active"
                              onClick={() => saveNote(key)}
                            >
                              {t("common.save")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // A section per heading, and inside it a verse per line. The
              // verses used to run together inside one paragraph; a line each
              // is easier to find a reference in, and it gives the machinery
              // that holds the reader's place a real box to measure rather
              // than the union of an inline run's line boxes.
              prose ? (
                // Running prose: a paragraph to a section, verses inside it as
                // inline spans rather than as lines of their own. The spans
                // still carry data-v, which is what holds the reader's place,
                // marks a bookmark and answers a jump — an inline box reports
                // the top of its first line, which is the same question being
                // asked of a block.
                runsOf(ch, verses).map((run, i) => (
                  <div key={i} className="section">
                    {run.title && <h3 className="section-head">{run.title}</h3>}
                    {/* Verse is set as lines and prose as paragraphs, which is
                        what a printed Bible does and why the two are told
                        apart in the data. Isaiah is both, chapter by chapter. */}
                    {run.poetry ? (
                      run.verses.map((v) => {
                        const mark = markOf(ch, v.verse);
                        const opener = i === 0 && v.verse === run.verses[0].verse;
                        return (
                          <Fragment key={v.verse}>
                            {stanzaMark(ch, v.verse)}
                            <p
                              id={ch === chapter ? `v-${v.verse}` : undefined}
                              data-v={`${ch}:${v.verse}`}
                              className={`verse-line${
                                opener ? " chapter-opener" : ""
                              }${
                                ch === chapter && highlightVerse === v.verse
                                  ? " verse-highlight"
                                  : ""
                              }`}
                            >
                              {opener && (
                                <span className="chap-drop" aria-hidden="true">
                                  {ch}
                                </span>
                              )}
                              <sup className="verse-num">{v.verse}</sup>
                              {lineMark(ch, v.verse)}
                              {paintRed(v.text, redAt(ch, v.verse), { word: 0 })}
                              {mark && (
                                <sup className="verse-mark" title={mark}>
                                  <StudyStar />
                                </sup>
                              )}
                            </p>
                          </Fragment>
                        );
                      })
                    ) : (
                      <p className="prose">
                        {i === 0 && (
                          <span className="chap-drop" aria-hidden="true">
                            {ch}
                          </span>
                        )}
                        {run.verses.map((v) => {
                          const mark = markOf(ch, v.verse);
                          // the drop cap already says "1", twice as loudly
                          const numbered = !(i === 0 && v.verse === 1);
                          return (
                            <Fragment key={v.verse}>
                              <span
                                id={ch === chapter ? `v-${v.verse}` : undefined}
                                data-v={`${ch}:${v.verse}`}
                                className={`prose-v${
                                  ch === chapter && highlightVerse === v.verse
                                    ? " verse-highlight"
                                    : ""
                                }`}
                              >
                                {numbered && (
                                  <sup className="verse-num">{v.verse}</sup>
                                )}
                                {paintRed(v.text, redAt(ch, v.verse), {
                                  word: 0,
                                })}
                                {mark && (
                                  <sup className="verse-mark" title={mark}>
                                    <StudyStar />
                                  </sup>
                                )}
                              </span>{" "}
                            </Fragment>
                          );
                        })}
                      </p>
                    )}
                  </div>
                ))
              ) : (
              runsOf(ch, verses).map((run, i) => (
                <div key={i} className="section">
                  {run.title && <h3 className="section-head">{run.title}</h3>}
                  {run.verses.map((v) => {
                    const mark = markOf(ch, v.verse);
                    return (
                      <Fragment key={v.verse}>
                      {stanzaMark(ch, v.verse)}
                      <p
                        id={ch === chapter ? `v-${v.verse}` : undefined}
                        data-v={`${ch}:${v.verse}`}
                        className={`verse-line${
                          ch === chapter && highlightVerse === v.verse
                            ? " verse-highlight"
                            : ""
                        }`}
                      >
                        <sup className="verse-num">{v.verse}</sup>
                        {lineMark(ch, v.verse)}
                        {paintRed(v.text, redAt(ch, v.verse), { word: 0 })}
                        {mark && (
                          <sup className="verse-mark" title={mark}>
                            <StudyStar />
                          </sup>
                        )}
                      </p>
                      </Fragment>
                    );
                  })}
                </div>
              ))
              )
            )}
          </article>
          );
        })}

        {/* The notice the licence asks for, under the text it covers. Both
            publishers require it wherever their words appear, and Crossway
            requires the link with it. */}
        {getTranslation(translation)?.notice && (
          <p className="scripture-notice">
            {getTranslation(translation)!.notice}
            {getTranslation(translation)!.noticeHref && (
              <>
                {" "}
                <a
                  href={getTranslation(translation)!.noticeHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  {getTranslation(translation)!.noticeHref!.replace(
                    /^https?:\/\//,
                    ""
                  )}
                </a>
              </>
            )}
          </p>
        )}
      </div>

      <button
        type="button"
        className="glass chap-arrow chap-arrow-l"
        onClick={() => go(-1)}
        disabled={bookNr === 1 && viewChapter === 1}
        aria-label={t("reader.prev")}
        title={t("reader.prev")}
      >
        ‹
      </button>
      <button
        type="button"
        className="glass chap-arrow chap-arrow-r"
        onClick={() => go(1)}
        disabled={bookNr === 66 && viewChapter === book.chapters}
        aria-label={t("reader.next")}
        title={t("reader.next")}
      >
        ›
      </button>

      {/* The way to the reading controls from anywhere on the page: a small
          tab on the right edge, halfway up, that opens the panel and closes
          it again. It stays above the panel and its shade while the panel is
          open, so the tap that opened it is the tap that puts it away. */}
      <button
        type="button"
        className={`glass panel-tab${panelOpen ? " open" : ""}`}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen}
        aria-controls="reader-panel"
        aria-label={t(panelOpen ? "reader.closePanel" : "reader.openPanel")}
        title={t(panelOpen ? "reader.closePanel" : "reader.openPanel")}
      >
        {/* three upright lines above the icon and three below, a handle's
            grip, so the tab reads as something to take hold of */}
        <svg className="pt-grip" viewBox="0 0 8 10" aria-hidden="true">
          <path d="M1 1.5v7M4 1.5v7M7 1.5v7" />
        </svg>
        <Icon name={panelOpen ? "close" : "book"} />
        <svg className="pt-grip" viewBox="0 0 8 10" aria-hidden="true">
          <path d="M1 1.5v7M4 1.5v7M7 1.5v7" />
        </svg>
      </button>

      {pinchShow !== null && (
        <div className="glass pinch-hint" aria-hidden="true">
          {pinchShow} pt
        </div>
      )}

      {wordSel && (
        <div className="glass lex-sheet" role="dialog" aria-label={wordSel.text}>
          <div className="lex-head">
            <span className="lex-lemma">
              {wordSel.nums.length === 0
                ? `${bookName} ${wordSel.ch}:${wordSel.verse}`
                : (lexFor(wordSel.nums[0])?.lemma ?? wordSel.text)}
            </span>
            {wordSel.nums.length > 0 &&
              lexCounts?.[wordSel.nums[0]] !== undefined && (
              <button
                type="button"
                ref={concBtnRef}
                className="lex-count lex-count-btn"
                onClick={() => setConcFor(wordSel.nums[0])}
                title={t("reader.concOpen")}
              >
                {t("reader.foundVerses", {
                  count: String(lexCounts[wordSel.nums[0]]),
                })}{" "}
                →
              </button>
              )}
            <button
              type="button"
              className="lex-close"
              onClick={() => setWordSel(null)}
              aria-label={t("search.close")}
            >
              ✕
            </button>
          </div>
          {wordSel.nums.length === 0 &&
            originalsAt(wordSel.ch, wordSel.verse).length > 0 && (
              <div className="lex-originals">
                <p className="lex-meta">
                  <Icon name="letters" /> {t("reader.originals")}
                </p>
                <div className="xref-chips">
                  {originalsAt(wordSel.ch, wordSel.verse).map((o) => (
                    <button
                      key={o.num}
                      type="button"
                      className="xref-chip orig-chip"
                      onClick={() =>
                        openWord(wordSel.ch, o.word, [o.num], wordSel.verse)
                      }
                    >
                      <span className="orig-lemma">
                        {lexFor(o.num)?.lemma ?? o.num}
                      </span>
                      {o.word && <span className="orig-kjv">{o.word}</span>}
                    </button>
                  ))}
                </div>
                <p className="cal-hint orig-note">{t("reader.originalsNote")}</p>
              </div>
            )}
          {/* Said before anything else in the sheet, because everything after
              it is only as good as the match that got here. */}
          {wordSel.approx && (
            <p className="lex-approx cal-hint">
              <span className="approx-mark" aria-hidden>
                ∗
              </span>{" "}
              {t("reader.approxNote")}
            </p>
          )}
          {/* the verse's cross-references */}
          {refsAt(wordSel.ch, wordSel.verse).length > 0 && (
            <div className="lex-xrefs">
              <p className="lex-meta">
                <Icon name="link" /> {t("reader.crossRefs")}
                {wordSel.nums.length > 0 &&
                  ` · ${bookName} ${wordSel.ch}:${wordSel.verse}`}
              </p>
              <div className="xref-chips">
                {refsAt(wordSel.ch, wordSel.verse).map((ref, i) => (
                  <button
                    key={i}
                    type="button"
                    className="xref-chip"
                    onClick={() => {
                      setWordSel(null);
                      jumpToRef(wordSel.ch, ref, wordSel.verse);
                    }}
                  >
                    {refChipLabel(ref)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {wordSel.nums.length > 0 && (
          <>
          <div className="plan-filters lex-tabs">
            <button
              type="button"
              className={`chip${deepSource === "strongs" ? " chip-active" : ""}`}
              onClick={() => setDeepSource("strongs")}
            >
              {t("reader.srcStrongs")}
            </button>
            <button
              type="button"
              className={`chip${deepSource === "absmith" ? " chip-active" : ""}`}
              onClick={() => showDeep(wordSel.nums)}
            >
              {wordSel.nums[0].startsWith("H")
                ? t("reader.srcBdb")
                : t("reader.srcAbsmith")}
            </button>
          </div>
          <div className="lex-body">
            {deepSource === "absmith" ? (
              deepLoading > 0 ? (
                <p className="skeleton">{t("common.loading")}</p>
              ) : (
                wordSel.nums.map((num) => (
                  <div key={num} className="lex-entry">
                    {wordSel.nums.length > 1 && (
                      <p className="lex-sub-lemma">{lexFor(num)?.lemma}</p>
                    )}
                    {deep[num] ? (
                      <>
                        <p className="absmith-text">{deep[num].d}</p>
                        {deep[num].extra && (
                          <>
                            <p className="lex-meta absmith-divider">
                              {t("reader.srcBrief")}
                            </p>
                            <p className="absmith-text">{deep[num].extra}</p>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="cal-hint">{t("reader.srcMissing")}</p>
                    )}
                  </div>
                ))
              )
            ) : (
              wordSel.nums.map((num) => {
              const entry = lexFor(num);
              if (!entry) {
                return (
                  <p key={num} className="skeleton">
                    {t("common.loading")}
                  </p>
                );
              }
              return (
                <div key={num} className="lex-entry">
                  {wordSel.nums.length > 1 && (
                    <p className="lex-sub-lemma">{entry.lemma}</p>
                  )}
                  <p className="lex-meta">
                    [{entry.translit}]{entry.pron ? ` · ${entry.pron}` : ""} ·{" "}
                    {num}
                  </p>
                  {entry.gram && gramLabel(entry.gram) && (
                    <p className="lex-gram">{gramLabel(entry.gram)}</p>
                  )}
                  {entry.derivation && (
                    <p className="lex-derivation">{entry.derivation}</p>
                  )}
                  <p className="lex-def">{entry.def}</p>
                  {entry.kjv && (
                    <p className="lex-kjv">
                      <strong>KJV:</strong> {entry.kjv}
                    </p>
                  )}
                </div>
                );
              })
            )}
          </div>
          {/* icon over label, so Spanish fits too. Copy, the phone's own share
              sheet, and a note: sending it to somebody inside the app went with
              the Table and the Gatherings. */}
          <div className="lex-actions word-actions">
            <button type="button" className="btn btn-sm" onClick={copyWord}>
              <span className="wa-icon"><Icon name="clipboard" /></span>
              <span className="wa-label">{t("reader.copy")}</span>
            </button>
            <button type="button" className="btn btn-sm" onClick={shareWord}>
              <span className="wa-icon"><Icon name="share" /></span>
              <span className="wa-label">{t("discover.share")}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={saveWordNote}
              title={t("reader.saveToNote")}
            >
              <span className="wa-icon"><Icon name="note" /></span>
              <span className="wa-label">{t("reader.note")}</span>
            </button>
          </div>
          {wordAction && <p className="email-sent">✓ {wordAction}</p>}
          </>
          )}
        </div>
      )}

      {concFor && (
        <Concordance
          num={concFor}
          lemma={lexFor(concFor)?.lemma ?? ""}
          translit={lexFor(concFor)?.translit ?? ""}
          usage={lexFor(concFor)?.kjv ?? ""}
          onClose={() => {
            setConcFor(null);
            requestAnimationFrame(() => concBtnRef.current?.focus());
          }}
          onPick={(b, c, v) => {
            setConcFor(null);
            setPanelOpen(false);
            setWordSel(null);
            setBackStack((prev) =>
              [
                ...prev,
                {
                  b: bookNr,
                  c: wordSel?.ch ?? viewChapter,
                  v: wordSel?.verse ?? 1,
                },
              ].slice(-10)
            );
            setBookNr(b);
            setChapter(c);
            setHighlightVerse(v);
          }}
        />
      )}

      {bmSheet !== null && (
        <div
          className="glass lex-sheet bm-sheet"
          role="dialog"
          aria-label={t("reader.journal")}
        >
          <div className="lex-head">
            <span className="lex-lemma bm-sheet-title">
              <Icon name="scroll" />{" "}
              {bmRefLabel(bookName, {
                b: bookNr,
                c: bmSheet.c,
                v: bmSheet.v,
                end: bmSheet.end,
              })}
            </span>
            {/* Keeping the verse: a toggle in plain sight at the top of the
                sheet, filled when it is kept, beside the way out. */}
            <button
              type="button"
              className={`lex-close bm-toggle${sheetKept ? " on" : ""}`}
              onClick={() => toggleBookmark(bmSheet.c, bmSheet.v, bmSheet.end)}
              aria-pressed={sheetKept}
              aria-label={t(
                sheetKept ? "reader.removeBookmark" : "reader.bookmarkToggle"
              )}
              title={t(
                sheetKept ? "reader.removeBookmark" : "reader.bookmarkToggle"
              )}
            >
              <Icon name="bookmark" filled={sheetKept} />
            </button>
            <button
              type="button"
              className="lex-close"
              onClick={() => {
                saveSheetNote();
                setBmSheet(null);
              }}
              aria-label={t("search.close")}
            >
              ✕
            </button>
          </div>
          {/* A sentence rarely ends where a verse does. The run starts at the
              verse that was pressed and can be drawn out to the end of the
              chapter — no further, because a reference that crossed into the
              next chapter would need two chapter numbers to say so. */}
          <div className="pref-row bm-through">
            <span>{t("reader.bmThrough")}</span>
            <select
              value={bmSheet.end}
              aria-label={t("reader.bmThrough")}
              onChange={(e) => {
                // a kept run is redrawn; one not kept is only what the sheet
                // shares, hangs and would keep, so choosing it keeps nothing
                const end = Number(e.target.value);
                if (sheetKept) setBookmarkEnd(bmSheet.c, bmSheet.v, end);
                else setBmSheet({ ...bmSheet, end });
              }}
            >
              {(chDataOf(bmSheet.c)?.verses ?? [])
                .filter((x) => x.verse >= bmSheet.v)
                .map((x) => (
                  <option key={x.verse} value={x.verse}>
                    {x.verse === bmSheet.v
                      ? t("reader.bmThisVerse")
                      : `${bmSheet.c}:${x.verse}`}
                  </option>
                ))}
            </select>
          </div>
          {/* Keeping a verse and writing on it are one sheet. The note is the
              first thing under the reference because it is usually what the
              sheet was opened for; the filing can wait. It saves on its own, so
              leaving the sheet by any route keeps what was written. */}
          <p className="cal-label">{t("reader.note")}</p>
          <textarea
            className="bm-note"
            value={sheetNote ?? notes[bmNoteKey] ?? ""}
            placeholder={t("reader.notePlaceholder")}
            maxLength={NOTE_MAX}
            rows={3}
            onChange={(e) => setSheetNote(e.target.value)}
            onBlur={saveSheetNote}
          />
          <p className="cal-label">{t("reader.addToCollection")}</p>
          <div className="chips bm-coll-chips">
            {Object.entries(collections).map(([id, coll]) => {
              const key = bmKeyOf(bookNr, bmSheet.c, bmSheet.v, bmSheet.end);
              const active = bookmarks[key]?.c === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`chip${active ? " chip-active" : ""}`}
                  onClick={() => {
                    updateBookmark(key, { coll: active ? "" : id });
                    setBmSheetMsg(
                      active ? "" : t("reader.addedTo", { name: coll.name })
                    );
                  }}
                >
                  <Icon name="collection" /> {coll.name}
                  {active && " ✓"}
                </button>
              );
            })}
          </div>
          <div className="coll-new">
            <input
              value={bmSheetColl}
              onChange={(e) => setBmSheetColl(e.target.value)}
              placeholder={t("reader.newCollection")}
              maxLength={80}
              onKeyDown={async (e) => {
                if (e.key !== "Enter" || !bmSheetColl.trim()) return;
                const name = bmSheetColl.trim();
                const id = await createCollectionNamed(name);
                setBmSheetColl("");
                if (id) {
                  updateBookmark(bmKeyOf(bookNr, bmSheet.c, bmSheet.v, bmSheet.end), {
                    coll: id,
                  });
                  setBmSheetMsg(t("reader.addedTo", { name }));
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={!bmSheetColl.trim()}
              onClick={async () => {
                const name = bmSheetColl.trim();
                const id = await createCollectionNamed(name);
                setBmSheetColl("");
                if (id) {
                  updateBookmark(bmKeyOf(bookNr, bmSheet.c, bmSheet.v, bmSheet.end), {
                    coll: id,
                  });
                  setBmSheetMsg(t("reader.addedTo", { name }));
                }
              }}
            >
              ＋
            </button>
          </div>
          {bmSheetMsg && <p className="email-sent">✓ {bmSheetMsg}</p>}
          <div className="lex-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                saveSheetNote();
                shareVerse(bmSheet.c, bmSheet.v, bmSheet.end);
              }}
            >
              <Icon name="share" /> {t("discover.share")}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setBmSheet(null);
                setBookmarksOpen(true);
              }}
            >
              <Icon name="bookmark" /> {t("reader.bookmarks")}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                saveSheetNote();
                setBmSheet(null);
              }}
            >
              {t("common.done")}
            </button>
          </div>
        </div>
      )}

      {/* One verse, every translation the app has. The one being read comes
          first and is marked as such — the question is always "against what
          I am reading", and an alphabetical list would make the reader hunt
          for their own place in it. */}
      {compareAt !== null && (
        <div
          className="modal-overlay"
          onClick={() => setCompareAt(null)}
          role="presentation"
        >
          <div
            className={`glass modal compare-modal${
              askStatus.allowed ? " asking" : ""
            }`}
            role="dialog"
            aria-label={t("reader.compare")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lex-head">
              <span className="lex-lemma">
                <Icon name="books" /> {bookName} {compareAt.ch}:{compareAt.v}
              </span>
              <button
                type="button"
                className="lex-close"
                onClick={() => setCompareAt(null)}
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>
            {askStatus.allowed ? (
              <AskVerse
                key={`${bookNr}:${compareAt.ch}:${compareAt.v}`}
                bookNr={bookNr}
                ch={compareAt.ch}
                v={compareAt.v}
                translation={translation}
                texts={Object.fromEntries(
                  Object.entries(compareRows).filter(
                    (row): row is [string, string] => typeof row[1] === "string"
                  )
                )}
                status={askStatus}
                onStatus={setAskStatus}
                note={notes[`${compareAt.ch}:${compareAt.v}`]}
                onSaveNote={(text) =>
                  commitNote(`${compareAt.ch}:${compareAt.v}`, text)
                }
              >
                {compareBody}
              </AskVerse>
            ) : (
              <>
                {compareBody}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setCompareAt(null)}
                  >
                    {t("common.done")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {backStack.length > 0 ? (
        <button type="button" className="glass back-pill" onClick={goBack}>
          <Icon name="back" />
          {t("reader.backTo", {
            ref: `${bookNameOf(backStack[backStack.length - 1].b)} ${
              backStack[backStack.length - 1].c
            }:${backStack[backStack.length - 1].v}`,
          })}
        </button>
      ) : (
        /* Only with the cross-reference stack empty. A reader following a
           chain of references wants the step back before the way out, and two
           pills in the same place would be one pill too many. */
        cameFrom === "talk" && (
          <Link className="glass back-pill" href="/">
            <Icon name="back" />
            {t("reader.backToTalk")}
          </Link>
        )
      )}

      {bookmarksOpen && (
        <div className="modal-overlay" onClick={() => setBookmarksOpen(false)}>
          <div className="glass modal" onClick={(e) => e.stopPropagation()}>
            <h2><Icon name="bookmark" /> {t("reader.bookmarks")}</h2>
            {Object.keys(bookmarks).length === 0 ? (
              <p className="notice">{t("reader.bookmarksEmpty")}</p>
            ) : (
              <div className="bookmark-list">
                {[
                  ...Object.entries(collections)
                    .map(([id, coll]) => ({ id, name: coll.name }))
                    // the seeded gospel track leads (see lib/defaultCollections)
                    .sort((a, b) =>
                      a.id === "gospel" ? -1 : b.id === "gospel" ? 1 : 0
                    ),
                  { id: "", name: t("reader.unsorted") },
                ].map((group) => {
                  const rows = Object.entries(bookmarks)
                    .filter(([, e]) => (e.c ?? "") === group.id)
                    .sort((a, b) => b[1].t - a[1].t);
                  if (group.id === "" && rows.length === 0) return null;
                  return (
                    <div key={group.id || "unsorted"} className="coll-group">
                      <div className="coll-head">
                        <strong>
                          <Icon name={group.id ? "collection" : "bookmark"} /> {group.name}
                        </strong>
                        <span className="coll-tools">
                          {group.id && (
                            <>
                              <button
                                type="button"
                                className="chip-remove"
                                aria-label={t("reader.deleteCollection")}
                                title={t("reader.deleteCollection")}
                                onClick={() => deleteCollection(group.id)}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      {group.id === "gospel" && rows.length > 0 && (
                        <p className="cal-hint">{t("reader.gospelTrack")}</p>
                      )}
                      {rows.length === 0 ? (
                        <p className="cal-hint">{t("reader.collEmpty")}</p>
                      ) : (
                        rows.map(([key, entry]) => {
                          const ref = parseBmKey(key);
                          if (!ref) return null;
                          return (
                            <div key={key} className="bookmark-row">
                              <button
                                type="button"
                                className="bookmark-jump"
                                onClick={() => jumpToBookmark(key)}
                              >
                                <Icon name="book" /> {bmRefLabel(bookNameOf(ref.b), ref)}
                                {entry.l && (
                                  <span className="bm-label">{entry.l}</span>
                                )}
                              </button>
                              <button
                                type="button"
                                className="rsvp-btn"
                                aria-label={t("reader.editLabel")}
                                title={t("reader.editLabel")}
                                onClick={() => {
                                  setEditingBm(editingBm === key ? null : key);
                                  setBmLabelDraft(entry.l ?? "");
                                }}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="chip-remove"
                                aria-label={t("reader.removeBookmark")}
                                title={t("reader.removeBookmark")}
                                onClick={() => {
                                  const where = bmRefLabel(
                                    bookNameOf(ref.b),
                                    ref
                                  );
                                  if (
                                    !window.confirm(
                                      t("reader.removeBookmarkConfirm", {
                                        ref: where,
                                      })
                                    )
                                  ) {
                                    return;
                                  }
                                  const next = { ...bookmarks };
                                  delete next[key];
                                  setBookmarks(next);
                                  void writeLocalState({ bookmarks: next });
                                  void enqueue({
                                    kind: "bookmark.del",
                                    key,
                                    ts: Date.now(),
                                  });
                                }}
                              >
                                ✕
                              </button>
                              {editingBm === key && (
                                <div className="bm-edit">
                                  <input
                                    value={bmLabelDraft}
                                    onChange={(e) =>
                                      setBmLabelDraft(e.target.value)
                                    }
                                    placeholder={t("reader.labelPlaceholder")}
                                    maxLength={120}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        updateBookmark(key, {
                                          label: bmLabelDraft,
                                        });
                                        setEditingBm(null);
                                      }
                                    }}
                                  />
                                  <select
                                    value={
                                      newCollFor === key
                                        ? "__new"
                                        : (entry.c ?? "")
                                    }
                                    onChange={(e) => {
                                      if (e.target.value === "__new") {
                                        setNewCollFor(key);
                                        setNewCollDraft("");
                                        return;
                                      }
                                      setNewCollFor(null);
                                      updateBookmark(key, {
                                        coll: e.target.value,
                                      });
                                    }}
                                  >
                                    <option value="">
                                      {t("reader.unsorted")}
                                    </option>
                                    {Object.entries(collections).map(
                                      ([id, coll]) => (
                                        <option key={id} value={id}>
                                          {coll.name}
                                        </option>
                                      )
                                    )}
                                    <option value="__new">
                                      ＋ {t("reader.newCollectionShort")}
                                    </option>
                                  </select>
                                  <button
                                    type="button"
                                    className="rsvp-btn active"
                                    onClick={() => {
                                      updateBookmark(key, {
                                        label: bmLabelDraft,
                                      });
                                      setEditingBm(null);
                                      setNewCollFor(null);
                                    }}
                                  >
                                    {t("common.save")}
                                  </button>
                                </div>
                              )}
                              {editingBm === key && newCollFor === key && (
                                <div className="bm-edit">
                                  <input
                                    value={newCollDraft}
                                    onChange={(e) =>
                                      setNewCollDraft(e.target.value)
                                    }
                                    placeholder={t("reader.newCollection")}
                                    maxLength={80}
                                    autoFocus
                                    onKeyDown={async (e) => {
                                      if (
                                        e.key !== "Enter" ||
                                        !newCollDraft.trim()
                                      )
                                        return;
                                      const id = await createCollectionNamed(
                                        newCollDraft.trim()
                                      );
                                      setNewCollDraft("");
                                      setNewCollFor(null);
                                      if (id) updateBookmark(key, { coll: id });
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="rsvp-btn active"
                                    disabled={!newCollDraft.trim()}
                                    onClick={async () => {
                                      const id = await createCollectionNamed(
                                        newCollDraft.trim()
                                      );
                                      setNewCollDraft("");
                                      setNewCollFor(null);
                                      if (id) updateBookmark(key, { coll: id });
                                    }}
                                  >
                                    ＋ {t("common.save")}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setBookmarksOpen(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextOpen !== null && ctxOf(contextOpen) && (
        <div className="modal-overlay" onClick={() => setContextOpen(null)}>
          <div
            className="glass modal ctx-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* The way out sits in the heading, as it does on the commentary,
                and the heading stays put while the rest scrolls under it: a
                Cancel at the foot was a button you had to read past the map
                and both readings to find. */}
            <div className="mh-head">
              <h2>
                <Icon name="pin" /> {bookName} {contextOpen} — {t("reader.context")}
              </h2>
              <button
                type="button"
                className="lex-close"
                onClick={() => setContextOpen(null)}
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>
            <div className="ctx-body">
              {/* Where before what, because a reader who does not know the
                  land reads the setting as a list of names. The map draws
                  itself only for the chapters that name somewhere — a little
                  over two in three — and is simply absent from the rest. */}
              <ChapterMap
                bookNr={bookNr}
                chapter={contextOpen}
                onGoToVerse={(verse) => {
                  setContextOpen(null);
                  setChapter(contextOpen);
                  setHighlightVerse(verse);
                }}
                onGoToRef={(ref, fromVerse) => {
                  setContextOpen(null);
                  // with the way back, as a cross-reference has
                  jumpToRef(contextOpen, ref, fromVerse);
                }}
              />
              {/* What the chapter builds or handles, drawn: the Tabernacle in
                  Exodus, the Temple in Kings, a house's roof in Mark 2. Only
                  the chapters that have any show the row. */}
              <StudyPictures bookNr={bookNr} chapter={contextOpen} />
              <div className="ctx-section">
                <h3><Icon name="jar" /> {t("reader.ctxPractical")}</h3>
                <p>{ctxOf(contextOpen)!.practical}</p>
              </div>
              <div className="ctx-section">
                <h3><Icon name="sparkle" /> {t("reader.ctxSpiritual")}</h3>
                <p>{ctxOf(contextOpen)!.spiritual}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Matthew Henry on the passage this verse sits in. */}
      {henryOn !== null &&
        (henryFor(henryOn[0], henryOn[1]) ||
          spurgeonFor(henryOn[0], henryOn[1])) && (
        <div className="modal-overlay" onClick={() => setHenryOn(null)}>
          <div
            className={`glass modal${askStatus.allowed ? " asking" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const sec = henryFor(henryOn[0], henryOn[1]);
              const spur = spurgeonFor(henryOn[0], henryOn[1]);
              const shown = sec ?? spur?.exposition ?? null;
              const span =
                !shown || shown.to === undefined
                  ? `${henryOn[0]}:${henryOn[1]}`
                  : shown.from === shown.to
                    ? `${henryOn[0]}:${shown.from}`
                    : `${henryOn[0]}:${shown.from}-${shown.to}`;
              const commentary = (
                <>
                  <div className="mh-body">
                    {/* Henry first, then Spurgeon. One panel rather than two
                        chips: in the Psalms both have something to say about
                        the same verse, and which of them you want is not a
                        decision worth making before you have read either. */}
                    {sec && (
                      <section className="mh-voice">
                        <p className="mh-by">{t("reader.byHenry")}</p>
                        {sec.title && <p className="mh-title">{sec.title}</p>}
                        {intoParagraphs(sec.text).map((para, n) => (
                          <p key={`h${n}`}>{para}</p>
                        ))}
                      </section>
                    )}
                    {spur && (
                      <section className="mh-voice">
                        <p className="mh-by">{t("reader.bySpurgeon")}</p>
                        {/* The overview introduces the whole psalm, so it
                            belongs at its opening and nowhere else — repeated
                            under every verse it would be something to scroll
                            past a hundred and seventy-six times. */}
                        {spur.overview && shown?.from === 1 && (
                          <div className="mh-overview">
                            {intoParagraphs(spur.overview).map((para, n) => (
                              <p key={`o${n}`}>{para}</p>
                            ))}
                          </div>
                        )}
                        {spur.exposition &&
                          intoParagraphs(spur.exposition.text).map((para, n) => (
                            <p key={`s${n}`}>{para}</p>
                          ))}
                        {spur.hints.length > 0 && (
                          <div className="mh-hints">
                            <p className="mh-by">{t("reader.spurgeonHints")}</p>
                            {spur.hints.map((h, n) => (
                              <p key={`t${n}`}>{h.text}</p>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                  {/* Name only whoever is actually on the screen. */}
                  {sec && <p className="mh-who">{t("reader.commentaryWho")}</p>}
                  {spur && <p className="mh-who">{t("reader.spurgeonWho")}</p>}
                </>
              );
              return (
                <>
                  {/* The close sits in the heading, not under the text.
                      This panel is a long read that scrolls inside itself, so
                      a button at the foot is a button you have to reach the
                      end of Henry to find. */}
                  <div className="mh-head">
                    <h2>
                      <Icon name="quote" />{" "}
                      {t("reader.commentaryOn", { ref: `${bookName} ${span}` })}
                    </h2>
                    <button
                      type="button"
                      className="lex-close"
                      onClick={() => setHenryOn(null)}
                      aria-label={t("common.close")}
                    >
                      ✕
                    </button>
                  </div>
                  {askStatus.allowed ? (
                    /* The scholars can be asked, under what two of them
                       actually wrote. Henry's words go with a question put to
                       Henry, and Spurgeon's with one put to Spurgeon; the
                       others answer from what is known of them. */
                    <AskVerse
                      key={`${bookNr}:${henryOn[0]}:${henryOn[1]}`}
                      bookNr={bookNr}
                      ch={henryOn[0]}
                      v={henryOn[1]}
                      translation={translation}
                      texts={(() => {
                        const line = chDataOf(henryOn[0])?.verses.find(
                          (x) => x.verse === henryOn[1]
                        );
                        return line ? { [translation]: line.text } : {};
                      })()}
                      status={askStatus}
                      onStatus={setAskStatus}
                      note={notes[`${henryOn[0]}:${henryOn[1]}`]}
                      onSaveNote={(text) =>
                        commitNote(`${henryOn[0]}:${henryOn[1]}`, text)
                      }
                      scholars={{
                        first: sec ? "henry" : "spurgeon",
                        sources: {
                          henry: sec
                            ? [sec.title, sec.text].filter(Boolean).join("\n\n")
                            : undefined,
                          spurgeon: spur?.exposition?.text,
                        },
                      }}
                    >
                      {commentary}
                    </AskVerse>
                  ) : (
                    commentary
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Everything that used to sit above the scripture, opened from the
          passage chip: a panel that folds out from the edge of the page. */}
      {panelOpen && (
        <>
          <div
            className="panel-scrim"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <div
            id="reader-panel"
            ref={sheetRef}
            tabIndex={-1}
            className="glass side-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("reader.panel")}
          >
            <div className="sp-head">
              <span className="sp-where">
                <Icon name="book" /> {bookName} {viewChapter}
              </span>
              {/* Dark, grey, light. It is on every other tab's header and was
                  on none of this one's, because The Word's header is kept for
                  the passage and study mode — but the reader who wants it is
                  the one reading in bed, and they should not have to leave the
                  chapter to reach it. */}
              <ThemeToggle className="sp-icon-btn" />
              {/* Study mode, reachable from the panel too: on a phone the
                  header star is small and far from the thumb. */}
              <button
                type="button"
                role="switch"
                aria-checked={study}
                className={`sp-icon-btn sp-study${study ? " on" : ""}`}
                onClick={toggleStudy}
                aria-label={t("reader.study")}
                title={t("reader.study")}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 1.4c.62 5.98 4.6 9.96 10.6 10.6-6 .62-9.98 4.6-10.6 10.6-.62-6-4.6-9.98-10.6-10.6C7.4 11.36 11.38 7.38 12 1.4Z"
                  />
                </svg>
                <span className="sp-study-label">{t("reader.study")}</span>
              </button>
              {/* No close button of its own: the tab on the page's right edge
                  that opened the panel closes it, and so do a tap on the
                  shade beside it and Escape. */}
            </div>

            {/* pinned: search, translation and bookmarks stay put while the
                book list scrolls under them. The search is always out, at the
                top: it used to fold away behind an icon in the row above, and
                the way to find a passage should not need finding itself. It
                does not take the focus when the panel opens, though: that
                would raise the keyboard over the books every time. */}
            <div className="sp-fixed">
              <div className="sp-pad">{searchBar(true)}</div>
              <div className="sp-pad sp-top">
                <select
                  className="sp-trans"
                  aria-label={t("reader.translation")}
                  value={translation}
                  onChange={(e) => {
                    // reloading rebases on `chapter`; keep the reader on the
                    // chapter you were actually reading
                    setChapter(viewChapter);
                    setTranslation(e.target.value);
                  }}
                >
                  {TRANSLATIONS.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.abbrev} — {tr.name}
                    </option>
                  ))}
                </select>
                {/* In plain mode too, and in the same seat: what you have
                    kept is worth reaching whether or not the tools are out,
                    and a button that moves house between modes is a button
                    that has to be found twice. */}
                <button
                  type="button"
                  className="btn btn-sm sp-bm"
                  onClick={() => {
                    setPanelOpen(false);
                    setBookmarksOpen(true);
                  }}
                >
                  <Icon name="bookmark" />
                  {Object.keys(bookmarks).length > 0 &&
                    ` ${Object.keys(bookmarks).length}`}
                </button>
              </div>
            </div>

            <div className="sp-body">
              <BookNav
                bookNr={bookNr}
                chapter={viewChapter}
                translation={translation}
                // A chapter moves the reader but leaves the panel standing,
                // because the verses for that chapter open underneath it and
                // there would be nothing to pick from otherwise. Anyone who
                // only wanted the chapter is already there; the scrim
                // dismisses.
                onChapter={(b, c) => {
                  if (b === bookNr) {
                    jumpChapter(c);
                    return;
                  }
                  setHighlightVerse(null);
                  setBackStack([]);
                  setBookNr(b);
                  setChapter(c);
                }}
                onVerse={(b, c, v) => {
                  setPanelOpen(false);
                  setBackStack([]);
                  if (b !== bookNr) setBookNr(b);
                  // the v-N anchors only exist on the open chapter, so this
                  // has to land before the highlight is asked to find one
                  setChapter(c);
                  setHighlightVerse(v);
                  pushVisit(b, c, v);
                }}
              />

              {/* The same two sliders as Settings, here where the page
                  behind them shows what they do. On every screen: a phone can
                  also pinch, but a pinch is no way to set the weight. */}
              <div className="sp-pad sp-prefs">
                <ReadingSliders
                  pt={pt}
                  weight={weight}
                  onPt={resize}
                  onWeight={(next) => {
                    setWeight(next);
                    writeTextWeight(next);
                  }}
                />
                <p className="cal-hint pinch-tip">{t("reader.pinchHint")}</p>
              </div>


              {/* The typeface too, at the foot of the panel, the same picker
                  as Settings. The page switches the way it does on opening:
                  once the face's file is here, with the verse being read held
                  where it is. A quicker second pick wins over a slow first. */}
              <div className="sp-pad sp-prefs">
                <TypefacePicker
                  face={pickedFace}
                  onFace={(next) => {
                    setPickedFace(next);
                    pickedFaceRef.current = next;
                    writeTextFace(next);
                    void faceReady(next).then(() => {
                      if (pickedFaceRef.current !== next) return;
                      holdVerse();
                      setFace(next);
                    });
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
