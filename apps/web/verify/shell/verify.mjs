// Shell: the sidebar's two states on wide screens (expanded, icon rail), the one toggle, tooltips, persistence, drag to
// file in the rail, the Deleted row and the phone drawer. Screenshots and <engine>-results.json land next to this file.
// Usage (dev server on http://127.0.0.1:3100):  node verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import { has } from '../_features.mjs'; // a release snapshot can lack Playground and the command menu
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const arg = process.argv[2] || 'all';
const engines = arg === 'all' ? ['chromium', 'webkit'] : [arg];
let which = engines[0];
const results = [];
const ok = (name, cond, extra = '') => { results.push({ engine: which, name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ' — ' + extra : ''}`); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${which}-${name}.png` });
const TOGGLE = /sidebar/i;
const side = page => page.locator('nav[aria-label="Main"]');
const mode = page => page.evaluate(() => document.documentElement.dataset.side);
const sideW = page => page.evaluate(() => Math.round(document.querySelector('nav[aria-label="Main"]').getBoundingClientRect().width));
const go = async (page, p) => { await page.waitForTimeout(300); await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(300); };
/** Every visible control that shows or hides the sidebar, anywhere on the page. */
const toggles = page => page.evaluate(re => [...document.querySelectorAll('button, a')].filter(b => {
  const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
  // Settings › General lists the shortcuts, whose Change and Reset buttons name the sidebar's action (26 Oct); they're not toggles
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && /sidebar|navigation/i.test(b.getAttribute('aria-label') || '') && !b.closest('[data-action]');
}).map(b => b.getAttribute('aria-label')));
async function axe(page, label) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(x => x.impact === 'serious' || x.impact === 'critical').map(x => ({ id: x.id, n: x.nodes.map(n => n.target.join(' ')).slice(0, 3) })));
  ok(`axe ${label}: no serious/critical`, v.length === 0, v.length ? JSON.stringify(v) : '');
}
async function pdrag(page, from, to, { steps = 14 } = {}) {
  await from.evaluate(el => el.scrollIntoView({ block: 'center' }));
  const a = await from.boundingBox(), b = await to.boundingBox();
  const sx = a.x + a.width / 2, sy = a.y + Math.min(40, a.height / 2), ex = b.x + b.width / 2, ey = b.y + b.height / 2;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(sx + (ex - sx) * i / steps, sy + (ey - sy) * i / steps);
  await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(450);
}

async function desktop(theme) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0].slice(0, 200)); });
  const T = `1440 ${theme}`;

  await go(page, '/library');
  const item = await page.locator('main ul[aria-label="Items"] > li a[href^="/library/"]').first().getAttribute('href');
  const play = await has(page, 'playground'), search = await has(page, 'search');
  let board = null;
  if (play) {
    await go(page, '/playground');
    const boardLink = page.locator('main a[href^="/boards/"]').first();
    board = await boardLink.count() ? await boardLink.getAttribute('href') : null;
  }
  const PAGES = ['/inbox', '/library', play && '/playground', '/collections', '/projects', '/settings', '/ai', '/help', '/deleted', item, board].filter(Boolean);
  const SHOTS = ['/inbox', '/library', play && '/playground'].filter(Boolean);

  // expanded: one toggle everywhere
  for (const p of PAGES) { await go(page, p); const t = await toggles(page); ok(`${T} expanded ${p}: exactly one sidebar toggle`, t.length === 1, t.join(' | ')); }
  ok(`${T} expanded is the default`, (await mode(page)) === 'full' && (await sideW(page)) === 252, `${await mode(page)} ${await sideW(page)}px`);
  const del = side(page).getByRole('link', { name: 'Deleted', exact: true });
  ok(`${T} Deleted row links to /deleted`, (await del.getAttribute('href')) === '/deleted' && await del.isVisible());
  ok(`${T} Deleted uses the flat trash glyph`, await del.locator('svg[data-ic="trash-2"]').count() === 1);
  await go(page, '/deleted');
  ok(`${T} Deleted is the current page on /deleted`, (await side(page).getByRole('link', { name: 'Deleted', exact: true }).getAttribute('aria-current')) === 'page');
  for (const p of SHOTS) { await go(page, p); await shot(page, `${theme}-1440-expanded-${p.slice(1)}`); }

  // collapse with the top bar's toggle
  await go(page, '/inbox');
  const t0 = page.getByRole('button', { name: TOGGLE }).first();
  const box0 = await t0.boundingBox();
  await t0.click(); await page.waitForTimeout(400);
  ok(`${T} the top-bar toggle collapses to the rail`, (await mode(page)) === 'rail' && (await sideW(page)) === 58, `${await mode(page)} ${await sideW(page)}px`);
  const box1 = await page.getByRole('button', { name: TOGGLE }).first().boundingBox();
  ok(`${T} the toggle moves only with the panel edge (same row)`, Math.abs(box0.y - box1.y) < 1 && box1.x < box0.x, `${Math.round(box0.x)},${Math.round(box0.y)} → ${Math.round(box1.x)},${Math.round(box1.y)}`);
  for (const p of PAGES) { await go(page, p); const t = await toggles(page); ok(`${T} rail ${p}: exactly one sidebar toggle`, t.length === 1, t.join(' | ')); }

  // the rail's contents (Library is a button there: it opens its panel beside the rail, item 4)
  await go(page, '/inbox');
  const nav = side(page);
  for (const [role, name] of [...(play ? [['link', /^Playground/]] : []), ...(search ? [['button', /Search/]] : []), ['link', /^Inbox/], ['button', /^Library/], ['button', 'Capture'], ['button', 'Your library'], ['button', /^Notifications/], ['link', 'Settings'], ['button', /^Help/], ['link', 'Deleted']]) {
    const l = nav.getByRole(role, { name, exact: typeof name === 'string' }).first();
    ok(`${T} rail shows ${role} “${name}” with its accessible name`, await l.isVisible());
  }
  if (!play) ok(`${T} rail has no Playground link (not in this build)`, await nav.getByRole('link', { name: /^Playground/ }).count() === 0);
  if (!search) ok(`${T} rail has no Search button (not in this build)`, await nav.getByRole('button', { name: /Search/ }).count() === 0);
  const geo = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    const els = [...nav.querySelectorAll('a, button')].filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none');
    const svgs = els.map(e => e.querySelector('svg')).filter(Boolean).map(s => { const r = s.getBoundingClientRect(); return Math.round((r.left + r.right) / 2); });
    const textShown = els.filter(e => [...e.querySelectorAll('span, b')].some(sp => sp.textContent.trim() && sp.getBoundingClientRect().width > 2 && !/badge/.test(sp.className)));
    const unnamed = els.filter(e => !(e.getAttribute('aria-label') || e.textContent).trim());
    const heads = [...nav.querySelectorAll('a, span')].filter(e => /^(Collections|Projects|Bookmarks|Tags|Your AI)$/.test(e.textContent.trim()) && e.getBoundingClientRect().width > 2);
    return { centres: [...new Set(svgs)], n: svgs.length, textShown: textShown.map(e => e.textContent.trim()), unnamed: unnamed.length, heads: heads.length, overflowX: nav.scrollWidth > nav.clientWidth };
  });
  ok(`${T} rail icons sit in one column`, geo.centres.every(c => Math.abs(c - 29) <= 1), `${geo.n} icons at x=${geo.centres.join(',')}`);
  ok(`${T} rail shows no labels and no section headings`, geo.textShown.length === 0 && geo.heads === 0, geo.textShown.join(' | '));
  ok(`${T} every rail control has a name`, geo.unnamed === 0, `${geo.unnamed} unnamed`);
  ok(`${T} rail doesn't scroll sideways`, !geo.overflowX);
  const collections = await nav.locator('[data-item-drop^="collections:"]').count();
  ok(`${T} collections and projects show as icons`, collections > 0 && await nav.locator('[data-item-drop^="projects:"]').count() > 0 && await nav.locator('[data-item-drop] svg').first().isVisible());
  const inbox = nav.getByRole('link', { name: /^Inbox/ });
  const badge = inbox.locator('[class*="badge"]');
  if (await badge.count()) {
    const [rb, rr] = [await badge.boundingBox(), await inbox.boundingBox()];
    ok(`${T} Inbox count is a corner badge on the icon`, rb.width <= 26 && rb.height <= 17 && rb.y >= rr.y && rb.x > rr.x + 14, JSON.stringify({ b: rb, r: rr }));
  } else ok(`${T} Inbox count is a corner badge on the icon (no count to show)`, true, 'inbox empty');
  ok(`${T} the current page is highlighted in the rail`, await page.evaluate(() => { const a = document.querySelector('nav[aria-label="Main"] a[aria-current="page"]'); return !!a && getComputedStyle(a).backgroundColor !== 'rgba(0, 0, 0, 0)'; }));

  // tooltips: hover and keyboard focus
  const [hoverName, hoverLabel] = play ? [/^Playground/, 'Playground'] : ['Deleted', 'Deleted'];
  const hoverItem = nav.getByRole('link', { name: hoverName, exact: typeof hoverName === 'string' });
  await hoverItem.hover(); await page.waitForTimeout(150);
  const tip = page.locator('[data-rail-tip]');
  ok(`${T} hovering a rail item shows its label`, (await tip.innerText()).trim() === hoverLabel, await tip.count() ? await tip.innerText() : 'none');
  await shot(page, `${theme}-1440-rail-tooltip-hover`);
  const tb = await tip.boundingBox(); const bb = await hoverItem.boundingBox();
  ok(`${T} tooltip sits beside the item, outside the rail`, tb && tb.x >= 58 && Math.abs((tb.y + tb.height / 2) - (bb.y + bb.height / 2)) <= 2, JSON.stringify(tb));
  await page.mouse.move(700, 450); await page.waitForTimeout(100);
  ok(`${T} tooltip goes away when the pointer leaves`, await tip.count() === 0);
  // Tab from search to Capture. Safari's Tab skips buttons and links unless 'Press Tab to highlight each item' is on;
  // Option-Tab is how its keyboard users reach them, so WebKit uses that.
  if (search) await nav.getByRole('button', { name: /Search/ }).focus();
  else await page.evaluate(() => { const nav = document.querySelector('nav[aria-label="Main"]'); const all = [...nav.querySelectorAll('a, button')].filter(e => e.getBoundingClientRect().width > 0); const i = all.findIndex(e => e.getAttribute('aria-label') === 'Capture' || e.textContent.trim().startsWith('Capture')); all[i - 1]?.focus(); });
  await page.keyboard.press('Shift'); await page.keyboard.press(which === 'webkit' ? 'Alt+Tab' : 'Tab'); await page.waitForTimeout(150);
  await shot(page, `${theme}-1440-rail-tooltip-focus`);
  ok(`${T} keyboard focus shows the tooltip`, await tip.count() === 1 && /^Capture/.test((await tip.innerText()).trim()), await tip.count() ? await tip.innerText() : 'none');
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  ok(`${T} Escape hides the tooltip`, await tip.count() === 0);
  await nav.getByRole('button', { name: 'Capture' }).hover(); await page.waitForTimeout(150);
  ok(`${T} Capture's tooltip shows its key`, /Capture\s*C$/.test((await tip.innerText()).trim()), await tip.innerText());
  ok(`${T} rail items have no native title (no double tooltip)`, await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main"] [data-tip][title]')].filter(e => e.getBoundingClientRect().width > 0).length) === 0);

  // menus open beside the rail, fully on screen
  for (const [name, group] of [['Help', 'Keyboard shortcuts'], ['Your library', null]]) {
    await nav.getByRole('button', name === 'Help' ? { name: /^Help/ } : { name, exact: true }).click(); await page.waitForTimeout(150); // "Help, something new" until What's new is opened
    const m = group ? page.getByRole('group', { name: group }) : nav.locator('.menu').first();
    const r = await m.boundingBox();
    ok(`${T} ${name} menu opens beside the rail, fully on screen`, r && r.x >= 58 && r.x + r.width <= 1440 && r.y >= 0 && r.y + r.height <= 900, JSON.stringify(r));
    await page.keyboard.press('Escape'); await page.mouse.click(900, 450); await page.waitForTimeout(100);
  }
  await page.mouse.move(700, 450);
  for (const p of SHOTS) { await go(page, p); await shot(page, `${theme}-1440-rail-${p.slice(1)}`); }
  await axe(page, `${T} rail (${SHOTS.at(-1).slice(1)})`);

  // persists across a reload, with no expand-then-shrink on load
  await page.reload({ waitUntil: 'domcontentloaded' });
  const early = await sideW(page);
  await page.waitForLoadState('networkidle');
  ok(`${T} rail persists after reload, from the first paint`, (await mode(page)) === 'rail' && early === 58 && (await sideW(page)) === 58, `first ${early}px, then ${await sideW(page)}px`);

  // drag to file onto a collection in the rail
  await go(page, '/library');
  const target = nav.locator('[data-item-drop^="collections:"]').first();
  const cname = await target.getAttribute('data-tip');
  const card = page.locator('main ul[aria-label="Items"] > li').nth(2);
  const title = (await card.locator('a[href^="/library/"]').first().innerText()).trim();
  await pdrag(page, card, target);
  const toast = page.locator('.toast').filter({ hasText: `to “${cname}”` });
  ok(`${T} dropping a card on a rail collection files it`, await toast.count() >= 1 || await page.locator('.toast').filter({ hasText: 'Already in' }).count() >= 1, `${title} → ${cname}: ${(await page.locator('.toast').allInnerTexts()).join(' | ')}`);

  // ⌘\ (Ctrl+\) toggles; not while typing in a dialog
  await page.keyboard.press(which === 'webkit' ? 'Meta+Backslash' : 'Control+Backslash'); await page.waitForTimeout(350);
  ok(`${T} ⌘\\ expands the sidebar`, (await mode(page)) === 'full' && (await sideW(page)) === 252, `${await mode(page)} ${await sideW(page)}px`);
  await page.keyboard.press('Control+Backslash'); await page.waitForTimeout(350);
  ok(`${T} ⌘\\ collapses it again`, (await mode(page)) === 'rail');
  await page.getByRole('button', { name: TOGGLE }).first().click(); await page.waitForTimeout(350);
  ok(`${T} the toggle expands it again`, (await mode(page)) === 'full' && (await sideW(page)) === 252);
  await page.reload({ waitUntil: 'networkidle' });
  ok(`${T} expanded persists after reload`, (await mode(page)) === 'full' && (await sideW(page)) === 252);
  ok(`${T} no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

async function phone(theme) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('capsa-side', 'rail'); } catch {} }); // a desktop choice mustn't shrink the drawer
  const page = await ctx.newPage();
  const T = `390 ${theme}`;
  const play = await (async () => { await go(page, '/inbox'); return has(page, 'playground'); })();
  for (const p of ['/inbox', '/library', play && '/playground'].filter(Boolean)) {
    await go(page, p);
    const t = await toggles(page);
    ok(`${T} ${p}: exactly one way to open the navigation`, t.length === 1, t.join(' | '));
  }
  await go(page, '/inbox');
  await shot(page, `${theme}-390-inbox`);
  await page.getByRole('button', { name: TOGGLE }).first().click(); await page.waitForTimeout(450);
  const w = await sideW(page);
  ok(`${T} the toggle opens the drawer at full width with labels`, w === 280 && await side(page).getByText('Inbox', { exact: true }).isVisible(), `${w}px`);
  ok(`${T} the drawer shows Deleted`, await side(page).getByRole('link', { name: 'Deleted' }).isVisible());
  ok(`${T} no rail tooltip on a phone`, await page.locator('[data-rail-tip]').count() === 0);
  await shot(page, `${theme}-390-drawer`);
  await browser.close();
}

/** The width change animates (width only, ~200 ms) and doesn't with reduced motion. */
async function motion(reduced) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await go(page, '/inbox');
  const prop = await page.evaluate(() => getComputedStyle(document.querySelector('nav[aria-label="Main"]')).transitionProperty);
  // the width on every frame from the click on, so a busy machine (a late timer) can't miss the transition or fake one
  const watch = page.evaluate(() => new Promise(r => {
    const nav = document.querySelector('nav[aria-label="Main"]'), seen = [], t0 = performance.now();
    const tick = () => { seen.push(Math.round(nav.getBoundingClientRect().width)); if (performance.now() - t0 < 600) requestAnimationFrame(tick); else r(seen); };
    requestAnimationFrame(tick);
  }));
  await page.getByRole('button', { name: TOGGLE }).first().click();
  const widths = await watch;
  const between = widths.filter(w => w > 58 && w < 252);
  const end = await sideW(page);
  const after = widths.slice(widths.findIndex(w => w < 252)); // from the first frame after the click took effect
  if (reduced) ok(`reduced motion: the rail appears at once`, after.every(w => w === 58) && end === 58, `${[...new Set(widths)].join(', ')} px`);
  else ok(`the sidebar animates its width only`, prop === 'width' && between.length > 0 && end === 58, `${prop}; ${between.length} frames between, ${[...new Set(widths)].slice(0, 8).join(', ')} px`);
  await browser.close();
}

for (const e of engines) {
  which = e;
  await motion(false); await motion(true);
  for (const th of ['light', 'dark']) await desktop(th);
  for (const th of ['light', 'dark']) await phone(th);
}
const fails = results.filter(r => !r.pass);
fs.writeFileSync(`${OUT}/${arg}-results.json`, JSON.stringify({ when: new Date().toISOString(), pass: results.length - fails.length, total: results.length, fails }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed${fails.length ? `; ${fails.length} failed` : ''}`);
process.exit(fails.length ? 1 : 0);
