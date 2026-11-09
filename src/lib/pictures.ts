// A book's pictures at the size the edition has them, fetched before they
// are asked for, so that a picture opened over the screen opens sharp.
//
// The larger copies are online only (public/sw.js keeps them out of the
// offline cache), and the page shows the small ones. Left to the viewer,
// the larger copy would only start downloading when the picture was
// opened, and the reader would see the small one first. So each is fetched
// as its picture comes near the screen, and kept in the browser's own cache
// for when it is opened.
//
// Not over a slow connection, nor with the phone's Data Saver on: there a
// chapter's worth of them, two megabytes or more, is a cost the reader has
// not chosen. Those readers still get the larger copy when they open a
// picture (and from the moment they touch it), just not before.

interface Connection {
  saveData?: boolean;
  effectiveType?: string;
}

/** Whether to spend data on pictures nobody has opened yet. */
export function mayFetchAhead(): boolean {
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  const c = (navigator as Navigator & { connection?: Connection }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !c.effectiveType || c.effectiveType === "4g";
}

/** Every copy asked for, held so the browser keeps it decoded and ready. */
const fetched = new Map<string, HTMLImageElement>();

/** Fetch a picture's larger copy, once, and keep it. */
export function fetchAhead(url: string | undefined): void {
  if (!url || fetched.has(url) || typeof Image === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  fetched.set(url, img);
  // a failure is forgotten, so it can be asked for again
  img.onerror = () => fetched.delete(url);
}

/** Whether a picture's larger copy has come and is ready to be shown. */
export function hasArrived(url: string): boolean {
  const img = fetched.get(url);
  return !!img && img.complete && img.naturalWidth > 0;
}

/**
 * A picture's larger copy, fetched if it has not been, and decoded: resolves
 * when it can be shown without a blank, and rejects if it cannot be had.
 */
export function whenArrived(url: string): Promise<void> {
  fetchAhead(url);
  const img = fetched.get(url);
  if (!img) return Promise.reject(new Error("offline"));
  return img.decode();
}

/**
 * Watch the pictures inside `root` that carry a `data-full` address, and
 * fetch each one's larger copy as it comes within a screen and a half of being
 * seen. `scroller` is the box the page scrolls in, where it is not the
 * window: the warning is measured against it, and against
 * the window a picture below the scroller's edge is never near at all.
 * Returns the function that stops watching.
 */
export function watchPictures(root: Element | null, scroller?: Element | null): () => void {
  if (!root || typeof IntersectionObserver === "undefined" || !mayFetchAhead()) return () => {};
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        fetchAhead((e.target as HTMLElement).dataset.full);
        seen.unobserve(e.target);
      }
    },
    { root: scroller ?? null, rootMargin: "150% 0px" }
  );
  root.querySelectorAll<HTMLElement>("[data-full]").forEach((el) => seen.observe(el));
  return () => seen.disconnect();
}
