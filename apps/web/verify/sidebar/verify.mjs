// The sidebar plan (Elvis, 25 Oct; docs: the taste board walkthrough). One suite that grows with each item.
// 27 Oct (issue #91): the workspace menu starts with you (your face and name), a way to Settings › Profile by mouse and
// by keyboard; a 60-character name fits; axe on the open menu in Classic and Paper, light and dark, at 1440 and 390.
// Usage: CAPSA_BASE=http://127.0.0.1:<port> node verify/sidebar/verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import { has } from '../_features.mjs'; // a release snapshot can lack Playground (a setup step) and Profile
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const AXE = require.resolve('axe-core/axe.min.js');
async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.nodes.length).map(v => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')}`));
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

// WCAG relative luminance contrast of two CSS colours
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const engine of engines) {
  const browser = await pw[engine].launch();
  for (const theme of ['light', 'dark']) {
    const T = `[${engine} ${theme}]`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    const nav = page.locator('nav[aria-label="Main"]');

    /* ---------- item 1: quiet section titles, one row rhythm, Demo data in the footer ---------- */
    const m = await nav.evaluate(n => {
      const cs = el => getComputedStyle(el);
      const bg = (() => { let e = n; while (e && cs(e).backgroundColor === 'rgba(0, 0, 0, 0)') e = e.parentElement; return e ? cs(e).backgroundColor : 'rgb(255,255,255)'; })();
      const heads = [...n.querySelectorAll('[class*="shLabel"]')].map(h => ({ text: h.textContent.trim(), color: cs(h).color, weight: Number(cs(h).fontWeight), size: parseFloat(cs(h).fontSize) }));
      const rows = [...n.querySelectorAll('a[class*="row"], button[class*="row"]')].filter(r => r.offsetParent).map(r => ({ h: Math.round(r.getBoundingClientRect().height), color: cs(r).color, weight: Number(cs(r).fontWeight) }));
      const foot = n.querySelector('[class*="foot"]');
      return { bg, heads, rows, demoInFoot: !!foot?.querySelector('[class*="demo"], .demo-tag') || /Demo data/.test(foot?.textContent ?? ''), demoOutsideFoot: [...n.children].some(c => !c.className.includes('foot') && /^Demo data$/.test(c.textContent.trim())) };
    });
    ok(`${T} section titles are there`, m.heads.length >= 2, m.heads.map(h => h.text).join(', '));
    const rowInk = m.rows.find(r => r.weight < 500)?.color ?? m.rows[0].color;
    ok(`${T} section titles are quieter than their rows (lighter colour, not bolder)`, m.heads.every(h => contrast(h.color, m.bg) < contrast(rowInk, m.bg) && h.weight <= 500),
      m.heads.map(h => `${h.text} ${contrast(h.color, m.bg).toFixed(2)}:1 w${h.weight}`).join('; ') + ` · rows ${contrast(rowInk, m.bg).toFixed(2)}:1`);
    ok(`${T} section titles still read: at least 4.5:1`, m.heads.every(h => contrast(h.color, m.bg) >= 4.5), m.heads.map(h => contrast(h.color, m.bg).toFixed(2)).join(', '));
    ok(`${T} one row rhythm: every row 30px`, m.rows.every(r => r.h === 30), [...new Set(m.rows.map(r => r.h))].join(', '));
    ok(`${T} Demo data sits in the footer, not floating above Your AI`, m.demoInFoot && !m.demoOutsideFoot, `in foot ${m.demoInFoot}, outside ${m.demoOutsideFoot}`);
    await nav.screenshot({ path: path.join(SHOTS, `${engine}-${theme}-sidebar.png`) });

    /* ---------- item 2: Set up Capsa ---------- */
    const N = (await has(page, 'playground')) ? 6 : 5; // the board step needs the Playground
    const card = nav.getByRole('button', { name: new RegExp(`^Set up Capsa, \\d of ${N} done$`) });
    ok(`${T} setup: the card shows how far along you are`, await card.isVisible() && new RegExp(`Set up\\s*0 of ${N}`).test(await card.innerText()), (await card.innerText()).replace(/\s+/g, ' '));
    await card.click(); await page.waitForTimeout(200);
    const list = page.getByRole('dialog', { name: 'Set up Capsa' });
    ok(`${T} setup: ${N} steps, each a link to where you do it`, await list.getByRole('link').count() === N && await list.getByRole('link', { name: /Make a collection/ }).getAttribute('href') === '/collections');
    ok(`${T} setup: focus moves into the list`, await page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label')) === 'Set up Capsa');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    ok(`${T} setup: Escape closes it and focus returns to the card`, !(await list.isVisible()) && /Set up Capsa/.test(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')));
    // a real step: make a collection, and the card counts it
    await page.evaluate(() => {});
    await nav.locator('[class*="shLabel"]', { hasText: 'Collections' }).hover();
    const add = nav.getByRole('button', { name: 'Add collection' });
    if (await add.count()) {
      await add.click(); await page.keyboard.type('Field notes'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
      ok(`${T} setup: making a collection ticks a step (1 of ${N})`, new RegExp(`1 of ${N}`).test(await nav.getByRole('button', { name: /^Set up Capsa/ }).innerText()), (await nav.getByRole('button', { name: /^Set up Capsa/ }).innerText()).replace(/\s+/g, ' '));
    } else ok(`${T} setup: making a collection ticks a step (1 of ${N})`, false, 'no add button on Collections');
    await nav.getByRole('button', { name: /^Set up Capsa/ }).click();
    await page.getByRole('dialog', { name: 'Set up Capsa' }).getByRole('button', { name: 'Hide' }).click(); await page.waitForTimeout(250);
    ok(`${T} setup: Hide puts it away`, await nav.getByRole('button', { name: /^Set up Capsa/ }).count() === 0);
    const undo = page.getByRole('button', { name: 'Undo' }).last();
    await undo.click(); await page.waitForTimeout(250);
    ok(`${T} setup: Undo brings it back`, await nav.getByRole('button', { name: /^Set up Capsa/ }).count() === 1);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    ok(`${T} setup: it survives a reload, still counting`, new RegExp(`1 of ${N}`).test(await nav.getByRole('button', { name: /^Set up Capsa/ }).innerText()));
    await ctx.close();

    /* ---------- item 4: in the icon rail, Library opens its panel beside the rail ---------- */
    const rc = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    await rc.addInitScript(() => { try { localStorage.setItem('capsa-side', 'rail'); } catch {} });
    const rp = await rc.newPage();
    await rp.goto(B + '/inbox', { waitUntil: 'networkidle' }); await rp.waitForTimeout(500);
    const rnav = rp.locator('nav[aria-label="Main"]');
    const lib = rnav.getByRole('button', { name: /^Library/ });
    ok(`${T} rail: Library is a button that opens a panel`, await lib.count() === 1 && await lib.getAttribute('aria-haspopup') === 'dialog');
    await lib.click(); await rp.waitForTimeout(250);
    const panel = rp.getByRole('dialog', { name: 'Library' });
    const geo = await panel.evaluate((el, navSel) => ({ left: el.getBoundingClientRect().left, rail: document.querySelector(navSel).getBoundingClientRect().right }), 'nav[aria-label="Main"]');
    ok(`${T} rail: the panel opens beside the rail, not over it`, await panel.isVisible() && geo.left >= geo.rail, `panel left ${Math.round(geo.left)}, rail right ${Math.round(geo.rail)}`);
    ok(`${T} rail: it lists the Library's views, collections and projects`, await panel.getByRole('link', { name: /All items/ }).isVisible() && await panel.getByRole('link', { name: /Prompts I reuse/ }).isVisible() && await panel.getByRole('link', { name: /Ship a menu bar app/ }).isVisible());
    ok(`${T} rail: focus moves into the panel`, await rp.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label')) === 'Library');
    await rp.keyboard.press('Escape'); await rp.waitForTimeout(150);
    ok(`${T} rail: Escape closes it and focus goes back to Library`, !(await panel.isVisible()) && await rp.evaluate(() => document.activeElement?.getAttribute('data-tip')) === 'Library');
    await lib.click(); await rp.waitForTimeout(150); await lib.click(); await rp.waitForTimeout(200);
    ok(`${T} rail: a second click on Library closes it`, !(await panel.isVisible()));
    await lib.click(); await rp.waitForTimeout(150);
    await panel.getByRole('link', { name: /Prompts I reuse/ }).click(); await rp.waitForURL(/\/collections\//); await rp.waitForTimeout(250);
    ok(`${T} rail: a link goes there and closes the panel`, /\/collections\/c-reuse/.test(rp.url()) && !(await panel.isVisible()), rp.url());
    await lib.click(); await rp.waitForTimeout(250);
    await rp.screenshot({ path: path.join(SHOTS, `${engine}-${theme}-rail-panel.png`) });
    await rc.close();
    const fc = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    const fp = await fc.newPage(); await fp.goto(B + '/inbox', { waitUntil: 'networkidle' }); await fp.waitForTimeout(400);
    ok(`${T} full sidebar: Library is still a plain link`, await fp.locator('nav[aria-label="Main"]').getByRole('link', { name: /^Library/ }).getAttribute('href') === '/library');
    await fc.close();

    /* ---------- item 9: Settings › Sidebar ---------- */
    const sc = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    const sp = await sc.newPage();
    const order = () => sp.goto(B + '/library', { waitUntil: 'networkidle' }).then(() => sp.waitForTimeout(400)).then(() =>
      sp.locator('nav[aria-label="Main"] [class*="shLabel"]').allInnerTexts());
    const before = await order();
    await sp.goto(B + '/settings/sidebar', { waitUntil: 'networkidle' }); await sp.waitForTimeout(400);
    ok(`${T} settings: a Sidebar page with three views`, await sp.getByRole('radiogroup', { name: 'Sidebar view' }).getByRole('radio').count() === 3 && await sp.getByRole('radio', { name: /Full/ }).getAttribute('aria-checked') === 'true');
    await sp.getByRole('radio', { name: /Compact/ }).click(); await sp.waitForTimeout(200);
    const rowsC = await sp.goto(B + '/library', { waitUntil: 'networkidle' }).then(() => sp.waitForTimeout(400)).then(() => sp.locator('nav[aria-label="Main"] a[class*="row"]').evaluateAll(as => [...new Set(as.filter(a => a.offsetParent).map(a => Math.round(a.getBoundingClientRect().height)))]));
    ok(`${T} settings: Compact makes the rows tighter`, rowsC.length === 1 && rowsC[0] === 26, rowsC.join(','));
    await sp.goto(B + '/settings/sidebar', { waitUntil: 'networkidle' }); await sp.waitForTimeout(300);
    await sp.getByRole('radio', { name: /Icons only/ }).click(); await sp.waitForTimeout(250);
    ok(`${T} settings: Icons only collapses the sidebar to the rail`, await sp.evaluate(() => document.documentElement.dataset.side) === 'rail');
    await sp.getByRole('radio', { name: /^Full/ }).click(); await sp.waitForTimeout(250);
    ok(`${T} settings: Full brings it back, rows 30px`, await sp.evaluate(() => document.documentElement.dataset.side) === 'full' && await sp.getByRole('radio', { name: /^Full/ }).getAttribute('aria-checked') === 'true');
    await sp.getByRole('switch', { name: 'Show Collections' }).click(); await sp.waitForTimeout(200);
    let heads = await order();
    ok(`${T} settings: switching a section off hides it`, !heads.includes('Collections') && heads.includes('Projects'), heads.join(', '));
    await sp.goto(B + '/settings/sidebar', { waitUntil: 'networkidle' }); await sp.waitForTimeout(300);
    await sp.getByRole('switch', { name: 'Show Collections' }).click(); await sp.waitForTimeout(200);
    if ((await has(sp, 'activity')) && (await has(sp, 'learn'))) { // Activity and Learn are a later release
      await sp.getByRole('switch', { name: 'Show Activity' }).click(); await sp.waitForTimeout(200);
      await sp.goto(B + '/library', { waitUntil: 'networkidle' }); await sp.waitForTimeout(400);
      const mainNav = sp.locator('nav[aria-label="Main"]');
      ok(`${T} settings: Activity can be switched off, Learn stays`, await mainNav.getByRole('link', { name: 'Activity' }).count() === 0 && await mainNav.getByRole('link', { name: 'Learn' }).count() === 1);
      await sp.goto(B + '/settings/sidebar', { waitUntil: 'networkidle' }); await sp.waitForTimeout(300);
      await sp.getByRole('switch', { name: 'Show Activity' }).click(); await sp.waitForTimeout(200);
    } else ok(`${T} settings: no Activity or Learn switches without them`, await sp.getByRole('switch', { name: /Show (Activity|Learn)/ }).count() === 0);
    await sp.getByRole('button', { name: /^Move Projects/ }).focus(); await sp.keyboard.press('ArrowUp'); await sp.waitForTimeout(250);
    ok(`${T} settings: the arrow keys move a section, and it's announced`, (await sp.locator('[aria-live]').evaluateAll(els => els.map(e => e.textContent))).some(t => /Projects, position \d of \d/.test(t)));
    heads = await order();
    const iC = heads.indexOf('Collections'), iP = heads.indexOf('Projects');
    ok(`${T} settings: the sidebar follows the new order`, iP > -1 && iC > -1 && iP < iC, heads.join(', '));
    // drag: Projects back below Collections with the pointer
    await sp.goto(B + '/settings/sidebar', { waitUntil: 'networkidle' }); await sp.waitForTimeout(300);
    const g = await sp.getByRole('button', { name: /^Move Projects/ }).boundingBox();
    const c = await sp.locator('[data-thing="collections"]').boundingBox();
    await sp.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await sp.mouse.down();
    await sp.mouse.move(g.x + g.width / 2, c.y + c.height + 6, { steps: 8 }); await sp.mouse.up(); await sp.waitForTimeout(300);
    heads = await order();
    ok(`${T} settings: dragging a section reorders it`, heads.indexOf('Collections') < heads.indexOf('Projects'), heads.join(', '));
    await sp.reload({ waitUntil: 'networkidle' }); await sp.waitForTimeout(400);
    ok(`${T} settings: the order survives a reload`, (await sp.locator('nav[aria-label="Main"] [class*="shLabel"]').allInnerTexts()).join() === heads.join(), before.join(', '));
    await sp.goto(B + '/settings/sidebar', { waitUntil: 'networkidle' }); await sp.waitForTimeout(300);
    await sp.screenshot({ path: path.join(SHOTS, `${engine}-${theme}-settings-sidebar.png`), fullPage: true });
    await sc.close();
  }

  /* ---------- the workspace menu reaches your Profile (Elvis, 27 Oct) ---------- */
  {
    const T = `[${engine}]`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    const wsBtn = page.locator('nav[aria-label="Main"] button[aria-haspopup="menu"]').first();
    const openMenu = async () => { await wsBtn.click(); await page.waitForTimeout(200); return page.getByRole('menu', { name: 'Libraries' }); };
    let menu = await openMenu();
    if (!(await has(page, 'avatar'))) { // Profile is a later release: the menu is the libraries alone, and still clean
      const firstHref = await menu.evaluate(m => m.querySelector('[role^="menuitem"]')?.getAttribute('href') ?? null);
      ok(`${T} workspace menu: no Profile row without Profile in this build`, firstHref !== '/settings/profile', String(firstHref));
      for (const [w, h] of [[1440, 900], [390, 844]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
        if (w < 861) { await page.getByRole('button', { name: /sidebar|menu/i }).first().click().catch(() => {}); await page.waitForTimeout(350); }
        await wsBtn.click(); await page.waitForTimeout(250);
        const v = await axe(page);
        ok(`${T} axe ${w}, workspace menu open: no serious or critical issues`, v.length === 0, v.join(' | '));
        await page.keyboard.press('Escape');
      }
      await ctx.close();
    } else {
    const first = await menu.evaluate(m => { const i = m.querySelector('[role^="menuitem"]'); return { tag: i.tagName, href: i.getAttribute('href'), text: i.textContent.trim(), face: !!i.querySelector('svg'), focus: document.activeElement?.getAttribute('aria-checked') }; });
    ok(`${T} workspace menu: the first row is you, a link to Settings › Profile with your face`, first.tag === 'A' && first.href === '/settings/profile' && first.face && /Your profile/.test(first.text), JSON.stringify(first));
    ok(`${T} workspace menu: opening it still puts focus on the open library`, first.focus === 'true');
    // keyboard: up from the open library reaches you, Enter goes there
    await page.keyboard.press('ArrowUp');
    ok(`${T} workspace menu: ↑ from the open library reaches your profile`, await page.evaluate(() => document.activeElement?.getAttribute('href')) === '/settings/profile');
    await page.keyboard.press('Enter'); await page.waitForURL(/\/settings\/profile/, { timeout: 5000 }).catch(() => {});
    ok(`${T} workspace menu: Enter opens Settings › Profile`, new URL(page.url()).pathname === '/settings/profile' && (await page.locator('main h1').innerText()) === 'Profile', page.url());
    // with a name (60 characters, the longest allowed): the row shows it and still says where it goes, on one line each
    const NAME = 'Adaeze Chukwuemeka-Okonkwo Wolfeschlegelsteinhausen Bergerdo'.slice(0, 60);
    await page.locator('#profile-name').fill(NAME); await page.getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(300);
    await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    menu = await openMenu();
    const named = await menu.evaluate(m => { const i = m.querySelector('a[role="menuitem"]'); const b = i.querySelector('b'), sm = i.querySelector('small'), r = i.getBoundingClientRect(), mr = m.getBoundingClientRect();
      return { name: b?.textContent, sub: sm?.textContent, clipped: b.scrollWidth > b.clientWidth, oneLine: b.getBoundingClientRect().height < 24, inside: r.right <= mr.right + 0.5 }; });
    ok(`${T} workspace menu: your name, then "Your profile"; a 60-character name ends in an ellipsis on one line inside the menu`, named.name === NAME && named.sub === 'Your profile' && named.oneLine && named.inside, JSON.stringify(named));
    await page.screenshot({ path: path.join(SHOTS, `${engine}-wsmenu-profile.png`) });
    await menu.getByRole('menuitem', { name: /Your profile/ }).click(); await page.waitForURL(/\/settings\/profile/, { timeout: 5000 }).catch(() => {});
    ok(`${T} workspace menu: clicking you opens Profile and the menu closes`, new URL(page.url()).pathname === '/settings/profile' && (await page.getByRole('menu', { name: 'Libraries' }).count()) === 0);
    // axe with the menu open, in every look, wide and on a phone (where the menu lives in the drawer)
    for (const [look, theme] of [['classic', 'light'], ['classic', 'dark'], ['paper', 'light'], ['paper', 'dark']]) {
      await page.goto(B + '/settings/general', { waitUntil: 'networkidle' });
      await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: look === 'paper' ? 'Paper' : 'Classic' }).click();
      await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light' }).click(); await page.waitForTimeout(200);
      for (const [w, h] of [[1440, 900], [390, 844]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
        if (w < 861) { await page.getByRole('button', { name: /sidebar|menu/i }).first().click().catch(() => {}); await page.waitForTimeout(350); }
        await wsBtn.click(); await page.waitForTimeout(250);
        const v = await axe(page);
        ok(`${T} axe ${look} ${theme} ${w}, workspace menu open: no serious or critical issues`, v.length === 0, v.join(' | '));
        await page.screenshot({ path: path.join(SHOTS, `${engine}-wsmenu-${look}-${theme}-${w}.png`) });
        await page.keyboard.press('Escape');
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await ctx.close();
    }
  }
  await browser.close();
}
console.log(`\n${pass}/${pass + fail} sidebar checks passed`);
process.exitCode = fail ? 1 : 0;
