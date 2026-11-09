"use client";

// The Word inside Barnabas: Communion's reader, with what Communion's root
// layout and header gave it.
//
// Communion wrapped every page in its language and reading providers, put a
// fixed header above a single scrolling element (#app-scroll, see
// lib/scroller), and kept the passage chip and the study star in that header.
// Here all of that lives inside one .word-root element, which is also where
// The Word's scoped stylesheet (src/app/word/word.css) and its theme apply.

import { useEffect, useLayoutEffect, useRef } from "react";
import Reader from "@/components/Reader";
import { getBook } from "@/lib/bible";
import { LanguageProvider, useI18n } from "@/lib/i18n";
import { ReadingProvider, useReading } from "@/lib/reading";
import { readLocal } from "@/lib/storage";

/**
 * The saved theme, applied before paint. Communion's default is grey; "dark"
 * is no attribute at all. Storage can throw where it is blocked, and then the
 * default stands.
 */
const THEME_BOOT =
  '(function(){var r=document.currentScript&&document.currentScript.parentElement;if(!r)return;var t;try{t=localStorage.getItem("barnabas.word.theme")}catch(e){t=null}if(t!=="dark"&&t!=="light")t="grey";if(t==="dark")delete r.dataset.theme;else r.dataset.theme=t})()';

export interface WordAppProps {
  initialBook?: number;
  initialChapter?: number;
  initialVerse?: number;
  initialFrom?: "talk";
}

export default function WordApp(props: WordAppProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The boot script only runs on a full page load; arriving from another
  // Barnabas page is a client navigation, so the theme is applied here too.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let saved: string | null = null;
    try {
      saved = readLocal("barnabas.word.theme");
    } catch {
      saved = null;
    }
    const theme = saved === "dark" || saved === "light" ? saved : "grey";
    if (theme === "dark") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, []);

  // The reader scrolls inside itself, so it is exactly as tall as the room
  // between Barnabas's header and its tab bar (the bar shows on phones only).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () => {
      const top = root.getBoundingClientRect().top + window.scrollY;
      const bar = document.querySelector<HTMLElement>(".tabbar");
      const below = bar && getComputedStyle(bar).display !== "none" ? bar.offsetHeight : 0;
      root.style.setProperty("--word-h", `${Math.max(320, window.innerHeight - top - below)}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    // suppressHydrationWarning: the boot script may change data-theme before
    // React hydrates, and the attribute is the script's to own
    <div ref={rootRef} className="word-root" data-theme="grey" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <LanguageProvider>
        <ReadingProvider>
          <div className="bg-scene" aria-hidden />
          <WordToolbar />
          <div id="app-scroll" className="app-scroll">
            <div className="page">
              <Reader {...props} />
            </div>
          </div>
        </ReadingProvider>
      </LanguageProvider>
    </div>
  );
}

/**
 * The passage chip and the study star, which Communion kept in its header
 * (components/Nav). The chip opens the reader's navigator; the star turns
 * study mode on and off. Both talk to the reader through ReadingProvider.
 */
function WordToolbar() {
  const { lang, t } = useI18n();
  const { position, panelOpen, setPanelOpen, study, toggleStudy } = useReading();
  const chipRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // closing the navigator hands focus back to the chip that opened it —
  // unless it closed to hand off to another dialog, which owns focus
  useEffect(() => {
    if (wasOpen.current && !panelOpen) {
      if (!document.querySelector(".word-root .modal-overlay, .word-root .lex-sheet, .word-root .side-panel")) {
        chipRef.current?.focus();
      }
    }
    wasOpen.current = panelOpen;
  }, [panelOpen]);

  const book = position ? getBook(position.bookNr) : undefined;
  const bookName = book ? (lang === "es" ? book.es : book.en) : "";

  return (
    <div className="word-toolbar">
      <div className="word-toolbar-inner">
        <span className="word-title">The Word</span>
        {position && book ? (
          <button
            type="button"
            ref={chipRef}
            className={`nav-passage${panelOpen ? " pn-open" : ""}`}
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
            aria-haspopup="dialog"
            aria-controls="reader-panel"
            title={`${bookName} ${position.chapter} — ${t("reader.openControls")}`}
          >
            <span className="pn-name">{bookName}</span>
            <span className="pn-tail">
              {position.chapter}
              <span className="pn-caret" aria-hidden>
                ⌄
              </span>
            </span>
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          role="switch"
          aria-checked={study}
          className={`theme-toggle study-toggle${study ? " on" : ""}`}
          onClick={toggleStudy}
          aria-label={t("reader.study")}
          title={t("reader.study")}
        >
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 1.4c.62 5.98 4.6 9.96 10.6 10.6-6 .62-9.98 4.6-10.6 10.6-.62-6-4.6-9.98-10.6-10.6C7.4 11.36 11.38 7.38 12 1.4Z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
