// Renders the Capsa app icons (public/icons/*.png, icon.svg), the favicon (src/app/icon.svg and src/app/favicon.ico) and
// the social image (src/app/opengraph-image.png) with Playwright. Sources, all made by
// design-references/brand/identity/src/build_capsa.py from the approved master (concept B, "Flat, looped cord"):
//   app-icon-capsa-light.svg   the app icon (1024 grid, its own rounded square)
//   mark-capsa.svg             the mark with transparent knockouts (maskable and Apple icons, the social image)
//   favicon-capsa.svg          the mark on a tight square, light or dark with the browser's chrome
//   small/mark-capsa-{16,32}   the mark drawn for 16 and 32 px: used only with --small, once Elvis approves them
// Re-run after the identity changes:
//   node verify/pwa/make-icons.mjs [--small]   (writes the files above and a contact sheet next to this script)
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(playwrightFrom());
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../public/icons');
const APP = path.resolve(HERE, '../../src/app');
const ID = path.resolve(HERE, '../../../../design-references/brand/identity');
const SMALL = process.argv.includes('--small');
const read = f => fs.readFileSync(path.join(ID, f), 'utf8');
const APP_ICON = read('app-icon-capsa-light.svg');
const MARK = read('mark-capsa.svg');
const FAVICON = read('favicon-capsa.svg');
const uri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
// the mark's ink bounds in its viewBox (0 2 96 96), as build_capsa.py's bbox(): x 18-83.6, y 14-85
const INK = { x0: 18, y0: 14, x1: 83.6, y1: 85 };
const tightMark = MARK.replace(/viewBox="[^"]+"/, `viewBox="${INK.x0} ${INK.y0} ${INK.x1 - INK.x0} ${INK.y1 - INK.y0}"`).replace(/ width="96" height="96"/, '');

// the 32 px drawing takes the master favicon's dark-chrome rule, so the tab icon still follows light or dark
const DARK_RULE = FAVICON.match(/<style>[\s\S]*?<\/style>/)[0];
const adaptive = svg => svg.replace(/(<title>[^<]*<\/title>)/, `$1${DARK_RULE}`);
fs.writeFileSync(path.join(APP, 'icon.svg'), SMALL ? adaptive(read('small/mark-capsa-32.svg')) : FAVICON);
fs.writeFileSync(path.join(OUT, 'icon.svg'), APP_ICON);

/** size: canvas px. body: share of the canvas the tile fills. bleed: a full-bleed white square with the mark at `mark`
 * of the height (maskable: inside the 80% safe circle; Apple: iOS applies its own rounded mask). */
const ICONS = [
  { file: 'icon-192.png', size: 192, body: 0.8125 },
  { file: 'icon-512.png', size: 512, body: 0.8125 },
  { file: 'maskable-512.png', size: 512, bleed: true, mark: 0.46 },
  { file: 'apple-touch-icon.png', size: 180, bleed: true, mark: 0.58 },
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function shot(file, size, html, transparent = true) {
  await page.setViewportSize({ width: size.w ?? size, height: size.h ?? size });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}</style>${html}`);
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  await page.waitForTimeout(50);
  await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: size.w ?? size, height: size.h ?? size } });
}
for (const icon of ICONS) {
  const s = icon.size;
  const html = icon.bleed
    ? `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;background:#fff"><img src="${uri(tightMark)}" style="height:${Math.round(s * icon.mark)}px"></div>`
    : `<div style="width:${s}px;height:${s}px;display:grid;place-items:center"><img src="${uri(APP_ICON)}" style="width:${Math.round(s * icon.body)}px"></div>`;
  await shot(path.join(OUT, icon.file), s, html, !icon.bleed);
  console.log('wrote', icon.file);
}

// favicon.ico: PNGs at 16, 32 and 48 (the drawings for 16 and 32 with --small; the master on its tight square otherwise)
const pngs = [];
for (const n of [16, 32, 48]) {
  const src = SMALL && n < 48 ? read(`small/mark-capsa-${n}.svg`) : FAVICON;
  const f = path.join(HERE, `favicon-${n}.png`);
  await shot(f, n, `<img src="${uri(src)}" width="${n}" height="${n}" style="display:block">`);
  pngs.push([n, fs.readFileSync(f)]); fs.rmSync(f);
}
const head = Buffer.alloc(6 + 16 * pngs.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
let at = head.length;
pngs.forEach(([n, png], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(at, e + 12);
  at += png.length;
});
fs.writeFileSync(path.join(APP, 'favicon.ico'), Buffer.concat([head, ...pngs.map(p => p[1])]));
console.log('wrote src/app/favicon.ico');

// the social image: the mark and the wordmark (Inter 700, -0.04em, the app's own font file) on the light ground
const inter = fs.readFileSync(path.join(APP, 'fonts/inter-latin.woff2')).toString('base64');
await shot(path.join(APP, 'opengraph-image.png'), { w: 1200, h: 630 }, `<style>@font-face{font-family:I;src:url(data:font/woff2;base64,${inter}) format('woff2');font-weight:100 900}</style>
  <div style="width:1200px;height:630px;display:flex;align-items:center;justify-content:center;gap:44px;background:#F7F7F6">
    <img src="${uri(tightMark)}" style="height:216px">
    <span style="font:700 172px/1 I;letter-spacing:-0.04em;color:#18181B;transform:translateY(18px)">Capsa</span></div>`, false);
console.log('wrote src/app/opengraph-image.png');

// Contact sheet: each icon on light and dark, the maskable one under a circle mask (Android) to check the safe zone,
// and the favicon at 16 and 32.
const img = f => `data:image/png;base64,${fs.readFileSync(path.join(OUT, f)).toString('base64')}`;
await page.setViewportSize({ width: 1000, height: 420 });
await page.setContent(`<!doctype html><style>
  body { margin: 0; font: 12px system-ui; display: grid; grid-template-columns: 1fr 1fr; }
  .p { padding: 20px; display: flex; gap: 20px; align-items: end; flex-wrap: wrap; }
  .l { background: #f7f7f6; color: #47474d } .d { background: #0b0b0c; color: #b9b9c0 }
  figure { margin: 0; display: grid; gap: 6px; justify-items: center }
</style>
${['l', 'd'].map(t => `<div class="p ${t}">
  <figure><img src="${img('icon-512.png')}" width="128"><figcaption>any 512</figcaption></figure>
  <figure><img src="${img('icon-192.png')}" width="64"><figcaption>any 192</figcaption></figure>
  <figure><img src="${img('maskable-512.png')}" width="128" style="border-radius:50%"><figcaption>maskable (circle)</figcaption></figure>
  <figure><img src="${img('maskable-512.png')}" width="128" style="border-radius:22%"><figcaption>maskable (squircle)</figcaption></figure>
  <figure><img src="${img('apple-touch-icon.png')}" width="90" style="border-radius:22%"><figcaption>apple 180</figcaption></figure>
  <figure><img src="${uri(fs.readFileSync(path.join(APP, 'icon.svg'), 'utf8'))}" width="32"><figcaption>favicon 32</figcaption></figure>
  <figure><img src="${uri(fs.readFileSync(path.join(APP, 'icon.svg'), 'utf8'))}" width="16"><figcaption>16</figcaption></figure>
</div>`).join('')}`);
await page.screenshot({ path: path.join(HERE, 'icons-contact-sheet.png') });
await browser.close();
console.log('wrote icons-contact-sheet.png');
