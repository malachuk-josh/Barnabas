"use client";

// Where the chapter happened.
//
// Not a picture of the Holy Land dropped into a panel. The places drawn are
// the places THIS chapter names, and tapping one goes to the verse that names
// it — which is only possible because OpenBible.info publishes, for every
// place in the Bible, the list of verses it appears in.
//
// Drawn as SVG from two public sources rather than shipped as a scan: see
// scripts/build-maps.mjs for why. What that buys here is that the map takes
// the app's own colours, so it is legible in all three themes; that it costs
// a few kilobytes rather than a few megabytes; and that it can be zoomed into
// without ever going soft, because there is nothing to go soft — every line
// is redrawn at whatever size it is asked for.

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import PlaceCard, { type TappedPlace } from "@/components/PlaceCard";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { load } from "@/lib/mapData";
import { wordPortal } from "@/lib/theme";

interface Place {
  /** the name as the reader knows it */
  n: string;
  x: number;
  y: number;
  /** the first verse in this chapter that names it */
  v: number;
  /** settlement, region, river, mountain … */
  t: string;
  /** OpenBible's id for it, for its card; absent from files built before */
  id?: string;
}

interface ChapterMapData {
  base: string;
  era: string;
  /** the part of the base window this chapter is in: [x, y, w, h] */
  focus: [number, number, number, number];
  places: Place[];
  /** named in the chapter but left off, because the map would not hold them */
  more?: number;
  /** the journey this chapter is part of, where it is one */
  route?: Route;
}

/**
 * A journey on the map (scripts/map-journeys.mjs): each leg as the points it
 * is drawn through, bold (s 1) where this chapter tells of it and faded where
 * an earlier one did; and its stops, numbered in order, a place passed through
 * twice carrying both numbers ("1·15").
 */
interface Route {
  j: string;
  legs: { p: [number, number][]; s: 0 | 1; sea?: 1 }[];
  stops: { x: number; y: number; n: string; s: 0 | 1 }[];
}

/**
 * Today's borders, countries and cities for a window, for the then-and-now
 * toggle (scripts/build-maps.mjs): a settled border and a dashed one as a
 * path each, and [en, es, x, y, rank] for each name, most prominent first.
 */
interface Modern {
  borders: { d: string; k?: 1 }[];
  countries: [string, string, number, number, number][];
  cities: [string, string, number, number, number][];
}

/** Whether the reader last left the maps showing today's borders. */
const NOW_KEY = "barnabas.word.mapNow";
function readNow(): boolean {
  try {
    return localStorage.getItem(NOW_KEY) === "1";
  } catch {
    return false;
  }
}
function writeNow(on: boolean) {
  try {
    localStorage.setItem(NOW_KEY, on ? "1" : "0");
  } catch {
    // a private window: the toggle works, it is only not remembered
  }
}

/** A stop's numbers, in order, a run of three or more as a range: "1·15",
 *  "11–13", "4·7–9". */
function stopNumbers(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${sorted[i]}–${sorted[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]));
    i = j + 1;
  }
  return parts.join("·");
}

/** A leg as a path. */
const legPath = (pts: [number, number][]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");

/**
 * The arrowhead half way along a leg, pointing the way it went: half way by
 * distance travelled, not by points, so a leg bent round a coast is marked in
 * its middle rather than at a bend.
 */
function arrowOf(pts: [number, number][], size: number): string | null {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  if (total < size * 4) return null;
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < left) {
      left -= len;
      continue;
    }
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const mx = ax + ux * left;
    const my = ay + uy * left;
    const f = (n: number) => n.toFixed(2);
    return (
      `M${f(mx + ux * size)} ${f(my + uy * size)}` +
      `L${f(mx - ux * size - uy * size * 0.8)} ${f(my - uy * size + ux * size * 0.8)}` +
      `L${f(mx - ux * size + uy * size * 0.8)} ${f(my - uy * size - ux * size * 0.8)}Z`
    );
  }
  return null;
}

interface Base {
  id: string;
  bounds: [number, number, number, number];
  width: number;
  height: number;
  land: string[];
  lakes: string[];
  rivers: string[];
  /** every named place: [name, x, y, weight, 0 area / 1 town / 2 peak, id] */
  sites: [string, number, number, number, number, string?][];
  /** the kinds of ground: deserts, ranges, deltas, plains */
  terrain: {
    n: string;
    es: string;
    k: "desert" | "range" | "ground";
    d: string[];
    x: number;
    y: number;
  }[];
}

interface Region {
  en: string;
  es: string;
  ll: [number, number];
  water?: boolean;
}

type Eras = Record<string, { regions: Region[] }>;

/** [x, y, width, height] in the base window's own units. */
type View = [number, number, number, number];

/** The same projection the build script used, so a region label lands where
 *  the coastline it belongs to was drawn. */
function project(bounds: [number, number, number, number], width: number) {
  const [w, s, e, n] = bounds;
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const scale = width / ((e - w) * kx);
  return (lon: number, lat: number): [number, number] => [
    (lon - w) * kx * scale,
    (n - lat) * scale,
  ];
}

/**
 * The crop a chapter opens at, or the whole window if the file predates it.
 *
 * Four numbers or nothing: everything downstream destructures this, and a
 * missing one would land as NaN in a viewBox, which draws a blank rather than
 * throwing — the worst of both.
 */
function viewOf(data: ChapterMapData, base: Base): View {
  const f = data.focus;
  return Array.isArray(f) && f.length === 4 && f.every(Number.isFinite)
    ? (f as View)
    : [0, 0, base.width, base.height];
}

/*
 * What mark a place takes: nothing, a town's dot, or a peak.
 *
 * Carmel and Tabor and Gilboa and Sinai are the shape of the ground the story
 * happens on, and a dot says a town stood there — which is not what any of
 * them were. scripts/build-maps decides the same thing for the gazetteer, and
 * ships the answer rather than the type.
 */
const PEAKS = ["mountain", "mountain range", "hill", "promontory", "cliff"];
const AREAS = [
  "region",
  "natural area",
  "body of water",
  "river",
  "valley",
  "special",
];
const markFor = (type: string): 0 | 1 | 2 =>
  PEAKS.includes(type) ? 2 : AREAS.includes(type) ? 0 : 1;

/** Regions before towns, otherwise as they were. */
const byAreaFirst = (a: Place, b: Place) =>
  (markFor(a.t) === 0 ? 0 : 1) - (markFor(b.t) === 0 ? 0 : 1);

/** The peak glyph, sitting on the ground with its summit on the point. */
const peakPath = (x: number, y: number, px: number) =>
  `M${(x - px * 4.4).toFixed(1)} ${(y + px * 2.6).toFixed(1)}L${x.toFixed(1)} ${(
    y - px * 3.2
  ).toFixed(1)}L${(x + px * 4.4).toFixed(1)} ${(y + px * 2.6).toFixed(1)}Z`;

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

/** [left, top, right, bottom], in the map's own units. */
type Box = [number, number, number, number];

const hits = (a: Box, b: Box) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** How much of two boxes is the same ground — the cost of a crowded spot. */
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/*
 * Everything already written, filed by where it is.
 *
 * Every name tests itself against the names placed before it, and at full
 * screen that is a thousand-odd places in the gazetteer against a few hundred
 * names, on every frame of a pinch. Filed under the squares of a coarse grid,
 * a test only looks at what is near it — the difference between a pass that
 * fits comfortably inside a frame on a slower Android phone and one that
 * does not.
 */
function boxIndex(cell: number) {
  const cells = new Map<number, Box[]>();
  const key = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
  const span = (b: Box) => [
    Math.floor(b[0] / cell),
    Math.floor(b[1] / cell),
    Math.floor(b[2] / cell),
    Math.floor(b[3] / cell),
  ];
  return {
    add(b: Box) {
      const [x0, y0, x1, y1] = span(b);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const list = cells.get(key(cx, cy));
          if (list) list.push(b);
          else cells.set(key(cx, cy), [b]);
        }
      }
    },
    /** nothing filed here touches b */
    clear(b: Box) {
      const [x0, y0, x1, y1] = span(b);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          for (const t of cells.get(key(cx, cy)) ?? []) if (hits(b, t)) return false;
        }
      }
      return true;
    },
    /** how much of b is already covered, not counting `own` */
    covered(b: Box, own?: Box) {
      const [x0, y0, x1, y1] = span(b);
      const seen = new Set<Box>();
      let sum = 0;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          for (const t of cells.get(key(cx, cy)) ?? []) {
            if (t === own || seen.has(t)) continue;
            seen.add(t);
            sum += overlap(b, t);
          }
        }
      }
      return sum;
    },
  };
}

/**
 * The type each kind of name is set in, as globals.css sets it, in CSS
 * pixels before the map's own scale is applied. Written out here because the
 * placing has to know how big a name is before it is drawn; change a size in
 * the stylesheet and change it here.
 */
const FACES = {
  name: { size: 15, italic: false, serif: true, track: 0, upper: false, halo: 1.5 },
  area: { size: 15, italic: true, serif: true, track: 0, upper: false, halo: 1.5 },
  region: { size: 12, italic: false, serif: false, track: 0.14, upper: true, halo: 0 },
  water: { size: 13, italic: true, serif: true, track: 0.06, upper: false, halo: 0 },
  ground: { size: 10, italic: false, serif: false, track: 0.18, upper: true, halo: 0 },
  range: { size: 12, italic: true, serif: true, track: 0.06, upper: false, halo: 0 },
  site: { size: 11.5, italic: false, serif: true, track: 0, upper: false, halo: 1.25 },
  stop: { size: 9.5, italic: false, serif: false, track: 0, upper: false, halo: 0 },
  country: { size: 11, italic: false, serif: false, track: 0.16, upper: true, halo: 1.25 },
  city: { size: 11, italic: true, serif: false, track: 0, upper: false, halo: 1.25 },
} as const;
type Face = (typeof FACES)[keyof typeof FACES];

/*
 * How wide a name comes out, in CSS pixels.
 *
 * Measured rather than guessed. The old tests treated a name as a point, or as
 * eighty pixels whatever it said — and "Lycaonia" was written straight over
 * "Cilicia", because the test measured from where the word starts and Cilicia
 * sat under where it ends. A canvas set in the map's own type, on the
 * device's own fonts, says how wide the word really is.
 */
let ruler: CanvasRenderingContext2D | null | undefined;
let families: { serif: string; sans: string } | null = null;
const widths = new Map<string, number>();
function widthOf(text: string, face: Face): number {
  const shown = face.upper ? text.toUpperCase() : text;
  const key = `${face.size}${face.italic}${face.serif}${face.track}|${shown}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  if (ruler === undefined) {
    ruler =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  let w: number;
  if (ruler) {
    if (!families) {
      // The Word's fonts are set on its wrapper, not on <html>
      const root = getComputedStyle(
        document.querySelector(".word-root") ?? document.documentElement
      );
      families = {
        serif: root.getPropertyValue("--serif").trim() || "serif",
        sans: root.getPropertyValue("--sans").trim() || "sans-serif",
      };
    }
    ruler.font = `${face.italic ? "italic " : ""}${face.size}px ${
      face.serif ? families.serif : families.sans
    }`;
    w = ruler.measureText(shown).width;
  } else {
    // no canvas to measure with: a generous average, which errs towards room
    w = shown.length * face.size * 0.6;
  }
  // letter-spacing, which the canvas does not apply
  w += shown.length * face.track * face.size;
  widths.set(key, w);
  return w;
}

/** The ground a name covers: anchored at x, sitting on the baseline at y. */
function textBox(
  x: number,
  y: number,
  w: number,
  face: Face,
  anchor: "start" | "middle" | "end",
  px: number
): Box {
  // the halo the name is drawn with, and a hair of air beyond it
  const pad = (face.halo + 1) * px;
  const width = w * px;
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  const ascent = face.size * (face.upper ? 0.72 : 0.78) * px;
  const descent = face.size * (face.upper ? 0.04 : 0.24) * px;
  return [left - pad, y - ascent - pad, left + width + pad, y + descent + pad];
}

/** Where a chapter's place may write its name, in pixels from its dot. */
interface Spot {
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
  /** far enough from the dot to need a hairline back to it */
  lead: boolean;
}

/**
 * Every spot a name may take, best first: beside the dot on the side with
 * more room, then the other side; centred just above and below; above and
 * below to either side; and only then further off along a hairline, a line
 * at a time, down and up, either side.
 *
 * A region the chapter names is different. It has no dot, so a hairline from
 * it points at nothing — or, worse, at whatever town happens to sit on its
 * anchor: Pisidia's line ended on Antioch's dot and read as Pisidia pointing
 * at Antioch. So a region is written across its own ground, or a line or two
 * off it, and never sent further on a line.
 */
function spotsFor(area: boolean, first: 1 | -1): Spot[] {
  const beside = (side: 1 | -1, dy: number, lead: boolean): Spot => ({
    dx: side * 5,
    dy,
    anchor: side > 0 ? "start" : "end",
    lead,
  });
  const sides: (1 | -1)[] = [first, first > 0 ? -1 : 1];
  if (area) {
    // a region the chapter names is written across its own ground: centred,
    // then a line or two up or down, and a little to either side — nearest
    // first, and never far enough to need a line back
    const near: Spot[] = [];
    for (const dy of [4.5, -10.5, 19.5, -25.5, 34.5]) {
      for (const dx of [0, -24, 24, -48, 48]) {
        near.push({ dx, dy, anchor: "middle", lead: false });
      }
    }
    return near.sort(
      (a, b) => a.dx ** 2 + (a.dy - 4.5) ** 2 - (b.dx ** 2 + (b.dy - 4.5) ** 2)
    );
  }
  const out: Spot[] = [];
  for (const side of sides) out.push(beside(side, 4.5, false));
  out.push({ dx: 0, dy: -8, anchor: "middle", lead: false });
  out.push({ dx: 0, dy: 18, anchor: "middle", lead: false });
  for (const side of sides) out.push(beside(side, -6, false), beside(side, 16, false));
  for (let k = 2; k <= 9; k++) {
    for (const side of sides) {
      out.push(beside(side, 4.5 + 15 * k, true), beside(side, 4.5 - 15 * k, true));
    }
  }
  return out;
}

/**
 * The map itself, at whatever part of the window it is asked for.
 *
 * Everything about how it looks is a function of `view`, not of the chapter's
 * own crop — which is what lets the full-screen viewer hand it a live viewBox
 * during a pinch and have the type stay the same size on the glass, the pins
 * stay the same size under the thumb, and names that were stacked because they
 * overlapped come apart again as the ground between them opens up.
 */
function MapArt({
  base,
  data,
  regions,
  view,
  onPlace,
  label,
  spacing,
  crowd,
  avoid,
  glance = false,
  modern = null,
}: {
  base: Base;
  data: ChapterMapData;
  /** today's borders and cities, when the reader has asked for them */
  modern?: Modern | null;
  regions: { en: string; es: string; water?: boolean; x: number; y: number }[];
  view: View;
  /** a place tapped: a pin the chapter names, or (full screen) the countryside */
  onPlace: (place: TappedPlace) => void;
  label: string;
  /** how far apart names must stand on the glass, in pixels */
  spacing: number;
  /** and how many of them there may be at once */
  crowd: number;
  /** something drawn over the map that no name may be written under */
  avoid?: React.RefObject<HTMLElement | null>;
  /**
   * The small map in the panel, read at a glance. A region the chapter names
   * is left out of it when there is no room near its ground; full screen
   * always writes it, crowded if it must be, and a pinch makes the room.
   */
  glance?: boolean;
}) {
  const { lang } = useI18n();
  const [vx, vy, vw, vh] = view;
  const svgRef = useRef<SVGSVGElement>(null);

  /*
   * How many of the map's own units go into one pixel on the glass.
   *
   * Everything drawn here — type, dots, the thread from a moved name, the
   * space names must keep from each other — wants to be a size a thumb and an
   * eye understand, and those are measured in pixels. But an SVG can only be
   * told sizes in the units of its viewBox, and this viewBox changes with
   * every pinch.
   *
   * This was a fraction of the view width before, which held type still during
   * a zoom but tied it to how wide the map was drawn: the same label came out
   * at six pixels in a card on a phone and at twenty-six across a desktop.
   * Measuring the element instead makes fourteen pixels fourteen pixels
   * everywhere, which is the only definition of the right size there is.
   */
  const [wide, setWide] = useState(0);
  /**
   * Where the thing drawn over the map sits — the panel's zoom button — in
   * CSS pixels from the map's top-left corner, with the map's own size to
   * convert it by. Null for the full-screen viewer, which has nothing on top.
   */
  const [cover, setCover] = useState<{
    l: number;
    t: number;
    r: number;
    b: number;
    w: number;
    h: number;
  } | null>(null);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const s = el.getBoundingClientRect();
      setWide(s.width);
      const on = avoid?.current?.getBoundingClientRect();
      setCover(
        on
          ? {
              l: on.left - s.left,
              t: on.top - s.top,
              r: on.right - s.left,
              b: on.bottom - s.top,
              w: s.width,
              h: s.height,
            }
          : null
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [avoid]);
  /** one CSS pixel, in map units */
  const px = vw / (wide || 1000);

  /*
   * Where every name on the map is written, decided in one pass.
   *
   * Four kinds of name share this map — the chapter's own places, the era's
   * regions, the kinds of ground, and the gazetteer's countryside — and they
   * used to be placed by four rules that could not see each other. A region
   * was only checked against the edge of the frame, so "Lycaonia" went down
   * on top of "Cilicia". A chapter name that collided was pushed down a line,
   * and down again, with nothing to stop it at the bottom: Perga and Attalia
   * went out through the foot of Acts 14's frame and left their hairlines
   * pointing at nothing, and the zoom button sat on whatever was in its
   * corner. Across the forty most crowded chapters that came to 137 names
   * written over names, 185 cut off by the frame and 143 lines leaving it.
   *
   * Now every name is a measured box that must sit wholly inside the frame,
   * clear of the button, and each kind is placed in order of what matters
   * against everything placed before it. The chapter's towns come first and
   * are never dropped: beside the dot, then above and below, then further
   * off along a hairline — and if a cluster is truly too dense, the spot that
   * covers least, still inside the frame. The regions the chapter names come
   * next, written over their own ground — in the small panel, left for the
   * full-screen map when there is no room there; full screen, always. The
   * era's regions may move a line or two to find room, and the ground and
   * the countryside are left out where they do not fit, which is what they
   * were always for.
   *
   * The dots never move. The map stays true; only the writing makes room.
   */
  const layout = useMemo(() => {
    const frame: Box = [vx, vy, vx + vw, vy + vh];
    const sees = (x: number, y: number) =>
      x >= frame[0] && x <= frame[2] && y >= frame[1] && y <= frame[3];
    // the button, from the element's pixels into the map's units: the map is
    // drawn whole and centred inside its element
    let button: Box | null = null;
    if (cover && cover.w > 0 && cover.h > 0) {
      const k = Math.min(cover.w / vw, cover.h / vh);
      const ox = (cover.w - vw * k) / 2;
      const oy = (cover.h - vh * k) / 2;
      const air = 4;
      button = [
        vx + (cover.l - air - ox) / k,
        vy + (cover.t - air - oy) / k,
        vx + (cover.r + air - ox) / k,
        vy + (cover.b + air - oy) / k,
      ];
    }
    /*
     * Wholly inside the frame, a little way in from its edge, and never under
     * the button. These are walls, not crowding: a name crowded by another is
     * still half legible, and one under the button or past the edge is not
     * there at all.
     */
    const edge = px * 3;
    const fits = (b: Box) =>
      b[0] >= frame[0] + edge &&
      b[1] >= frame[1] + edge &&
      b[2] <= frame[2] - edge &&
      b[3] <= frame[3] - edge &&
      !(button && hits(b, button));

    /** everything already on the map that a new name must not cover */
    const taken = boxIndex(px * 48);
    const clear = (b: Box) => taken.clear(b);
    const covered = (b: Box, own?: Box) => taken.covered(b, own);

    // The chapter's own dots first: marks on the map that no name may cover.
    // A place outside the frame is left out, rather than drawn as half a name
    // at the edge — full screen, it is there as soon as the map is moved.
    const shown = data.places.filter((p) => sees(p.x, p.y));
    const dotOf = new Map<Place, Box>();
    for (const p of shown) {
      if (markFor(p.t) === 0) continue;
      const r = px * 4;
      const box: Box = [p.x - r, p.y - r, p.x + r, p.y + r];
      dotOf.set(p, box);
      taken.add(box);
    }

    /*
     * A journey's numbered stops: marks like the dots, which names keep off.
     * A number sits beside its stop rather than on it, so the dot stays the
     * place: up and to the left first, then wherever round it is free of the
     * dots and the numbers already set — Perga and Attalia, Seleucia and
     * Antioch, are a few miles apart and their numbers would sit on each
     * other. Where nowhere is free, this chapter's own stops take the least
     * crowded spot, and a stop on the way here is not numbered until a pinch
     * makes room for it, as the countryside arrives.
     *
     * Stops nearer each other than a number is wide share one number at that
     * size — Rome, the Three Taverns and the Forum of Appius are "11–13" from
     * across the Mediterranean, Bethphage, Jerusalem and Bethany "9–11" — and
     * come apart again as a pinch opens the ground between them.
     */
    const groups: { x: number; y: number; nums: number[]; s: 0 | 1; k: number }[] = [];
    for (const st of data.route?.stops ?? []) {
      if (!sees(st.x, st.y)) continue;
      const nums = st.n.split("·").map(Number).filter((v) => Number.isFinite(v) && v > 0);
      const g = groups.find((q) => Math.hypot(q.x - st.x, q.y - st.y) < px * 20);
      if (g) {
        g.x = (g.x * g.k + st.x) / (g.k + 1);
        g.y = (g.y * g.k + st.y) / (g.k + 1);
        g.k++;
        g.nums.push(...nums);
        if (st.s) g.s = 1;
      } else {
        groups.push({ x: st.x, y: st.y, nums, s: st.s, k: 1 });
      }
    }
    const badges: { x: number; y: number; cx: number; cy: number; w: number; n: string; s: 0 | 1 }[] = [];
    for (const g of groups) {
      const st = { x: g.x, y: g.y, s: g.s, n: stopNumbers(g.nums) };
      const w = Math.max(15, widthOf(st.n, FACES.stop) + 9);
      const half = w / 2 + 2;
      const spots: [number, number][] = [
        [-half, -10],
        [half, -10],
        [-half, 10],
        [half, 10],
        [-(half + 4), 0],
        [half + 4, 0],
        [0, -15],
        [0, 15],
      ];
      let best: { cx: number; cy: number; box: Box } | null = null;
      let least = Infinity;
      for (const [dx, dy] of spots) {
        const cx = st.x + dx * px;
        const cy = st.y + dy * px;
        const box: Box = [cx - (px * w) / 2, cy - px * 7.5, cx + (px * w) / 2, cy + px * 7.5];
        if (!fits(box)) continue;
        const cost = covered(box);
        if (cost < least) {
          least = cost;
          best = { cx, cy, box };
        }
        if (cost === 0) break;
      }
      if (!best || (!st.s && least > 0)) continue;
      taken.add(best.box);
      badges.push({ ...st, cx: best.cx, cy: best.cy, w });
    }

    /*
     * Towns first, then the regions the chapter names: a dot needs the room
     * beside it, and a region can be written anywhere over its own ground.
     *
     * A town is never left out. In the few clusters too dense for any free
     * spot — Nehemiah's gates, all within a few hundred yards of each other —
     * it takes the spot that covers least, still inside the frame. A region
     * with no free room near it is left out of the small map instead: written
     * over a town it hides the town, sent away on a line it points at the
     * wrong thing, and the full-screen map, four times the size, has room for
     * it.
     */
    const isArea = (p: Place) => (markFor(p.t) === 0 ? 1 : 0);
    const laid: (Place & {
      lx: number;
      ly: number;
      anchor: Spot["anchor"];
      lead: boolean;
    })[] = [];
    const layOut = (p: Place) => {
      const area = isArea(p) === 1;
      const face = area ? FACES.area : FACES.name;
      const w = widthOf(p.n, face);
      const spots = spotsFor(area, p.x < vx + vw * 0.62 ? 1 : -1);
      const own = dotOf.get(p);
      let pick = spots[0];
      let pickBox: Box | null = null;
      let least = Infinity;
      for (const spot of spots) {
        const box = textBox(p.x + spot.dx * px, p.y + spot.dy * px, w, face, spot.anchor, px);
        if (!fits(box)) continue;
        const cost = covered(box, own);
        if (cost < least) {
          least = cost;
          pick = spot;
          pickBox = box;
        }
        if (cost === 0) break;
      }
      if (area && least > 0 && glance) return;
      // nowhere inside the frame at all: a name wider than the map
      if (!pickBox) {
        pickBox = textBox(p.x + pick.dx * px, p.y + pick.dy * px, w, face, pick.anchor, px);
      }
      taken.add(pickBox);
      laid.push({
        ...p,
        lx: p.x + pick.dx * px,
        ly: p.y + pick.dy * px,
        anchor: pick.anchor,
        lead: pick.lead,
      });
    };
    const order = [...shown].sort((a, b) => isArea(a) - isArea(b) || a.y - b.y || a.x - b.x);
    for (const p of order) if (!isArea(p)) layOut(p);

    /*
     * Today's cities, when they are asked for. Full screen, between the
     * chapter's towns and its regions: a town and a city each mark one spot
     * and cannot move, and a region's name can — OpenBible pins Greece at
     * Athens, and written there first, Greece kept modern Athens off every
     * map of Paul in Achaia — and full screen a region is always written,
     * crowded if it must be. At a glance the chapter's own regions keep their
     * place, since there a region with no room is left out altogether.
     */
    const cities: { key: string; text: string; x: number; y: number; side: 1 | -1 }[] = [];
    const placeCities = () => {
      if (!modern) return;
      // Cities keep their distance from one another; from the ancient names
      // they need only not be written over them. Kept apart from those too,
      // as the countryside is, Kavala would never stand beside Neapolis —
      // which is the whole of what the toggle is for.
      const placed: [number, number][] = [];
      const gapCity = (px * spacing) ** 2;
      for (const [en, es, x, y] of modern.cities) {
        if (cities.length >= crowd) break;
        if (!sees(x, y)) continue;
        if (placed.some(([qx, qy]) => (qx - x) ** 2 + (qy - y) ** 2 < gapCity)) continue;
        const text = lang === "es" ? es : en;
        const mark: Box = [x - px * 3, y - px * 3, x + px * 3, y + px * 3];
        if (!clear(mark)) continue;
        const w = widthOf(text, FACES.city);
        const first: 1 | -1 = x < vx + vw * 0.72 ? 1 : -1;
        let side: 1 | -1 | null = null;
        let box: Box | null = null;
        for (const sd of [first, first > 0 ? -1 : 1] as (1 | -1)[]) {
          const b = textBox(x + sd * 5 * px, y + 3.6 * px, w, FACES.city, sd > 0 ? "start" : "end", px);
          if (fits(b) && clear(b)) {
            side = sd;
            box = b;
            break;
          }
        }
        if (!box || !side) continue;
        taken.add(mark);
        taken.add(box);
        placed.push([x, y]);
        cities.push({ key: `${en}${x}`, text, x, y, side });
      }
    };

    if (!glance) placeCities();
    for (const p of order) if (isArea(p)) layOut(p);
    if (glance) placeCities();

    // The era's regions, centred on their country, a line or two off it if
    // that is what it takes; left out if no line is free.
    const named: { key: string; text: string; x: number; y: number; water?: boolean }[] = [];
    // with today's map over it, today's countries take the place of the age's
    for (const r of modern ? [] : regions) {
      const face = r.water ? FACES.water : FACES.region;
      const text = lang === "es" ? r.es : r.en;
      const w = widthOf(text, face);
      for (const dy of [0, -14, 14, -28, 28]) {
        const y = r.y + dy * px;
        const box = textBox(r.x, y, w, face, "middle", px);
        if (!fits(box) || !clear(box)) continue;
        taken.add(box);
        named.push({ key: r.en, text, x: r.x, y, water: r.water });
        break;
      }
    }

    /*
     * The country between the pins.
     *
     * A chapter names four places on average, and four dots on an empty coast
     * is what you get when you zoom into them. Those four are four of 1,333,
     * and the rest were there the whole time — so the window's gazetteer is
     * offered, most-named first, and as many taken as will stand apart at the
     * size the map is drawn. How far apart is `spacing`, measured between
     * points, which is what makes the countryside arrive as a reader pinches
     * in; whether a name actually fits is the boxes, which is what keeps it
     * off everything already written. Full screen, each opens its card; in the
     * panel they are the paper, and a tap anywhere opens the map.
     */
    const gap = (px * spacing) ** 2;
    // A place the chapter names is not written again as countryside: the same
    // id, or the same name close by (a file from before the ids, or the
    // other entry of one spot). The same name far off is another place —
    // Antioch in Pisidia is still there when the chapter is about Syria's.
    const pinIds = new Set(data.places.map((p) => p.id).filter(Boolean));
    const near = px * 40;
    const pinned = (n: string, x: number, y: number, id?: string) =>
      (id !== undefined && pinIds.has(id)) ||
      data.places.some(
        (p) =>
          p.n.toLowerCase() === n.toLowerCase() &&
          Math.abs(p.x - x) < near &&
          Math.abs(p.y - y) < near
      );
    const already = new Set(
      regions.map((r) => (lang === "es" ? r.es : r.en).toLowerCase())
    );
    // the same filing for the density test, in squares one gap wide, so a
    // site only measures itself against the squares around it
    const reach = Math.max(px * spacing, 1e-9);
    const pointCells = new Map<number, [number, number][]>();
    const pointKey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
    const file = (x: number, y: number) => {
      const k = pointKey(Math.floor(x / reach), Math.floor(y / reach));
      const list = pointCells.get(k);
      if (list) list.push([x, y]);
      else pointCells.set(k, [[x, y]]);
    };
    const crowded = (x: number, y: number) => {
      const cx = Math.floor(x / reach);
      const cy = Math.floor(y / reach);
      for (let i = cx - 1; i <= cx + 1; i++) {
        for (let j = cy - 1; j <= cy + 1; j++) {
          for (const [qx, qy] of pointCells.get(pointKey(i, j)) ?? []) {
            if ((qx - x) ** 2 + (qy - y) ** 2 < gap) return true;
          }
        }
      }
      return false;
    };
    for (const p of laid) {
      file(p.x, p.y);
      file(p.lx, p.ly);
    }
    for (const r of named) file(r.x, r.y);

    /*
     * Today's countries, when they are asked for — their cities are set above,
     * with the chapter's towns — placed like the countryside, biggest first,
     * where they fit, and instead of it: an ancient village and a modern town
     * in the same place are two names for the eye to sort, and the toggle is
     * for seeing what stands there now.
     */
    const countries: { key: string; text: string; x: number; y: number }[] = [];
    if (modern) {
      // A country is big, and its name can go a good way from its middle
      // before it is somewhere else: up and down a few lines, and to either
      // side, nearest first, to clear the ancient names written over it —
      // and the cities, which cannot move, are set first.
      const around: [number, number][] = [];
      for (const dy of [0, -14, 14, -28, 28, -42, 42]) {
        for (const dx of [0, -60, 60, -120, 120]) around.push([dx, dy]);
      }
      around.sort((a, b) => a[0] ** 2 / 4 + a[1] ** 2 - (b[0] ** 2 / 4 + b[1] ** 2));
      for (const [en, es, x, y] of modern.countries) {
        const text = lang === "es" ? es : en;
        const w = widthOf(text, FACES.country);
        for (const [dx, dy] of around) {
          const lx = x + dx * px;
          const ly = y + dy * px;
          const box = textBox(lx, ly, w, FACES.country, "middle", px);
          if (!fits(box) || !clear(box)) continue;
          taken.add(box);
          file(lx, ly);
          countries.push({ key: en, text, x: lx, y: ly });
          break;
        }
      }
    }

    // The kinds of ground, faintest of all, and a hundred pixels apart: they
    // are the paper the chapter is printed on — after today's names, when
    // those are asked for, so the Pindus does not keep Athens off the map.
    const grounds: { key: string; text: string; x: number; y: number; range: boolean }[] = [];
    for (const t of base.terrain) {
      if (grounds.some((g) => Math.hypot(g.x - t.x, g.y - t.y) < px * 100)) continue;
      const range = t.k === "range";
      const face = range ? FACES.range : FACES.ground;
      const text = lang === "es" ? t.es : t.n;
      const w = widthOf(text, face);
      for (const dy of [0, -12, 12]) {
        const y = t.y + dy * px;
        const box = textBox(t.x, y, w, face, "middle", px);
        if (!fits(box) || !clear(box)) continue;
        taken.add(box);
        grounds.push({ key: `${t.n}|${t.x}|${t.y}`, text, x: t.x, y, range });
        break;
      }
    }

    for (const g of grounds) file(g.x, g.y);

    const sites: {
      n: string;
      x: number;
      y: number;
      mark: number;
      side: 1 | -1;
      id?: string;
    }[] = [];
    for (const [n, x, y, , mark, id] of modern ? [] : base.sites) {
      if (sites.length >= crowd) break;
      if (!sees(x, y)) continue;
      if (already.has(n.toLowerCase()) || pinned(n, x, y, id)) continue;
      if (crowded(x, y)) continue;
      const dot: Box = [x - px * 3, y - px * 3, x + px * 3, y + px * 3];
      if (mark && !clear(dot)) continue;
      const w = widthOf(n, FACES.site);
      const first: 1 | -1 = x < vx + vw * 0.72 ? 1 : -1;
      let side: 1 | -1 | null = null;
      let box: Box | null = null;
      for (const s of [first, first > 0 ? -1 : 1] as (1 | -1)[]) {
        const b = textBox(x + s * 4.5 * px, y + 3.6 * px, w, FACES.site, s > 0 ? "start" : "end", px);
        if (fits(b) && clear(b)) {
          side = s;
          box = b;
          break;
        }
      }
      if (!box || !side) continue;
      if (mark) taken.add(dot);
      taken.add(box);
      file(x, y);
      sites.push({ n, x, y, mark, side, id });
    }

    return { laid, named, grounds, sites, badges, countries, cities };
  }, [data.places, data.route, regions, base.terrain, base.sites, lang, vx, vy, vw, vh, px, spacing, crowd, cover, glance, modern]);

  return (
    <svg
      ref={svgRef}
      viewBox={view.join(" ")}
      className="mp-svg"
      role="img"
      aria-label={label}
      /* one pixel, published to the stylesheet: sizes in there are written as
         calc(var(--mp-u) * 14px) and come out fourteen pixels tall */
      style={{ "--mp-u": px } as React.CSSProperties}
    >
      {/* the sea is the ground; the land is drawn on top of it */}
      <rect x={vx} y={vy} width={vw} height={vh} className="mp-sea" />
      {base.land.map((d, i) => (
        <path key={`l${i}`} d={d} className="mp-land" />
      ))}
      {/* what KIND of land: the Negev, the mountains of Lebanon, the delta.
          Over the coast and under everything written on it, faint enough to be
          the paper rather than the subject. */}
      {base.terrain.map((t) =>
        t.d.map((d, i) => (
          <path key={`t${t.n}${i}`} d={d} className={`mp-ground mp-${t.k}`} />
        ))
      )}
      {/* The lie of the land (scripts/build-relief.mjs): slopes shaded as if
          lit from the north-west, blended into the map's own colours. Level
          ground is a middle grey the blend leaves alone, so the sea and the
          plains are untouched and every theme keeps its colours; a phone that
          never fetched it simply has the flat map it had before. */}
      <image
        href={`/maps/relief/${base.id}.webp`}
        x={0}
        y={0}
        width={base.width}
        height={base.height}
        preserveAspectRatio="none"
        className="mp-relief"
        aria-hidden
      />
      {base.rivers.map((d, i) => (
        <path key={`r${i}`} d={d} className="mp-river" />
      ))}
      {base.lakes.map((d, i) => (
        <path key={`w${i}`} d={d} className="mp-lake" />
      ))}

      {/* today's borders, settled and dashed, under everything written */}
      {modern?.borders.map((b, i) => (
        <path
          key={`m${i}`}
          d={b.d}
          className={`mp-border${b.k ? " mp-border-open" : ""}`}
          strokeWidth={px * 1.3}
          strokeDasharray={b.k ? `${px * 4} ${px * 3}` : undefined}
        />
      ))}

      {/* the journey: over the ground, under every name. The earlier legs
          faint, this chapter's bold with the way it went; by sea, dashed. */}
      {data.route && (
        <g className="mp-route" aria-hidden>
          {data.route.legs.map((l, i) => (
            <path
              key={`j${i}`}
              d={legPath(l.p)}
              className={`mp-leg${l.s ? " now" : ""}`}
              strokeWidth={px * (l.s ? 2.6 : 1.7)}
              strokeDasharray={l.sea ? `${px * 6} ${px * 4.5}` : undefined}
            />
          ))}
          {data.route.legs.map((l, i) => {
            if (!l.s) return null;
            const d = arrowOf(l.p, px * 4.5);
            return d ? <path key={`a${i}`} d={d} className="mp-arrow" /> : null;
          })}
          {data.route.stops.map((st, i) => (
            <circle
              key={`s${i}`}
              cx={st.x}
              cy={st.y}
              r={px * (st.s ? 2.4 : 1.8)}
              className={`mp-stop-dot${st.s ? " now" : ""}`}
            />
          ))}
        </g>
      )}

      {/* the kinds of ground, named faintest of all and only where they fit */}
      {layout.grounds.map((g) => (
        <text
          key={`g${g.key}`}
          x={g.x}
          y={g.y}
          className={`mp-ground-name${g.range ? " mp-range-name" : ""}`}
          textAnchor="middle"
        >
          {g.text}
        </text>
      ))}

      {/* under everything the chapter itself names, and under the era's
          regions: this is the ground, not the subject */}
      {layout.sites.map((p) => {
        // full screen, the countryside has cards too; at a glance it is the
        // paper, and a tap anywhere opens the map
        const tappable = !glance && !!p.id;
        const open = () => onPlace({ id: p.id, n: p.n });
        return (
          <g
            key={`n${p.id ?? p.n}${p.x}`}
            className={`mp-site${tappable ? " mp-site-tap" : ""}`}
            aria-hidden={tappable ? undefined : true}
            role={tappable ? "button" : undefined}
            tabIndex={tappable ? 0 : undefined}
            aria-label={tappable ? p.n : undefined}
            onClick={
              tappable
                ? (e) => {
                    e.stopPropagation();
                    open();
                  }
                : undefined
            }
            onKeyDown={
              tappable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") open();
                  }
                : undefined
            }
          >
            {tappable && (
              <circle cx={p.x} cy={p.y} r={px * 11} className="mp-hit" />
            )}
            {p.mark === 1 && <circle cx={p.x} cy={p.y} r={px * 1.5} />}
            {p.mark === 2 && (
              <path d={peakPath(p.x, p.y, px * 0.82)} className="mp-peak" />
            )}
            <text
              x={p.x + px * 4.5 * p.side}
              y={p.y + px * 3.6}
              textAnchor={p.side > 0 ? "start" : "end"}
            >
              {p.n}
            </text>
          </g>
        );
      })}

      {layout.named.map((r) => (
        <text
          key={r.key}
          x={r.x}
          y={r.y}
          className={`mp-region${r.water ? " mp-water" : ""}`}
          textAnchor="middle"
        >
          {r.text}
        </text>
      ))}

      {layout.countries.map((c) => (
        <text
          key={`c${c.key}`}
          x={c.x}
          y={c.y}
          className="mp-country"
          textAnchor="middle"
          aria-hidden
        >
          {c.text}
        </text>
      ))}
      {layout.cities.map((c) => (
        <g key={`k${c.key}`} className="mp-city" aria-hidden>
          <rect x={c.x - px * 2.2} y={c.y - px * 2.2} width={px * 4.4} height={px * 4.4} />
          <text
            x={c.x + px * 5 * c.side}
            y={c.y + px * 3.6}
            textAnchor={c.side > 0 ? "start" : "end"}
          >
            {c.text}
          </text>
        </g>
      ))}

      {layout.badges.map((b, i) => (
        <g key={`b${i}`} className={`mp-stop${b.s ? " now" : ""}`} aria-hidden>
          <rect
            x={b.cx - (px * b.w) / 2}
            y={b.cy - px * 7}
            width={px * b.w}
            height={px * 14}
            rx={px * 7}
          />
          <text x={b.cx} y={b.cy + px * 3.4} textAnchor="middle">
            {b.n}
          </text>
        </g>
      ))}

      {/* the regions first, so a town at a region's anchor — Antioch, where
          Pisidia is written — is on top of it and keeps its own tap */}
      {[...layout.laid].sort(byAreaFirst).map((p) => {
        const mark = markFor(p.t);
        const side = p.anchor === "end" ? -1 : 1;
        const open = () => onPlace({ id: p.id, n: p.n, v: p.v });
        return (
          <g
            key={p.id ?? p.n}
            className={`mp-pin${mark === 0 ? " mp-area" : ""}`}
            onClick={(e) => {
              // the map behind opens full screen; a place opens its card
              e.stopPropagation();
              open();
            }}
            role="button"
            tabIndex={0}
            aria-label={p.n}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") open();
            }}
          >
            {/* a fat invisible target: these are small marks and this is a
                phone. The dot is five pixels across and the thumb is not. A
                region has no dot, and is tapped by its name. */}
            {mark !== 0 && (
              <circle cx={p.x} cy={p.y} r={px * 15} className="mp-hit" />
            )}
            {/* the hairline back to the dot, for a name that had to be moved
                off it to be read at all */}
            {p.lead && (
              <line
                x1={p.x}
                y1={p.y}
                x2={p.lx - side * px}
                y2={p.ly - px * 3.5}
                className="mp-leader"
              />
            )}
            {mark === 1 && (
              <circle cx={p.x} cy={p.y} r={px * 2.7} className="mp-dot" />
            )}
            {mark === 2 && (
              <path d={peakPath(p.x, p.y, px)} className="mp-dot" />
            )}
            <text
              x={p.lx}
              y={p.ly}
              textAnchor={p.anchor}
              className="mp-name"
            >
              {p.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Then, or now: today's borders and cities laid over the ancient map. */
function NowToggle({ now, onNow }: { now: boolean; onNow: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`chip mp-now${now ? " chip-active" : ""}`}
      aria-pressed={now}
      onClick={(e) => {
        // the panel's map opens full screen on a tap; this is not that tap
        e.stopPropagation();
        onNow();
      }}
    >
      <Icon name="globe" /> {t("map.now")}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Full screen
// ---------------------------------------------------------------------------

const dist = (t: TouchList) =>
  Math.hypot(
    t[0].clientX - t[1].clientX,
    t[0].clientY - t[1].clientY
  );
const mid = (t: TouchList) => ({
  x: (t[0].clientX + t[1].clientX) / 2,
  y: (t[0].clientY + t[1].clientY) / 2,
});

/**
 * The map with the screen to itself, and two fingers to move it with.
 *
 * The app turns the browser's own pinch off everywhere — maximumScale 1, and
 * WebKit's gesture events swallowed — because magnifying the page is never
 * what a reader means by it. So the gesture is answered here instead, and
 * answered better: it moves the viewBox rather than the page, which means the
 * coastline is redrawn at the new scale instead of being blown up, and the
 * names stay the size they were.
 *
 * Panning is bounded by the base window rather than by the chapter's crop, so
 * a reader who zooms out of Bethlehem can wander up to Galilee and down to the
 * Negev — the whole map is there, and only the opening view was ever narrowed.
 */
function MapViewer({
  base,
  data,
  focus,
  regions,
  onPlace,
  onClose,
  modern,
  now,
  onNow,
}: {
  base: Base;
  data: ChapterMapData;
  /** already checked for four numbers — see viewOf */
  focus: View;
  regions: { en: string; es: string; water?: boolean; x: number; y: number }[];
  onPlace: (place: TappedPlace) => void;
  onClose: () => void;
  modern: Modern | null;
  now: boolean;
  onNow: () => void;
}) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);

  /*
   * How far in the reader may go.
   *
   * Not as far as the fingers will allow: Natural Earth resolves to a few
   * hundred metres and there is nothing under that to show, so past about a
   * sixteenth of the window a pinch buys nothing but a wider grey. The line is
   * drawn where the data stops rather than where the gesture does.
   */
  const MAX_ZOOM = 16;
  /** the smallest and largest the view may be, in window units */
  const limits = useRef({ min: base.width / MAX_ZOOM, max: base.width });

  /**
   * Open on the chapter's own crop, widened to the shape of the screen.
   *
   * Letterboxing is what happens when a viewBox and its element disagree about
   * their proportions, and it would put grey bars down the sides of a map that
   * has a sea to show there instead. Matching them on the way in means every
   * later zoom keeps them matched.
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const [fx, fy, fw, fh] = focus;
    let w = fw;
    let h = fh;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    limits.current = {
      min: base.width / MAX_ZOOM,
      max: Math.max(base.width, base.height * aspect),
    };
    setView(
      clamp([fx - (w - fw) / 2, fy - (h - fh) / 2, w, h], base, limits.current)
    );
    // opening measurement only — the view is the reader's from here on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, focus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /*
   * The gesture, in touch events rather than pointer events, to match the
   * reader's pinch — and because the two-finger case needs the whole touch
   * list at once rather than a set of pointers assembled by hand.
   */
  const gesture = useRef<{
    d: number;
    view: View;
    mid: { x: number; y: number };
    rect: DOMRect;
  } | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; rect: DOMRect } | null>(
    null
  );
  /** a finger that travelled is panning, and must not also count as a tap */
  const travelled = useRef(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !view) return;

    const onStart = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      travelled.current = 0;
      if (e.touches.length === 2) {
        drag.current = null;
        gesture.current = {
          d: dist(e.touches),
          view: viewRef.current,
          mid: mid(e.touches),
          rect,
        };
      } else if (e.touches.length === 1) {
        gesture.current = null;
        drag.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          view: viewRef.current,
          rect,
        };
      }
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (g && e.touches.length === 2) {
        e.preventDefault();
        const scale = dist(e.touches) / Math.max(1, g.d);
        const [ox, oy, ow, oh] = g.view;
        const { min, max } = limits.current;
        const w = Math.min(max, Math.max(min, ow / scale));
        const h = (w * oh) / ow;
        // the ground under the middle of the pinch is the ground that stays
        // there, so the map grows out of the point being held rather than out
        // of its own corner
        const ux = ox + ((g.mid.x - g.rect.left) / g.rect.width) * ow;
        const uy = oy + ((g.mid.y - g.rect.top) / g.rect.height) * oh;
        const now = mid(e.touches);
        travelled.current += Math.abs(scale - 1) * 100;
        setView(
          clamp(
            [
              ux - ((now.x - g.rect.left) / g.rect.width) * w,
              uy - ((now.y - g.rect.top) / g.rect.height) * h,
              w,
              h,
            ],
            base,
            limits.current
          )
        );
        return;
      }
      const d = drag.current;
      if (d && e.touches.length === 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - d.x;
        const dy = e.touches[0].clientY - d.y;
        travelled.current = Math.max(travelled.current, Math.hypot(dx, dy));
        const [ox, oy, ow, oh] = d.view;
        setView(
          clamp(
            [
              ox - (dx / d.rect.width) * ow,
              oy - (dy / d.rect.height) * oh,
              ow,
              oh,
            ],
            base,
            limits.current
          )
        );
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        gesture.current = null;
        drag.current = null;
      } else if (e.touches.length === 1) {
        // a pinch that lost a finger becomes a drag from where that one is
        gesture.current = null;
        drag.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          view: viewRef.current,
          rect: el.getBoundingClientRect(),
        };
      }
    };

    // WebKit's own pinch is a separate gesture stack from touch events, and
    // preventDefault on touchmove does not reach it — see the reader's pinch.
    const stopGesture = (ev: Event) => ev.preventDefault();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, view !== null]);

  /** the live view, readable from inside a handler that was built earlier */
  const viewRef = useRef<View>(focus);
  if (view) viewRef.current = view;

  /** A step of zoom about the middle, for a mouse and for a keyboard. */
  const step = (factor: number) => {
    const v = viewRef.current;
    const { min, max } = limits.current;
    const w = Math.min(max, Math.max(min, v[2] * factor));
    const h = (w * v[3]) / v[2];
    setView(
      clamp([v[0] + (v[2] - w) / 2, v[1] + (v[3] - h) / 2, w, h], base, limits.current)
    );
  };

  const reset = () => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const [fx, fy, fw, fh] = focus;
    let w = fw;
    let h = fh;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    setView(
      clamp([fx - (w - fw) / 2, fy - (h - fh) / 2, w, h], base, limits.current)
    );
  };

  return (
    <div className="map-full">
      <div className="map-full-bar">
        <div className="map-full-title">
          <p className="mp-era">{t(`map.era.${data.era}` as MessageKey)}</p>
          {data.route && (
            <p className="mp-journey">
              {t(`map.journey.${data.route.j}` as MessageKey)}
            </p>
          )}
        </div>
        <div className="map-full-tools">
          <button
            type="button"
            className="lex-close"
            onClick={() => step(1 / 0.6)}
            aria-label={t("map.zoomOut")}
          >
            −
          </button>
          <button
            type="button"
            className="lex-close"
            onClick={() => step(0.6)}
            aria-label={t("map.zoomIn")}
          >
            +
          </button>
          <button
            type="button"
            className="lex-close"
            onClick={reset}
            aria-label={t("map.reset")}
          >
            <Icon name="globe" />
          </button>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("search.close")}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="map-full-stage" ref={boxRef}>
        {view && (
          <MapArt
            base={base}
            data={data}
            regions={regions}
            view={view}
            label={t("reader.ctxWhere")}
            /* the gap names keep from each other on the glass, in pixels */
            spacing={22}
            crowd={150}
            modern={modern}
            onPlace={(place) => {
              // a finger that panned is not a finger that tapped
              if (travelled.current > 10) return;
              onPlace(place);
            }}
          />
        )}
      </div>
      <div className="map-full-note">
        <NowToggle now={now} onNow={onNow} />
        <span>{t("map.pinchHint")}</span>
      </div>
    </div>
  );
}

/** Keep a view inside the map it is a view of. */
function clamp(
  [x, y, w, h]: View,
  base: Base,
  limits: { min: number; max: number }
): View {
  const width = Math.min(limits.max, Math.max(limits.min, w));
  const height = (h * width) / w;
  // Wider than the map itself means there is nothing left to choose: centre
  // it, and let the sea run out to the edges of the screen.
  const nx =
    width >= base.width
      ? (base.width - width) / 2
      : Math.min(Math.max(x, 0), base.width - width);
  const ny =
    height >= base.height
      ? (base.height - height) / 2
      : Math.min(Math.max(y, 0), base.height - height);
  return [nx, ny, width, height];
}

// ---------------------------------------------------------------------------

export default function ChapterMap({
  bookNr,
  chapter,
  onGoToVerse,
  onGoToRef,
}: {
  bookNr: number;
  chapter: number;
  /** take the reader to the verse this place is named in */
  onGoToVerse: (verse: number) => void;
  /** take the reader to another chapter that names it, from this verse */
  onGoToRef?: (ref: [number, number, number], fromVerse: number) => void;
}) {
  const { lang, t } = useI18n();
  const [data, setData] = useState<ChapterMapData | null | undefined>(undefined);
  const [base, setBase] = useState<Base | null>(null);
  const [eras, setEras] = useState<Eras>({});
  const [full, setFull] = useState(false);
  /** the place whose card is open, over the panel or the full-screen map */
  const [card, setCard] = useState<TappedPlace | null>(null);
  /** today's borders and cities over the ancient map, as the reader last left it */
  const [now, setNow] = useState(false);
  useEffect(() => setNow(readNow()), []);
  const [modern, setModern] = useState<Modern | null>(null);
  const toggleNow = () =>
    setNow((on) => {
      writeNow(!on);
      return !on;
    });
  /** the zoom button in the panel's corner, which names keep clear of */
  const expandRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /*
   * What comes back over the wire is checked, not trusted.
   *
   * This app's service worker serves its datasets cache-first and on purpose,
   * so new code meeting an older copy of a file is a normal state here rather
   * than an exotic one: a reader who had opened a map before the gazetteer
   * shipped had base maps in that cache with no `sites` in them, and the loop
   * over it threw and took the whole reader down with it — Acts crashed while
   * Genesis was fine, because only some of the six windows had been cached.
   *
   * So anything missing degrades to nothing rather than to an exception. A map
   * without its gazetteer is a map with fewer names on it, which is what the
   * reader had yesterday, and the next time the worker turns the cache over it
   * fills in silently.
   */
  useEffect(() => {
    let cancelled = false;
    load<Record<string, ChapterMapData>>(`/maps/${bookNr}.json`, {}).then(
      (book) => {
        if (cancelled) return;
        const row = book?.[String(chapter)];
        setData(
          row && Array.isArray(row.places) && row.places.length > 0 ? row : null
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [bookNr, chapter]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    Promise.all([
      load<Base | null>(`/maps/base/${data.base}.json`, null),
      load<Eras>("/maps/eras.json", {}),
    ]).then(([b, e]) => {
      if (cancelled) return;
      // the coastline is the one part a map cannot do without
      setBase(
        b && Array.isArray(b.land) && b.width > 0 && b.height > 0
          ? {
              ...b,
              lakes: Array.isArray(b.lakes) ? b.lakes : [],
              rivers: Array.isArray(b.rivers) ? b.rivers : [],
              sites: Array.isArray(b.sites) ? b.sites : [],
              terrain: Array.isArray(b.terrain) ? b.terrain : [],
            }
          : null
      );
      setEras(e && typeof e === "object" ? e : {});
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  // today's layer for this window, fetched the first time it is asked for
  useEffect(() => {
    if (!now || !base) {
      setModern(null);
      return;
    }
    let cancelled = false;
    load<Modern | null>(`/maps/modern/${base.id}.json`, null).then((m) => {
      if (cancelled) return;
      setModern(
        m && Array.isArray(m.borders) && Array.isArray(m.countries) && Array.isArray(m.cities)
          ? m
          : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [now, base]);

  /*
   * The panel's own shape, for the crop it opens at.
   *
   * The small map is as wide as the panel and no taller than 46% of the
   * screen. A chapter that runs north and south — Nazareth to Bethlehem — has
   * a crop taller than that shape, and drawn into it the map was shrunk to
   * the height and the width left over showed whatever lay beside the crop,
   * past the window's own edge as a bare band of sea. So the crop is widened
   * to the panel's shape about its middle, inside the window.
   */
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameAspect, setFrameAspect] = useState(0);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () =>
      setFrameAspect(el.clientWidth / Math.max(1, window.innerHeight * 0.46));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [data, base]);
  const panelView = useMemo((): View | null => {
    if (!base || !data) return null;
    const [fx, fy, fw, fh] = viewOf(data, base);
    if (!frameAspect || fw / fh >= frameAspect) return [fx, fy, fw, fh];
    const w = Math.min(base.width, fh * frameAspect);
    const x = Math.max(0, Math.min(base.width - w, fx + fw / 2 - w / 2));
    if (w >= fh * frameAspect - 0.5) return [x, fy, w, fh];
    // The window itself is narrower than the panel's shape: the rest is taken
    // off the top and the bottom instead, as far as the chapter's own places
    // and this chapter's journey allow, and never into them.
    const ys = [
      ...data.places.map((p) => p.y),
      ...(data.route?.legs ?? []).filter((l) => l.s).flatMap((l) => l.p.map(([, y]) => y)),
    ];
    const lo = Math.min(...ys) - 45;
    const hi = Math.max(...ys) + 30;
    const h = Math.min(fh, Math.max(w / frameAspect, hi - lo));
    // about the crop's middle, moved to hold the places, and inside the crop
    let y = fy + fh / 2 - h / 2;
    y = Math.min(Math.max(y, hi - h), lo);
    y = Math.max(fy, Math.min(fy + fh - h, y));
    return [x, y, w, h];
  }, [base, data, frameAspect]);

  const regions = useMemo(() => {
    if (!base || !data) return [];
    const to = project(base.bounds, base.width);
    const [w, s, e, n] = base.bounds;
    const [fx, fy, fw, fh] = viewOf(data, base);
    const kept: { en: string; es: string; water?: boolean; x: number; y: number }[] =
      [];
    for (const r of eras[data.era]?.regions ?? []) {
      const [lon, lat] = r.ll;
      // a name for a country off the edge of this window is a name nobody can
      // place, so it is left off rather than pinned to the border
      if (lon < w || lon > e || lat < s || lat > n) continue;
      const [x, y] = to(lon, lat);
      // and nothing far outside the crop this chapter opens at — with a
      // margin, because the full-screen view can be panned past it
      if (
        x < fx - fw ||
        x > fx + fw * 2 ||
        y < fy - fh ||
        y > fy + fh * 2
      ) {
        continue;
      }
      /*
       * A region name gives way to the chapter's own places, always.
       *
       * Twice over: by name, because Matthew 2 names Judea and Galilee itself
       * and the era would have written both again a few pixels away; and by
       * position, because a country's name printed across a town's is two
       * words in one place and neither of them readable.
       */
      const label = lang === "es" ? r.es : r.en;
      if (data.places.some((p) => p.n.toLowerCase() === label.toLowerCase())) {
        continue;
      }
      if (data.places.some((p) => Math.hypot(p.x - x, p.y - y) < fw * 0.16)) {
        continue;
      }
      /*
       * And no two names on top of each other.
       *
       * An era's regions are written for the window that era usually gets.
       * Jonah reaches Tarshish, so his chapter is drawn on the whole known
       * world — where Israel, Judah, Philistia, Moab and Edom all land inside
       * a thumbnail of the Levant and print as one smudge. These are
       * decoration, not the chapter's content, so the crowded ones are simply
       * dropped; the places the chapter names are never dropped this way.
       */
      if (kept.some((k) => Math.hypot(k.x - x, k.y - y) < fw * 0.16)) continue;
      kept.push({ ...r, x, y });
    }
    return kept;
  }, [base, data, eras, lang]);

  /*
   * Nothing at all until there is something to draw — not a heading over a
   * space, and not a skeleton either.
   *
   * A little over a third of chapters name nowhere: the Psalms mostly, the
   * Proverbs, the doctrinal stretches of the letters. This owns its whole
   * section rather than sitting inside one, so on those chapters the panel
   * simply opens with the setting, as it always did.
   */
  if (data === undefined || data === null || !base) return null;

  const focus = viewOf(data, base);

  return (
    <div className="ctx-section ctx-map">
      <h3>
        <Icon name="globe" /> {t("reader.ctxWhere")}
      </h3>
      <p className="mp-era">{t(`map.era.${data.era}` as MessageKey)}</p>
      {data.route && (
        <p className="mp-journey">{t(`map.journey.${data.route.j}` as MessageKey)}</p>
      )}
      {/* The whole map opens it, not a corner of it: at this size the map is
          an illustration, and an illustration you can enlarge should enlarge
          when you touch it. The places keep their own tap — they stop the
          click before it gets here. */}
      <div
        ref={frameRef}
        className="mp-frame"
        role="button"
        tabIndex={0}
        aria-label={t("map.expand")}
        onClick={() => setFull(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setFull(true);
        }}
      >
        <MapArt
          base={base}
          data={data}
          regions={regions}
          view={panelView ?? focus}
          label={t("reader.ctxWhere")}
          /* Far wider apart in the panel than in the viewer, and far fewer.
             The same map is a third of the width in a card, and a countryside
             that reads full screen reads there as a crowd the chapter's own
             places are lost in — which is the one thing the panel is for. */
          spacing={36}
          crowd={34}
          avoid={expandRef}
          glance
          onPlace={setCard}
          modern={modern}
        />
        <span className="mp-expand" aria-hidden ref={expandRef}>
          <Icon name="search" />
        </span>
      </div>
      <div className="mp-tools">
        <NowToggle now={now} onNow={toggleNow} />
      </div>
      {now && <p className="mp-note">{t("map.nowNote")}</p>}
      <p className="mp-note">
        {data.more
          ? `${t("map.tapAPlace")} · ${t("map.andMore", { n: String(data.more) })}`
          : t("map.tapAPlace")}
      </p>
      {data.route && <p className="mp-note">{t("map.routeNote")}</p>}
      <p className="mp-credit">{t("map.credit")}</p>

      {/* Out to the body: the context panel is a .glass card, and a
          backdrop-filter makes its element the containing block for anything
          fixed inside it — so rendered where it is written, a full-screen map
          would be a small box inside a modal. */}
      {full &&
        mounted &&
        createPortal(
          <MapViewer
            base={base}
            data={data}
            focus={focus}
            regions={regions}
            onClose={() => setFull(false)}
            onPlace={setCard}
            modern={modern}
            now={now}
            onNow={toggleNow}
          />,
          wordPortal()
        )}
      {card && (
        <PlaceCard
          place={card}
          bookNr={bookNr}
          chapter={chapter}
          onClose={() => setCard(null)}
          onGoToVerse={(verse) => {
            setCard(null);
            setFull(false);
            onGoToVerse(verse);
          }}
          onGoToRef={(ref) => {
            const from = card.v ?? 1;
            setCard(null);
            setFull(false);
            if (onGoToRef) onGoToRef(ref, from);
          }}
        />
      )}
    </div>
  );
}
