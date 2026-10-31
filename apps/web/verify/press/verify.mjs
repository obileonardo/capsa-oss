// Pressed states and the phone item sheet (issue #80). Checks:
// - the lab (/lab/components): every control family's Pressed cell differs from its Default cell (scale, fill, shadow,
//   border, colour or a pseudo-element), in Classic and Paper, light and dark; with reduced motion a press keeps its
//   tint and drops its scale; focus-visible stays a separate ring (a pressed button has no outline of its own).
// - phones (390, touch, Chromium and WebKit): each Library card shows one control, More, 44px or bigger, clear of the
//   preview, title and meta; Copy and Bookmark are gone from the card. More opens a real modal dialog (aria-modal,
//   labelled by the item's title) with the desktop menu's actions; Bookmark, a collection, New collection, a project
//   and Copy all work from it; focus starts in it, stays in it and returns to More; arrow keys move through it; the page
//   doesn't scroll behind it; Escape, the scrim, the close button and a swipe down all close it; reduced motion drops
//   the slide. No sideways scroll; axe has no serious or critical issues with the sheet open, in all four looks.
// - desktop (1440): More still opens the popover, with the same rows as before; no dialog.
// Screenshots (a pressed contact sheet per look, the phone Library and sheet per look, the desktop menu) go to
// CAPSA_SHOTS (default ./shots).
// Usage (dev server running): CAPSA_BASE=http://127.0.0.1:3390 node verify/press/verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import { features } from '../_features.mjs'; // a release snapshot can lack Paper (with Profile) and never has the lab
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.CAPSA_SHOTS || path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const ALL_LOOKS = [['classic', 'light'], ['classic', 'dark'], ['paper', 'light'], ['paper', 'dark']];
let LOOKS = ALL_LOOKS; // Classic alone in a build without Paper (set per run, below)
const HIDE_DEV = 'nextjs-portal{display:none!important}';

// lab specimen → the control family it stands for
const FAMILIES = {
  'btn-primary': 'primary button', 'btn-secondary': 'secondary button', 'btn-ghost': 'ghost button', 'btn-danger': 'destructive button',
  'btn-icon': 'icon button', 'btn-split-capture': 'split Capture button', 'btn-split-copy': 'split Copy button', 'segmented': 'segmented control',
  'library-tabs': 'tabs (Library)', 'tabs': 'tabs (filters)', 'chips': 'chip', 'filter-pills': 'filter pill', 'menu-items': 'menu row',
  'sidebar-rows': 'sidebar row', 'checkbox': 'checkbox', 'switch': 'toggle', 'item-cards': 'item card', 'kanban': 'Inbox card',
  'ai-cards': 'connection card', 'fab': 'Ask face', 'btn-icon-misc': 'list row',
};

async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.nodes.length).map(v => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')}`));
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* every element's pressed-relevant computed style in a lab cell, in document order */
const SIG = `window.__sig = cell => [...cell.querySelectorAll('[data-lab-stage] *')].map(e => {
  const c = getComputedStyle(e), b = getComputedStyle(e, '::before'), a = getComputedStyle(e, '::after');
  return [c.scale, c.transform, c.backgroundColor, c.boxShadow, c.borderTopColor, c.color, c.opacity, b.backgroundColor, b.opacity, b.scale, a.scale, a.backgroundColor].join('|');
});`;

async function lab(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(SIG);
  for (const [look, theme] of LOOKS) {
    await page.goto(`${B}/lab/components?style=${look}&theme=${theme}`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE_DEV });
    await page.waitForSelector('[data-specimen="btn-primary"] [data-lab-variant="active"]');
    await page.waitForTimeout(900);
    const res = await page.evaluate(slugs => slugs.map(slug => {
      const sec = document.querySelector(`[data-specimen="${slug}"]`);
      // the forced Pressed cell is the last "active" one (a static variant can be labelled Active too)
      const d = sec?.querySelector('[data-lab-variant="default"]'), p = [...(sec?.querySelectorAll('[data-lab-variant="active"]') ?? [])].pop();
      if (!d || !p || !p.querySelector('[data-force-active]')) return [slug, null];
      const a = window.__sig(d), b = window.__sig(p);
      const diff = b.findIndex((x, i) => x !== a[i]);
      return [slug, diff >= 0];
    }), Object.keys(FAMILIES));
    const missing = res.filter(([, v]) => v === null).map(([s]) => s);
    const flat = res.filter(([, v]) => v === false).map(([s]) => FAMILIES[s]);
    ok(`lab ${look} ${theme}: every family has a Pressed cell`, !missing.length, missing.join(', '));
    ok(`lab ${look} ${theme}: every family's Pressed cell differs from Default (${res.length - missing.length} families)`, !flat.length, flat.join(', '));
    // scale where it belongs, and focus kept apart from press
    const primary = await page.evaluate(() => {
      const p = [...document.querySelectorAll('[data-specimen="btn-primary"] [data-lab-variant="active"]')].pop().querySelector('.btn.primary');
      const d = document.querySelector('[data-specimen="btn-primary"] [data-lab-variant="default"] .btn.primary');
      const c = getComputedStyle(p);
      return { scale: c.scale, outline: c.outlineStyle, bgP: c.backgroundColor, bgD: getComputedStyle(d).backgroundColor };
    });
    ok(`lab ${look} ${theme}: a pressed primary scales down and darkens, with no focus ring of its own`,
      parseFloat(primary.scale) < 1 && primary.bgP !== primary.bgD && primary.outline === 'none', JSON.stringify(primary));
    if (theme === 'light') await shotContact(page, look, theme);
    else await shotContact(page, look, theme);
  }
  await ctx.close();
  // reduced motion: tint stays, scale goes
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  for (const look of ['classic', 'paper']) {
    await rp.goto(`${B}/lab/components?style=${look}&theme=light`, { waitUntil: 'networkidle' });
    await rp.waitForSelector('[data-specimen="btn-primary"] [data-lab-variant="active"]');
    await rp.waitForTimeout(700);
    const r = await rp.evaluate(() => ['btn-primary', 'btn-secondary', 'chips', 'item-cards', 'fab', 'btn-split-capture'].map(slug => {
      const sec = document.querySelector(`[data-specimen="${slug}"]`);
      const cell = [...sec.querySelectorAll('[data-lab-variant="active"]')].pop().querySelector('[data-lab-stage]');
      const scaled = [...cell.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e).scale; return s !== 'none' && s !== '1'; });
      const d = sec.querySelector('[data-lab-variant="default"] [data-lab-stage]');
      const tint = [...cell.querySelectorAll('*')].some((e, i) => {
        const o = d.querySelectorAll('*')[i]; if (!o) return false;
        const a = getComputedStyle(e), b = getComputedStyle(o);
        return a.backgroundColor !== b.backgroundColor || a.boxShadow !== b.boxShadow || a.borderTopColor !== b.borderTopColor || a.color !== b.color;
      });
      return [slug, scaled.length, tint];
    }));
    ok(`reduced motion ${look}: no pressed control scales`, r.every(([, n]) => n === 0), JSON.stringify(r.filter(([, n]) => n)));
    ok(`reduced motion ${look}: pressed controls keep their tint`, r.filter(([s]) => s !== 'fab' && s !== 'item-cards').every(([, , t]) => t), JSON.stringify(r));
  }
  await rctx.close();
}

/* the contact sheet: each family's Default and Pressed cells, side by side, in one image per look */
async function shotContact(page, look, theme) {
  const parts = [];
  for (const slug of Object.keys(FAMILIES)) {
    const sec = page.locator(`[data-specimen="${slug}"]`);
    for (const v of ['default', 'active']) {
      const cell = v === 'active' ? sec.locator(`[data-lab-variant="active"]`).last() : sec.locator(`[data-lab-variant="default"]`).first();
      if (!(await cell.count())) continue;
      await cell.scrollIntoViewIfNeeded();
      const buf = await cell.screenshot({ animations: 'disabled' }).catch(() => null);
      if (buf) parts.push({ slug, v, src: `data:image/png;base64,${buf.toString('base64')}` });
    }
  }
  const bg = theme === 'dark' ? '#111' : '#fafafa', ink = theme === 'dark' ? '#eee' : '#222';
  const rows = Object.keys(FAMILIES).map(slug => {
    const d = parts.find(p => p.slug === slug && p.v === 'default'), a = parts.find(p => p.slug === slug && p.v === 'active');
    return `<div class=r><b>${FAMILIES[slug]}</b>${d ? `<img src="${d.src}">` : ''}${a ? `<img src="${a.src}">` : ''}</div>`;
  }).join('');
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: 1600, height: 900 });
  await sheet.setContent(`<style>body{margin:0;padding:24px;background:${bg};color:${ink};font:13px system-ui}.r{display:grid;grid-template-columns:180px auto auto;gap:16px;align-items:start;justify-content:start;padding:10px 0;border-bottom:1px solid #8884}.r img{max-width:620px;max-height:320px;object-fit:contain;object-position:left top}h1{font-size:16px;margin:0 0 8px}</style><h1>Pressed states · ${look} ${theme} · Default, then Pressed</h1>${rows}`);
  await sheet.screenshot({ path: path.join(SHOTS, `pressed-contact-${look}-${theme}.png`), fullPage: true });
  await sheet.close();
}

async function setLook(page, look, theme) {
  await page.evaluate(([l, t]) => { document.documentElement.dataset.look = l; document.documentElement.dataset.theme = t; }, [look, theme]);
  await page.waitForTimeout(250);
}

async function phone(browser, engine) {
  for (const [look, theme] of LOOKS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: engine === 'chromium', hasTouch: true, deviceScaleFactor: 2,
      ...(engine === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
    const page = await ctx.newPage();
    await page.goto(`${B}/library`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE_DEV });
    await setLook(page, look, theme);
    const tag = `${engine} ${look} ${theme}`;
    const phoneQ = await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches);
    if (!phoneQ) { ok(`${tag}: the browser emulates a touch phone`, false, 'hover: none and pointer: coarse did not match'); await ctx.close(); continue; }
    // cards: one visible control, More, clear of the text
    const cards = await page.evaluate(() => [...document.querySelectorAll('main li[data-id]')].slice(0, 6).map(li => {
      const vis = [...li.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height && getComputedStyle(b).visibility !== 'hidden' && getComputedStyle(b).opacity !== '0'; });
      const more = li.querySelector('button[aria-label^="More for"]');
      const m = more.getBoundingClientRect();
      // the glyph itself must not sit on the footer's other parts
      const g = more.querySelector('svg').getBoundingClientRect();
      const glyphHit = [...li.querySelectorAll('[class*="__ft"] > *')].some(e => { const r = e.getBoundingClientRect(); return r.width && g.left < r.right && g.right > r.left && g.top < r.bottom && g.bottom > r.top; });
      // the visible glyph never sits on the preview, title or meta (the invisible 44px target may brush their edge)
      // the glyph against the text itself (line boxes), not the boxes around it
      // (clipped to the element's content box, since an ellipsis cuts a line box short of its full width)
      const gHit = sel => [...li.querySelectorAll(sel)].some(e => { const rg = document.createRange(); rg.selectNodeContents(e);
        const b = e.getBoundingClientRect(), cs = getComputedStyle(e), right = b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
        const pv = e.closest('[class*="__pv"]')?.getBoundingClientRect(); // the preview clips what overflows it
        return [...rg.getClientRects()].some(r => r.width && g.left < Math.min(r.right, right) && g.right > r.left && g.top < Math.min(r.bottom, pv?.bottom ?? Infinity) && g.bottom > r.top); });
      return { n: vis.length, label: vis[0]?.getAttribute('aria-label') ?? '', w: m.width, h: m.height, overText: gHit('[class*="__pv"] > *') || gHit('h2') || gHit('[class*="__meta"]'), glyphHit };
    }));
    ok(`${tag}: each card shows one control, More`, cards.length >= 4 && cards.every(c => c.n === 1 && c.label.startsWith('More for')), JSON.stringify(cards.map(c => [c.n, c.label.slice(0, 12)])));
    ok(`${tag}: More is a 44px target`, cards.every(c => c.w >= 44 && c.h >= 44), JSON.stringify(cards.map(c => [c.w, c.h])));
    ok(`${tag}: More sits clear of the preview, title and meta, and of the footer's labels`, cards.every(c => !c.overText && !c.glyphHit), JSON.stringify(cards.map(c => [c.overText, c.glyphHit])));
    ok(`${tag}: no sideways scroll on the phone Library`, (await sideways(page)) <= 0);
    await page.screenshot({ path: path.join(SHOTS, `phone-library-${engine}-${look}-${theme}.png`) });

    const card = page.locator('main li[data-id]').first();
    const title = (await card.locator('h2').innerText()).trim();
    const id = await card.getAttribute('data-id');
    const more = card.locator('button[aria-label^="More for"]');
    const dlg = page.locator('dialog[open]');
    const open = async () => { await more.tap(); await dlg.waitFor(); await page.waitForTimeout(600); };
    const closed = async () => { await page.waitForTimeout(500); return (await page.locator('dialog[open]').count()) === 0; };
    const focusOnMore = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('More for') ?? false);

    await open();
    const aria = await page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      const t = document.getElementById(d.getAttribute('aria-labelledby'));
      return { modal: d.getAttribute('aria-modal'), title: t?.textContent ?? '', focusIn: d.contains(document.activeElement), lock: getComputedStyle(document.documentElement).overflow,
        rows: [...d.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean),
        haspopup: document.querySelector('main li[data-id] button[aria-label^="More for"]').getAttribute('aria-haspopup') };
    });
    ok(`${tag}: More opens a modal dialog labelled by the item's title`, aria.modal === 'true' && aria.title === title && aria.haspopup === 'dialog', JSON.stringify(aria));
    ok(`${tag}: focus starts in the sheet and the page behind doesn't scroll`, aria.focusIn && aria.lock === 'hidden', JSON.stringify(aria));
    const want = ['Bookmark', 'Copy', 'New collection…'];
    ok(`${tag}: the sheet has the menu's actions (Bookmark, Copy, collections, New collection, projects)`, want.every(w => aria.rows.includes(w)) && aria.rows.length >= 6, aria.rows.join(' | '));
    const safe = await page.evaluate(() => getComputedStyle(document.querySelector('dialog[open] [class*="body"]')).paddingBottom);
    ok(`${tag}: the sheet keeps clear of the home indicator (safe area padding)`, parseFloat(safe) >= 20, safe);
    ok(`${tag}: no sideways scroll with the sheet open`, (await sideways(page)) <= 0);
    if (engine === 'chromium') { const v = await axe(page); ok(`${tag}: axe, sheet open: no serious or critical issues`, !v.length, v.join('; ')); }
    await page.screenshot({ path: path.join(SHOTS, `phone-sheet-${engine}-${look}-${theme}.png`) });

    if (look === 'classic' && theme === 'light') {
      // keyboard: arrows move, Tab never leaves the sheet for the page
      const rest = await page.evaluate(() => document.activeElement?.className ?? '');
      ok(`${tag}: opened by touch, focus rests on the sheet itself (no ring on a row)`, /__panel/.test(rest), rest);
      await page.keyboard.press('ArrowDown');
      const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
      await page.keyboard.press('ArrowDown');
      const second = await page.evaluate(() => document.activeElement?.textContent?.trim());
      ok(`${tag}: ArrowDown moves through the rows`, first === 'Bookmark' && second === 'Copy', `${first}, ${second}`);
      let escaped = false;
      for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); escaped ||= await page.evaluate(() => { const a = document.activeElement; return !!a && a !== document.body && !document.querySelector('dialog[open]')?.contains(a); }); }
      ok(`${tag}: Tab stays in the sheet`, !escaped);
      // actions
      const bm = dlg.getByRole('button', { name: 'Bookmark', exact: true });
      const was = await bm.getAttribute('aria-pressed');
      await bm.tap(); await page.waitForTimeout(250);
      const now = await bm.getAttribute('aria-pressed');
      const marked = await page.evaluate(i => document.querySelector(`main li[data-id="${i}"]`).hasAttribute('data-bookmarked'), id);
      ok(`${tag}: Bookmark works from the sheet`, was !== now && marked === (now === 'true'), `${was} → ${now}, card ${marked}`);
      await bm.tap(); await page.waitForTimeout(200);
      const coll = dlg.locator('section').first().locator('button[aria-pressed]').nth(1);
      const cName = (await coll.innerText()).trim(); const c0 = await coll.getAttribute('aria-pressed');
      await coll.tap(); await page.waitForTimeout(250);
      ok(`${tag}: a collection toggles from the sheet (“${cName}”)`, (await coll.getAttribute('aria-pressed')) !== c0);
      await coll.tap(); await page.waitForTimeout(200);
      const proj = dlg.locator('section').nth(1).locator('button[aria-pressed]').first();
      const p0 = await proj.getAttribute('aria-pressed');
      await proj.tap(); await page.waitForTimeout(250);
      ok(`${tag}: a project toggles from the sheet`, (await proj.getAttribute('aria-pressed')) !== p0);
      await proj.tap(); await page.waitForTimeout(200);
      await dlg.getByRole('button', { name: 'New collection…' }).tap();
      const input = dlg.getByLabel('New collection name');
      const fs16 = await input.evaluate(e => parseFloat(getComputedStyle(e).fontSize));
      ok(`${tag}: the new collection field is 16px (no iOS zoom)`, fs16 >= 16, String(fs16));
      await input.fill('Sheet test');
      await dlg.getByRole('button', { name: 'Create' }).tap(); await page.waitForTimeout(300);
      const made = dlg.getByRole('button', { name: 'Sheet test' });
      ok(`${tag}: New collection creates one with this item in it`, (await made.count()) === 1 && (await made.getAttribute('aria-pressed')) === 'true');
      await made.tap(); await page.waitForTimeout(150);
      await dlg.getByRole('button', { name: 'Copy', exact: true }).tap();
      await page.waitForTimeout(150);
      const copiedLabel = await page.locator('dialog[open]').getByText('Copied', { exact: true }).count();
      await page.waitForTimeout(600);
      ok(`${tag}: Copy confirms with a tick and “Copied”, then the sheet closes`, copiedLabel === 1 && await closed(), String(copiedLabel));
      ok(`${tag}: focus returns to More`, await focusOnMore());
      if (engine === 'chromium') {
        const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok(`${tag}: Copy put the item's text on the clipboard`, clip.length > 20, clip.slice(0, 40));
      }
      // opened from the keyboard, focus starts on the first row
      await more.focus(); await page.keyboard.press('Enter'); await dlg.waitFor(); await page.waitForTimeout(500);
      const kf = await page.evaluate(() => document.activeElement?.textContent?.trim());
      ok(`${tag}: opened with Enter, focus starts on the first row`, kf === 'Bookmark', kf);
      await page.keyboard.press('Escape'); await closed();
      // closing: Escape, the scrim, the close button, a swipe
      await open(); await page.keyboard.press('Escape');
      ok(`${tag}: Escape closes the sheet`, await closed());
      ok(`${tag}: and focus returns to More`, await focusOnMore());
      await open(); await page.touchscreen.tap(195, 120);
      ok(`${tag}: tapping the scrim closes the sheet`, await closed());
      await open(); await dlg.getByRole('button', { name: 'Close' }).tap();
      ok(`${tag}: the close button closes the sheet`, await closed());
      await open();
      const h = await page.locator('dialog[open] [class*="head"]').boundingBox();
      await page.mouse.move(h.x + h.width / 2, h.y + 12); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(h.x + h.width / 2, h.y + 12 + i * 30); await page.waitForTimeout(12); }
      await page.mouse.up();
      ok(`${tag}: a swipe down on the handle closes the sheet`, await closed());
      // a short, slow drag springs back
      await open();
      const h2 = await page.locator('dialog[open] [class*="head"]').boundingBox();
      await page.mouse.move(h2.x + 40, h2.y + 12); await page.mouse.down();
      for (let i = 1; i <= 4; i++) { await page.mouse.move(h2.x + 40, h2.y + 12 + i * 8); await page.waitForTimeout(60); }
      await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(600);
      const back = await page.evaluate(() => { const p = document.querySelector('dialog[open] [class*="panel"]'); return p ? getComputedStyle(p).transform : 'gone'; });
      ok(`${tag}: a short slow drag springs back`, back === 'none' || back === 'matrix(1, 0, 0, 1, 0, 0)', back);
      await page.keyboard.press('Escape'); await closed();
    }
    await ctx.close();
  }
  // reduced motion: no slide
  const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: engine === 'chromium', hasTouch: true, reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  await rp.goto(`${B}/library`, { waitUntil: 'networkidle' });
  await rp.locator('main li[data-id] button[aria-label^="More for"]').first().tap();
  await rp.locator('dialog[open]').waitFor();
  const tf = await rp.evaluate(() => new Promise(r => requestAnimationFrame(() => r(getComputedStyle(document.querySelector('dialog[open] [class*="panel"]')).transform))));
  ok(`${engine} reduced motion: the sheet doesn't slide`, tf === 'none', tf);
  await rctx.close();
}

async function desktop(browser) {
  for (const [look, theme] of LOOKS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${B}/library`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE_DEV });
    await setLook(page, look, theme);
    const card = page.locator('main li[data-id]').first();
    await card.hover();
    await card.locator('button[aria-label^="More for"]').click();
    const menu = page.locator('.menu[aria-label^="Organise "]');
    await menu.waitFor();
    const rows = (await menu.locator('button').allInnerTexts()).map(t => t.trim());
    ok(`desktop ${look} ${theme}: More opens the popover, not a dialog`, (await page.locator('dialog[open]').count()) === 0 && rows.length >= 6);
    ok(`desktop ${look} ${theme}: the popover's rows are unchanged`, rows[0].startsWith('Bookmark') && rows[1] === 'Copy' && rows.includes('Open in panel') && rows.includes('New collection…'), rows.join(' | '));
    ok(`desktop ${look} ${theme}: the card keeps Copy, More and Bookmark`, (await card.locator('button:visible').count()) === 3);
    await page.screenshot({ path: path.join(SHOTS, `desktop-menu-${look}-${theme}.png`) });
    await ctx.close();
  }
}

for (const engine of engines) {
  const browser = await pw[engine].launch();
  try {
    const probe = await browser.newPage();
    await probe.goto(`${B}/library`, { waitUntil: 'networkidle' });
    const paper = (await features(probe)).has('avatar');
    const hasLab = (await probe.request.get(`${B}/lab/components`)).status() === 200; // the lab never ships in a release
    await probe.close();
    LOOKS = paper ? ALL_LOOKS : ALL_LOOKS.filter(([l]) => l === 'classic');
    if (engine === 'chromium') { if (hasLab) await lab(browser); else console.log('SKIP the lab is not in this build'); await desktop(browser); }
    await phone(browser, engine);
  } finally { await browser.close(); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
