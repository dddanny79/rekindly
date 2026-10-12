/**
 * Builds the logo assets from the source images in docs/brand/source (white
 * background JPEGs): transparent PNGs, a light-text variant for dark mode, favicons
 * and app icons.
 *
 *   node scripts/brand.mjs
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const sharp = require('sharp');

const root = new URL('..', import.meta.url).pathname;
const src = (name) => `${root}docs/brand/source/${name}.jpeg`;
const brand = `${root}docs/brand`;
const assets = `${root}apps/web/src/assets/brand`;
const pub = `${root}apps/web/public`;
mkdirSync(assets, { recursive: true });

/** White → transparent; anti-aliased edges are un-mixed from white. */
async function transparent(file) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const d = 255 - Math.min(r, g, b);
    const a = Math.max(0, Math.min(1, (d - 8) / 100));
    const unmix = (c) => (a ? Math.max(0, Math.min(255, (c - 255 * (1 - a)) / a)) : 0);
    out[o] = unmix(r);
    out[o + 1] = unmix(g);
    out[o + 2] = unmix(b);
    out[o + 3] = Math.round(a * 255);
  }
  const image = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
  // Trim transparent margins, keep a little air.
  const trimmed = await image
    .png()
    .toBuffer()
    .then((buf) => sharp(buf).trim().toBuffer());
  // Materialised so that a later resize applies to the padded image (sharp would
  // otherwise run extend after resize).
  const padded = await sharp(trimmed)
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(padded);
}

/** Dark-mode variant: the grey/navy lettering becomes light, the colours stay. */
async function lightText(png) {
  const { data, info } = await png.clone().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (!a || Math.max(r, g, b) - Math.min(r, g, b) > 45) continue;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const v = Math.round(255 - l * 0.8);
    data[i] = v;
    data[i + 1] = v - 3;
    data[i + 2] = v - 9;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

const write = (img, path, resize) =>
  (resize ? img.clone().resize(resize) : img.clone())
    .png({ compressionLevel: 9, palette: false })
    .toFile(path);

const mark = await transparent(src('mark'));
await write(mark, `${brand}/rekindly-mark.png`, {
  width: 512,
  height: 512,
  fit: 'contain',
  background: { r: 0, g: 0, b: 0, alpha: 0 },
});
await write(mark, `${assets}/mark.png`, {
  width: 128,
  height: 128,
  fit: 'contain',
  background: { r: 0, g: 0, b: 0, alpha: 0 },
});

for (const name of ['wordmark', 'subtitle']) {
  const light = await transparent(src(name));
  const dark = await lightText(await light.clone().png());
  await write(light, `${brand}/rekindly-${name}.png`, { width: 1200 });
  await write(dark, `${brand}/rekindly-${name}-dark.png`, { width: 1200 });
  await write(light, `${assets}/${name}-light.png`, { height: name === 'wordmark' ? 96 : 160 });
  await write(dark, `${assets}/${name}-dark.png`, { height: name === 'wordmark' ? 96 : 160 });
}

// Favicons and app icons.
const icon = (size, background) =>
  sharp(src('mark')).resize(size, size, {
    fit: 'contain',
    background: background ?? { r: 255, g: 255, b: 255, alpha: 0 },
  });
await write(mark, `${pub}/favicon-32.png`, {
  width: 32,
  height: 32,
  fit: 'contain',
  background: { r: 0, g: 0, b: 0, alpha: 0 },
});
await write(mark, `${pub}/favicon-192.png`, {
  width: 192,
  height: 192,
  fit: 'contain',
  background: { r: 0, g: 0, b: 0, alpha: 0 },
});
// Home screen icons: opaque, with margin (iOS rounds the corners itself).
await icon(180).flatten({ background: '#ffffff' }).png().toFile(`${pub}/apple-touch-icon.png`);
await icon(512).flatten({ background: '#ffffff' }).png().toFile(`${pub}/icon-512.png`);
console.log('Brand assets written.');
