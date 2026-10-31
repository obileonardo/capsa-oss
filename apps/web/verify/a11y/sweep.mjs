// Hardening sweep (build-out Stage 10): every route in light and dark at 1440 and light at 390 (phone). (The Pixel pass was removed with the Pixel style.)
// Checks: axe (no serious/critical), no horizontal scroll, no console errors, a skip link, and that Tab moves through
// controls with a visible focus indicator. Usage (dev server on :3100): node verify/a11y/sweep.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
const ROUTES = ['/library', '/library/a-deploy', '/inbox', '/inbox/s-video', '/inbox/s-github', '/inbox/s-queued', '/inbox/s-x-thread',
  '/library/sources', '/library/health', '/library/duplicates', '/library?view=gallery', '/collections', '/collections/c-reuse', '/projects', '/projects/p-menubar', '/playground', '/settings', ...['profile', 'general', 'capture-import', 'organising', 'labels', 'boards-ai', 'data', 'about'].map(x => `/settings/${x}`), '/help', ...['glossary', 'device', 'backup', 'whats-new', 'not-connected'].map(x => `/help/${x}`), '/ai', ...['overview', 'mcp', 'files', 'claude', 'perplexity'].map(x => `/ai/${x}`), '/deleted', '/activity', '/learn', '/capture?url=https%3A%2F%2Fexample.com%2Fpost&title=Example', '/no-such-page'];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; if (!c || process.env.VERBOSE) console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

for (const which of engines) {
  for (const [theme, width] of [['light', 1440], ['dark', 1440], ['light', 390]]) {
    const browser = await pw[which].launch();
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(`${page.url()} ${e.message}`)); page.on('console', m => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errs.push(`${page.url()} ${m.text().slice(0, 140)}`));
    const tag = `[${which} ${theme} ${width}]`;
    for (const r of ROUTES) {
      await page.goto(B + r, { waitUntil: 'networkidle' }); await page.waitForTimeout(350);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${tag} ${r}: no horizontal scroll`, over <= 0, `${over}px`);
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
        .filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.nodes.length).map(v => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')}`));
      ok(`${tag} ${r}: axe has no serious or critical issues`, bad.length === 0, bad.join(' | '));
      if (theme === 'light' && width === 1440) {
        ok(`${tag} ${r}: has a skip link to the content`, await page.locator('a[href="#main"]').count() >= 1 || r === '/no-such-page');
        // Tab through the first controls: each gets a visible focus indicator
        await page.evaluate(() => (document.activeElement)?.blur());
        const seen = [];
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press(which === 'webkit' ? 'Alt+Tab' : 'Tab'); // Safari moves to links and buttons with Option+Tab
          const f = await page.evaluate(() => {
            const el = document.activeElement; if (!el || el === document.body) return null;
            const cs = getComputedStyle(el), r = el.getBoundingClientRect();
            const ringOf = c => (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (/rgb/.test(c.boxShadow) && c.boxShadow !== 'none') || c.borderImageSource !== 'none';
            // a field inside a framed search box rings the box (:focus-within)
            const ring = ringOf(cs) || (el.tagName === 'INPUT' && el.parentElement && ringOf(getComputedStyle(el.parentElement)));
            const after = getComputedStyle(el, '::after'); const afterRing = after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) > 0;
            return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30), ring: ring || afterRing, visible: r.width > 0 && r.height > 0 };
          });
          if (f) seen.push(f);
        }
        const noRing = seen.filter(f => f.visible && !f.ring);
        ok(`${tag} ${r}: Tab reaches controls, each with a visible focus indicator`, seen.length >= 3 && noRing.length === 0, noRing.map(f => f.name).join(', ') || `${seen.length} stops`);
      }
      if (width === 390 && ['/library', '/inbox', '/collections/c-reuse', '/settings'].includes(r)) await page.screenshot({ path: path.join(OUT, `${which}-390${r.replace(/\//g, '_')}.png`) });
    }
    ok(`${tag} no console errors`, errs.length === 0, [...new Set(errs)].slice(0, 4).join(' | '));
    await browser.close();
  }
}
console.log(`\n${pass}/${pass + fail} sweep checks passed`);
process.exit(fail ? 1 : 0);
