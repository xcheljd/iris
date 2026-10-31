/**
 * The Iris mark — the one source for the logo and every app icon.
 *
 * Iris is the messenger of the gods: a wing breaking out through a ring,
 * the message leaving. Two drawings share one 512×512 grid:
 *
 * - the full mark (ring + three-feather wing) for 48px and up;
 * - a simplified glyph (thicker ring, wider gap, two feathers) for 16–32px,
 *   where the full mark blurs into a blob.
 *
 * `components/iris-icon.tsx` draws the full mark in the app;
 * `scripts/build-icons.ts` turns these shapes into the icon files
 * (`pnpm icons`). Edit the shapes here, then rerun the script.
 */

export const BRAND = {
  navy: "#0f1c30",
  gold: "#dbb45c",
  goldDeep: "#b8862d",
  goldLight: "#f0d690",
  goldLightDeep: "#d4a648",
  bronze: "#c0913a",
  bronzeDeep: "#946a1d",
  tileLight: "#e2bf6c",
  /** Flat gold for the tiny favicon tiles, where a gradient adds nothing. */
  tileFlat: "#c99a3f",
} as const;

/** Full mark. The ring's centre is (236, 276); the top feather exits its gap. */
export const MARK = {
  center: [236, 276] as const,
  ring: "M331.6 80.1 A218 218 0 1 0 416.7 154.1",
  /** Feathers, top to bottom; the wing is drawn shifted up 34. */
  feathers: [
    "M120 358 L220 144 L420 90 L304 212 Z",
    "M120 358 L322 234 L430 228 L320 306 Z",
    "M120 358 L330 328 L398 350 L292 382 Z",
  ],
  pivot: { cx: 128, cy: 354, r: 16 },
} as const;

/** Small glyph. Ring centre (256, 256), drawn a touch off-centre to balance the wing. */
export const GLYPH = {
  center: [262, 250] as const,
  ring: "M439.5 206.8 A190 190 0 1 1 305.2 72.5",
  ringWidth: 74,
  feathers: ["M128 384 L214 196 L448 64 L322 268 Z", "M128 384 L318 292 L392 300 L294 358 Z"],
  pivot: { cx: 136, cy: 378, r: 26 },
} as const;

/**
 * Transform that centres a drawing (by its own centre point) in the 512 grid
 * at the given scale.
 */
export function centreOn(center: readonly [number, number], scale: number): string {
  return `translate(256 256) scale(${scale}) translate(${-center[0]} ${-center[1]})`;
}

/** The full mark in one flat colour (a `<g>` body, no wrapper). */
export function markFlat(color: string, ringWidth = 34): string {
  return [
    `<path d="${MARK.ring}" stroke="${color}" stroke-width="${ringWidth}" stroke-linecap="round" fill="none"/>`,
    ...MARK.feathers.map((d) => `<path d="${d}" fill="${color}"/>`),
    `<circle cx="${MARK.pivot.cx}" cy="${MARK.pivot.cy}" r="${MARK.pivot.r}" fill="${color}"/>`,
  ].join("");
}

/** The small glyph in one flat colour. */
export function glyphFlat(color: string): string {
  return [
    `<path d="${GLYPH.ring}" stroke="${color}" stroke-width="${GLYPH.ringWidth}" stroke-linecap="round" fill="none"/>`,
    ...GLYPH.feathers.map((d) => `<path d="${d}" fill="${color}"/>`),
    `<circle cx="${GLYPH.pivot.cx}" cy="${GLYPH.pivot.cy}" r="${GLYPH.pivot.r}" fill="${color}"/>`,
  ].join("");
}
