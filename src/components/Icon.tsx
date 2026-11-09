// Communion's icons are drawn, not typed. Emoji are colour bitmaps the
// browser paints from the system font — they cannot be tinted, so they always
// arrived in somebody else's palette, looking like a text message dropped into
// the page. These are line drawings on a 24-grid that stroke in currentColor,
// so an icon is gold on a heading, dim on an inactive tab, and brown in light
// mode, without ever being told which.

export type IconName = keyof typeof PATHS;

/** A full circle as a path — two half arcs, so it strokes like everything else. */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

/** Every icon: a list of <path d="..."> strings, drawn on a 24x24 grid. */
const PATHS = {
  // ---- reading ----
  book: [
    "M12 7C10.2 5.6 8 5 5.5 5c-.9 0-1.7.1-2.5.2v13c.8-.1 1.6-.2 2.5-.2 2.5 0 4.7.6 6.5 2",
    "M12 7c1.8-1.4 4-2 6.5-2 .9 0 1.7.1 2.5.2v13c-.8-.1-1.6-.2-2.5-.2-2.5 0-4.7.6-6.5 2",
    "M12 7v13",
  ],
  books: [
    "M4 4h4v16H4z",
    "M10 4h4v16h-4z",
    "M16.2 4.6l3.6.9-3.7 15-3.6-1",
  ],
  scroll: [
    "M8 4h9.5a1.5 1.5 0 0 1 1.5 1.5V18a3 3 0 0 1-3 3H7",
    "M8 4a2 2 0 0 0-2 2v1.5h2.8",
    "M7 21a3 3 0 0 0 3-3v-1.5H6.6",
    "M11.5 9h4.5M11.5 12.5h4.5"
  ],
  news: ["M3 5h14v15H3z", "M17 9h4v9a2 2 0 0 1-4 0z", "M6 9h8M6 13h8M6 17h5"],
  letters: [
    "M3 18l4-10 4 10",
    "M4.4 14.8h5.2",
    "M20.5 11.5v6.5",
    "M20.5 14.5a3 3 0 1 0 0 3.2"
  ],

  // ---- faith ----
  cross: ["M12 3v18", "M6.5 8.5h11"],
  prayer: [
    "M9.7 21.2c-1.7 0-3-1.3-3-3.1 0-3.2 1.1-6.1 2-9 .4-1.3.8-2.4 1.5-2.4.6 0 1 .9 1.2 2.1",
    "M14.3 21.2c1.7 0 3-1.3 3-3.1 0-3.2-1.1-6.1-2-9-.4-1.3-.8-2.4-1.5-2.4-.6 0-1 .9-1.2 2.1",
    "M12 8.4v12.8",
    "M8.3 17.8h7.4"
  ],
  dove: [
    "M3.5 20l2.2-3.2C10 16.5 13.6 14 15.7 10.4 16.9 8.3 17.6 6 20.5 4c0 3-.4 4.6-1.3 6.6-2.2 4.9-6.6 8-11.4 8.2z",
    "M8.5 13.6c2 1.1 4.2 1.2 6.2.3",
  ],
  // the Illuminated theme: light shining in the darkness
  candle: [
    "M12 3.2c1.4 1.9 2 3 2 4a2 2 0 0 1-4 0c0-1 .6-2.1 2-4z",
    "M9.5 10.5h5V21h-5z",
    "M9.5 14h5",
  ],
  // the Parchment theme: an open scroll on its two rollers, handles showing
  // above and below, three lines written between, and the sheet's edges
  // gone wavy the way the old leaf-of-paper icon had them. Drawn to the full
  // height of the box, handle tip to handle tip, and a little narrower than
  // it is tall — at the width of the box it read as squashed beside the
  // candle and the newspaper. Not `scroll` above, which is a page with a
  // curled edge and stands for reading plans; this one is the book of the
  // ancient world, and the theme's own.
  parchment: [
    "M5 3.2a1.5 1.5 0 0 1 1.5 1.5v14.6a1.5 1.5 0 0 1-3 0V4.7a1.5 1.5 0 0 1 1.5-1.5z",
    "M19 3.2a1.5 1.5 0 0 1 1.5 1.5v14.6a1.5 1.5 0 0 1-3 0V4.7a1.5 1.5 0 0 1 1.5-1.5z",
    "M5 1.2v2M5 20.8v2M19 1.2v2M19 20.8v2",
    "M6.5 5.4c1.8-1.5 3.7 1.5 5.5 0s3.7-1.5 5.5 0",
    "M6.5 18.6c1.8-1.5 3.7 1.5 5.5 0s3.7-1.5 5.5 0",
    "M9 9.5h6M9 12h6M9 14.5h4",
  ],
  // a map pin: the Context pop-up, which is where it happened. Not a folded
  // map, which at pill size is three upright strips — the same shape as the
  // books on Compare beside it.
  pin: [
    "M12 21.2c-4.4-4.5-6.6-8.1-6.6-11a6.6 6.6 0 0 1 13.2 0c0 2.9-2.2 6.5-6.6 11z",
    circle(12, 10.2, 2.4),
  ],
  // "Thy word is a lamp unto my feet" (Psalm 119:105): the clay oil lamp of
  // the psalmist's day, flame at the spout. Marks Ask.
  lamp: [
    "M3.5 13h10.5l6.8-2-3.6 4.3a4 4 0 0 1-3 1.7H8a4.5 4.5 0 0 1-4.5-4z",
    "M20.2 4.4c1.2 1.6 1.8 2.6 1.8 3.6a1.8 1.8 0 0 1-3.6 0c0-1 .6-2 1.8-3.6z",
    "M8.2 13a1.8 1.8 0 0 1 3.6 0",
    "M9.6 17l-.7 2.6h5.7l-.7-2.6",
  ],
  anchor: [
    "M12 8.5V21",
    "M12 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M8.5 11h7",
    "M3.5 15c0 3.3 3.8 6 8.5 6s8.5-2.7 8.5-6",
  ],

  // ---- the reader ----
  bookmark: ["M7 3.5h10a1 1 0 0 1 1 1V21l-6-4.2L6 21V4.5a1 1 0 0 1 1-1z"],
  collection: [
    "M5 6.5h6l1.5 2H19a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1z",
  ],
  note: ["M4 20h4L18.2 9.8a2.7 2.7 0 0 0-3.8-3.8L4 16.2z", "M13.6 6.8l3.6 3.6"],
  link: [
    "M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M16.2 16.2L21 21"],
  sparkle: ["M12 3l1.9 5.4 5.4 1.9-5.4 1.9L12 18l-1.9-5.8-5.4-1.9 5.4-1.9z"],
  jar: [
    "M9 3.2h6",
    "M9.8 3.2C7.4 5.1 6 7.9 6 11.4 6 16 8.7 20.5 12 20.5s6-4.5 6-9.1c0-3.5-1.4-6.3-3.8-8.2",
    "M6.3 9c-1.6.2-2.6 1.2-2.6 2.4s1 2.2 2.6 2.4",
    "M17.7 9c1.6.2 2.6 1.2 2.6 2.4s-1 2.2-2.6 2.4"
  ],
  quote: ["M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-5 4V6a1 1 0 0 1 1-1z"],

  // ---- people, the wall, and getting word out ----
  people: [
    "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11z",
    "M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6",
    "M16 5.2a3.2 3.2 0 0 1 0 6",
    "M17.5 14.8c2.4.6 4 2.4 4 5.2",
  ],
  person: [
    "M12 11.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z",
    "M4.5 20.5c0-3.9 3.4-6.4 7.5-6.4s7.5 2.5 7.5 6.4",
  ],
  /**
   * A wall, with something hung on it.
   *
   * A framed card on its nail, hung by two wires. Bricks were tried and
   * thrown away: a wall on its own is masonry, and the courses fought the
   * frame for the same few pixels until neither could be read. What says
   * wall here is the hanging, not the wall.
   */
  wall: [
    circle(12, 3.2, 0.9),
    "M11.4 4L6.4 8.2M12.6 4l5 4.2",
    "M5.6 8.2h12.8v11.6H5.6z",
    "M8.6 12.4h6.8M8.6 15.6h4.4",
  ],
  /**
   * A reading plan: days in a list, the first of them done.
   *
   * It borrowed the scroll before this, which is the Journal's own icon — so
   * one segment of the Journal wore the badge of the screen it was sitting
   * on. Deliberately not the calendar either: that belongs to a different
   * destination, and a plan is a sequence you work through rather than a
   * month you look at.
   */
  plan: [
    "M3.2 6.3l1.8 1.8 3.3-3.5",
    "M11.4 6.4h9.4",
    "M3.9 12.4h4.4",
    "M11.4 12.4h9.4",
    "M3.9 18.4h4.4",
    "M11.4 18.4h9.4",
  ],
  bell: [
    "M12 3.2A5.3 5.3 0 0 0 6.7 8.5c0 5-2.2 7.3-2.2 7.3h15s-2.2-2.3-2.2-7.3A5.3 5.3 0 0 0 12 3.2z",
    "M9.8 19a2.2 2.2 0 0 0 4.4 0",
  ],
  share: ["M12 16V3.5", "M7.5 8L12 3.5 16.5 8", "M4.5 14v5.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14"],
  download: ["M12 3.5V16", "M7.5 11.5L12 16l4.5-4.5", "M4.5 14v5.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14"],
  clipboard: [
    "M9 4.5H6.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1H15",
    "M9.5 3h5a.8.8 0 0 1 .8.8v2.4H8.7V3.8A.8.8 0 0 1 9.5 3z",
  ],
  phone: ["M7.5 2.5h9a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z", "M12 18.3a.7.7 0 1 0 0-.1"],

  // ---- settings and chrome ----
  menu: ["M4 7h16M4 12h16M4 17h16"],
  gear: [
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
    "M12 2.8l1.3 2.4 2.7-.4 .4 2.7 2.4 1.3-1.2 2.4 1.2 2.4-2.4 1.3-.4 2.7-2.7-.4L12 21.2l-1.3-2.4-2.7.4-.4-2.7-2.4-1.3 1.2-2.4-1.2-2.4 2.4-1.3.4-2.7 2.7.4z",
  ],
  tools: [
    "M14.5 3.5a4.5 4.5 0 0 1 5 6.2l-9 9a2.4 2.4 0 0 1-3.4-3.4l9-9a4.5 4.5 0 0 1-1.6-2.8z",
    "M5 5l3.5 3.5",
  ],
  lock: ["M7 10.5V8a5 5 0 0 1 10 0v2.5", "M5.5 10.5h13V20h-13z", "M12 14v2.5"],
  globe: [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "M3.2 12h17.6",
    "M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z",
  ],
  trash: ["M4.5 7h15", "M9.5 7V4h5v3", "M6.5 7l1 13.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9L17.5 7"],
  sun: [
    "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
    "M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8M19.1 19.1l-1.8-1.8M6.7 6.7L4.9 4.9",
  ],
  moon: ["M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"],
  sunrise: ["M12 15.5a4 4 0 0 1 8 0", "M4 15.5a4 4 0 0 1 4-4", "M2.5 19.5h19", "M12 3v4M5.5 6.5l1.8 1.8M18.5 6.5l-1.8 1.8"],
  hourglass: [
    "M6.5 3h11M6.5 21h11",
    "M8.5 3c0 4.2 3.5 6.4 3.5 6.4S15.5 7.2 15.5 3",
    "M8.5 21c0-4.2 3.5-6.4 3.5-6.4s3.5 2.2 3.5 6.4",
  ],
  check: ["M4.5 12.5l5 5 10-11"],
  send: ["M12 19.5V5", "M6 11l6-6 6 6"],
  close: ["M5.5 5.5l13 13M18.5 5.5l-13 13"],
  // the way back from wherever a reference took you: an arrow that turns round
  back: ["M9 5.5L3.5 11 9 16.5", "M3.5 11h11a6 6 0 0 1 6 6v1.5"],

  // ---- growth and nature ----
  seedling: [
    "M12 21v-7.5",
    "M12 13.5c-4 0-6.5-2.6-6.5-6.5 4 0 6.5 2.6 6.5 6.5z",
    "M12 13.5c4 0 6.5-2.6 6.5-6.5-4 0-6.5 2.6-6.5 6.5z",
  ],
  flower: [
    circle(12, 12, 2.3),
    circle(12, 7.2, 2.5),
    circle(16.6, 10.6, 2.5),
    circle(14.8, 16, 2.5),
    circle(9.2, 16, 2.5),
    circle(7.4, 10.6, 2.5)
  ],
  mountain: ["M2 19.5l6.5-11 4 6 3-4.5 6.5 9.5z", "M8.5 8.5l2.5 4"],
  fire: [
    "M12.4 2.5C13 7.1 7.2 8.8 7.2 13.6a4.8 4.8 0 0 0 9.6 0c0-2.1-1.1-3.6-2.4-4.7",
    "M12 13.2c.4 1.8-.4 3-1.6 3.4a2.4 2.4 0 0 0 3.8 1.4c.7-.6 1-1.6.7-2.6"
  ],
  heart: ["M12 20.5C5.5 16.4 3 13 3 9.6A4.6 4.6 0 0 1 12 7.4a4.6 4.6 0 0 1 9 2.2c0 3.4-2.5 6.8-9 10.9z"],
  shield: ["M12 3l8 3v6.2C20 17.4 16.4 20.5 12 21.5 7.6 20.5 4 17.4 4 12.2V6z"],
  party: ["M3 21l5-13 8 8z", "M8 8a3 3 0 0 1 3-4M16 5.5a2 2 0 0 1 3 1.5M19 12.5a2 2 0 0 1 2-1.5", "M13.5 4.5v.1M20 17.5v.1M9.5 2.5v.1"],
  music: [
    "M9 17.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z",
    "M20.5 15.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z",
    "M9 17.5V6.2l11.5-2.2v11.5",
    "M9 9.5l11.5-2.2",
  ],
  runner: [
    "M14.5 5.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z",
    "M6 21l3.5-5 2-4-1-4-3.5 2-1.5 3",
    "M11.5 12l3.5 2 1 7",
    "M12.5 8.5l4 1 2.5-2.5",
  ],
  owl: [
    "M12 21.2c-4 0-6.6-3.2-6.6-7.6 0-5 2.6-9.2 6.6-9.2s6.6 4.2 6.6 9.2c0 4.4-2.6 7.6-6.6 7.6z",
    circle(9.5, 11.4, 1.9),
    circle(14.5, 11.4, 1.9),
    "M12 13.8l-1.2 1.6h2.4z",
    "M6.6 6.6L4.8 3.4M17.4 6.6l1.8-3.2"
  ],
  // a framed picture: hills and the sun
  picture: [
    "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    "M3.5 16.5l5-5 4.5 4.5 2.5-2.5 5 5",
    circle(15.5, 9.5, 1.6),
  ],
};

/** Icons whose shape needs a filled counter to read at text size. */
const FILLED = new Set<IconName>([]);

export default function Icon({
  name,
  className,
  title,
  filled,
}: {
  name: IconName;
  className?: string;
  title?: string;
  /** Fill the shape rather than outline it — a bookmark that is set, say. */
  filled?: boolean;
}) {
  const paths = PATHS[name];
  return (
    <svg
      className={`ic${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={filled || FILLED.has(name) ? "currentColor" : "none"}
        />
      ))}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
