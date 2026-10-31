// A11Y-02 (Track C, 25 Oct): the main screens at 200% zoom and with large text.
//   200% zoom: a 1280×800 and a 1440×900 window zoomed to 200% lay out at 640×400 and 720×450 CSS pixels with 2 device
//              pixels per CSS pixel, which is what the browser's zoom does (WCAG 1.4.4 and 1.4.10).
//   Large text: the browser's default font size at 24 px (Chrome's "Very large", 150%) at 1440 wide. The app's type is
//              in rem, so it follows that setting.
//   Reflow (#85): a 320 px wide window with text at 200% (WCAG 1.4.10 with 1.4.4), in Classic and in Paper, set the way a
//              person sets them (Settings, Appearance, Style). Before #85 the capture bar's modes and send button, the
//              Library's places, segmented controls, the item page's top bar, tag chips and long button labels ran off the edge.
// Checks per screen: no sideways scrolling of the page; no control or heading cut off (text wider than its box with
// nothing to show the rest); every control inside the window or inside something that scrolls to it; and no console
// errors. Screenshots go to verify/a11y/zoom/.
// Usage (dev server running): CAPSA_BASE=http://127.0.0.1:3203 node verify/a11y/zoom.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'zoom'); fs.mkdirSync(OUT, { recursive: true });
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
const ROUTES = ['/library', '/library/a-deploy', '/inbox', '/inbox/s-video', '/inbox/s-github', '/collections/c-reuse', '/projects/p-menubar', '/playground',
  '/settings/appearance', '/settings/shortcuts', '/settings/tags', '/help', '/ai', '/ai/mcp', '/ai/files', '/deleted'];
const MODES = [
  { name: 'zoom200-1280', viewport: { width: 640, height: 400 }, dpr: 2 },
  { name: 'zoom200-1440', viewport: { width: 720, height: 450 }, dpr: 2 },
  { name: 'largetext-1440', viewport: { width: 1440, height: 900 }, dpr: 1, css: 'html { font-size: 24px !important; }' },
  { name: 'reflow320-text200-classic', viewport: { width: 320, height: 640 }, dpr: 2, css: 'html { font-size: 200% !important; }', look: 'classic' },
  { name: 'reflow320-text200-paper', viewport: { width: 320, height: 640 }, dpr: 2, css: 'html { font-size: 200% !important; }', look: 'paper' },
];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; if (!c || process.env.VERBOSE) console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

for (const which of engines) {
  for (const m of MODES) {
    const browser = await pw[which].launch();
    const ctx = await browser.newContext({ viewport: m.viewport, deviceScaleFactor: m.dpr, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(`${page.url()} ${e.message}`)); page.on('console', x => x.type() === 'error' && !/404|Failed to load resource/.test(x.text()) && errs.push(x.text().slice(0, 140)));
    const tag = `[${which} ${m.name}]`;
    if (m.look) {
      await page.goto(B + '/settings/appearance', { waitUntil: 'networkidle' });
      await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: m.look === 'paper' ? 'Paper' : 'Classic' }).click(); await page.waitForTimeout(300);
    }
    for (const r of ROUTES) {
      await page.goto(B + r, { waitUntil: 'networkidle' }); await page.waitForTimeout(350);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' + (m.css ?? '') }); await page.waitForTimeout(m.css ? 250 : 0);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${tag} ${r}: no sideways scrolling`, over <= 0, `${over}px`);
      const bad = await page.evaluate(() => {
        const vw = innerWidth;
        const scrollsX = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
        // a name cut with an ellipsis by its line (a card's or row's title) is truncated by design, its full text a click away
        const ellipsized = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.textOverflow === 'ellipsis' && s.overflowX === 'hidden' && p.getBoundingClientRect().right <= innerWidth + 1) return true; } return false; };
        const hidden = el => { for (let p = el; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return true; } return false; };
        const out = [];
        for (const el of document.querySelectorAll('main a[href], main button, main input, main select, main textarea, main [role="tab"], main h1, main h2, nav a[href], nav button')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || hidden(el) || el.closest('.sr-only, [aria-hidden="true"]')) continue;
          const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
          // outside the window to the right, with nothing that scrolls to it
          if (r.right > vw + 1 && !scrollsX(el) && !ellipsized(el)) out.push(`off-screen: ${name}`);
          // text cut off: wider than its box, clipped, and not shown with an ellipsis
          const s = getComputedStyle(el);
          if (el.scrollWidth > el.clientWidth + 2 && s.overflowX === 'hidden' && s.textOverflow !== 'ellipsis' && !el.querySelector('[style*="ellipsis"]') && el.tagName !== 'INPUT') out.push(`clipped: ${name}`);
        }
        return [...new Set(out)].slice(0, 6);
      });
      ok(`${tag} ${r}: every control and heading shows in full or scrolls into view`, bad.length === 0, bad.join(' | '));
      if (['/library', '/library/a-deploy', '/inbox', '/inbox/s-video', '/playground', '/settings/appearance', '/settings/shortcuts', '/help'].includes(r)) await page.screenshot({ path: path.join(OUT, `${which}-${m.name}${r.replace(/\//g, '_')}.png`) });
    }
    ok(`${tag} no console errors`, errs.length === 0, [...new Set(errs)].slice(0, 3).join(' | '));
    await browser.close();
  }
}
console.log(`\n${pass}/${pass + fail} zoom and large-text checks passed`);
process.exit(fail ? 1 : 0);
