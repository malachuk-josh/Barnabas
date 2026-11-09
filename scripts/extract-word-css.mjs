#!/usr/bin/env node
// One-off: extract The Word's CSS from Communion's app/globals.css into
// src/app/word/word.css, scoped under .word-root so it cannot reach the rest
// of Barnabas.
//
//   node scripts/extract-word-css.mjs <communion>/app/globals.css
//
// What is kept:
//   - lines 1–373 whole: the variables, the three themes, the base rules and
//     "The Word only" block;
//   - everywhere else, a selector only when every class it names is used by
//     the ported components (src/components, src/app/word). Classes inside
//     :not(...) do not count, since they need not exist. Bare-element rules
//     are kept: past the base there are only eight, for fields and <mark>;
//   - from the Bookshelf (lines 6493–7435), only the bk-viewer rules the
//     picture viewer uses; and nothing from the Picture Bible or the
//     illustrated Bible (line 7630 on).
//
// How it is scoped (postcss-prefix-selector, with a transform):
//   :root / html / body           -> .word-root
//   :root[data-theme=x] ...        -> .word-root[data-theme=x] ...
//   :root[data-theme=x] body       -> .word-root[data-theme=x]
//   html.reading ...               -> .word-root ...   (always reading here)
//   anything else                  -> .word-root <selector>
// Keyframes are left alone.

import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import prefixer from "postcss-prefix-selector";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/extract-word-css.mjs <communion globals.css>");
  process.exit(1);
}
const OUT = path.join(ROOT, "src/app/word/word.css");
const SCOPE = ".word-root";

const BASE_END = 373;
const BOOKSHELF = [6493, 7435];
const DROP_FROM = 7630;

// Every identifier-like token in the ported components. Over-inclusive on
// purpose: a class name that also happens to be a JS word costs a few rules.
const COMPONENTS = [
  "Reader", "BookNav", "Icon", "ChapterMap", "PlaceCard", "StudyPictures",
  "PictureViewer", "AskVerse", "SearchScope", "Concordance", "HighlightedText",
  "ReadingSliders", "TypefacePicker", "ThemeToggle", "WordApp",
].map((n) => path.join(ROOT, "src/components", `${n}.tsx`));
const extra = [path.join(ROOT, "src/app/word/page.tsx")];
const used = new Set();
for (const file of [...COMPONENTS, ...extra]) {
  if (!fs.existsSync(file)) continue;
  for (const m of fs.readFileSync(file, "utf8").matchAll(/[A-Za-z_][\w-]*/g)) used.add(m[0]);
}

function classesOf(selector) {
  const withoutNot = selector.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
  return [...withoutNot.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

const css = fs.readFileSync(source, "utf8");
const root = postcss.parse(css, { from: source });

let keptRules = 0;
let droppedRules = 0;
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
  const line = rule.source?.start?.line ?? 0;
  if (line <= BASE_END) {
    keptRules++;
    return;
  }
  if (line >= DROP_FROM) {
    rule.remove();
    droppedRules++;
    return;
  }
  const inBookshelf = line >= BOOKSHELF[0] && line <= BOOKSHELF[1];
  const keep = rule.selectors.filter((sel) => {
    const classes = classesOf(sel);
    if (inBookshelf) return classes.some((c) => c.startsWith("bk-viewer")) && classes.every((c) => used.has(c));
    // the few bare-element rules past the base (fields, <mark>) all belong to
    // sections The Word uses
    if (classes.length === 0) return true;
    return classes.every((c) => used.has(c));
  });
  if (keep.length === 0) {
    rule.remove();
    droppedRules++;
  } else {
    rule.selectors = keep;
    keptRules++;
  }
});

// keyframes nobody refers to any more
const text = root.toString();
root.walkAtRules(/keyframes$/i, (at) => {
  const uses = text.split(at.params).length - 1;
  if (uses <= 1) at.remove();
});

// at-rules left empty by the filtering
let changed = true;
while (changed) {
  changed = false;
  root.walkAtRules((at) => {
    if (at.nodes && at.nodes.filter((n) => n.type !== "comment").length === 0) {
      at.remove();
      changed = true;
    }
  });
}

function scope(prefix, selector) {
  const sel = selector.trim();
  // html.reading: Reader marks the document while scripture is open, and
  // here scripture is always open
  let m = sel.match(/^html\.reading(?=$|[\s>+~])(.*)$/s);
  if (m) return `${prefix}${m[1]}`;
  m = sel.match(/^(?::root|html|body)((?:\[[^\]]*\])*)(?=$|[\s>+~:.])(.*)$/s);
  // ":root[data-theme=x] body" is the wrapper too: there is no <body> inside it
  if (m) return `${prefix}${m[1]}${m[2].replace(/^\s+body(?=$|[\s>+~:.])/, "")}`;
  m = sel.match(/^((?:\[data-theme[^\]]*\])+)(.*)$/s);
  if (m) return `${prefix}${m[1]}${m[2]}`;
  return `${prefix} ${sel}`;
}

const result = await postcss([
  prefixer({ prefix: SCOPE, transform: (prefix, selector) => scope(prefix, selector) }),
]).process(root, { from: source, to: OUT });

const header = `/*
 * The Word — ported from Communion's app/globals.css and scoped under
 * .word-root by scripts/extract-word-css.mjs. Generated: edit the script's
 * output with care, or re-run it against Communion's stylesheet.
 */
`;
fs.writeFileSync(OUT, header + result.css.replace(/\n{3,}/g, "\n\n"));
console.log(`kept ${keptRules} rules, dropped ${droppedRules}; wrote ${path.relative(ROOT, OUT)}`);
