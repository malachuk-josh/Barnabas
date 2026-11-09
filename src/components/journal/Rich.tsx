import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { BOOKS } from "@/lib/bible";
import { parseRef, wordHref } from "@/lib/services/scripture";

/**
 * Journal text with scripture references linked into The Word (`/word?b=&c=&v=`, the parser Services uses),
 * and a small, safe markdown renderer: headings, paragraphs, lists, quotes, bold, italic, code and links.
 * Nothing is ever set as HTML.
 */

// A book name from The Word's list (or a common short form), then chapter[:verse[-end]].
const SHORT = ["Psalm", "Ps", "Gen", "Exod", "Ex", "Lev", "Num", "Deut", "Josh", "Judg", "Prov", "Eccl", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Mic", "Hab", "Zeph", "Zech", "Mal", "Matt", "Mt", "Mk", "Lk", "Jn", "Rom", "Gal", "Eph", "Phil", "Col", "Heb", "Jas", "Rev"];
const NAMES = [...BOOKS.map((b) => b.en), ...SHORT].sort((a, b) => b.length - a.length).map((n) => n.replace(/ /g, "\\s?"));
const REF_RE = new RegExp(`(?<![\\w])(?:${NAMES.join("|")})\\.?\\s(\\d{1,3})(?::(\\d{1,3}))?(?:\\s?[-–]\\s?(\\d{1,3})(?::(\\d{1,3}))?)?(?![\\w:])`, "g");

/** Splits text into plain runs and linked references. */
export function linkRefs(text: string, keyBase = "r"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(REF_RE)) {
    const ref = parseRef(m[0]);
    const href = ref && wordHref(ref);
    if (!href) continue;
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <Link key={`${keyBase}-${n++}`} href={href} className="jr-ref">
        {m[0]}
      </Link>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** One reference as a link when it parses, plain text otherwise. */
export function RefLink({ refText }: { refText?: string | null }) {
  if (!refText?.trim()) return null;
  const href = wordHref(refText);
  return href ? (
    <Link href={href} className="jr-ref">
      {parseRef(refText)?.label ?? refText}
    </Link>
  ) : (
    <span>{refText}</span>
  );
}

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const safeHref = (h: string) => (/^(https?:\/\/|\/(?!\/))/.test(h) ? h : null);

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...linkRefs(text.slice(last, at), `${key}-t${i}`));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{linkRefs(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = safeHref(lm[2]);
      out.push(href ? (href.startsWith("/") ? <Link key={k} href={href}>{lm[1]}</Link> : <a key={k} href={href} target="_blank" rel="noopener noreferrer">{lm[1]}</a>) : <Fragment key={k}>{lm[1]}</Fragment>);
    } else out.push(<em key={k}>{linkRefs(tok.slice(1, -1), k)}</em>);
    last = at + tok.length;
  }
  if (last < text.length) out.push(...linkRefs(text.slice(last), `${key}-t${i}`));
  return out;
}

/** Plain text with line breaks kept and references linked (structured fields). */
export function Prose({ text, className }: { text?: string; className?: string }) {
  if (!text?.trim()) return null;
  const paras = text.trim().split(/\n{2,}/);
  return (
    <div className={className ?? "jr-prose"}>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(line, `p${i}-${j}`)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

/** A small markdown subset for the body. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = `b${b++}`;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2], key);
      blocks.push(level === 1 ? <h2 key={key}>{content}</h2> : level === 2 ? <h3 key={key}>{content}</h3> : <h4 key={key}>{content}</h4>);
      i++;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/).test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        i++;
      }
      const lis = items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>);
      blocks.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        q.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key}>
          {q.join("\n").split(/\n{2,}/).map((p, j) => (
            <p key={j}>{inline(p.replace(/\n/g, " "), `${key}-${j}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key}>
        {para.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, `${key}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="jr-md">{blocks}</div>;
}
