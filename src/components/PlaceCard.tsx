"use client";

// A place on the map, told about: what it was, where it is now and how sure
// anyone is of that, and every chapter of the Bible that names it.
//
// From OpenBible.info's geocoding, which for each of its 1,300-odd places
// weighs what seventy-odd atlases, dictionaries and commentaries say the
// modern site is (scripts/build-maps.mjs writes it out as /maps/places.json).
// Its own measure of confidence is shown in words rather than as a number,
// and where the site is uncertain the next best guesses are named, because
// "Mount Sinai is Jebel Musa" said flatly would be saying more than anyone
// knows.
//
// Over everything, the Context panel and the full-screen map alike, and put
// on the page's body: both are glass, and glass holds anything fixed inside
// it to its own box.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { BOOKS } from "@/lib/bible";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { load } from "@/lib/mapData";
import { wordPortal } from "@/lib/theme";

/** A place someone tapped: its id where the map file has one, its name, and
 *  the verse in this chapter that names it — none for the countryside. */
export interface TappedPlace {
  id?: string;
  n: string;
  v?: number;
}

/**
 * [name, kind, the modern site, confidence out of 1000, country (an index
 *  into countries, or -1), "book.chapter.verse …" for each chapter naming
 *  it, how many verses name it, the next best sites where it is uncertain]
 */
type Card = [string, string, string, number, number, string, number, string[]?];
interface Places {
  countries: [string, string][];
  places: Record<string, Card>;
  /** an entry that is the same spot as a better-known one, sent to it */
  same?: Record<string, string>;
}

/** What kind of place, in a word or two. Several of the dataset's kinds read
 *  the same to a reader and share one. */
const KIND: Record<string, string> = {
  settlement: "town",
  "district in settlement": "town",
  region: "region",
  "people group": "region",
  mountain: "mountain",
  "mountain range": "mountains",
  "mountain ridge": "mountains",
  hill: "hill",
  cliff: "hill",
  promontory: "hill",
  river: "river",
  wadi: "wadi",
  valley: "valley",
  "body of water": "water",
  island: "island",
  spring: "spring",
  well: "spring",
  pool: "spring",
  campsite: "campsite",
  gate: "gate",
  structure: "landmark",
  altar: "landmark",
  hall: "landmark",
  tree: "landmark",
  rock: "landmark",
  road: "road",
  "natural area": "wild",
  field: "wild",
  garden: "garden",
};

/** A region's site is only a point to draw it at, and a river's or a sea's is
 *  its modern name: neither is an identification anyone has argued over. */
const AREA = new Set(["region", "people group"]);
const WATER = new Set(["river", "wadi", "valley", "body of water"]);

/** "the Salt Sea" and "Salt Sea" are one name. */
const bare = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();

function sureKey(score: number): MessageKey {
  if (score >= 800) return "place.sure.high";
  if (score >= 500) return "place.sure.likely";
  if (score >= 200) return "place.sure.possible";
  return "place.sure.uncertain";
}

export default function PlaceCard({
  place,
  bookNr,
  chapter,
  onClose,
  onGoToVerse,
  onGoToRef,
}: {
  place: TappedPlace;
  bookNr: number;
  chapter: number;
  onClose: () => void;
  /** a verse in the chapter the map is of */
  onGoToVerse: (verse: number) => void;
  /** a verse anywhere else: [book, chapter, verse] */
  onGoToRef: (ref: [number, number, number]) => void;
}) {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Places | null | undefined>(undefined);
  const [all, setAll] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    load<Places | null>("/maps/places.json", null).then((d) => {
      if (live) setData(d && typeof d === "object" && d.places ? d : null);
    });
    return () => {
      live = false;
    };
  }, []);

  // Escape closes the card, not the full-screen map under it: heard first,
  // on the way down, and kept from going further
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const id = place.id && data ? (data.same?.[place.id] ?? place.id) : undefined;
  const card = id ? data?.places[id] : undefined;
  const [name, type, modern, score, ci, refsText, count, others] = card ?? [
    place.n,
    "",
    "",
    0,
    -1,
    "",
    0,
    undefined,
  ];
  const country = data && ci >= 0 ? data.countries[ci]?.[lang === "es" ? 1 : 0] : undefined;
  const kind = KIND[type] ?? "place";

  // where it is now, said the way its kind needs
  let today: string | null = null;
  if (card) {
    const renamed = modern && bare(modern) !== bare(name);
    if (AREA.has(type)) today = country ? t("place.todayIn", { country }) : null;
    else if (WATER.has(type)) today = renamed ? t("place.today", { where: modern }) : null;
    else if (renamed) today = t("place.today", { where: country ? `${modern}, ${country}` : modern });
    else if (country) today = t("place.todayIn", { country });
  }
  const showSure = !!card && !AREA.has(type) && !(WATER.has(type) && score >= 800);

  // the chapters that name it, a row a book, in the Bible's order
  const refs = refsText
    ? refsText.split(" ").map((r) => r.split(".").map(Number) as [number, number, number])
    : [];
  const books: { nr: number; refs: [number, number, number][] }[] = [];
  for (const r of refs) {
    const last = books[books.length - 1];
    if (last && last.nr === r[0]) last.refs.push(r);
    else books.push({ nr: r[0], refs: [r] });
  }
  const SHOWN = 6;
  const shown = all || books.length <= SHOWN + 2 ? books : books.slice(0, SHOWN);

  const go = ([b, c, v]: [number, number, number]) => {
    if (b === bookNr && c === chapter) onGoToVerse(v);
    else onGoToRef([b, c, v]);
  };

  return createPortal(
    <div className="modal-overlay over-panel" onClick={onClose}>
      <div
        className="glass modal place-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-card-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="place-head">
          <h2 id="place-card-title">
            <Icon name="pin" /> {name}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        {card && (
          <p className="place-kind">
            {t(`place.kind.${kind}` as MessageKey)}
            {count > 0 && (
              <>
                {" · "}
                {count === 1 ? t("place.namedOnce") : t("place.namedIn", { n: String(count) })}
              </>
            )}
          </p>
        )}
        {today && <p className="place-today">{today}</p>}
        {showSure && modern && <p className="place-sure">{t(sureKey(score))}</p>}
        {card && !AREA.has(type) && others && others.length > 0 && (
          <p className="place-others">{t("place.others", { sites: others.join(", ") })}</p>
        )}
        {data === undefined && place.id && <p className="place-kind skeleton-text">…</p>}

        {place.v !== undefined && (
          <button type="button" className="btn btn-primary place-go" onClick={() => onGoToVerse(place.v!)}>
            <Icon name="book" /> {t("place.goToVerse", { v: String(place.v) })}
          </button>
        )}

        {books.length > 0 && (
          <>
            <h3 className="place-refs-head">{t("place.alsoIn")}</h3>
            <ul className="place-refs">
              {shown.map((b) => (
                <li key={b.nr}>
                  <span className="place-book">{BOOKS[b.nr - 1]?.[lang === "es" ? "es" : "en"]}</span>
                  <span className="place-chapters">
                    {b.refs.map((r) => {
                      const here = r[0] === bookNr && r[1] === chapter;
                      return (
                        <button
                          key={r[1]}
                          type="button"
                          className={`chip place-ch${here ? " chip-active" : ""}`}
                          onClick={() => go(r)}
                          aria-label={`${BOOKS[r[0] - 1]?.[lang === "es" ? "es" : "en"]} ${r[1]}:${r[2]}`}
                          aria-current={here ? "true" : undefined}
                        >
                          {r[1]}
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
            {shown.length < books.length && (
              <button type="button" className="link-btn place-more" onClick={() => setAll(true)}>
                {t("place.showAll", { n: String(books.length) })}
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    wordPortal()
  );
}
