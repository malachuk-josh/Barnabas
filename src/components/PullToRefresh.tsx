"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 72; // px of pull (after resistance) that triggers a refresh
const MAX = 110;

/** Nothing above the touch point is scrolled down, so a downward drag means "pull to refresh". */
function atTop(target: EventTarget | null): boolean {
  if (window.scrollY > 0) return false;
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.closest("input, textarea, select, [contenteditable='true'], .sheet, .more-sheet, [data-no-pull]")) return false;
    if (el.scrollTop > 0) return false;
  }
  return true;
}

/**
 * Pull down from the top of a page to reload it, on phones and in the home-screen app
 * (which has no browser refresh). Desktop and mouse input are left alone.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const tracking = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 860px) and (pointer: coarse)");
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const onStart = (e: TouchEvent) => {
      if (!phone.matches || e.touches.length !== 1 || !atTop(e.target)) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
      tracking.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.touches[0]!.clientX - start.current.x;
      const dy = e.touches[0]!.clientY - start.current.y;
      if (!tracking.current) {
        // Decide once: a mostly vertical downward drag starts a pull; anything else is ordinary scrolling.
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          start.current = null;
          return;
        }
        tracking.current = true;
        setDragging(true);
      }
      if (e.cancelable) e.preventDefault(); // keep the page still and stop the browser's own bounce
      set(Math.min(MAX, Math.max(0, dy) * 0.5));
    };

    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (tracking.current && pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        set(THRESHOLD);
        window.location.reload();
      } else {
        set(0);
      }
      tracking.current = false;
      setDragging(false);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const ready = pull >= THRESHOLD;
  return (
    <div
      className={`ptr${pull > 0 || refreshing ? " ptr-on" : ""}${refreshing ? " ptr-spin" : ""}${dragging ? "" : " ptr-settle"}`}
      style={{ transform: `translate(-50%, ${pull - 52}px)` }}
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ transform: refreshing ? undefined : `rotate(${ready ? 180 : (pull / THRESHOLD) * 180}deg)` }}>
        {refreshing ? (
          <path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        ) : (
          <path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <span className="sr-only">{refreshing ? "Refreshing" : ready ? "Release to refresh" : pull > 0 ? "Pull to refresh" : ""}</span>
    </div>
  );
}
