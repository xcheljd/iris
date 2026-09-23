import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Contrast math straight from the tokens in app/globals.css — jsdom has no
// layout or paint, so this is how colour regressions get pinned. Alpha tints
// are composited in sRGB, as browsers do.

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const MODES = { light: block(":root"), dark: block(".dark") };
type Mode = keyof typeof MODES;

type RGB = [number, number, number];
function hsl(token: string): RGB {
  const [h, s, l] = token.replace(/%/g, "").split(/\s+/).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
const lum = (c: RGB) => {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg: RGB, bg: RGB, alpha: number): RGB => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as RGB;
const token = (mode: Mode, name: string) => {
  const v = MODES[mode][name];
  if (!v) throw new Error(`--${name} missing in ${mode}`);
  return hsl(v);
};

describe.each(["light", "dark"] as const)("theme tokens (%s)", (mode) => {
  const card = token(mode, "card");

  it.each(["heat-hot", "heat-warm", "heat-cold"])("--%s reads as text on the card and on its /15 badge tint", (name) => {
    const c = token(mode, name);
    expect(ratio(c, card)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c, over(c, card, 0.15))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["heat-hot", "heat-warm", "heat-cold"])("text-foreground reads on a /30 --%s bar segment", (name) => {
    expect(ratio(token(mode, "foreground"), over(token(mode, name), card, 0.3))).toBeGreaterThanOrEqual(4.5);
  });
});
