import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { count, LANGUAGE_NOTE, quote, SHEPHERDING_PATH, TERMS, VERSES, verseFor } from "@/lib/language";
import { NAV } from "@/components/NavLinks";
import { legacyRedirects } from "../next.config";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** The glossary holds the old words on purpose; The Word's files are its own and aren't touched here. */
const SKIP = [
  "src/lib/language.ts",
  "src/app/word/",
  "src/components/Reader.tsx",
  "src/components/WordApp.tsx",
];

const OLD_WORDS = /\bvolunteers?\b|\bburnout\b|\bburnt[- ]out\b|\bburned[- ]out\b/i;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

/**
 * Every string a person could read: string and template literals and JSX text. Comments aren't nodes,
 * so they're left out. Lowercase literals with no whitespace are keys, ids, paths or enum values
 * (`"volunteers"`, `"volunteer.add"`, `"../radar/burnout"`), which keep their names; JSX text and
 * capitalized single words ("Volunteers") are labels.
 */
function userFacingStrings(file: string): { text: string; line: number }[] {
  const code = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    else if (ts.isJsxText(node)) text = node.getText(sf);
    const label = text !== null && (ts.isJsxText(node) || /\s/.test(text.trim()) || /^[A-Z]/.test(text.trim()));
    if (text !== null && label) out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("biblical language", () => {
  it("quotes each verse word for word from the King James Version", () => {
    expect(VERSES.colaborers).toEqual({ text: "For we are labourers together with God: ye are God's husbandry, ye are God's building.", reference: "1 Corinthians 3:9" });
    expect(VERSES.encourage).toEqual({ text: "Wherefore comfort yourselves together, and edify one another, even as also ye do.", reference: "1 Thessalonians 5:11" });
    expect(VERSES.weariness).toEqual({ text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", reference: "Galatians 6:9" });
    expect(VERSES.shepherding.text).toBe("Feed the flock of God which is among you, taking the oversight thereof, not by constraint, but willingly; not for filthy lucre, but of a ready mind;");
    expect(VERSES.shepherding.short).toBe("Feed the flock of God which is among you");
    expect(VERSES.shepherding.reference).toBe("1 Peter 5:2");
    expect(quote("shepherding", { short: true })).toBe("“Feed the flock of God which is among you” (1 Peter 5:2, KJV)");
  });

  it("has singular, plural and capitalized forms, with the right verse", () => {
    expect(TERMS.colaborer).toMatchObject({ one: "co-laborer", many: "co-laborers", One: "Co-laborer", Many: "Co-laborers" });
    expect(count(1, "colaborer")).toBe("1 co-laborer");
    expect(count(3, "colaborer")).toBe("3 co-laborers");
    expect(count(2, "shepherdingCase")).toBe("2 shepherding cases");
    expect(TERMS.wearinessWatch.One).toBe("Weariness watch");
    expect(verseFor("encourage").reference).toBe("1 Thessalonians 5:11");
    expect(verseFor("shepherdingTeam").reference).toBe("1 Peter 5:2");
  });

  it("teaches Barnabas the words", () => {
    expect(BARNABAS_SYSTEM).toContain(LANGUAGE_NOTE);
    expect(BARNABAS_SYSTEM).toContain("co-laborer");
    expect(BARNABAS_SYSTEM).toContain("weariness");
    expect(BARNABAS_SYSTEM).toContain("Shepherding");
  });

  it("names the area Shepherding and sends the old Care links there", () => {
    const item = NAV.find((n) => n.href === SHEPHERDING_PATH)!;
    expect(item.label).toBe("Shepherding");
    expect(NAV.some((n) => n.href === "/care" || n.label === "Care")).toBe(false);
    expect(legacyRedirects).toEqual([
      { source: "/care", destination: "/shepherding", permanent: true },
      { source: "/care/:path*", destination: "/shepherding/:path*", permanent: true },
    ]);
    expect(fs.existsSync(path.join(SRC, "app/shepherding/cases/[id]/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(SRC, "app/care"))).toBe(false);
  });

  it("no user-facing source string says volunteer or burnout (outside the glossary and comments)", () => {
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (SKIP.some((s) => rel === s || rel.startsWith(s))) continue;
      for (const s of userFacingStrings(file)) if (OLD_WORDS.test(s.text)) hits.push(`${rel}:${s.line}: ${s.text.trim().slice(0, 100)}`);
    }
    expect(hits).toEqual([]);
  });
});
