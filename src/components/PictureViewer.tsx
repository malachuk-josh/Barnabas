"use client";

// A book's picture, or its cover, over the whole screen to look at closely.
// A study picture from a chapter's Context comes with a caption — what it
// is, and on a tap what in it is reconstructed and where that comes from —
// and with the chapter's others a swipe or an arrow away.
//
// It opens as large as the screen allows. Pinch to zoom, up to four times
// that, and drag to move about in it; double-tap a place to zoom in on it,
// and again to come back out. On a computer the wheel zooms where the pointer
// is and a drag moves; + and − do the same for anyone without a pinch or a
// wheel, from the buttons or the keys, and 0 puts it back. A tap beside the
// picture, the ✕, or Escape closes it.
//
// A picture with a larger copy — a book's pictures and its cover, at the
// size the edition has them, which are online only — opens on the larger
// one. The chapter fetches it as the picture comes near the screen
// (lib/pictures.ts), so it is usually there already; when it is not, the
// viewer waits for it, a moment, over a quiet spinner, rather than showing
// the small one first and sharpening under the reader's eyes. Only a slow
// connection, kept waiting more than a couple of seconds, is shown the small
// one meanwhile, and offline the small one is all there is.
//
// The app turns the browser's own pinch-zoom off — on a home-screen app a
// stray pinch is far likelier than a meant one — so the viewer answers the
// pinch itself, as the map does. Pointer events rather than touch events,
// unlike the map's, so a mouse and a finger take the same path.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import { hasArrived, whenArrived } from "@/lib/pictures";
import { wordPortal } from "@/lib/theme";

const MAX = 4;
/** how far a double-tap goes in */
const TAP_ZOOM = 2.5;
const BUTTON_STEP = 1.6;
/** how long a slow connection waits on the larger copy before the small one is shown meanwhile */
const SLOW_MS = 2500;

/** The picture's scale, and how far it has moved from where it sits at rest. */
type View = { s: number; x: number; y: number };
const FIT: View = { s: 1, x: 0, y: 0 };

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const within = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

/** What a study picture is, shown over its top edge: a line, and more on a tap. */
export interface PictureCaption {
  title: string;
  /** what sort of picture — "Study reconstruction", "Measured diagram" — where it needs saying */
  kind?: string;
  refs?: string;
  period?: string;
  /** what in it is reconstructed or uncertain */
  note?: string;
  sources?: { t: string; u: string }[];
  /** where to go from it: the passage it shows */
  go?: { label: string; href: string };
}

export default function PictureViewer({
  src,
  full,
  alt,
  onClose,
  caption,
  step,
}: {
  src: string;
  /** the same picture larger, fetched now and shown when it has come */
  full?: string;
  alt?: string;
  onClose: () => void;
  caption?: PictureCaption;
  /** one of a set: where it is in it, and the ways to the others */
  step?: { at: string; prev: () => void; next: () => void };
}) {
  const { t } = useI18n();
  const [view, setView] = useState<View>(FIT);
  const [about, setAbout] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  /** the picture's size at rest: the screen's, less its margins, in the picture's shape */
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // the picture shown: the larger copy once it has come, nothing (and the
  // spinner) while it is coming, and the small one offline or when the wait
  // runs long
  const online = () => typeof navigator === "undefined" || navigator.onLine;
  const [shown, setShown] = useState<string | null>(() =>
    !full || !online() ? src : hasArrived(full) ? full : null
  );
  useEffect(() => {
    if (!full || !online()) {
      setShown(src);
      return;
    }
    if (hasArrived(full)) {
      setShown(full);
      return;
    }
    setShown(null);
    let live = true;
    const meanwhile = setTimeout(() => live && setShown((s) => s ?? src), SLOW_MS);
    whenArrived(full)
      .then(() => live && setShown(full))
      .catch(() => live && setShown((s) => s ?? src));
    return () => {
      live = false;
      clearTimeout(meanwhile);
    };
  }, [src, full]);
  const waiting = !!full && shown !== full && online();

  /**
   * Keep the picture on the screen. Larger than the screen, no edge of it
   * comes in past the screen's; smaller, none of it goes off.
   */
  const clamp = useCallback((v: View): View => {
    const el = img.current;
    const st = stage.current;
    const s = Math.min(MAX, Math.max(1, v.s));
    if (!el || !st) return { ...v, s };
    // where its middle sits at rest, from the stage's corner
    const cx = el.offsetLeft + el.offsetWidth / 2;
    const cy = el.offsetTop + el.offsetHeight / 2;
    const half = { w: (el.offsetWidth * s) / 2, h: (el.offsetHeight * s) / 2 };
    return {
      s,
      x: within(v.x, half.w - cx, st.clientWidth - cx - half.w),
      y: within(v.y, half.h - cy, st.clientHeight - cy - half.h),
    };
  }, []);

  /** Zoom to `s`, keeping the place under the screen point (px, py) where it is. */
  const zoomAt = useCallback(
    (from: View, s: number, px: number, py: number): View => {
      const el = img.current;
      const st = stage.current?.getBoundingClientRect();
      if (!el || !st) return from;
      const to = Math.min(MAX, Math.max(1, s));
      // the point, from the picture's middle at rest
      const cx = px - (st.left + el.offsetLeft + el.offsetWidth / 2);
      const cy = py - (st.top + el.offsetTop + el.offsetHeight / 2);
      const k = to / from.s;
      return clamp({ s: to, x: cx - (cx - from.x) * k, y: cy - (cy - from.y) * k });
    },
    [clamp]
  );

  const zoomCentre = useCallback(
    (factor: number) => {
      const st = stage.current?.getBoundingClientRect();
      if (!st) return;
      setView((v) => zoomAt(v, v.s * factor, st.left + st.width / 2, st.top + st.height / 2));
    },
    [zoomAt]
  );

  /** As large as the screen allows, in the picture's own shape. */
  const fit = useCallback(() => {
    const el = img.current;
    const st = stage.current;
    if (!el || !st || !el.naturalWidth) return;
    const pad = getComputedStyle(st);
    const w = st.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const h = st.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
    const k = Math.min(w / el.naturalWidth, h / el.naturalHeight);
    setBox({ w: Math.floor(el.naturalWidth * k), h: Math.floor(el.naturalHeight * k) });
  }, []);

  // a picture already in the cache can be there before its load is heard
  useEffect(() => {
    if (mounted && img.current?.complete) fit();
  }, [mounted, shown, fit]);

  // a turned phone is a different screen: the picture is fitted to it again
  // and kept inside it
  useEffect(() => {
    if (box) setView((v) => clamp(v));
  }, [box, clamp]);

  // the keys, and the wheel, which has to be heard actively to keep the page from scrolling
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomCentre(BUTTON_STEP);
      else if (e.key === "-") zoomCentre(1 / BUTTON_STEP);
      else if (e.key === "0") setView(FIT);
      else if (step && e.key === "ArrowLeft" && viewRef.current.s === 1) step.prev();
      else if (step && e.key === "ArrowRight" && viewRef.current.s === 1) step.next();
    };
    const el = stage.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // a trackpad's pinch comes as a wheel with Ctrl held, in small steps
      const rate = e.ctrlKey ? 0.01 : 0.0025;
      setView((v) => zoomAt(v, v.s * Math.exp(-e.deltaY * rate), e.clientX, e.clientY));
    };
    window.addEventListener("keydown", onKey);
    el?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", fit);
    };
  }, [onClose, mounted, zoomAt, zoomCentre, fit, step]);

  // ---- fingers and the mouse --------------------------------------------------

  const pointers = useRef(new Map<number, Point>());
  /** two fingers down: how far apart they began, and the view then */
  const pinch = useRef<{ d: number; mid: Point; view: View } | null>(null);
  /** one finger or the mouse down: where it began, and the view then */
  const drag = useRef<{ at: Point; view: View } | null>(null);
  /** how far the gesture has gone, so a drag is not also taken for a tap */
  const travelled = useRef(0);
  const lastTap = useRef<{ t: number; at: Point } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.current.values()];
    if (b) {
      pinch.current = { d: distance(a, b), mid: middle(a, b), view: viewRef.current };
      drag.current = null;
    } else {
      travelled.current = 0;
      drag.current = { at: a, view: viewRef.current };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const before = pointers.current.get(e.pointerId);
    if (!before) return;
    const now = { x: e.clientX, y: e.clientY };
    travelled.current += distance(before, now);
    pointers.current.set(e.pointerId, now);
    const [a, b] = [...pointers.current.values()];
    const p = pinch.current;
    if (p && b) {
      // the place between the fingers stays between them, and goes where they go
      const mid = middle(a, b);
      const zoomed = zoomAt(p.view, (p.view.s * distance(a, b)) / Math.max(1, p.d), p.mid.x, p.mid.y);
      setView(clamp({ ...zoomed, x: zoomed.x + mid.x - p.mid.x, y: zoomed.y + mid.y - p.mid.y }));
    } else if (drag.current && viewRef.current.s > 1) {
      const d = drag.current;
      setView(clamp({ ...d.view, x: d.view.x + now.x - d.at.x, y: d.view.y + now.y - d.at.y }));
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const at = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const left = [...pointers.current.values()];
    if (left.length === 1) {
      // one finger lifted from a pinch: the other carries on as a drag
      pinch.current = null;
      drag.current = { at: left[0], view: viewRef.current };
      return;
    }
    if (left.length > 0 || !at) return;
    const wasPinch = pinch.current !== null;
    const began = drag.current?.at;
    pinch.current = null;
    drag.current = null;
    // across the screen, at rest, is to the next picture of a set
    if (step && !wasPinch && began && viewRef.current.s === 1 && e.type !== "pointercancel") {
      const dx = at.x - began.x;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(at.y - began.y)) {
        if (dx < 0) step.next();
        else step.prev();
        return;
      }
    }
    if (wasPinch || travelled.current > 10 || e.type === "pointercancel") return;

    // a tap: beside the picture, at its own size, it closes; twice on the
    // picture, it zooms in there or back out. (The stage holds the pointer,
    // so it is the stage the tap lands on; where is told by the picture's box.)
    const r = img.current?.getBoundingClientRect();
    const onPicture = !!r && at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom;
    if (!onPicture && viewRef.current.s === 1) {
      onClose();
      return;
    }
    const last = lastTap.current;
    if (last && e.timeStamp - last.t < 320 && distance(last.at, at) < 30) {
      lastTap.current = null;
      setView((v) => (v.s > 1 ? FIT : zoomAt(v, TAP_ZOOM, at.x, at.y)));
    } else {
      lastTap.current = { t: e.timeStamp, at };
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div className="bk-viewer" role="dialog" aria-modal="true" aria-label={t("shelf.viewPicture")}>
      <div
        ref={stage}
        className={`bk-viewer-stage${view.s > 1 ? " zoomed" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {shown && (
          <img
            ref={img}
            src={shown}
            alt={alt ?? ""}
            draggable={false}
            // fitted again for the larger copy too, which is the same shape:
            // the zoom stays where it was
            onLoad={fit}
            width={box?.w}
            height={box?.h}
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
              ...(box ? { width: box.w, height: box.h } : null),
            }}
          />
        )}
      </div>
      {waiting && <span className="bk-viewer-wait" role="status" aria-label={t("common.loading")} />}
      <button type="button" className="lex-close bk-viewer-close" onClick={onClose} aria-label={t("common.close")}>
        ✕
      </button>
      {caption && (
        <div className={`bk-viewer-cap${about ? " open" : ""}`}>
          <button
            type="button"
            className="bk-viewer-cap-head"
            onClick={() => setAbout((a) => !a)}
            aria-expanded={about}
          >
            {(caption.kind || step) && (
              <span className="bk-viewer-cap-kind">
                {[caption.kind, step?.at].filter(Boolean).join(" · ")}
              </span>
            )}
            <span className="bk-viewer-cap-title">{caption.title}</span>
            <span className="bk-viewer-cap-more">{about ? t("reader.studyLess") : t("reader.studyMore")}</span>
          </button>
          {caption.go && (
            <Link href={caption.go.href} className="bk-viewer-cap-go" onClick={onClose}>
              <Icon name="book" /> {caption.go.label}
            </Link>
          )}
          {about && (
            <div className="bk-viewer-cap-body">
              {caption.refs && <p className="bk-viewer-cap-refs">{caption.refs}</p>}
              {caption.period && <p className="bk-viewer-cap-period">{caption.period}</p>}
              {caption.note && <p>{caption.note}</p>}
              {caption.sources && caption.sources.length > 0 && (
                <>
                  <h4>{t("reader.studySources")}</h4>
                  <ul>
                    {caption.sources.map((s) => (
                      <li key={s.u}>
                        <a href={s.u} target="_blank" rel="noopener noreferrer">
                          {s.t}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {step && view.s === 1 && (
        <>
          <button type="button" className="bk-viewer-step prev" onClick={step.prev} aria-label={t("reader.studyPrev")}>
            ‹
          </button>
          <button type="button" className="bk-viewer-step next" onClick={step.next} aria-label={t("reader.studyNext")}>
            ›
          </button>
        </>
      )}
      <div className="bk-viewer-zoom">
        <button
          type="button"
          onClick={() => zoomCentre(1 / BUTTON_STEP)}
          disabled={view.s <= 1}
          aria-label={t("shelf.zoomOut")}
          title={t("shelf.zoomOut")}
        >
          −
        </button>
        <button type="button" className="bk-viewer-pct" onClick={() => setView(FIT)} disabled={view.s <= 1} title={t("shelf.zoomFit")}>
          {Math.round(view.s * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomCentre(BUTTON_STEP)}
          disabled={view.s >= MAX}
          aria-label={t("shelf.zoomIn")}
          title={t("shelf.zoomIn")}
        >
          +
        </button>
      </div>
    </div>,
    wordPortal()
  );
}
