// Classic only (refinement pass, 22 Oct): the Pixel style was removed from the app. These checks replace the 54 Pixel
// style checks: nothing of Pixel is left on screen or in the page, settings from older versions are dropped, and the
// icon system is one set of sizes, every icon a brand glyph in the chosen Icon style. Usage (dev server on :3100): node verify/style/style-test.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const ROUTES = ['/library', '/inbox', '/collections/c-reuse', '/projects/p-menubar', '/settings', '/help', '/ai', '/library/a-deploy'];

for (const which of engines) {
  const browser = await pw[which].launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1080 } });
  const T = `[${which}]`;
  // an older library: prefs carry the retired style settings, and localStorage still says Pixel
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  await page.evaluate(async () => {
    localStorage.setItem('capsa-style', 'pixel'); localStorage.setItem('capsa-gp', 'Grid');
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
    await new Promise(r => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put({ ...st, prefs: { ...st.prefs, style: 'pixel', pixelText: 'titles', titleStyle: 'Grid' }, _at: Date.now() + 1e6 }, 'app'); tx.oncomplete = r; });
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  const left = await page.evaluate(() => ({ attr: document.documentElement.dataset.style ?? null, ls: localStorage.getItem('capsa-style'), gp: document.documentElement.style.getPropertyValue('--gp-display') }));
  ok(`${T} an older library with Pixel saved opens in Classic, and the old setting is forgotten`, left.attr === null && left.ls === null && !left.gp, JSON.stringify(left));
  await page.waitForTimeout(400);
  const saved = await page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); }); const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); }); return st.prefs; });
  ok(`${T} …and it's dropped from the saved prefs`, !('style' in saved) && !('titleStyle' in saved) && !('pixelText' in saved), JSON.stringify(saved));
  for (const r of ROUTES) {
    await page.goto(B + r, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    const res = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('svg')].filter(e => getComputedStyle(e).display !== 'none' && e.getClientRects().length);
      const icons = shown.filter(e => e.classList.contains('pi'));
      const sizes = [...new Set(icons.map(e => Math.round(e.getBoundingClientRect().width)))].sort((a, b) => a - b);
      // since 23 Oct every flat icon is a brand glyph (design-references/brand/icons/STYLE.md): it carries both drawings and
      // shows the one for Settings › Appearance › Icon style (Solid: filled, Line: one 1.5 line); tints and pinned previews are their own set
      const style = document.documentElement.dataset.icons || 'solid';
      const notBrand = icons.filter(e => !e.hasAttribute('data-glyph')).map(e => e.dataset.ic || e.getAttribute('class'));
      const wrongSet = icons.filter(e => e.hasAttribute('data-glyph') && !e.getAttribute('data-glyph-set')).filter(e => {
        const vis = [...e.querySelectorAll(':scope > g[data-set]')].filter(g => getComputedStyle(g).display !== 'none').map(g => g.dataset.set);
        return vis.length !== 1 || vis[0] !== style;
      }).map(e => e.dataset.glyph);
      const pixelFont = [...document.querySelectorAll('body *')].some(e => /Geist Pixel|gp_|GeistPixel/i.test(getComputedStyle(e).fontFamily));
      const h1 = document.querySelector('main h1');
      // icon contrast: the icon's colour against the first opaque background behind it (WCAG 1.4.11 asks 3:1)
      const rgb = c => { const n = (c.replace(/^color\(srgb/, '').match(/[\d.]+/g) || []).map(Number); return /^color\(srgb/.test(c) ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : n; };
      const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) return c.slice(0, 3); } return [255, 255, 255]; };
      const low = [];
      for (const e of icons) {
        if (e.closest('[aria-hidden="true"] .card, [data-tint]') && e.closest('[data-tint]')) continue; // card previews: decorative copies on tinted art
        const fg = rgb(getComputedStyle(e).color).slice(0, 3), bg = bgOf(e.parentElement);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
        if (ratio < 3 && !e.closest('button:disabled, [aria-disabled="true"]')) low.push(`${e.dataset.ic} ${ratio.toFixed(2)}`);
      }
      return { pk: document.querySelectorAll('svg.pk').length, sizes, style, notBrand: [...new Set(notBrand)], wrongSet: [...new Set(wrongSet)], pixelFont, low: [...new Set(low)], h1: h1 ? getComputedStyle(h1).fontFamily : '' };
    });
    ok(`${T} ${r}: no pixel icons or pixel type left`, res.pk === 0 && !res.pixelFont);
    ok(`${T} ${r}: icons come in 14, 16 or 20 px only, every one a brand glyph showing the ${res.style} drawing`, res.sizes.every(x => [14, 16, 20].includes(x)) && res.notBrand.length === 0 && res.wrongSet.length === 0,
      `sizes ${res.sizes.join(',')} · not brand: ${res.notBrand.slice(0, 5).join(', ') || 'none'} · wrong set: ${res.wrongSet.slice(0, 5).join(', ') || 'none'}`);
    ok(`${T} ${r}: every icon has at least 3:1 contrast with its background`, res.low.length === 0, res.low.slice(0, 6).join(', '));
    ok(`${T} ${r}: the page title is in Newsreader`, /Newsreader/i.test(res.h1), res.h1.slice(0, 60));
  }
  await page.goto(B + '/settings/general', { waitUntil: 'networkidle' }); await page.waitForTimeout(300); // /settings opens Profile since #91
  // since #63 there is a Style again, but only Classic and Paper (verify/paper checks Paper); Pixel stays gone
  const styles = await page.getByRole('group', { name: 'Style', exact: true }).getByRole('button').allInnerTexts();
  ok(`${T} Settings' Style offers Classic and Paper only, never Pixel`, styles.map(t => t.trim()).join() === 'Classic,Paper' && await page.getByText('Pixel', { exact: true }).count() === 0, styles.join());
  await browser.close();
}
// Text sizes in rem (25 Oct, WCAG 1.4.4): no px font-size or line-height in the app's CSS, so text follows the browser's text size
{
  const { readdirSync, readFileSync, statSync } = await import('fs');
  const { join } = await import('path');
  const src = new URL('../../src/', import.meta.url).pathname;
  const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : []; });
  const hits = walk(decodeURIComponent(src)).flatMap(f => (readFileSync(f, 'utf8').match(/(font-size|line-height):\s*[\d.]+px/g) ?? []).map(m => `${f.split('/src/')[1]}: ${m}`));
  ok('text sizes are in rem: no px font-size or line-height in the CSS', hits.length === 0, hits.slice(0, 5).join('; ') || 'none');
}
console.log(`\n${pass}/${pass + fail} Classic-only checks passed`);
process.exit(fail ? 1 : 0);
