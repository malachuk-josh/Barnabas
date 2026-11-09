// The map's data files, fetched once each and shared: the chapter maps, the
// base windows and eras (components/ChapterMap.tsx) and the place cards
// (components/PlaceCard.tsx).

/*
 * One fetch per file, shared by every chapter that wants it.
 *
 * A reader moves through a book a chapter at a time and the whole book's
 * places are one file; the six base maps and the era labels are the same for
 * everybody. Held, so only the first chapter of a book costs anything.
 *
 * Only what arrived is held. This used to keep the failures too: a request
 * that died once — a dropped signal, or the phone suspending the app halfway
 * through it — was remembered as "there is no map", and every Context opened
 * afterwards was handed that same answer until the app was restarted. One
 * lost request for the Levant took the maps out of 452 chapters at once, and
 * a home screen app can go days without restarting, so to the reader the
 * feature had simply been removed. A failure is forgotten now, and the next
 * time the panel opens it asks again.
 */
const held = new Map<string, Promise<unknown>>();
export function load<T>(url: string, fallback: T): Promise<T> {
  let hit = held.get(url) as Promise<T> | undefined;
  if (!hit) {
    const asked: Promise<T> = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.json() as Promise<T>;
    });
    asked.catch(() => {
      if (held.get(url) === asked) held.delete(url);
    });
    held.set(url, asked);
    hit = asked;
  }
  return hit.catch(() => fallback);
}
