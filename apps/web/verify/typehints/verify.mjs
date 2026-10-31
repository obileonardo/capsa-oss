// Type hints (B5a, Layer 1) verification: ground-truth accuracy, honesty (no text → nothing), privacy (no request
// leaves 127.0.0.1), UI flow (measure, progress, cancel, keyboard), screenshots, axe, console errors.
// Usage (dev server on :3100): node verify.mjs [chromium|webkit|all]   (default: all)
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CASES, REGION_CASE, cardHtml, noTextHtml, renderCard, spacingTruth, weightTruth } from './cases.mjs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const which = (process.argv[2] || 'all').toLowerCase();
if (!['chromium', 'webkit', 'all'].includes(which)) { console.error('Usage: node verify.mjs [chromium|webkit|all]'); process.exit(2); }

let engine = 'chromium';
const results = [];
const table = [];
const ok = (name, pass, detail = '') => { results.push({ engine, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ' — ' + detail : ''}`); };
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const alignTruth = a => (a === 'center' ? 'centred' : a);

async function axe(page, name) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })));
  const bad = v.filter(x => x.impact === 'serious' || x.impact === 'critical');
  ok(`axe ${name}: no serious/critical`, !bad.length, v.map(x => `${x.impact}:${x.id}(${x.targets.join(' | ')})`).join(', ') || 'clean');
}

async function run() {
  const browser = await pw[engine].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const requests = [];
  ctx.on('request', r => requests.push(r.url()));
  const errors = [];
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(`PAGEERROR ${e.message}`));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${BASE}/typehints-lab`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__typehintsLab);

  /* ---------- 1. UI flow on a cold worker: start, see progress, cancel, then measure for real ---------- */
  const a = CASES[0];
  const cardA = await renderCard(browser, cardHtml(a));
  await page.evaluate(b64 => window.__typehintsLab.load(b64), cardA.png.toString('base64'));
  const measureBtn = page.getByRole('button', { name: 'Measure type', exact: true });
  await measureBtn.waitFor();
  await measureBtn.focus();
  await page.keyboard.press('Enter'); // keyboard activation
  const bar = page.getByRole('progressbar');
  await bar.waitFor({ timeout: 5000 });
  ok('progress bar shown while measuring', await bar.isVisible(), await bar.getAttribute('aria-valuetext'));
  await shot(page, 'running-1440-light');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await measureBtn.waitFor({ timeout: 5000 });
  ok('cancel stops the run and returns to idle', await measureBtn.isVisible() && !(await page.getByText('measured from pixels').count()));
  await measureBtn.click();
  await page.getByText('measured from pixels').first().waitFor();
  const brief = await page.locator('blockquote').first().innerText();
  ok('result shows a brief line', /Headings .*≈\d/.test(brief), brief);
  ok('Layer 2 shown as not built', await page.getByText('Typeface · serif/sans: Layer 2, not built yet').count() > 0);
  ok('result JSON has version + ISO measuredAt', await page.evaluate(() => {
    const j = JSON.parse(document.querySelector('[data-testid="typehints-json"]').textContent);
    return j.version === 1 && !Number.isNaN(Date.parse(j.measuredAt)) && j.measuredAt.endsWith('Z');
  }));
  await page.locator('details summary', { hasText: 'Words read' }).click();
  await page.getByRole('button', { name: '% width' }).click();
  ok('unit toggle switches to % of width', await page.getByText(/of width/).count() > 0);
  await page.getByRole('button', { name: 'px', exact: true }).click();
  await shot(page, 'result-1440-light');
  await axe(page, 'lab result light');
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.waitForTimeout(400); // let colour transitions settle before screenshots and contrast checks
  await shot(page, 'result-1440-dark');
  await axe(page, 'lab result dark');
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#lab-type').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await shot(page, 'result-390-light');
  await axe(page, 'lab result 390');
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ---------- 2. ground truth ---------- */
  const measure = (png, region) => page.evaluate(([b64, r]) => window.__typehintsLab.measure(b64, r), [png.toString('base64'), region]);
  for (const c of CASES) {
    const card = await renderCard(browser, cardHtml(c));
    const t0 = Date.now();
    const r = await measure(card.png);
    const ms = Date.now() - t0;
    if (r.status !== 'ok') { ok(`${c.id}: text found`, false, r.status); continue; }
    const lv = r.measured.levels;
    const sizes = [...new Set(c.blocks.map(b => b.size))];
    ok(`${c.id}: ${sizes.length} size levels found`, lv.length === sizes.length, `measured ${lv.map(l => Math.round(l.sizePx)).join('/')} vs truth ${sizes.join('/')} (${ms} ms)`);
    for (const b of c.blocks) {
      const m = lv.reduce((p, q) => (Math.abs(q.sizePx - b.size) < Math.abs(p.sizePx - b.size) ? q : p));
      const err = m.sizePx / b.size - 1;
      const wT = weightTruth(b.weight), cT = b.caps ? 'all caps' : 'mixed', sT = spacingTruth(b.ls);
      ok(`${c.id} ${b.size}px: size within ±10%`, Math.abs(err) <= 0.10, `${m.sizePx.toFixed(1)} px (${pct(err)})`);
      if (b.weight === 300 || b.weight === 700) ok(`${c.id} ${b.size}px: weight ${b.weight} → ${wT}`, m.weight === wT, `${m.weight} (stroke ${(m.strokeRatio * 100).toFixed(1)}% of x-height)`);
      ok(`${c.id} ${b.size}px: case ${cT}`, m.case === cT, m.case);
      const lhErr = b.lines.length > 1 && m.lineHeight ? m.lineHeight / b.lh - 1 : null;
      table.push({ engine, card: c.id, font: c.family.replace(/"/g, ''), bg: c.bg, truthSize: b.size, size: +m.sizePx.toFixed(1), sizeErr: pct(err),
        truthWeight: `${b.weight} ${wT}`, weight: m.weight ?? '–', stroke: m.strokeRatio ? +(m.strokeRatio * 100).toFixed(1) : '–', xh: m.xHeightPx ? +m.xHeightPx.toFixed(1) : '–', truthCase: cT, case: m.case, truthSpacing: sT, spacing: m.spacing ?? '–',
        truthLH: b.lines.length > 1 ? b.lh : '–', lh: m.lineHeight ? +m.lineHeight.toFixed(2) : '–', lhErr: lhErr === null ? '–' : pct(lhErr),
        truthAlign: alignTruth(c.align), align: r.measured.alignment ?? '–', ms });
    }
    ok(`${c.id}: alignment ${alignTruth(c.align)}`, r.measured.alignment === alignTruth(c.align), r.measured.alignment ?? 'none');
    ok(`${c.id}: every value labelled measured`, r.method === 'measured from pixels' && r.layer === 1);
  }

  /* ---------- 3. region, no text, honesty ---------- */
  const base = CASES.find(c => c.id === REGION_CASE.base);
  const rc = await renderCard(browser, cardHtml(base));
  const rr = rc.blocks[REGION_CASE.blockIndex];
  const reg = { x: Math.max(0, rr.x - 0.01), y: Math.max(0, rr.y - 0.01), w: Math.min(1, rr.w + 0.02), h: Math.min(1, rr.h + 0.02) };
  const rres = await measure(rc.png, reg);
  const rl = rres.measured?.levels ?? [];
  ok('region: only the 14 px body is measured', rl.length === 1 && Math.abs(rl[0].sizePx / 14 - 1) <= 0.1, rl.map(l => l.sizePx.toFixed(1)).join('/'));
  ok('region: stored on the result', !!rres.source.region);
  const nt = await renderCard(browser, noTextHtml());
  const nres = await measure(nt.png);
  ok('no text: status no-text and no values', nres.status === 'no-text' && !nres.measured, nres.status);
  await page.evaluate(b64 => window.__typehintsLab.load(b64), nt.png.toString('base64'));
  await page.getByRole('button', { name: 'Measure type', exact: true }).click();
  await page.getByText('No readable text found', { exact: true }).waitFor();
  ok('no text: UI says "No readable text found" and shows nothing else', await page.locator('aside .tag', { hasText: 'measured from pixels' }).count() === 0 && await page.locator('ul[aria-label^="Size levels"]').count() === 0);
  await shot(page, 'no-text-1440-light');

  /* ---------- 4. privacy and errors ---------- */
  const outside = requests.filter(u => { try { const x = new URL(u); return !['data:', 'blob:'].includes(x.protocol) && x.hostname !== '127.0.0.1'; } catch { return true; } });
  const assets = requests.filter(u => u.includes('/typehints/'));
  ok('privacy: no request outside 127.0.0.1', outside.length === 0, `${requests.length} requests; outside: ${outside.slice(0, 5).join(', ') || 'none'}; OCR assets: ${[...new Set(assets.map(u => new URL(u).pathname))].join(', ')}`);
  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}

const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/${engine}-${name}.png`, fullPage: full });

for (const e of which === 'all' ? ['chromium', 'webkit'] : [which]) { engine = e; await run(); }

/* ---------- accuracy table ---------- */
const cols = ['engine', 'card', 'font', 'truthSize', 'size', 'sizeErr', 'truthWeight', 'weight', 'stroke', 'truthCase', 'case', 'truthSpacing', 'spacing', 'truthLH', 'lh', 'lhErr', 'truthAlign', 'align'];
const md = [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...table.map(r => `| ${cols.map(c => r[c]).join(' | ')} |`)].join('\n');
const errs = table.map(r => Math.abs(parseFloat(r.sizeErr)));
const spOk = table.filter(r => r.spacing === r.truthSpacing).length;
const lhRows = table.filter(r => r.lhErr !== '–');
const w4 = table.filter(r => r.truthWeight.startsWith('400'));
const summary = [
  `Size error: mean ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(1)}%, max ${Math.max(...errs).toFixed(1)}% (${errs.length} levels)`,
  `Weight 400 → Regular: ${w4.filter(r => r.weight === 'Regular').length}/${w4.length} (reported, not a target)`,
  `Spacing class matches CSS letter-spacing: ${spOk}/${table.length} (reported, not a target)`,
  `Line height within ±10%: ${lhRows.filter(r => Math.abs(parseFloat(r.lhErr)) <= 10).length}/${lhRows.length} (reported)`,
];
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ at: new Date().toISOString(), summary, results, table }, null, 1));
console.log('\n' + md + '\n\n' + summary.join('\n'));
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
