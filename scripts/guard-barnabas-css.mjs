#!/usr/bin/env node
// One-off (idempotent): keep Barnabas's global styles out of The Word.
//
//   node scripts/guard-barnabas-css.mjs
//
// word.css scopes The Word under .word-root, so it cannot reach Barnabas. The
// other direction needs this: Barnabas's globals style bare elements (input,
// textarea, h1–h3, …) and a few class names The Word uses too (.btn, .card,
// .chip, …), and whatever The Word's own rule for one of those does not set
// would leak in from Barnabas's. So each such selector in src/app/globals.css
// gets `:where(:not(.word-root *))` on its subject. :where() adds no
// specificity, so nothing changes outside The Word.

import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GLOBALS = path.join(ROOT, "src/app/globals.css");
// Other app-wide stylesheets get the same guard: the website builder's, and the public site's and member
// app's (which are scoped under .cs-root already, so the guard normally changes nothing there).
const EXTRA = ["src/app/site/editor.css", "src/app/s/site.css"].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
const WORD = path.join(ROOT, "src/app/word/word.css");
const GUARD = ":where(:not(.word-root *))";

const classesIn = (selector) => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

const wordClasses = new Set();
postcss.parse(fs.readFileSync(WORD, "utf8")).walkRules((rule) => {
  for (const c of classesIn(rule.selector)) wordClasses.add(c);
});

function needsGuard(sel) {
  if (sel.includes(GUARD)) return false;
  if (classesIn(sel).some((c) => wordClasses.has(c))) return true;
  // bare-element rules (and :focus-visible) reach everything, The Word included;
  // html, body and * only set the page up
  const first = sel.trim().split(/[\s>+~]+/)[0];
  if (/^(html|body|\*)\b/.test(first)) return false;
  return /^[a-z]/.test(first) || first.startsWith(":focus-visible");
}

function guard(sel) {
  // a pseudo-element must stay last
  const m = sel.match(/^(.*?)(::[\w-]+(?:\([^)]*\))?)$/s);
  return m ? `${m[1]}${GUARD}${m[2]}` : `${sel}${GUARD}`;
}

for (const FILE of [GLOBALS, ...EXTRA]) {
const root = postcss.parse(fs.readFileSync(FILE, "utf8"), { from: FILE });
let guarded = 0;
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
  const next = rule.selectors.map((sel) => {
    if (!needsGuard(sel)) return sel;
    guarded++;
    return guard(sel);
  });
  if (next.some((s, i) => s !== rule.selectors[i])) {
    // keep the file's one-line style: postcss would otherwise break lists
    rule.selector = next.join(", ");
  }
});
fs.writeFileSync(FILE, root.toString());
console.log(`guarded ${guarded} selectors in ${path.relative(ROOT, FILE)}`);
}
