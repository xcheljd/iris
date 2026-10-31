/**
 * Builds every app icon from the mark in `lib/brand-mark.ts`.
 *
 *   pnpm icons
 *
 * Writes (all committed):
 *   app/icon.svg              browser tab icon (simplified glyph, gold tile)
 *   app/favicon.ico           16 + 32 glyph, 48 full mark
 *   app/icon.png              512 full-mark tile (fallback for browsers without SVG icons)
 *   app/apple-icon.png        180 square, iOS rounds the corners itself
 *   public/icon-192.png       web app / install icon
 *   public/icon-512.png
 *   public/icon-maskable-512.png   Android: full bleed, mark inside the 80% safe circle
 *   public/icon-monochrome.svg     mark only, for themed icons and pinned tabs
 *   docs/social-preview.png   1280×640, for the GitHub repo's social preview
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import sharp from "sharp";
import { BRAND, GLYPH, MARK, centreOn, glyphFlat, markFlat } from "../lib/brand-mark";

const ROOT = join(__dirname, "..");

const goldGradient = `<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${BRAND.tileLight}"/><stop offset="100%" stop-color="${BRAND.goldDeep}"/></linearGradient>`;

const svg = (body: string, defs = "", w = 512, h = 512) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;

/** Gold rounded tile with the full mark. `rx: 0` gives a full-bleed square. */
const fullTile = (rx: number, scale = 0.74) =>
  svg(
    `<rect width="512" height="512" rx="${rx}" fill="url(#t)"/><g transform="${centreOn(MARK.center, scale)}">${markFlat(BRAND.navy)}</g>`,
    goldGradient,
  );

/** Flat gold tile with the small glyph, for 16–32px. */
const glyphTile = svg(
  `<rect width="512" height="512" rx="96" fill="${BRAND.tileFlat}"/><g transform="${centreOn(GLYPH.center, 0.9)}">${glyphFlat(BRAND.navy)}</g>`,
);

const monochrome = svg(`<g transform="${centreOn(MARK.center, 0.86)}">${markFlat("#000")}</g>`);

const socialPreview = svg(
  `<rect width="1280" height="640" fill="${BRAND.navy}"/>` +
    `<circle cx="330" cy="300" r="520" fill="url(#glow)"/>` +
    `<g transform="translate(150 170) scale(0.5859)"><rect width="512" height="512" rx="116" fill="url(#t)"/><g transform="${centreOn(MARK.center, 0.74)}">${markFlat(BRAND.navy)}</g></g>` +
    `<text x="510" y="318" font-family="Inter, Helvetica, Arial, sans-serif" font-size="120" font-weight="700" fill="#f4f1ea">Iris</text>` +
    `<text x="514" y="388" font-family="Inter, Helvetica, Arial, sans-serif" font-size="38" fill="#9fb0cf">Client follow-up for retail stores</text>`,
  goldGradient +
    `<radialGradient id="glow"><stop offset="0%" stop-color="#1d2f52"/><stop offset="100%" stop-color="${BRAND.navy}" stop-opacity="0"/></radialGradient>`,
  1280,
  640,
);

const png = (src: string, size: number, height = size) =>
  sharp(Buffer.from(src), { density: 72 * Math.max(1, size / 512) * 2 })
    .resize(size, height)
    .png({ compressionLevel: 9 })
    .toBuffer();

/** ICO container holding PNG images (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

function write(rel: string, data: string | Buffer) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`  ${rel}`);
}

async function main() {
  console.log("Writing icons:");
  write("app/icon.svg", glyphTile);
  write(
    "app/favicon.ico",
    ico([
      { size: 16, data: await png(glyphTile, 16) },
      { size: 32, data: await png(glyphTile, 32) },
      { size: 48, data: await png(fullTile(116), 48) },
    ]),
  );
  write("app/icon.png", await png(fullTile(116), 512));
  write("app/apple-icon.png", await png(fullTile(0), 180));
  write("public/icon-192.png", await png(fullTile(116), 192));
  write("public/icon-512.png", await png(fullTile(116), 512));
  write("public/icon-maskable-512.png", await png(fullTile(0, 0.58), 512));
  write("public/icon-monochrome.svg", monochrome);
  write("docs/social-preview.png", await png(socialPreview, 1280, 640));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
