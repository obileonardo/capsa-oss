// Inbox + Review verification: flows, screenshots, axe, console errors.  Usage: node verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import { fileURLToPath } from 'url';
import fs from 'fs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = fileURLToPath(new URL('.', import.meta.url));
const BASE = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
const results = { checks: [], axe: [], errors: [], shots: [] };
const { FIXTURES } = await import('../capture/fixtures.mjs');
const only = process.argv[3] ?? 'all'; // 'capture' runs only the Stage 2 capture flow; 'deleted' only flow 11 (ring, delete, bin, Deleted)

const check = (engine, name, ok, detail = '') => {
  results.checks.push({ engine, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ' — ' + detail : ''}`);
};

async function newPage(browser, engine, { width = 1440, theme = 'light', motion = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: theme, reducedMotion: motion ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') results.errors.push({ engine, url: page.url(), text: m.text().slice(0, 240) }); });
  page.on('pageerror', e => results.errors.push({ engine, url: page.url(), text: 'pageerror: ' + e.message.slice(0, 240) }));
  return { ctx, page };
}
const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForSelector('main#main h1, main#main .empty', { timeout: 15000 }); await page.waitForTimeout(250); };
const libCount = async page => Number((await page.locator('nav[aria-label="Main"] a[href="/library"]').innerText()).replace(/\D/g, '') || 0);
const toasts = page => page.locator('.toasts .toast');
/** A real pointer drag (mouse down, several moves, up), as a person does it: no synthetic drag events. */
async function pdrag(page, from, to, { steps = 12, release = true, settle = 450, at } = {}) {
  await from.evaluate(el => el.scrollIntoView({ block: 'center' })); // clear of the sticky top bar
  const a = await from.boundingBox(), b = await to.boundingBox();
  const sx = a.x + a.width / 2, sy = a.y + Math.min(24, a.height / 2);
  const ex = b.x + b.width / 2, ey = at ?? b.y + Math.min(140, b.height / 2);
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move(sx + 6, sy + 2);
  for (let i = 1; i <= steps; i++) await page.mouse.move(sx + (ex - sx) * i / steps, sy + (ey - sy) * i / steps);
  await page.waitForTimeout(80); // a frame for the hit test under the pointer
  if (release) { await page.mouse.up(); await page.waitForTimeout(settle); }
}

async function shoot(page, engine, name) {
  const file = `${engine}-${name}.png`;
  await page.screenshot({ path: OUT + file });
  results.shots.push(file);
}
async function axe(page, engine, label) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => {
    const map = res => res.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }));
    const main = await window.axe.run({ include: [['#main']] }, { resultTypes: ['violations'] });
    const full = await window.axe.run(document, { resultTypes: ['violations'] });
    return { main: map(main), full: map(full) };
  });
  results.axe.push({ engine, label, violations: r.main, fullPage: r.full });
  const outside = r.full.filter(v => !r.main.some(m => m.id === v.id && m.nodes === v.nodes));
  if (outside.length) results.outsideMain = [...new Set([...(results.outsideMain ?? []), ...outside.map(v => `${v.id}(${v.impact}) ${v.target.join(',')}`)])];
  const rr = r.main;
  const bad = rr.filter(v => v.impact === 'serious' || v.impact === 'critical');
  check(engine, `axe ${label}: no serious/critical`, bad.length === 0, rr.map(v => `${v.id}(${v.impact})×${v.nodes} ${v.target.join(',')}`).join('; ') || '0 violations');
  const badOut = outside.filter(v => v.impact === 'serious' || v.impact === 'critical');
  check(engine, `axe ${label}: no serious/critical outside #main either`, badOut.length === 0, badOut.map(v => `${v.id}(${v.impact}) ${v.target.join(',')}`).join('; ') || 'none');
}

for (const engine of engines) {
  const browser = await pw[engine].launch();

  if (only !== 'capture' && only !== 'deleted') { // the original flows (skipped with `capture`, for a quick Stage 2 run)
  /* ---------- screenshots + axe: both themes, 1440 and 390 ---------- */
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const { ctx, page } = await newPage(browser, engine, { width, theme });
      const tag = `${theme}-${width}`;
      for (const [path, name] of [
        ['/inbox', 'inbox'], ['/inbox/s-video', 'review-video'], ['/inbox/s-github', 'review-github'], ['/inbox/s-article', 'review-article'],
        ['/inbox/s-x-thread', 'outcome-needs-thread'], ['/inbox/s-failed', 'outcome-failed'], ['/inbox/s-x-bait', 'outcome-nothing'],
        ['/inbox/s-queued', 'outcome-queued'], ['/inbox/s-video-old', 'outcome-reviewed'], ['/inbox/s-bookmark', 'outcome-bookmark'],
      ]) {
        await go(page, path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) check(engine, `${tag} ${name}: no horizontal scroll`, false, `${overflow}px`);
        const keep = theme === 'light' || ['inbox', 'review-video', 'review-github', 'outcome-needs-thread', 'outcome-reviewed'].includes(name);
        if (keep) await shoot(page, engine, `${tag}-${name}`);
        if (engine === 'chromium' || ['inbox', 'review-video', 'outcome-failed'].includes(name)) await axe(page, engine, `${tag} ${name}`);
      }
      if (width === 1440) { // the other two views
        await go(page, '/inbox/s-article');
        await page.getByRole('button', { name: 'List' }).click();
        await page.waitForTimeout(200);
        await shoot(page, engine, `${tag}-review-list`);
        await page.locator('[aria-controls^="lr-"]').first().click();
        await shoot(page, engine, `${tag}-review-list-expanded`);
        await axe(page, engine, `${tag} list view`);
        await page.getByRole('button', { name: 'Focus' }).click();
        await page.waitForTimeout(200);
        await shoot(page, engine, `${tag}-review-focus`);
        await axe(page, engine, `${tag} focus view`);
        await page.getByRole('button', { name: 'Auto' }).click();
      }
      await ctx.close();
    }
  }

  /* ---------- flow 1: file candidates, then Undo ---------- */
  {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox/s-video');
    const before = await libCount(page);
    // AI-located candidates start unselected until their moment is confirmed (DESIGN_DECISIONS §3): 3 of 5 preselected
    check(engine, 'default: AI-located c-v1 and c-v4 start unselected', !(await page.locator('[data-card="c-v1"] input[type=checkbox]').isChecked()) && !(await page.locator('[data-card="c-v4"] input[type=checkbox]').isChecked()));
    await page.getByRole('button', { name: /^Save 3 to Library/ }).click();
    await page.waitForSelector('h2:has-text("Saved 3 resources to Library")');
    const after = await libCount(page);
    const toastText = await toasts(page).first().innerText();
    check(engine, 'file: Library count +3', after === before + 3, `${before} → ${after}`);
    check(engine, 'file: toast says where they went', /Saved 3 to Library/.test(toastText), toastText.replace(/\n/g, ' | '));
    check(engine, 'file: focus moved to the outcome heading', await page.evaluate(() => document.activeElement?.id === 'oc-h'));
    check(engine, 'file: kept list links to Library', await page.locator('ul[aria-label="Kept from this source"] a[href^="/library/"]').count() === 3);
    await shoot(page, engine, 'flow-file-saved');
    await toasts(page).first().getByRole('button', { name: 'Undo' }).click();
    await page.waitForSelector('h2:has-text("5 found to review")');
    check(engine, 'undo: Library count restored', await libCount(page) === before, `${await libCount(page)}`);
    check(engine, 'undo: staging kept and board back', await page.locator('article input[type=checkbox]:checked').count() === 3);
    await ctx.close();
  }

  /* ---------- flow 2: double-click Save files only once; ⌘↵ twice too ---------- */
  {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox/s-video');
    const before = await libCount(page);
    await page.getByRole('button', { name: /^Save 3 to Library/ }).dblclick();
    await page.waitForSelector('h2:has-text("Saved 3")');
    await page.waitForTimeout(300);
    check(engine, 'double-click Save files once', await libCount(page) === before + 3, `${before} → ${await libCount(page)}, toasts ${await toasts(page).count()}`);
    check(engine, 'double-click Save shows one toast', await toasts(page).count() === 1);
    await go(page, '/inbox/s-article');
    const b2 = await libCount(page);
    const mod = engine === 'webkit' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+Enter`); await page.keyboard.press(`${mod}+Enter`);
    await page.waitForSelector('h2:has-text("Saved 4")');
    await page.waitForTimeout(300);
    check(engine, '⌘↵ twice files once', await libCount(page) === b2 + 4, `${b2} → ${await libCount(page)}`);
    await ctx.close();
  }

  /* ---------- flow 3: Save link only, then Undo ---------- */
  {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox/s-article');
    await page.getByRole('button', { name: /Save link only/ }).click();
    await page.waitForSelector('h2:has-text("Kept as a link")');
    const t = await toasts(page).first().innerText();
    check(engine, 'link only: outcome + toast', /Kept as a link · 4 skipped/.test(t), t.replace(/\n/g, ' | '));
    check(engine, 'link only: Restore offered', await page.getByRole('button', { name: /Restore 4 skipped/ }).count() === 1);
    await shoot(page, engine, 'flow-link-only');
    await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
    await page.waitForSelector('h2:has-text("4 found to review")');
    check(engine, 'link only: Undo returns to review', true);
    await ctx.close();
  }

  /* ---------- flow 4: Focus keyboard keep / skip ---------- */
  {
    const { ctx, page } = await newPage(browser, engine, { width: 390 });
    await go(page, '/inbox/s-video');
    check(engine, 'Auto picks Focus at 390', await page.locator('[role=progressbar]').count() === 1);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    for (const k of ['k', 's', 'k', 's', 'k']) { await page.keyboard.press(k); await page.waitForTimeout(60); }
    const prog = await page.locator('[role=progressbar]').getAttribute('aria-valuetext');
    check(engine, 'focus: 5 decisions recorded', prog === '5 of 5 decided', prog);
    check(engine, 'focus: summary after last card', await page.locator('h3:has-text("All 5 seen")').count() === 1);
    const bar = await page.getByRole('region', { name: 'Save' }).innerText();
    check(engine, 'focus: commit bar shows 3 to keep', /3\s*to keep/.test(bar), bar.replace(/\n/g, ' '));
    await shoot(page, engine, 'flow-focus-summary-390');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    check(engine, 'focus: ← goes back', /Card 4 of 5/.test(await page.locator('main').innerText()));
    // commit bar must not cover content at the end of the scroll (AUD-08 / AUD-22)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const geo = await page.evaluate(() => {
      const barEl = document.querySelector('[role=region][aria-label="Save"]').getBoundingClientRect();
      const last = document.querySelector('details')?.getBoundingClientRect();
      const btn = document.querySelector('[aria-label="Open navigation"]')?.getBoundingClientRect();
      const count = document.querySelector('[role=region][aria-label="Save"] p')?.getBoundingClientRect();
      return { barTop: barEl.top, barBottom: barEl.bottom, vh: innerHeight, lastBottom: last?.bottom, btnRight: btn?.right, countLeft: count?.left, sw: document.documentElement.scrollWidth };
    });
    check(engine, 'mobile: commit bar sits at the bottom edge', Math.abs(geo.barBottom - geo.vh) < 2, JSON.stringify(geo));
    check(engine, 'mobile: commit bar does not cover the last content', geo.lastBottom <= geo.barTop + 1);
    check(engine, 'mobile: commit bar clears the menu button', !geo.btnRight || geo.countLeft >= geo.btnRight);
    check(engine, 'mobile: no horizontal scroll', geo.sw <= 390, String(geo.sw));
    await page.keyboard.press(engine === 'webkit' ? 'Meta+Enter' : 'Control+Enter');
    await page.waitForSelector('h2:has-text("Saved 3 resources")');
    check(engine, 'focus: ⌘↵ saves the staged 3', true);
    await shoot(page, engine, 'flow-focus-saved-390');
    await ctx.close();
  }

  /* ---------- flow 5: evidence stepping with [ and ] ---------- */
  {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox/s-video');
    await page.locator('body').click({ position: { x: 600, y: 140 } });
    await page.keyboard.press(']'); await page.keyboard.press(']');
    const c1 = await page.locator('[role=region][aria-label="Where it came from"]').innerText();
    check(engine, '] steps to 3 of 5', /Where it came from · 3 of 5/.test(c1.replace(/\s+/g, ' ')) && /Docs lookup server/.test(c1));
    check(engine, 'active card ringed', await page.locator('[data-card="c-v3"] article[data-active="true"]').count() === 1);
    check(engine, 'creator quote highlighted in the description', await page.locator('mark[data-evid="c-v3"][data-active="true"]').count() === 1);
    await page.keyboard.press('[');
    check(engine, '[ steps back to 2 of 5', /Where it came from · 2 of 5/.test((await page.locator('[role=region][aria-label="Where it came from"]').innerText()).replace(/\s+/g, ' ')));
    await shoot(page, engine, 'flow-evidence-2of5');
    await go(page, '/inbox/s-github');
    await page.locator('body').click({ position: { x: 600, y: 140 } });
    await page.keyboard.press(']'); await page.keyboard.press(']');
    await page.waitForTimeout(400);
    const vis = await page.evaluate(() => {
      const m = document.querySelector('mark[data-evid="c-g3"][data-active="true"]'); const pane = document.querySelector('aside[aria-label="Source and where it came from"]');
      if (!m || !pane) return null; const r = m.getBoundingClientRect(), p = pane.getBoundingClientRect(); return r.top >= p.top && r.bottom <= p.bottom;
    });
    check(engine, 'github: active passage highlighted and in view', vis === true, String(vis));
    await shoot(page, engine, 'flow-evidence-github-3of3');
    // the card's quote: a long one scrolls inside the card, so it takes focus and the keyboard scrolls it; a short one stays out of the tab order
    const quoteNow = () => page.evaluate(() => {
      const q = document.querySelector('[role=region][aria-label="Where it came from"] blockquote');
      return q && { scrolls: q.scrollHeight > q.clientHeight + 1, tabbable: q.tabIndex === 0 };
    });
    const quotes = [];
    for (const [path, steps] of [['/inbox/s-github', 3], ['/inbox/s-video', 5]]) {
      await go(page, path);
      await page.locator('body').click({ position: { x: 600, y: 140 } });
      for (let k = 0; k < steps; k++) { await page.waitForTimeout(150); const q = await quoteNow(); if (q) quotes.push(q); await page.keyboard.press(']'); }
    }
    check(engine, 'card quote: focusable exactly when it scrolls', quotes.length > 0 && quotes.every(q => q.scrolls === q.tabbable), JSON.stringify(quotes));
    await go(page, '/inbox/s-github');
    await page.evaluate(() => { const q = document.querySelector('[role=region][aria-label="Where it came from"] blockquote'); if (q) q.textContent = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long quoted passage`).join('\n'); });
    await page.waitForTimeout(300);
    const long = await quoteNow();
    check(engine, 'card quote: a long quote scrolls and can be focused', !!long && long.scrolls && long.tabbable, JSON.stringify(long));
    await page.locator('[role=region][aria-label="Where it came from"] blockquote').focus();
    await page.keyboard.press('PageDown'); // WebKit doesn't line-scroll a focused box with the arrow keys; Page Down and Space work in both
    await page.waitForTimeout(400);
    const top = await page.evaluate(() => document.querySelector('[role=region][aria-label="Where it came from"] blockquote')?.scrollTop ?? 0);
    check(engine, 'card quote: the keyboard scrolls it once focused', top > 0, `scrollTop ${top}`);
    await ctx.close();
  }

  /* ---------- flow 6: edit validation, unchanged edit records nothing, confirm moment ---------- */
  {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox/s-article');
    const card = page.locator('[data-card="c-a1"]');
    await card.getByRole('button', { name: /Edit title/ }).click();
    await card.getByRole('button', { name: 'Save edit' }).click();
    check(engine, 'edit: unchanged save records nothing', await card.locator('text=Edited by you').count() === 0 && await toasts(page).count() === 0);
    await card.getByRole('button', { name: /Edit title/ }).click();
    await card.getByLabel('Title').fill('   ');
    await card.getByRole('button', { name: 'Save edit' }).click();
    const inv = await card.getByLabel('Title').getAttribute('aria-invalid');
    check(engine, 'edit: empty title shows inline error', inv === 'true' && await card.locator('[role=alert]:has-text("Give it a title")').count() === 1);
    await shoot(page, engine, 'flow-edit-error');
    await card.getByLabel('Title').fill('Vercel hosting');
    await page.keyboard.press(engine === 'webkit' ? 'Meta+Enter' : 'Control+Enter'); // AUD-09: saves the edit, then files
    await page.waitForSelector('h2:has-text("Saved 4")');
    check(engine, 'edit + ⌘↵: edited title is what gets filed', await page.locator('ul[aria-label="Kept from this source"]').innerText().then(t => t.includes('Vercel hosting')));
    await go(page, '/inbox/s-video');
    await page.locator('[data-card="c-v1"]').getByRole('button', { name: 'Confirm moment' }).click();
    check(engine, 'confirm moment keeps the AI label', await page.locator('[data-card="c-v1"] .tag:has-text("Found by AI · moment 07:16 · confirmed by you")').count() === 1);
    check(engine, 'confirm moment selects the candidate', await page.locator('[data-card="c-v1"] input[type=checkbox]').isChecked());
    await ctx.close();
  }

  /* ---------- flow 7: Inbox keyboard, preview, restore skipped ---------- */
  {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox');
    await page.locator('body').click({ position: { x: 450, y: 30 } }); // an empty spot in the top bar (the right panel narrows the main column)
    await page.keyboard.press('ArrowDown');
    const pv = await page.locator('aside[aria-label="Preview"] h2').innerText();
    check(engine, 'inbox: ↓ moves selection and preview', pv === 'demo-org/browser-qa-skill', pv);
    check(engine, 'inbox: focus follows selection', await page.evaluate(() => document.activeElement?.getAttribute('href')) === '/inbox/s-github');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/inbox/s-github');
    check(engine, 'inbox: Enter opens the source', true);
    await page.getByRole('button', { name: /^Save 2 to Library/ }).click();
    await page.waitForSelector('h2:has-text("Saved 2")');
    await page.getByRole('button', { name: /Restore 1 skipped/ }).click();
    await page.waitForSelector('h2:has-text("1 found to review")');
    check(engine, 'restore skipped: the injection candidate is back, unselected', await page.locator('article input[type=checkbox]').count() === 1 && !(await page.locator('article input[type=checkbox]').isChecked()));
    await go(page, '/inbox');
    check(engine, 'inbox: opened source loses unread weight', await page.locator('a[href="/inbox/s-github"][data-unread="true"]').count() === 0);
    await ctx.close();
  }

  /* ---------- flow 7b: the pipeline board (22 Oct): columns, drag and drop with real meaning, keyboard moves ---------- */
  {
    const { ctx, page } = await newPage(browser, engine, { width: 1728 });
    await go(page, '/inbox');
    const heads = await page.locator('[data-inbox-list] section h2').allInnerTexts();
    check(engine, 'board: four columns in pipeline order', heads.map(h => h.replace(/\s*\d+$/, '').trim()).join(' > ') === 'Ready to review > Processing > Nothing to unpack > Done', heads.join(' | '));
    const col = k => page.locator(`section[data-col="${k}"]`);
    const widths = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[data-inbox-list] > section, [data-inbox-list] > aside')];
      const box = document.querySelector('[data-inbox-list]').getBoundingClientRect();
      return { n: els.length, ws: els.map(e => e.getBoundingClientRect().width), total: box.width };
    });
    check(engine, 'board: four columns and the review panel, each a fifth of the width', widths.n === 5 && widths.ws.every(w => Math.abs(w - (widths.total - 4 * 12) / 5) < 1.5), widths.ws.map(w => w.toFixed(0)).join(' · ') + ` of ${widths.total.toFixed(0)}`);
    check(engine, 'board: "needs you" stays in Ready to review, flagged', await col('review').locator('a[href="/inbox/s-x-thread"]').count() === 1 && /Needs you/.test(await col('review').locator('a[href="/inbox/s-x-thread"]').innerText()));
    // drag a Ready card to Done (real pointer input): files what the panel has ticked (3 of 5 for the video), with Undo
    const lib0 = await libCount(page);
    await pdrag(page, page.locator('a[href="/inbox/s-video"]'), col('done'));
    check(engine, 'drag Ready → Done files the ticked candidates', await libCount(page) === lib0 + 3 && await col('done').locator('a[href="/inbox/s-video"]').count() === 1, `${lib0} → ${await libCount(page)}`);
    check(engine, 'drag Ready → Done: the toast says what was saved', /Saved 3 to Library · 2 skipped/.test(await toasts(page).first().innerText()));
    check(engine, 'drag: no lifted card is left behind after the drop', await page.locator('[data-drag-ghost]').count() === 0);
    await toasts(page).filter({ hasText: 'Saved 3' }).getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(250);
    check(engine, 'Undo puts the card back in Ready to review', await libCount(page) === lib0 && await col('review').locator('a[href="/inbox/s-video"]').count() === 1);
    // the three working columns trade cards freely: Ready → Processing → Nothing to unpack → Ready
    await pdrag(page, page.locator('a[href="/inbox/s-article"]'), col('progress'));
    check(engine, 'drag Ready → Processing moves it back to be read', await col('progress').locator('a[href="/inbox/s-article"]').count() === 1 && /Back in Processing/.test(await toasts(page).first().innerText()));
    await pdrag(page, page.locator('a[href="/inbox/s-article"]'), col('nothing'));
    check(engine, 'drag Processing → Nothing to unpack marks it', await col('nothing').locator('a[href="/inbox/s-article"]').count() === 1 && /Marked as nothing useful/.test(await col('nothing').locator('a[href="/inbox/s-article"]').innerText()));
    await pdrag(page, page.locator('a[href="/inbox/s-article"]'), col('review'));
    check(engine, 'drag Nothing → Ready reopens it with its candidates', await col('review').locator('a[href="/inbox/s-article"]').count() === 1 && /4 found/.test(await col('review').locator('a[href="/inbox/s-article"]').innerText()));
    // a drop that would mean nothing springs home with the reason: an unread source has nothing to review yet
    await pdrag(page, page.locator('a[href="/inbox/s-queued"]'), col('review'));
    check(engine, 'a refused drop: the card stays, and the toast says why', await col('progress').locator('a[href="/inbox/s-queued"]').count() === 1
      && /Can’t move to Ready to review · Nothing found to review yet/.test(await toasts(page).first().innerText()), (await toasts(page).first().innerText()).replace(/\n/g, ' '));
    // Esc while dragging puts the card back; nothing changes
    await pdrag(page, page.locator('a[href="/inbox/s-article"]'), col('nothing'), { release: false });
    check(engine, 'drag: the column under the card is highlighted', await col('nothing').getAttribute('data-over') !== null && await page.locator('[data-drag-ghost]').count() === 1);
    await page.keyboard.press('Escape');
    await page.mouse.up(); await page.waitForTimeout(450);
    check(engine, 'drag: Esc cancels and the card stays', await col('review').locator('a[href="/inbox/s-article"]').count() === 1 && await page.locator('[data-drag-ghost]').count() === 0);
    check(engine, 'drag: the card is still on the board page (the drop opened nothing)', new URL(page.url()).pathname === '/inbox');
    // Done cards lift (24 Oct: so the bin can show it won't take them), but every column refuses them and they spring home
    const doneCard = col('done').locator('a[href="/inbox/s-x-prompt"]');
    await pdrag(page, doneCard, col('review'), { release: false });
    const ghostOnDone = await page.locator('[data-drag-ghost]').count();
    const refusedCols = await page.evaluate(() => ['review', 'progress', 'nothing'].every(k => document.querySelector(`section[data-col="${k}"]`).dataset.drop === 'no'));
    await page.mouse.up(); await page.waitForTimeout(450);
    check(engine, 'Done cards lift, every column refuses them, and they spring home to Done', ghostOnDone === 1 && refusedCols
      && await col('done').locator('a[href="/inbox/s-x-prompt"]').count() === 1 && await page.locator('[data-drag-ghost]').count() === 0 && new URL(page.url()).pathname === '/inbox'
      && /Can’t move to Ready to review/.test(await toasts(page).first().innerText()), (await toasts(page).first().innerText()).replace(/\n/g, ' '));
    // keyboard: arrows across columns, then Move to… in the ⋯ menu
    await page.locator('a[href="/inbox/s-github"]').click();
    await page.locator('a[href="/inbox/s-github"]').focus();
    await page.keyboard.press('ArrowRight');
    check(engine, 'keyboard: → moves to the next column', await page.evaluate(() => document.activeElement?.closest('section')?.dataset.col) === 'progress');
    await page.keyboard.press('ArrowLeft');
    await page.getByRole('button', { name: 'More for “demo-org/browser-qa-skill”' }).click();
    const menu = page.getByRole('menu', { name: 'Move or delete' });
    check(engine, 'Move to…: every working column is offered', !(await menu.getByRole('menuitem', { name: /^Processing/ }).isDisabled()) && !(await menu.getByRole('menuitem', { name: 'Nothing to unpack' }).isDisabled()));
    await menu.getByRole('menuitem', { name: 'Nothing to unpack' }).click();
    await page.waitForTimeout(250);
    check(engine, 'Move to… moves the card and announces it', await col('nothing').locator('a[href="/inbox/s-github"]').count() === 1 && /moved to Nothing to unpack/.test(await page.locator('#inbox-announce').innerText()));
    await toasts(page).filter({ hasText: 'Marked as nothing' }).last().getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(250);
    check(engine, 'Undo a keyboard move', await col('review').locator('a[href="/inbox/s-github"]').count() === 1);
    await page.getByRole('button', { name: /^More for “.*”$/ }).and(col('progress').getByRole('button')).first().click();
    check(engine, 'Move to…: an unread source can’t go to Ready to review (disabled, with the reason)', await page.getByRole('menu', { name: 'Move or delete' }).getByRole('menuitem', { name: /^Ready to review/ }).isDisabled());
    await page.keyboard.press('Escape');
    await shoot(page, engine, 'light-1728-board');
    await axe(page, engine, 'inbox board');
    await ctx.close();
  }

  /* ---------- flow 7c: empty columns, the physical drag with motion on, reduced motion, 20 cards ---------- */
  {
    // a state with one source, in Done: the three working columns are empty
    // write the sources straight into IndexedDB (the app's own format); `make` builds them from the demo's sources
    let orig = null;
    // (`make` runs here in Node, not in the page: the app's Content Security Policy allows no eval in a production build)
    const seed = async (page, make) => {
      const srcs = orig ?? await page.evaluate(async () => {
        const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
        return (await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); })).sources;
      });
      const sources = new Function('srcs', make)(structuredClone(srcs));
      await page.evaluate(async sources => {
        const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
        const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
        await new Promise(r => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put({ ...st, sources, _at: Date.now() + 1e7 }, 'app'); tx.oncomplete = r; });
      }, sources);
      orig = srcs;
    };
    for (const motion of [false, true]) {
      const { ctx, page } = await newPage(browser, engine, { width: 1728, motion });
      orig = null;
      await go(page, '/inbox');
      await seed(page, "return srcs.filter(s => s.id === 's-x-prompt')");
      await go(page, '/inbox');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-col-empty] .art img')].every(i => i.complete), null, { timeout: 10000 }).catch(() => {});
      const geo = await page.evaluate(() => ['review', 'progress', 'nothing'].map(k => {
        const col = document.querySelector(`section[data-col="${k}"]`).getBoundingClientRect();
        const e = document.querySelector(`[data-col-empty="${k}"]`);
        if (!e) return { k, missing: true };
        const svg = e.querySelector('.art').getBoundingClientRect(), p = e.querySelector('p').getBoundingClientRect();
        const top = svg.top, bottom = p.bottom, cx = (svg.left + svg.right) / 2;
        const tile = getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' || getComputedStyle(e.querySelector('.art')).backgroundColor !== 'rgba(0, 0, 0, 0)';
        const shown = [...e.querySelectorAll('.art img')].filter(i => getComputedStyle(i).visibility !== 'hidden' && getComputedStyle(i).display !== 'none');
        return { k, dx: cx - (col.left + col.right) / 2, dy: (top + bottom) / 2 - (col.top + col.bottom) / 2, title: e.innerText.trim(), tile,
          art: e.querySelector('.art').dataset.art, loaded: shown.length === 1 && shown[0].complete && shown[0].naturalWidth > 0 };
      }));
      if (!motion) {
        check(engine, 'empty columns: each has its own drawing and a short title', geo.map(g => g.title).join(' | ') === 'All reviewed | Nothing processing | Nothing here', geo.map(g => g.title).join(' | '));
        check(engine, 'empty columns: centred in the column (geometry, ±2 px)', geo.every(g => !g.missing && Math.abs(g.dx) <= 2 && Math.abs(g.dy) <= 2), geo.map(g => `${g.k} ${g.dx?.toFixed(1)},${g.dy?.toFixed(1)}`).join(' · '));
        check(engine, 'empty columns: no tile behind the drawing', geo.every(g => !g.tile));
        check(engine, 'Inbox Zero is not shown while a column has a card', await page.getByRole('region', { name: 'Inbox Zero' }).count() === 0);
      }
      if (!motion) check(engine, 'empty columns: each shows its own illustration, one image for the theme, loaded',
        geo.map(g => g.art).join(',') === 'inbox-ready-empty,inbox-processing-empty,inbox-nothing-empty' && geo.every(g => g.loaded), geo.map(g => `${g.art}:${g.loaded}`).join(' · '));
      await shoot(page, engine, `light-1728-empty-columns${motion ? '' : '-reduced'}`);
      // the lift: a fast sideways move tilts the card and scales it to 1.03; reduced motion does neither
      await seed(page, "return srcs");
      await go(page, '/inbox');
      const c = page.locator('section[data-col="review"]');
      const card = c.locator('a[href="/inbox/s-article"]');
      const a = await card.boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + 20); await page.mouse.down();
      for (let i = 1; i <= 6; i++) { await page.mouse.move(a.x + a.width / 2 + i * 40, a.y + 20 + i * 4); await page.waitForTimeout(16); }
      await page.waitForTimeout(60);
      const lifted = await page.locator('[data-drag-ghost]').evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return { scale: Math.hypot(m.a, m.b), rot: Math.atan2(m.b, m.a) * 180 / Math.PI }; });
      await page.waitForTimeout(700); // holding still: the tilt eases back to 0
      const still = await page.locator('[data-drag-ghost]').evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; });
      if (motion) {
        check(engine, 'lift: the card scales to about 1.03 and tilts the way the pointer moves (at most 6°)', Math.abs(lifted.scale - 1.03) < 0.006 && lifted.rot > 0.3 && lifted.rot <= 6.01, `scale ${lifted.scale.toFixed(3)}, tilt ${lifted.rot.toFixed(2)}°`);
        check(engine, 'lift: the tilt eases back to 0 when the pointer stops', Math.abs(still) < 0.3, `${still.toFixed(2)}°`);
      } else check(engine, 'reduced motion: no tilt and no scale while dragging', Math.abs(lifted.scale - 1) < 0.001 && Math.abs(lifted.rot) < 0.01, `scale ${lifted.scale.toFixed(3)}, tilt ${lifted.rot.toFixed(2)}°`);
      // drop on Nothing to unpack: watch the ghost settle onto the card's new place
      const nb = await page.locator('section[data-col="nothing"]').boundingBox();
      await page.mouse.move(nb.x + nb.width / 2, nb.y + 160, { steps: 8 }); await page.waitForTimeout(80);
      await page.evaluate(() => { window.__settle = []; const loop = () => { const g = document.querySelector('[data-drag-ghost]'); if (!g) { window.__settleDone = true; return; } window.__settle.push({ top: g.getBoundingClientRect().top, op: +getComputedStyle(g).opacity }); requestAnimationFrame(loop); }; window.__settleDone = false; requestAnimationFrame(loop); });
      await page.mouse.up();
      await page.waitForFunction(() => window.__settleDone, null, { timeout: 3000 });
      const settle = await page.evaluate(() => ({ s: window.__settle, top: document.querySelector('section[data-col="nothing"] a[href="/inbox/s-article"]').getBoundingClientRect().top }));
      if (motion) {
        const tops = settle.s.map(f => f.top); const dir = Math.sign(settle.top - tops[0]);
        const over = Math.max(0, ...tops.map(t => (t - settle.top) * dir));
        check(engine, 'drop: the card springs into its place with a tiny overshoot', over > 0.2 && over < 12 && Math.abs(tops.at(-1) - settle.top) < 1.5, `overshoot ${over.toFixed(1)} px over ${tops.length} frames`);
      } else check(engine, 'reduced motion: the drop is a short fade, no spring', settle.s.length < 20 && settle.s.every(f => Math.abs(f.top - settle.s[0].top) < 0.5), `${settle.s.length} frames, opacity ${settle.s.map(f => f.op.toFixed(1)).join(' ')}`);
      if (motion) {
        // 20 cards in a column: drag across the board and count frames (only transform and opacity animate)
        await seed(page, "const base = srcs.find(s => s.id === 's-article'); return [...srcs, ...Array.from({ length: 20 }, (_, i) => ({ ...base, id: 'perf-' + i, title: base.title + ' ' + i, savedAt: new Date(Date.now() - (i + 10) * 36e5).toISOString() }))]");
        await go(page, '/inbox');
        const n = await page.locator('section[data-col="review"] li[data-id]').count();
        const pc = await page.locator('section[data-col="review"] a[href="/inbox/perf-3"]').boundingBox();
        await page.evaluate(() => { window.__f = []; let last = performance.now(); const loop = now => { window.__f.push(now - last); last = now; if (!window.__stop) requestAnimationFrame(loop); }; window.__stop = false; requestAnimationFrame(loop); });
        await page.mouse.move(pc.x + pc.width / 2, pc.y + 20); await page.mouse.down();
        const cols = ['progress', 'nothing', 'done', 'nothing', 'progress', 'review'];
        for (const k of cols) { const bb = await page.locator(`section[data-col="${k}"]`).boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + 200, { steps: 10 }); }
        await page.mouse.up(); await page.waitForTimeout(500);
        const f = await page.evaluate(() => { window.__stop = true; return window.__f.slice(2).sort((a, b) => a - b); });
        const p95 = f[Math.floor(f.length * 0.95)], med = f[Math.floor(f.length / 2)];
        check(engine, `drag with ${n} cards in the column: frames stay near 60 fps (median ≤ 17.5 ms, p95 ≤ 34 ms)`, n >= 20 && med <= 17.5 && p95 <= 34, `median ${med.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ${f.length} frames`);
      }
      await ctx.close();
    }
  }

  /* ---------- flow 8: paste fallback, capture note, empty state ---------- */
  {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox/s-x-thread');
    await page.getByRole('button', { name: /Paste the reply text/ }).click();
    await page.getByRole('button', { name: 'Keep pasted text' }).click();
    check(engine, 'paste: empty shows inline error', await page.locator('[role=alert]:has-text("Paste some text first")').count() === 1);
    await page.getByLabel('Paste the text').fill('Critique this design like a senior product designer. List the three biggest problems first.');
    await page.getByRole('button', { name: 'Keep pasted text' }).click();
    check(engine, 'paste: shown verbatim as “You pasted this”', await page.locator('text=You pasted this').count() === 1);
    await shoot(page, engine, 'flow-paste-held');
    await page.getByRole('button', { name: 'Attach to this source' }).click();
    check(engine, 'paste: attached to the source with Undo', /Text attached/.test(await toasts(page).first().innerText()));
    // Stage 3: pasted text is split on this device, as in the capture box, so the reply's prompt becomes a candidate.
    check(engine, 'paste: the toast says what was found on this device', /1 found on this device/.test(await toasts(page).first().innerText()), (await toasts(page).first().innerText()).replace(/\n/g, ' '));
    await page.waitForTimeout(500);
    await go(page, '/inbox/s-x-thread');
    await page.waitForSelector('h2:has-text("found to review")');
    check(engine, 'paste: kept with the source after reload, verbatim, as a candidate to review', await page.locator('[data-card] :text("Critique this design like a senior product designer. List the three biggest problems first.")').count() >= 1
      && /Quoted from what you pasted/.test(await page.locator('main').innerText()));
    // quick capture (C): text is split on this device too; a plain note is kept as a note
    await go(page, '/inbox');
    await page.keyboard.press('c');
    await page.locator('#cap-value').fill('Critique this design like a senior product designer. List the three biggest problems first.');
    await page.keyboard.press(engine === 'webkit' ? 'Meta+Enter' : 'Control+Enter');
    await page.waitForTimeout(400);
    check(engine, 'capture (C): one clear prompt goes straight to the Library', /Kept in Library/.test(await toasts(page).first().innerText()), await toasts(page).first().innerText());
    await page.keyboard.press('c');
    await page.locator('#cap-value').fill('Remember to look at the pricing page on Friday.');
    await page.keyboard.press(engine === 'webkit' ? 'Meta+Enter' : 'Control+Enter');
    await page.waitForTimeout(500);
    await go(page, '/inbox');
    check(engine, 'capture (C): the prompt is in the Library, the note waits in the Inbox, honestly', await page.locator('text=No prompt, steps, [blanks] or code found on this device').count() >= 1
      && await page.evaluate(() => new Promise(res => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => { const db = q.result; const g = db.transaction('state').objectStore('state').get('app'); g.onsuccess = () => { db.close(); res(g.result.artifacts.some(a => a.title.startsWith('Critique this design') && a.history?.[0]?.what === 'Kept when captured')); }; }; })));
    await shoot(page, engine, 'flow-inbox-with-note');
    await go(page, '/settings/danger');
    await page.getByRole('button', { name: 'Remove demo data' }).click();
    await page.waitForTimeout(600);
    await go(page, '/inbox');
    await page.getByRole('link', { name: /Remember to look at the pricing page/ }).dblclick(); // wide screens: click selects, double-click opens
    await page.waitForSelector('h2:has-text("Kept as a note")');
    await shoot(page, engine, 'flow-captured-queued');
    await page.getByRole('button', { name: /Delete source/ }).click();
    await page.waitForURL('**/inbox');
    // the prompt's source is in Done (its prompt went straight to the Library): Done items can't be deleted (24 Oct), so the
    // panel offers no Delete; the test clears it from storage to reach the empty state
    check(engine, 'a Done source offers no Delete in the right panel', await page.locator('aside[aria-label="Preview"]').getByRole('button', { name: 'Delete source' }).count() === 0);
    await page.waitForTimeout(450);
    await page.evaluate(async () => {
      const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
      const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
      await new Promise(r => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put({ ...st, sources: [], _at: Date.now() + 1e7 }, 'app'); tx.oncomplete = r; });
    });
    await go(page, '/inbox');
    await page.waitForSelector('h2:has-text("Inbox Zero")');
    check(engine, 'empty state teaches capture', await page.getByRole('region', { name: 'Inbox Zero' }).getByRole('button', { name: /^Capture/ }).count() === 1);
    await shoot(page, engine, 'light-1440-inbox-empty');
    await axe(page, engine, 'inbox empty');
    await page.getByRole('region', { name: 'Inbox Zero' }).getByRole('button', { name: /^Capture/ }).click();
    check(engine, 'empty state opens capture', await page.locator('dialog[open]').count() === 1);
    await ctx.close();
  }


  }

  /* ---------- flow 9 (build-out Stage 2): the Library's capture box captures, on this device only ---------- */
  if (only !== 'deleted') {
    const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') results.errors.push({ engine, url: page.url(), text: m.text().slice(0, 240) }); });
    page.on('pageerror', e => results.errors.push({ engine, url: page.url(), text: 'pageerror: ' + e.message.slice(0, 240) }));
    // Nothing may leave this machine: every request that isn't to the local app is recorded and blocked.
    const outside = [];
    await page.route(u => !u.href.startsWith(BASE), r => { outside.push(r.request().url()); return r.abort(); });
    const readState = async () => {
      await page.waitForTimeout(450); // the store saves on a 250 ms debounce
      return page.evaluate(async () => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('capsa-web', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const st = await new Promise(res => { const r = db.transaction('state').objectStore('state').get('app'); r.onsuccess = () => res(r.result); });
        db.close();
        return st;
      });
    };
    const capForm = page.locator('form[aria-label="Capture"]');
    const capture = async (text, mode = 'Link') => {
      await capForm.getByRole('button', { name: mode, exact: true }).click();
      await page.fill('#lib-cap', text);
      await page.locator('#lib-cap').press('Enter');
    };
    const inboxN = async () => Number((await page.locator('nav[aria-label="Main"] a[href="/inbox"]').innerText()).replace(/\D/g, '') || 0);

    await go(page, '/library');
    const inbox0 = await inboxN();
    let withCandidates = 0;
    for (const f of FIXTURES) {
      await capture(f.input, f.mode === 'prompt' ? 'Prompt' : 'Link');
      const src = (await readState()).sources[0];
      const cands = src.candidates ?? [];
      const stored = src.segments?.[0]?.text ?? '';
      const got = cands.map(c => c.type), want = f.expect.map(e => e.type);
      const exactOk = f.expect.every((e, i) => {
        const c = cands[i];
        return c && stored.includes(c.exact) && c.evidence?.method === 'text_span' && c.evidence.quote === c.exact
          && (e.exact === undefined || c.exact === e.exact) && (!e.exactIsWhole || c.exact === stored);
      });
      const onePrompt = want.length === 1 && want[0] === 'prompt'; // one clear prompt skips the Inbox
      if (want.length && !onePrompt) withCandidates++;
      check(engine, `capture ${f.id}: ${want.join(' + ') || 'nothing (kept as a note)'}`,
        JSON.stringify(got) === JSON.stringify(want) && exactOk && src.status === (onePrompt ? 'reviewed' : want.length ? 'review' : 'nothing') && src.extraction === 'on_device',
        `${got.join(',') || '-'} · ${src.status}`);
    }
    // 22 Oct: with many cards, every column's last card scrolls fully into view, clear of the floating capture box
    await go(page, '/inbox');
    const hidden = await page.evaluate(() => {
      const cap = document.querySelector('form[aria-label="Capture"]')?.getBoundingClientRect();
      return [...document.querySelectorAll('[data-inbox-list] > section')].map(sec => {
        const list = sec.querySelector('ul'); const last = list?.lastElementChild; if (!last) return null;
        list.scrollTop = list.scrollHeight;
        const r = last.getBoundingClientRect(), box = list.getBoundingClientRect();
        const ok = r.bottom <= box.bottom + 0.5 && (!cap || r.bottom <= cap.top || r.right <= cap.left || r.left >= cap.right);
        return ok ? null : `${sec.dataset.col}: last card bottom ${Math.round(r.bottom)}, list ${Math.round(box.bottom)}, capture top ${Math.round(cap?.top ?? 0)}`;
      }).filter(Boolean);
    });
    const most = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-inbox-list] > section ul')].map(u => u.children.length)));
    check(engine, 'board: with many cards the last card in every column scrolls into view, clear of the capture box', hidden.length === 0 && most >= 10, hidden.join('; ') || `${most} cards in the longest column`);
    check(engine, 'capture: Inbox count goes up by the pastes with candidates', (await inboxN()) === inbox0 + withCandidates, `${inbox0} → ${await inboxN()} (+${withCandidates})`);

    // the whole loop: destination → paste → Inbox review (exact words as evidence) → Library and the collection
    const st0 = await readState();
    const agentId = st0.collections.find(c => c.name === 'Agent setup').id;
    const inAgent = st => st.artifacts.filter(a => (a.collections ?? []).includes(agentId)).length;
    const agent0 = inAgent(st0), lib0 = st0.artifacts.length;
    await capForm.getByRole('button', { name: /Kept items go to/ }).click();
    await page.waitForTimeout(150);
    await shoot(page, engine, 'stage2-capture-destination');
    await page.getByRole('menuitemradio', { name: 'Agent setup' }).click();
    check(engine, 'capture: destination shows “to Agent setup”', /to\s*Agent setup/.test(await capForm.innerText()));
    await capture(FIXTURES.find(f => f.id === 'mixed-document-headings').input);
    const t = page.locator('.toasts .toast').filter({ hasText: '3 found' });
    check(engine, 'capture: toast says what was found and where it goes', /Kept in Inbox · 3 found · for “Agent setup”/.test(await t.innerText()), (await t.innerText()).replace(/\s+/g, ' '));
    await shoot(page, engine, 'stage2-capture-toast');
    await t.getByRole('button', { name: 'Open' }).click(); // the toast's action is Open (it was Review)
    await page.waitForSelector('h2:has-text("3 found to review")');
    await page.waitForTimeout(300);
    check(engine, 'review: says it was found on this device, not AI', await page.locator('main header').getByText('Found on this device, not AI', { exact: true }).isVisible()); // retargeted 22 Oct: the teaching paragraph became this header badge
    check(engine, 'review: evidence is the exact words, from what you pasted', /Quoted from what you pasted, line 4/.test(await page.getByRole('region', { name: 'Where it came from' }).innerText()));
    check(engine, 'review: each candidate is highlighted in what you pasted', (await page.locator('mark[data-evid]').count()) === 3);
    await shoot(page, engine, 'stage2-review-pasted');
    await axe(page, engine, 'stage2 review of pasted text');
    await page.getByRole('button', { name: /Save 3 to Library/ }).click();
    await page.waitForTimeout(300);
    const st1 = await readState();
    check(engine, 'review → Library: 3 new artifacts', st1.artifacts.length === lib0 + 3, `${lib0} → ${st1.artifacts.length}`);
    check(engine, 'review → Library: they went into the chosen collection', inAgent(st1) === agent0 + 3, `${agent0} → ${inAgent(st1)}`);
    const kept = st1.artifacts.filter(a => !st0.artifacts.some(b => b.id === a.id));
    check(engine, 'review → Library: exact words kept verbatim, evidence method first', kept.every(a => a.exact && a.evidence?.method === 'text_span' && a.evidence.quote === a.exact));
    await go(page, '/library');
    check(engine, 'Library: kept items show, labelled with their evidence', (await page.locator('ul[aria-label="Items"] > li').filter({ hasText: 'Code review prompt' }).count()) === 1);

    // links: saved with a title and the site, nothing fetched
    const links = [
      ['https://github.com/acme/skills-kit', 'github', 'acme/skills-kit'],
      ['https://www.youtube.com/watch?v=abc123', 'video', 'YouTube video'],
      ['https://x.com/someone/status/123456', 'x', 'Post by @someone'],
      ['https://example.com/blog/how-i-review-pull-requests', 'article', 'How i review pull requests'],
    ];
    const ids = {};
    for (const [url, kind, title] of links) {
      await capture(url);
      const src = (await readState()).sources[0];
      ids[kind] = src.id;
      check(engine, `link ${kind}: saved to the Inbox as “${title}” · ${src.displayUrl}`, src.kind === kind && src.title === title && src.status === 'queued' && src.url === url, `${src.kind} · ${src.title} · ${src.status}`);
      if (kind === 'github') {
        const gt = page.locator('.toasts .toast').filter({ hasText: 'acme/skills-kit' });
        check(engine, 'links: a GitHub link’s toast says reading is off', /Reading GitHub links is off/.test(await gt.innerText()));
      }
    }
    await go(page, '/inbox');
    check(engine, 'Inbox: GitHub row says reading asks first', await page.getByText('Saved · reading GitHub links asks first (Settings)').isVisible());
    await shoot(page, engine, 'stage2-inbox');
    await go(page, `/inbox/${ids.video}`);
    check(engine, 'video link keeps the honest waiting state', await page.getByRole('heading', { name: /Waiting for the extraction service/ }).isVisible());
    await go(page, `/inbox/${ids.x}`);
    check(engine, 'X post keeps the honest waiting state', await page.getByRole('heading', { name: /Waiting for the extraction service/ }).isVisible());
    await go(page, `/inbox/${ids.github}`);
    check(engine, 'GitHub link with reading off: says so, nothing sent', await page.getByRole('heading', { name: 'Saved. Reading GitHub links is off' }).isVisible() && (await page.getByRole('button', { name: 'Read from GitHub' }).count()) === 0);
    await shoot(page, engine, 'stage2-github-off');
    await axe(page, engine, 'stage2 github off');
    check(engine, 'no request left this machine while reading is off', outside.length === 0, outside.join(' ') || 'none');

    // reading switched on (GitHub's API is stubbed by this test, so nothing leaves the machine)
    await go(page, '/settings/capture');
    const sw = page.getByRole('switch', { name: 'Reading public GitHub links (asks first)' });
    check(engine, 'settings: GitHub reading is off by default', (await sw.getAttribute('aria-checked')) === 'false');
    await sw.click();
    check(engine, 'settings: switch turns on', (await sw.getAttribute('aria-checked')) === 'true');
    await shoot(page, engine, 'stage2-settings-reading');
    await axe(page, engine, 'stage2 settings');
    const stubbed = [];
    const SKILL = '---\nname: tidy-commits\ndescription: Squash fixup commits and write a clear message.\n---\nSquash fixups, then write a one-line summary and a short body.\n';
    const README = '# skills-kit\n\nA small kit of agent skills.\n\n## Install the MCP server\n\n```json\n{ "mcpServers": { "skills-kit": { "command": "npx", "args": ["-y", "skills-kit-mcp"] } } }\n```\n\n## Quick start\n\n```bash\nnpx skills-kit init\n```\n';
    await page.route('https://api.github.com/**', r => {
      const u = r.request().url();
      stubbed.push(u);
      if (u.includes('/repos/acme/private-thing/')) return r.fulfill({ status: 403, body: '{"message":"API rate limit exceeded"}', headers: { 'access-control-allow-origin': '*' } });
      if (u.endsWith('/contents/SKILL.md')) return r.fulfill({ status: 200, body: SKILL, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' } });
      if (u.endsWith('/readme')) return r.fulfill({ status: 200, body: README, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' } });
      return r.fulfill({ status: 404, body: '{}', headers: { 'access-control-allow-origin': '*' } });
    });
    await go(page, `/inbox/${ids.github}`);
    check(engine, 'GitHub link with reading on: asks first', await page.getByRole('heading', { name: 'Ready to read from GitHub' }).isVisible() && stubbed.length === 0);
    await page.getByRole('button', { name: 'Read from GitHub' }).click();
    await page.waitForSelector('h2:has-text("3 found to review")', { timeout: 10000 });
    const gh = (await readState()).sources.find(x => x.id === ids.github);
    check(engine, 'GitHub read: SKILL.md and README become skill + MCP server + command', JSON.stringify(gh.candidates.map(c => c.type)) === '["skill","mcp_server","command"]', gh.candidates.map(c => `${c.type}:${c.title}`).join(', '));
    check(engine, 'GitHub read: evidence names the file and lines', gh.candidates.every(c => /^(SKILL\.md|README\.md), lines? \d/.test(c.evidence.locator)), gh.candidates.map(c => c.evidence.locator).join(' | '));
    check(engine, 'GitHub read: exactly two requests, both to GitHub’s public API', stubbed.length === 2 && stubbed.every(u => u.startsWith('https://api.github.com/repos/acme/skills-kit/')), stubbed.join(' '));
    await shoot(page, engine, 'stage2-review-github');
    await axe(page, engine, 'stage2 review github');
    await go(page, '/library');
    await capture('https://github.com/acme/private-thing');
    const priv = (await readState()).sources[0];
    await go(page, `/inbox/${priv.id}`);
    await page.getByRole('button', { name: 'Read from GitHub' }).click();
    await page.waitForSelector('h2:has-text("Couldn’t read this")', { timeout: 10000 });
    // The browser logs the stubbed 403 itself ("Failed to load resource… 403"); that line is expected here, nothing else.
    const logged = results.errors.filter(e => e.engine === engine && /status of 403/.test(e.text));
    results.errors = results.errors.filter(e => !(e.engine === engine && /status of 403/.test(e.text)));
    check(engine, 'GitHub read: the only console line for a rate limit is the browser’s own 403 log', logged.length <= 1, `${logged.length}`);
    check(engine, 'GitHub read: a rate limit is explained, the link stays saved', /60 an hour/.test(await page.locator('main').innerText()));
    await go(page, '/settings/capture');
    await page.getByRole('switch', { name: 'Reading public GitHub links (asks first)' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    check(engine, 'settings: switching off persists', (await page.getByRole('switch', { name: 'Reading public GitHub links (asks first)' }).getAttribute('aria-checked')) === 'false');
    check(engine, 'no unstubbed request left this machine in the whole capture flow', outside.length === 0, outside.join(' ') || 'none');
    await ctx.close();
  }

  /* ---------- flow 10 (build-out Stage 3): the Inbox in the new shell, the selected source reviewed in the right panel ---------- */
  if (only !== 'capture' && only !== 'deleted') {
    const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') results.errors.push({ engine, url: page.url(), text: m.text().slice(0, 240) }); });
    page.on('pageerror', e => results.errors.push({ engine, url: page.url(), text: 'pageerror: ' + e.message.slice(0, 240) }));
    await go(page, '/inbox');
    const panel = page.locator('aside[aria-label="Preview"]');
    check(engine, 'stage3: serif page title and the capture box on the Inbox', await page.locator('main h1').innerText() === 'Inbox' && await page.locator('form[aria-label="Capture"]').count() === 1);
    check(engine, 'stage3: the right panel shows the first source with its candidates', /5 found/i.test(await panel.innerText()) && await panel.getByRole('checkbox').count() === 5);
    check(engine, 'stage3: AI-located candidates start unticked in the panel too', (await panel.getByRole('checkbox', { checked: true }).count()) === 3);
    // retargeted 22 Oct: Done is now a visible column of the pipeline board (it was a folded group)
    check(engine, 'stage3: Done is its own column at the end of the board', await page.locator('[data-inbox-list] > section').last().getAttribute('data-col') === 'done');
    await panel.getByRole('button', { name: /^Next/ }).click();
    check(engine, 'stage3: Next steps the evidence card (2 of 5)', /Where it came from · 2 of 5/.test((await panel.innerText()).replace(/\s+/g, ' ')));
    check(engine, 'stage3: the exact words are highlighted in the stored text', await panel.locator('pre mark').count() === 1);
    await shoot(page, engine, 'stage3-inbox-1728');
    await axe(page, engine, 'stage3 inbox with panel');
    const lib0 = await libCount(page);
    await panel.getByRole('button', { name: 'Save 3 to Library' }).click();
    await page.waitForTimeout(300);
    check(engine, 'stage3: Save in the panel files the ticked candidates', await libCount(page) === lib0 + 3, `${lib0} → ${await libCount(page)}`);
    await toasts(page).filter({ hasText: 'Saved 3 to Library' }).getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(200);
    check(engine, 'stage3: Undo puts them back', await libCount(page) === lib0);
    const title = await panel.locator('h2').innerText();
    await panel.getByRole('button', { name: 'Delete source' }).click();
    await page.waitForTimeout(200);
    check(engine, 'stage3: delete from the panel removes the source', await page.getByRole('link', { name: new RegExp(title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).count() === 0);
    await toasts(page).filter({ hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(200);
    check(engine, 'stage3: Undo restores the deleted source', await page.getByRole('link', { name: new RegExp(title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).count() === 1);
    await go(page, '/inbox/s-github');
    check(engine, 'stage3: the review puts the evidence in the right panel', await page.locator('aside[aria-label="Source and where it came from"]').count() === 1 && /Where it came from · 1 of 3/.test((await page.locator('aside[aria-label="Source and where it came from"]').innerText()).replace(/\s+/g, ' ')));
    check(engine, 'stage3: the review has the serif source title', (await page.locator('main h1').innerText()).trim() === 'demo-org/browser-qa-skill');
    await shoot(page, engine, 'stage3-review-1728');
    await axe(page, engine, 'stage3 review docked');
    await ctx.close();
  }

  /* ---------- flow 11 (24 Oct): the top card's ring, deleting by column, the bin, the Deleted page ---------- */
  if (only !== 'capture') {
    const readState = async page => {
      await page.waitForTimeout(450); // the store saves on a 250 ms debounce
      return page.evaluate(async () => {
        const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
        const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
        db.close(); return st;
      });
    };
    /** Every column's top card: its ring (focus outline + offset, or the selected / hover box-shadow) must sit inside its
     * list's clip box (the scroll box clips at its padding edge). This is the "cutout" Elvis saw on 24 Oct. */
    const ringRoom = page => page.evaluate(() => [...document.querySelectorAll('[data-inbox-list] > section')].flatMap(sec => {
      const ul = sec.querySelector('ul'); const a = ul.querySelector('li[data-id] > a'); if (!a) return [];
      const u = ul.getBoundingClientRect(), r = a.getBoundingClientRect(), cs = getComputedStyle(a);
      const outline = cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset) : 0;
      // box-shadow: "<colour> x y blur spread" per layer; how far each reaches above the box
      const shadow = Math.max(0, ...cs.boxShadow.split(/,(?![^(]*\))/).filter(x => !/inset/.test(x)).map(x => {
        const n = x.replace(/rgba?\([^)]*\)|#[0-9a-f]+/gi, '').trim().split(/\s+/).map(parseFloat); const [, y = 0, blur = 0, spread = 0] = n;
        return blur + spread - y;
      }));
      const top = r.top - Math.max(outline, shadow), clip = u.top + ul.clientTop;
      return [{ col: sec.dataset.col, cur: a.getAttribute('aria-current') === 'true', fv: a.matches(':focus-visible'), outline, shadow: +shadow.toFixed(2), room: +(top - clip).toFixed(2) }];
    }));
    const focusTop = (page, k) => page.evaluate(k => document.querySelector(`section[data-col="${k}"] li[data-id] > a`)?.focus(), k);
    const binDrag = async (page, card, { release = true } = {}) => {
      await card.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
      const a = await card.boundingBox(); const sx = a.x + a.width / 2, sy = a.y + Math.min(24, a.height / 2);
      await page.mouse.move(sx, sy); await page.mouse.down();
      await page.mouse.move(sx + 6, sy + 6); // past the 4 px slop: the card lifts and the bin rises
      await page.waitForSelector('[data-bin]', { timeout: 3000 });
      await page.waitForTimeout(400); // the bin's rise (reduced motion: its fade)
      const b = await page.locator('[data-bin] > span').first().boundingBox();
      const ex = b.x + b.width / 2, ey = b.y + b.height / 2;
      for (let i = 1; i <= 12; i++) await page.mouse.move(sx + (ex - sx) * i / 12, sy + (ey - sy) * i / 12);
      await page.waitForTimeout(150);
      if (release) { await page.mouse.up(); await page.waitForTimeout(600); }
    };
    const binState = page => page.evaluate(() => { const b = document.querySelector('[data-bin]'); if (!b) return null; const w = b.querySelector('span').getBoundingClientRect();
      return { over: b.hasAttribute('data-over'), drop: b.dataset.drop, label: b.innerText.trim(), cx: w.left + w.width / 2, bottom: b.getBoundingClientRect().bottom, vw: innerWidth, vh: innerHeight, anim: getComputedStyle(b).animationName }; });

    /* screenshots, light and dark at 1440 and 390: the bin during a drag, the Processing confirm, Deleted empty and with items */
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const { ctx, page } = await newPage(browser, engine, { width, theme });
      const tag = `${theme}-${width}`;
      await go(page, '/inbox');
      // the cutout: every column's top card, focused from the keyboard, keeps its whole ring
      await page.keyboard.press('Tab');
      const rings = [];
      for (const k of ['review', 'progress', 'nothing', 'done']) { await focusTop(page, k); rings.push(...(await ringRoom(page)).filter(g => g.col === k)); }
      check(engine, `${tag} the top card's ring is whole in every column (focus ring inside the list's clip box)`, rings.length === 4 && rings.every(g => g.fv && g.outline > 0 && g.room >= -0.01),
        rings.map(g => `${g.col} ${g.fv ? 'focus' : 'no-focus'} ring ${g.outline}px room ${g.room}`).join(' · '));
      if (width === 1440) {
        await page.locator('body').click({ position: { x: 450, y: 30 } }); // the selected card (no focus now) shows its 1 px ring
        await page.waitForTimeout(300); // the ring's box-shadow transition (200 ms)
        const selRing = (await ringRoom(page)).find(g => g.cur);
        check(engine, `${tag} the selected top card's ring is whole`, selRing && selRing.shadow >= 1 && selRing.room >= -0.01, JSON.stringify(selRing));
      }
      // the bin during a drag
      await binDrag(page, page.locator('section[data-col="review"] a[href="/inbox/s-article"]'), { release: false });
      const bs = await binState(page);
      check(engine, `${tag} dragging: the bin is at the bottom centre and lights up under the card`, bs && bs.over && bs.drop === 'ok' && Math.abs(bs.cx - bs.vw / 2) <= 2 && bs.vh - bs.bottom >= 12 && bs.vh - bs.bottom <= 40, JSON.stringify(bs));
      await shoot(page, engine, `${tag}-bin-over`);
      await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(500);
      check(engine, `${tag} Esc over the bin deletes nothing and the bin goes`, await page.locator('a[href="/inbox/s-article"]').count() === 1 && await page.locator('[data-bin]').count() === 0);
      // a Done card over the bin: shut, faded, with the reason
      if (width === 1440) {
        await binDrag(page, page.locator('section[data-col="done"] a[href="/inbox/s-x-prompt"]'), { release: false });
        const no = await binState(page);
        check(engine, `${tag} a Done card over the bin: the bin won't take it, and says so`, no && no.over && no.drop === 'no' && no.label === 'Done items can’t be deleted', JSON.stringify(no));
        await shoot(page, engine, `${tag}-bin-refuses-done`);
        await page.mouse.up(); await page.waitForTimeout(600);
        check(engine, `${tag} the Done card springs home and stays`, await page.locator('section[data-col="done"] a[href="/inbox/s-x-prompt"]').count() === 1 && /Done items can’t be deleted/.test(await toasts(page).first().innerText()));
      }
      // the Processing confirm, from the card's ⋯ menu
      await page.getByRole('button', { name: /^More for “/ }).and(page.locator('section[data-col="progress"] button')).first().click();
      await page.getByRole('menuitem', { name: 'Delete…' }).click();
      await page.waitForSelector('dialog[open]');
      await page.waitForTimeout(250);
      await shoot(page, engine, `${tag}-processing-confirm`);
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      // Deleted, with items: one from the Inbox (Ready, by the ⋯ menu), one from the Library (its item page)
      await page.getByRole('button', { name: 'More for “demo-org/browser-qa-skill”' }).click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await go(page, '/library/a-style');
      await page.getByRole('button', { name: 'Delete Style sentence template' }).click();
      await page.waitForURL(/\/library$/);
      await go(page, '/deleted');
      await page.waitForTimeout(200);
      await shoot(page, engine, `${tag}-deleted`);
      if (engine === 'chromium' || width === 1440) await axe(page, engine, `${tag} deleted with items`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(engine, `${tag} Deleted: no horizontal scroll`, overflow <= 0, `${overflow}px`);
      await page.getByRole('button', { name: 'Empty Deleted' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Empty Deleted' }).click();
      await page.waitForSelector('h2:has-text("Nothing in Deleted")');
      await shoot(page, engine, `${tag}-deleted-empty`);
      if (engine === 'chromium' || width === 1440) await axe(page, engine, `${tag} deleted empty`);
      await ctx.close();
    }

    /* the rules, at 1728: Ready and Nothing delete, Processing asks, Done refuses; Undo; the bin absorbs; Deleted restores */
    for (const motion of [false, true]) {
      const { ctx, page } = await newPage(browser, engine, { width: 1728, motion });
      const col = k => page.locator(`section[data-col="${k}"]`);
      await go(page, '/inbox');
      if (!motion) {
        check(engine, 'Inbox: Deleted is reachable from the header', await page.locator('main header a[href="/deleted"]').count() === 1);
        // Ready to review: ⋯ → Delete, gone at once, Undo brings it back to the same place
        const order0 = (await readState(page)).sources.map(x => x.id);
        // the sample data has its own deleted entries (design review, 25 Oct); they stay put through these steps
        const trash0 = (await readState(page)).trash.length;
        await page.getByRole('button', { name: 'More for “demo-org/browser-qa-skill”' }).click();
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
        await page.waitForTimeout(200);
        const st1 = await readState(page);
        const e1 = st1.trash.find(t => t.item.id === 's-github');
        check(engine, 'Ready to review: ⋯ → Delete moves it to Deleted, whole, with where it was', await col('review').locator('a[href="/inbox/s-github"]').count() === 0
          && e1?.kind === 'source' && e1.from.column === 'review' && e1.from.index === order0.indexOf('s-github') && e1.item.candidates?.length === 3, JSON.stringify(e1?.from));
        await toasts(page).filter({ hasText: 'Deleted “demo-org/browser-qa-skill”' }).getByRole('button', { name: 'Undo' }).click();
        await page.waitForTimeout(200);
        const st2 = await readState(page);
        check(engine, 'Undo: back in Ready to review, in the same place, and out of Deleted', await col('review').locator('a[href="/inbox/s-github"]').count() === 1
          && JSON.stringify(st2.sources.map(x => x.id)) === JSON.stringify(order0) && st2.trash.length === trash0 && !st2.trash.some(t => t.item.id === 's-github'));
        // Nothing to unpack: Delete on the focused card; focus stays on the board
        await page.keyboard.press('Tab');
        await focusTop(page, 'nothing');
        const nid = await col('nothing').locator('li[data-id]').first().getAttribute('data-id');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(250);
        check(engine, 'Nothing to unpack: Delete on a focused card deletes it, and focus moves to the next card', await col('nothing').locator(`li[data-id="${nid}"]`).count() === 0
          && await page.evaluate(() => !!document.activeElement?.closest('section[data-col]')) && /moved to Deleted/.test(await page.locator('#inbox-announce').innerText()));
        // Done: no Delete in the ⋯ menu, Backspace refused with the reason, no Delete in the right panel
        const done = col('done').locator('a[href="/inbox/s-x-prompt"]');
        await done.click();
        check(engine, 'Done: the right panel offers no Delete', await page.locator('aside[aria-label="Preview"]').getByRole('button', { name: 'Delete source' }).count() === 0);
        await done.focus(); await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
        check(engine, 'Done: Backspace is refused with the reason, and the card stays', await done.count() === 1 && /Done items can’t be deleted/.test(await toasts(page).first().innerText()));
        await col('done').locator('li[data-id="s-x-prompt"]').getByRole('button', { name: /^More for/ }).click();
        check(engine, 'Done: the ⋯ menu offers no Delete', await page.getByRole('menu').getByRole('menuitem', { name: /^Delete/ }).count() === 0);
        await page.keyboard.press('Escape');
        // Processing: asks first; Cancel keeps it; Stop and delete deletes it
        const q = col('progress').locator('a[href="/inbox/s-queued"]');
        await q.focus(); await page.keyboard.press('Delete');
        await page.waitForSelector('dialog[open]');
        const dlg = page.getByRole('dialog');
        const btns = await dlg.locator('.dlg-foot button').allInnerTexts();
        check(engine, 'Processing: Delete asks first, with one primary “Stop and delete” and Cancel', /Stop and delete/.test(await dlg.innerText()) && /still processing/.test(await dlg.innerText())
          && btns.join('|') === 'Cancel|Stop and delete' && await dlg.locator('.dlg-foot .btn.primary').count() === 1
          && await page.evaluate(() => document.activeElement?.textContent === 'Stop and delete'), btns.join('|'));
        await dlg.getByRole('button', { name: 'Cancel' }).click();
        check(engine, 'Processing: Cancel keeps it', await q.count() === 1 && await page.locator('dialog[open]').count() === 0);
        await page.getByRole('button', { name: /^More for “/ }).and(col('progress').getByRole('button')).first().click();
        await page.getByRole('menuitem', { name: 'Delete…' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Stop and delete' }).click();
        await page.waitForTimeout(200);
        const st3 = await readState(page);
        check(engine, 'Processing: Stop and delete takes it out of the queue, into Deleted', await q.count() === 0 && st3.trash.some(t => t.item.id === 's-queued' && t.from.column === 'progress' && t.item.status === 'queued'));
        // a Processing card dropped on the bin asks too, and springs home meanwhile
        await toasts(page).filter({ hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).click();
        await page.waitForTimeout(200);
        await binDrag(page, q);
        check(engine, 'bin: a Processing card asks first and springs home', await page.locator('dialog[open]').count() === 1 && await q.count() === 1);
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      }
      // the bin with real pointer movement: it rises (fades with reduced motion), lights up, and absorbs the card
      const art = col('review').locator('a[href="/inbox/s-article"]');
      await binDrag(page, art, { release: false });
      const bs = await binState(page);
      check(engine, `bin: ${motion ? 'rises' : 'fades in (reduced motion)'} and lights up under the card`, bs?.over && bs.drop === 'ok' && new RegExp(`(^|_)${motion ? 'bin-in' : 'bin-fade'}$`).test(bs.anim), JSON.stringify(bs));
      // where the card came from: a dashed light-grey frame of the same size with a plus, kept while the card is away (Elvis, 24 Oct)
      const slot = await page.evaluate(() => { const li = document.querySelector('li[data-id="s-article"]'); const b = getComputedStyle(li, '::before'), p = getComputedStyle(li, '::after');
        return { lift: li.dataset.lift, h: li.getBoundingClientRect().height, style: b.borderTopStyle, plus: p.content !== 'none' && p.backgroundImage.includes('gradient') }; });
      check(engine, 'drag: the card\'s own slot stays as a dashed drop-back frame with a plus', ['held', 'gone'].includes(slot.lift) && slot.h > 40 && slot.style === 'dashed' && slot.plus, JSON.stringify(slot));
      // the bin is the trash icon with a lid: open over the bin (shut with reduced motion)
      const lid = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-bin] svg g')).rotate) || 0);
      check(engine, `bin: ${motion ? 'its lid is open while the card is over it' : 'its lid stays still (reduced motion)'}`, motion ? lid <= -20 : lid === 0, `lid ${lid}deg`);
      await page.evaluate(() => { window.__g = []; const loop = () => { const g = document.querySelector('[data-drag-ghost]'); if (!g) { window.__gDone = true; return; } const m = new DOMMatrix(getComputedStyle(g).transform); window.__g.push(+Math.hypot(m.a, m.b).toFixed(3)); requestAnimationFrame(loop); }; window.__gDone = false; requestAnimationFrame(loop); });
      await page.mouse.up();
      await page.waitForFunction(() => window.__gDone, null, { timeout: 3000 });
      const scales = await page.evaluate(() => window.__g);
      if (motion) {
        const shutting = await page.evaluate(() => { const g = document.querySelector('[data-bin] svg g'); return g ? g.getAnimations().map(x => x.animationName) : []; });
        check(engine, 'bin: after the drop its lid drops shut (lid-shut animation)', shutting.some(n => /lid-shut$/.test(n)), JSON.stringify(shutting));
      }
      await page.waitForTimeout(800); // the lid shuts and the bin fades (640 ms) before it's removed
      const st4 = await readState(page);
      check(engine, `bin: the drop deletes it (into Deleted) and ${motion ? 'the card is absorbed (shrinks into the bin)' : 'the card fades where it is, with no tween (reduced motion)'}`, await art.count() === 0 && st4.trash.some(t => t.item.id === 's-article')
        && await page.locator('[data-drag-ghost]').count() === 0 && await page.locator('[data-bin]').count() === 0
        && (motion ? Math.min(...scales) < 0.2 && scales.length >= 5 : scales.every(x => Math.abs(x - scales[0]) < 0.001)), `${scales.length} frames, scales ${Math.max(...scales)} → ${Math.min(...scales)}`);
      check(engine, 'bin: the drop opened nothing', new URL(page.url()).pathname === '/inbox');
      if (!motion) {
        // Deleted: what it was, where, when; Restore puts it back exactly; Delete forever; survives a reload
        const nothingId = (await readState(page)).trash.find(t => t.from.column === 'nothing').item.id;
        const before = (await readState(page)).trash.find(t => t.item.id === nothingId);
        await go(page, '/deleted');
        // the rows deleted here (the sample data's own deleted entries are listed too, grouped by when)
        const rows = page.locator('main li[data-key]:not([data-key*="-demo-del-"])');
        const artRow = (await page.locator('li[data-key="source:s-article"]').innerText()).replace(/\s+/g, ' ');
        check(engine, 'Deleted: lists both under Today, newest first, with what it was, where (with its glyph), and when', await rows.count() === 2
          && /^Today\s*\d+$/.test((await page.locator('main h2').first().innerText()).trim()) && await page.locator('main li[data-key]').first().getAttribute('data-key') === 'source:s-article'
          && /Article\s*from\s*Inbox › Ready to review\s*Deleted just now/.test(artRow) && await page.locator('li[data-key="source:s-article"] [data-place="inbox"] svg').count() === 1, artRow);
        await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
        check(engine, 'Deleted: survives a reload', await rows.count() === 2);
        await page.locator(`li[data-key="source:${nothingId}"]`).getByRole('button', { name: /^Restore/ }).click();
        await page.waitForTimeout(200);
        const st5 = await readState(page);
        const back = st5.sources.find(x => x.id === nothingId);
        check(engine, 'Restore: back exactly as it was, in the same place (Nothing to unpack)', JSON.stringify(back) === JSON.stringify(before.item) && st5.sources.findIndex(x => x.id === nothingId) === before.from.index
          && /Restored to Inbox/.test(await toasts(page).first().innerText()) && await page.evaluate(() => document.activeElement?.dataset.act === 'restore'));
        const gone = await rows.first().getAttribute('data-key');
        await rows.first().getByRole('button', { name: /^Delete forever/ }).click();
        await page.waitForTimeout(200);
        check(engine, 'Delete forever: gone from Deleted, with an Undo', await page.locator(`li[data-key="${gone}"]`).count() === 0 && /forever/.test(await toasts(page).first().innerText()));
        await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
        const st6 = await readState(page);
        check(engine, 'Delete forever: still gone after a reload, and not back in the Inbox', !st6.trash.some(t => `${t.kind}:${t.item.id}` === gone) && !st6.sources.some(x => `source:${x.id}` === gone) && !st6.trash.some(t => !t.item.demo));
        await go(page, '/inbox');
        check(engine, 'Restore: the card is in its column on the board', await col('nothing').locator(`li[data-id="${nothingId}"]`).count() === 1);
        // older libraries and backups have no Deleted: they load, and deleting still works
        await page.evaluate(async () => {
          const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
          const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
          const { trash: _t, ...old } = st;
          await new Promise(r => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put({ ...old, _at: Date.now() + 1e7 }, 'app'); tx.oncomplete = r; });
        });
        await go(page, '/deleted');
        check(engine, 'a library saved before Deleted existed loads, with Deleted empty', await page.getByRole('heading', { name: 'Nothing in Deleted' }).count() === 1);
        await go(page, '/inbox');
        await page.getByRole('button', { name: 'More for “demo-org/browser-qa-skill”' }).click();
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
        check(engine, '…and deleting still works there', (await readState(page)).trash.length === 1);
      }
      await ctx.close();
    }
  }
  await browser.close();
}

// Errors from areas other than Inbox/Review (e.g. another builder's in-progress route) are reported separately.
const mine = results.errors.filter(e => !/boards|library\/|collections|projects/i.test(e.text));
const pass = results.checks.filter(c => c.ok).length, fail = results.checks.length - pass;
if (results.outsideMain) console.log('axe outside #main (shared shell):', results.outsideMain.join(' | '));
console.log(`\n${pass}/${results.checks.length} checks passed, ${fail} failed · console errors on my routes: ${mine.length} (other: ${results.errors.length - mine.length}) · screenshots: ${results.shots.length}`);
if (mine.length) console.log(JSON.stringify([...new Set(mine.map(e => e.text))].slice(0, 10), null, 1));
fs.writeFileSync(OUT + `results-${engines.join('-')}.json`, JSON.stringify(results, null, 1));
process.exit(fail ? 1 : 0); // a failed check fails the run (CI reads the exit code)
