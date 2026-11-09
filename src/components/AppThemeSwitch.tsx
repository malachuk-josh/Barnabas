"use client";

import { useEffect, useState } from "react";

/** Saved choice: "light" or "dark". With nothing saved, Barnabas follows the device. */
export const THEME_KEY = "barnabas.theme";

/** Runs before paint (in the layout) so a saved choice never flashes the other theme first. */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

type Mode = "light" | "dark";

function current(): Mode {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const Sun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
);

/** Light/dark switch. The icon shows where a tap takes you: a sun in dark mode, a moon in light mode. */
export function AppThemeSwitch() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    setMode(current());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => setMode(current());
    mq.addEventListener("change", follow);
    return () => mq.removeEventListener("change", follow);
  }, []);

  function toggle() {
    const next: Mode = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // private browsing: the choice lasts until the page is closed
    }
    setMode(next);
  }

  const label = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="theme-switch" onClick={toggle} aria-label={label} title={label}>
      {mode === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
