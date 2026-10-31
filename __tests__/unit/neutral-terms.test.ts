import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Iris is for any kind of retail store, so screens say "item", never a
// product kind like "watch". This scans the text people can see — string
// literals and JSX text in app/ and components/ — for a store-specific word.
// Code names (promoItems, the promo_items table) don't count: a word
// glued to an identifier has no word boundary, and text inside {…} is code.

const WORDS = /\bwatch(es)?\b/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });
}

/** Visible text candidates: quoted strings and JSX text, comments removed. */
function visibleText(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  // JSX text: between tags, with none of the characters code between `=>` and a
  // generic `<` would have.
  for (const m of code.matchAll(/>([^<>{}();=]+)</g)) out.push(m[1]);
  return out;
}

describe("screens use neutral words", () => {
  it("no screen text names a kind of product", () => {
    const hits: string[] = [];
    for (const root of ["app", "components"]) {
      for (const f of files(root)) {
        for (const text of visibleText(readFileSync(f, "utf8"))) {
          if (WORDS.test(text)) hits.push(`${f}: ${text.trim().slice(0, 80)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("catches a hardcoded product word", () => {
    expect(visibleText('toast.success("Promo watch created")').some((t) => WORDS.test(t))).toBe(true);
    expect(visibleText("<span>3 watches</span>").some((t) => WORDS.test(t))).toBe(true);
    expect(visibleText("const n = g.watches.length; promoItems.id").some((t) => WORDS.test(t))).toBe(false);
  });
});
