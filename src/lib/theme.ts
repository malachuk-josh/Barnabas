"use client";

// Which theme is on, read from the page itself and kept in step with it.
//
// Two controls change the theme — the button in the header and the three in
// Settings — and each used to read the page once, when it appeared. Change it
// with one and the other went on showing the theme from before, so the header
// button could picture the theme you were already in. The page's own
// attribute is the one answer both can watch.
//
// In Barnabas the attribute lives on The Word's own wrapper (.word-root), not
// on <html>: the reader's themes must not reach the rest of the app.

import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "grey";

/** Where The Word's theme and CSS variables live. */
export const WORD_ROOT = ".word-root";

/** The Word's wrapper element, or <html> if it is not mounted. */
export function wordRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>(WORD_ROOT) ?? document.documentElement
  );
}

function read(): Theme {
  const current = wordRoot().dataset.theme;
  return current === "light" || current === "grey" ? current : "dark";
}

export function useDocumentTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(read());
    const watch = new MutationObserver(() => setTheme(read()));
    watch.observe(wordRoot(), {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => watch.disconnect();
  }, []);
  return theme;
}

/**
 * Where The Word's pop-ups are portalled. Communion portalled to <body>; here
 * that would put them outside .word-root and so outside its scoped styles.
 */
export function wordPortal(): HTMLElement {
  return document.querySelector<HTMLElement>(WORD_ROOT) ?? document.body;
}
