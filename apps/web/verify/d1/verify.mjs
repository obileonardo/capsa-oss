// Design review 25 Oct, items 1–4 (agent D1): libraries (switching isolates data, the 2-library limit and the Pro sheet,
// per-library backup and restore, app-wide prefs, same kind of page), the notifications panel (a glyph per kind, Mark all
// read, keyboard, empty state), Your AI in the sidebar (Add AI with official logos) and the Your AI area (/ai/<page>,
// redirects, Back to app, Files for agents framed side by side). Screenshots of every new screen at 1440 and 390, light
// and dark, land next to this file. Usage (dev server): CAPSA_BASE=http://127.0.0.1:3201 node verify/d1/verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { unzipSync, strFromU8 } from './_unzip.mjs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const arg = process.argv[2] || 'all';
const engines = arg === 'all' ? ['chromium', 'webkit'] : [arg];
let which = engines[0];
const results = [];
const ok = (name, cond, extra = '') => { results.push({ engine: which, name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ' · ' + extra : ''}`); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${which}-${name}.png` });
const go = async (page, p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(350); };
const main = page => page.getByRole('navigation', { name: 'Main' });
const wsBtn = page => main(page).locator('button[aria-haspopup="menu"]').first();
const bell = page => page.getByRole('button', { name: /^Notifications/ });
async function axe(page, label) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(x => x.impact === 'serious' || x.impact === 'critical').map(x => ({ id: x.id, n: x.nodes.map(n => n.target.join(' ')).slice(0, 3) })));
  ok(`axe ${label}: no serious/critical`, v.length === 0, v.length ? JSON.stringify(v) : '');
}
const dbs = page => page.evaluate(async () => (await indexedDB.databases?.() ?? []).map(d => d.name).sort());
const registry = page => page.evaluate(() => JSON.parse(localStorage.getItem('capsa-libraries') || 'null'));
/** A visible Lucide fallback (the brand suite fails on these). */
const lucideIn = loc => loc.evaluate(el => [...el.querySelectorAll('svg.lucide')].filter(e => e.getClientRects().length).map(e => e.getAttribute('data-ic')));
async function palette(page, q) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k'); await page.waitForTimeout(250);
  await page.keyboard.type(q); await page.waitForTimeout(450);
  const n = await page.locator('dialog[open] [role="option"]').filter({ hasText: q }).count();
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  return n;
}

async function libraries() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().split('\n')[0].slice(0, 200)); });
  const T = 'lib';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-d1-'));

  await go(page, '/library');
  const demoItems = await page.evaluate(() => document.querySelectorAll('main ul[aria-label="Items"] > li').length);
  const demoTitle = (await page.locator('main ul[aria-label="Items"] > li a[href^="/library/"]').first().innerText()).split('\n')[0].trim();
  ok(`${T} existing data is "Your library" with nothing to migrate`, (await wsBtn(page).innerText()).trim() === 'Your library' && (await dbs(page)).includes('capsa-web'), (await dbs(page)).join(','));
  await wsBtn(page).click();
  const menu = page.getByRole('menu', { name: 'Libraries' });
  const rows = menu.getByRole('menuitemradio');
  ok(`${T} the menu lists libraries, the current one ticked, with its item count`, await rows.count() === 1 && (await rows.first().getAttribute('aria-checked')) === 'true' && /Your library\s*\d+ items/.test(await rows.first().innerText()), await rows.first().innerText());
  ok(`${T} Settings and Back up now left the menu`, await menu.getByText('Settings').count() === 0 && await menu.getByText('Back up now').count() === 0);
  ok(`${T} New library and Manage libraries are in the menu`, await menu.getByRole('menuitem', { name: 'New library' }).count() === 1 && await menu.getByRole('menuitem', { name: 'Manage libraries' }).count() === 1);
  ok(`${T} every menu row has a brand glyph (no Lucide fallback)`, (await lucideIn(menu)).length === 0, (await lucideIn(menu)).join(','));
  ok(`${T} the current row has focus, and ↓ moves to the next row`, await page.evaluate(() => document.activeElement?.getAttribute('aria-checked')) === 'true'
    && (await page.keyboard.press('ArrowDown'), await page.evaluate(() => document.activeElement?.textContent)) === 'New library');
  await shot(page, 'lib-menu-light-1440');
  await axe(page, `${T} library menu`);
  await page.keyboard.press('Escape');
  ok(`${T} Escape closes the menu and returns focus to it`, await menu.count() === 0 && await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup')) === 'menu');

  // a second library
  await go(page, '/library/' + (await page.locator('main ul[aria-label="Items"] > li a[href^="/library/"]').first().getAttribute('href')).split('/').pop());
  await wsBtn(page).click(); await menu.getByRole('menuitem', { name: 'New library' }).click();
  const dlg = page.getByRole('dialog', { name: 'New library' });
  ok(`${T} New library opens its dialog`, await dlg.isVisible());
  await dlg.getByLabel('Name').fill('Design');
  await dlg.getByRole('radio', { name: 'Violet' }).click(); await dlg.getByRole('radio', { name: 'Swatches' }).click();
  await shot(page, 'lib-new-light-1440');
  await axe(page, `${T} new library dialog`);
  await dlg.getByRole('button', { name: 'Create library' }).click();
  await page.waitForURL(u => u.pathname === '/library'); await page.waitForTimeout(500);
  ok(`${T} creating it switches to it, from an item page to the Library (same kind of page)`, (await wsBtn(page).innerText()).trim() === 'Design' && new URL(page.url()).pathname === '/library');
  ok(`${T} the new library is its own database`, (await dbs(page)).some(n => /^capsa-web--l-/.test(n)), (await dbs(page)).join(','));
  ok(`${T} nothing from the other library shows: Library empty`, await page.locator('main ul[aria-label="Items"] > li').count() === 0);
  ok(`${T} …no Inbox count`, await main(page).getByRole('link', { name: /^Inbox/ }).locator('[class*="badge"]').count() === 0);
  ok(`${T} …no notifications`, /Notifications: none/.test(await bell(page).getAttribute('aria-label')), await bell(page).getAttribute('aria-label'));
  ok(`${T} …⌘K doesn't find the other library's items`, await palette(page, demoTitle) === 0, demoTitle);
  await go(page, '/deleted');
  ok(`${T} …Deleted is empty`, await page.locator('main li').count() === 0 || /Nothing/i.test(await page.locator('main').innerText()));
  await go(page, '/library');
  await shot(page, 'lib-empty-light-1440');
  await page.fill('#lib-cap', 'Design only: check contrast on every swatch.'); await page.locator('#lib-cap').press('Enter'); await page.waitForTimeout(600);
  const designCount = await page.locator('main ul[aria-label="Items"] > li').count();
  ok(`${T} the new library keeps its own items`, designCount >= 1, `${designCount}`);
  // per-library backup
  await go(page, '/library');
  const [dl] = await Promise.all([page.waitForEvent('download'), main(page).getByRole('button', { name: 'Back up now' }).click()]);
  ok(`${T} the backup's file name has the library's name`, /^capsa-backup-design-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const designZip = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(designZip);
  const files = unzipSync(fs.readFileSync(designZip));
  const lib = JSON.parse(strFromU8(files['library.json'])), man = JSON.parse(strFromU8(files['manifest.json']));
  ok(`${T} the backup holds only this library`, lib.artifacts.length === designCount && !lib.artifacts.some(a => a.demo) && man.library === 'Design', `${lib.artifacts.length} items, manifest says ${man.library}`);
  // app-wide prefs: theme set here applies everywhere
  await go(page, '/settings/appearance');
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click(); await page.waitForTimeout(400);
  // switch back with ⌘1
  await go(page, '/playground');
  await page.keyboard.press('ControlOrMeta+1'); await page.waitForTimeout(900);
  ok(`${T} ⌘1 switches back, staying on the Playground`, (await wsBtn(page).innerText()).trim() === 'Your library' && new URL(page.url()).pathname === '/playground');
  ok(`${T} theme is app-wide: dark here too`, await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  await go(page, '/library');
  ok(`${T} Your library is untouched`, await page.locator('main ul[aria-label="Items"] > li').count() === demoItems, `${await page.locator('main ul[aria-label="Items"] > li').count()} vs ${demoItems}`);
  ok(`${T} ⌘K here doesn't find the Design item`, await palette(page, 'check contrast on every swatch') === 0);
  ok(`${T} the bell counts this library's events again`, /Notifications: \d/.test(await bell(page).getAttribute('aria-label')));
  await wsBtn(page).click();
  ok(`${T} the menu shows both, with counts`, await rows.count() === 2 && new RegExp(`Design\\s*${designCount} item`).test(await rows.nth(1).innerText()), await rows.nth(1).innerText());
  await shot(page, 'lib-menu2-dark-1440');
  // a third shows the Pro sheet
  await menu.getByRole('menuitem', { name: 'New library' }).click();
  const pro = page.getByRole('dialog', { name: 'More libraries with Pro' });
  ok(`${T} a third library shows the Pro sheet, not the form`, await pro.isVisible() && await page.getByRole('dialog', { name: 'New library' }).count() === 0);
  { const t = await pro.innerText(); ok(`${T} the Pro sheet says the free limit (2), shows no prices before launch, and has no payment`, /Free[\s\S]*2 libraries[\s\S]*Pro[\s\S]*Not available yet[\s\S]*More libraries/.test(t) && !/\$\s*\d/.test(t) && !/£|€|pay|card|subscribe|upgrade/i.test(t), t.replace(/\s+/g, ' ')); }
  await shot(page, 'lib-pro-dark-1440');
  await axe(page, `${T} Pro sheet`);
  await pro.getByRole('button', { name: 'OK' }).click();
  ok(`${T} still two libraries`, (await registry(page)).libs.length === 2);
  // ⌘2, then reload keeps the library
  await page.keyboard.press('ControlOrMeta+2'); await page.waitForTimeout(900);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  ok(`${T} after a reload the same library is open`, (await wsBtn(page).innerText()).trim() === 'Design' && await page.locator('main ul[aria-label="Items"] > li').count() === designCount);
  // restore into this library only: add an item, restore the backup (replace), and Your library stays as it was
  await page.fill('#lib-cap', 'A second Design note, made after the backup.'); await page.locator('#lib-cap').press('Enter'); await page.waitForTimeout(600);
  await go(page, '/settings/storage');
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(designZip); await page.waitForTimeout(400);
  const replaceBtn = page.getByRole('button', { name: 'Replace everything' });
  if (await replaceBtn.count()) { await replaceBtn.click(); await page.waitForTimeout(600); }
  await go(page, '/library');
  ok(`${T} restoring replaces only this library`, await page.locator('main ul[aria-label="Items"] > li').count() === designCount, `${await page.locator('main ul[aria-label="Items"] > li').count()} vs ${designCount}`);
  await page.keyboard.press('ControlOrMeta+1'); await page.waitForTimeout(900); await go(page, '/library');
  ok(`${T} …and the other library is untouched by the restore`, await page.locator('main ul[aria-label="Items"] > li').count() === demoItems);
  // an old backup (no library name in it) restores into the open library (merge)
  const oldZip = path.join(tmp, 'old.zip');
  fs.copyFileSync(designZip, oldZip);
  await go(page, '/settings/storage');
  await page.locator('input[type="file"]').first().setInputFiles(oldZip); await page.waitForTimeout(400);
  const mergeBtn = page.getByRole('button', { name: 'Merge in' });
  if (await mergeBtn.count()) { await mergeBtn.click(); await page.waitForTimeout(600); }
  await go(page, '/library');
  ok(`${T} a backup from another library restores into the open one (merge adds its items)`, await page.locator('main ul[aria-label="Items"] > li').count() === demoItems + designCount, `${await page.locator('main ul[aria-label="Items"] > li').count()}`);
  // Manage: rename and delete with a typed confirmation
  await wsBtn(page).click(); await menu.getByRole('menuitem', { name: 'Manage libraries' }).click();
  const mg = page.getByRole('dialog', { name: 'Manage libraries' });
  await mg.getByLabel('Name of Design').fill('Design work'); await mg.getByLabel('Name of Design work').press('Enter').catch(() => mg.getByLabel(/Name of Design/).press('Enter'));
  await page.waitForTimeout(200);
  ok(`${T} rename in Manage libraries`, (await registry(page)).libs.some(l => l.name === 'Design work'));
  await mg.getByRole('button', { name: 'Change icon and colour of Design work' }).click();
  await shot(page, 'lib-manage-dark-1440');
  await axe(page, `${T} manage libraries`);
  await mg.getByRole('button', { name: 'Delete Design work' }).click();
  const del = page.getByRole('dialog', { name: 'Delete “Design work”' });
  const delBtn = del.getByRole('button', { name: 'Delete library' });
  ok(`${T} delete waits for the typed name`, await delBtn.isDisabled());
  await del.getByRole('textbox').fill('Design work');
  await delBtn.click(); await page.waitForTimeout(800);
  ok(`${T} deleting removes it and its database`, (await registry(page)).libs.length === 1 && !(await dbs(page)).some(n => /^capsa-web--l-/.test(n)), (await dbs(page)).join(','));
  ok(`${T} no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

async function notifications() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  const T = 'ntf';
  await go(page, '/library');
  const before = await bell(page).getAttribute('aria-label');
  await bell(page).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const box = page.getByRole('group', { name: 'Notifications' });
  ok(`${T} opened by keyboard, focus goes to the first notification`, await page.evaluate(() => !!document.activeElement?.closest('[aria-label="Notifications"]') && document.activeElement.tagName === 'A'));
  const notes = box.locator('[data-row]');
  const n = await notes.count();
  await page.keyboard.press('ArrowDown');
  ok(`${T} ↓ moves to the next notification`, n < 2 || await page.evaluate(() => document.activeElement === document.querySelectorAll('[aria-label="Notifications"] [data-row]')[1]));
  const icons = await box.evaluate(el => [...el.querySelectorAll('[class*="noteIcon"]')].map(i => i.querySelector('svg')?.getAttribute('data-ic') ?? 'none'));
  ok(`${T} every notification has a glyph, one per kind`, icons.length === n && !icons.includes('none') && new Set(icons).size === icons.length, icons.join(','));
  ok(`${T} no Lucide fallback in the panel (Solid)`, (await lucideIn(box)).length === 0, (await lucideIn(box)).join(','));
  await page.evaluate(() => { document.documentElement.dataset.icons = 'line'; });
  ok(`${T} …nor in Line`, (await lucideIn(box)).length === 0 && await box.evaluate(el => [...el.querySelectorAll('[class*="noteIcon"] g[data-set="line"]')].every(g => getComputedStyle(g).display !== 'none')));
  await page.evaluate(() => { document.documentElement.dataset.icons = 'solid'; });
  ok(`${T} grouped by Today / Earlier with times`, await box.locator('h3').count() >= 1 && await box.locator('time').count() === n);
  ok(`${T} each row has its action`, await box.evaluate(el => [...el.querySelectorAll('[class*="note_"], [class*="note "]')].length >= 0) && await box.getByText(/^(Review|Open|Back up)$/).count() >= n);
  ok(`${T} a link to Settings › Notifications`, (await box.getByRole('link', { name: 'Notification settings' }).getAttribute('href')) === '/settings/general#notifications'); // Settings grouped (26 Oct)
  await shot(page, 'ntf-light-1440');
  await axe(page, `${T} panel`);
  await page.keyboard.press('Escape');
  ok(`${T} Escape closes and returns focus to the bell`, await box.count() === 0 && await page.evaluate(() => /^Notifications/.test(document.activeElement?.getAttribute('aria-label') ?? '')));
  await bell(page).click();
  await box.getByRole('button', { name: 'Mark all read' }).click(); await page.waitForTimeout(200);
  ok(`${T} Mark all read clears the bell's count`, (await bell(page).getAttribute('aria-label')) === 'Notifications: none' && /\d/.test(before), `${before} → ${await bell(page).getAttribute('aria-label')}`);
  ok(`${T} …the notifications stay, read`, await box.locator('[data-row]').count() === n && await box.locator('[data-unread]').count() === 0);
  await page.locator('.toast').filter({ hasText: /Marked \d+ as read/ }).getByRole('button', { name: 'Undo' }).click();
  ok(`${T} Undo brings the count back`, (await bell(page).getAttribute('aria-label')) === before);
  // opening one marks it read
  if (!(await box.isVisible())) await bell(page).click();
  await box.locator('[data-row]').first().click(); await page.waitForTimeout(300);
  const after = Number((await bell(page).getAttribute('aria-label')).match(/\d+/)?.[0] ?? 0);
  ok(`${T} opening a notification marks it read`, after === Number(before.match(/\d+/)[0]) - 1, `${before} → ${after}`);
  for (const [theme, w] of [['dark', 1440], ['light', 390], ['dark', 390]]) {
    await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
    await page.emulateMedia({ colorScheme: theme });
    await go(page, '/library');
    if (w < 600) { await page.getByRole('button', { name: /sidebar/i }).first().click(); await page.waitForTimeout(250); }
    await bell(page).click(); await page.waitForTimeout(200);
    const r = await box.boundingBox();
    ok(`${T} ${theme} ${w}: the panel is fully on screen`, r && r.x >= 0 && r.x + r.width <= w && r.y + r.height <= (w < 600 ? 844 : 900), JSON.stringify(r));
    await shot(page, `ntf-${theme}-${w}`);
    await page.keyboard.press('Escape');
  }
  await browser.close();
}

async function yourAi(theme, w) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().split('\n')[0].slice(0, 200)); });
  const T = `ai ${theme} ${w}`;
  const phone = w < 600;
  const openNav = async () => { if (phone) { await page.getByRole('button', { name: /sidebar/i }).first().click(); await page.waitForTimeout(250); } };
  await go(page, '/playground'); await openNav();
  const sec = main(page).locator('[class*="sec"]').filter({ has: page.getByRole('link', { name: 'Your AI' }) });
  ok(`${T} a fresh library's Your AI shows only + Add AI`, (await sec.locator('a[class*="row"], button[class*="row"]').allInnerTexts()).map(x => x.trim()).join('|') === 'Add AI', (await sec.locator('a[class*="row"], button[class*="row"]').allInnerTexts()).join('|'));
  ok(`${T} …and no "Claude · Not connected"`, !/Not connected/.test(await sec.innerText()));
  // + Add AI opens the connect modal at its picker (#93 replaced the Add AI dialog with it)
  await sec.getByRole('button', { name: 'Add AI' }).click();
  const pick = page.getByRole('dialog', { name: 'Connect your AI' });
  const opts = pick.getByRole('list', { name: 'AIs' }).locator('li button');
  await opts.first().waitFor();
  const names = (await opts.allInnerTexts()).map(x => x.split('\n')[0].trim());
  ok(`${T} the picker lists the supported AIs`, ['Claude', 'ChatGPT and Codex', 'Cursor', 'Visual Studio Code', 'Gemini', 'Le Chat', 'Perplexity'].every(x => names.includes(x)), names.join(','));
  await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] img')].every(i => i.complete), null, { timeout: 5000 }).catch(() => {});
  const logos = await pick.evaluate(el => [...el.querySelectorAll('li button')].map(b => ({ img: b.querySelector('img[data-v="light"]')?.getAttribute('src') ?? null, ok: (() => { const i = b.querySelector('img[data-v="light"]'); return !i || (i.complete && i.naturalWidth > 0); })() })));
  ok(`${T} each logo is an official file that loads (or a neutral tile, never a redraw)`, logos.every(l => l.ok), JSON.stringify(logos));
  await shot(page, `ai-picker-${theme}-${w}`);
  if (theme === 'light' && w === 1440) await axe(page, `${T} picker`);
  await opts.filter({ hasText: 'Cursor' }).click();
  const dlg = page.locator('dialog[data-connect]');
  ok(`${T} picking Cursor shows its steps in the modal`, /Connect Cursor/.test(await dlg.innerText()) && /Step 1 of 4/.test(await dlg.innerText()));
  for (let i = 0; i < 3; i++) await dlg.getByRole('button', { name: /^Continue/ }).click();
  await dlg.getByRole('button', { name: 'Finish' }).click();
  await dlg.getByRole('link', { name: 'Cursor page' }).click();
  await page.waitForURL(/\/ai\/cursor$/); await page.waitForTimeout(400);
  ok(`${T} the finish links to Cursor's setup page`, (await page.locator('main h1').innerText()).trim() === 'Cursor');
  await openNav();
  const anav = page.getByRole('navigation', { name: 'Your AI' });
  ok(`${T} the area has its own sidebar: Back to app, Overview, Cursor, Add AI, Local MCP server, Files for agents`,
    (await anav.locator('a, button').allInnerTexts()).map(x => x.trim()).join('|') === 'Back to app|Overview|Cursor|Add AI|Local MCP server|Files for agents' && await main(page).count() === 0,
    (await anav.locator('a, button').allInnerTexts()).join('|'));
  ok(`${T} Cursor in the area sidebar has its logo`, await anav.getByRole('link', { name: 'Cursor' }).locator('img').count() >= 1);
  ok(`${T} breadcrumb: Your AI › Cursor`, /Your AI\s*Cursor/.test(await page.getByRole('navigation', { name: 'Breadcrumb' }).innerText()));
  ok(`${T} Cursor's steps: download, its MCP config`, await page.locator('main ol li').count() >= 3 && /\.cursor\/mcp\.json/.test(await page.locator('main').innerText()));
  ok(`${T} no Lucide fallback on the page`, (await lucideIn(page.locator('main'))).length === 0, (await lucideIn(page.locator('main'))).join(','));
  await shot(page, `ai-cursor-${theme}-${w}`);
  if (phone) await page.keyboard.press('Escape');
  await anav.getByRole('link', { name: 'Back to app' }).click().catch(async () => { await openNav(); await anav.getByRole('link', { name: 'Back to app' }).click(); });
  await page.waitForURL(u => !u.pathname.startsWith('/ai'));
  ok(`${T} Back to app returns to the page you were on`, new URL(page.url()).pathname === '/playground', page.url());
  await openNav();
  const cursorRow = main(page).getByRole('button', { name: /^Cursor/ });   // a row that opens the connect modal since #93
  ok(`${T} the app sidebar now shows Cursor with its logo and status`, await cursorRow.count() === 1 && (await cursorRow.locator('img').first().getAttribute('src')) === '/brands/cursor.svg' && /Not set up/.test(await cursorRow.innerText()), await cursorRow.innerText().catch(() => ''));
  // the other pages
  for (const [p, h1] of [['/ai/overview', 'Overview'], ['/ai/mcp', 'Local MCP server'], ['/ai/files', 'Files for agents']]) {
    await go(page, p);
    ok(`${T} ${p} works like Settings (h1, current page in its sidebar)`, (await page.locator('main h1').innerText()).trim() === h1 && (phone || (await page.getByRole('navigation', { name: 'Your AI' }).locator('[aria-current="page"]').innerText()).trim() === h1));
    await shot(page, `ai-${p.split('/').pop()}-${theme}-${w}`);
    if (theme === 'light' && w === 1440) await axe(page, `${T} ${p}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${T} ${p}: no horizontal scroll`, over <= 0, `${over}px`);
  }
  const frames = await page.evaluate(() => [...document.querySelectorAll('main section[aria-labelledby="ai-types"], main section[aria-labelledby="ai-from"]')].map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }));
  ok(`${T} Files for agents: two framed units, ${phone ? 'stacked' : 'side by side'}`, frames.length === 2 && (phone ? frames[0].x === frames[1].x && frames[1].y > frames[0].y : frames[0].y === frames[1].y && frames[1].x > frames[0].x), JSON.stringify(frames));
  ok(`${T} the four file types each have their art`, await page.locator('main section[aria-labelledby="ai-types"] li [data-art]').count() === 4);
  ok(`${T} collections and projects listed in the frame beside them, each with its icon`, await page.locator('main section[aria-labelledby="ai-from"] li a svg').count() >= 2);
  // old links
  for (const [from, to] of [['/ai', '/ai/overview'], ['/ai#mcp', '/ai/mcp'], ['/ai#files', '/ai/files']]) {
    await page.goto(B + from, { waitUntil: 'networkidle' }); await page.waitForURL(u => u.pathname !== '/ai').catch(() => {});
    ok(`${T} ${from} lands on ${to}`, new URL(page.url()).pathname === to, page.url());
  }
  ok(`${T} no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

async function sources() {
  const r = await fetch(B + '/brands/SOURCES.md');
  const md = r.ok ? await r.text() : '';
  const { AIS } = await import('../../src/lib/ais.ts');
  for (const a of AIS.filter(a => a.logo)) {
    const files = [`${a.logo}.svg`, ...(a.logoDark ? [`${a.logo}-dark.svg`] : [])];
    for (const f of files) {
      const res = await fetch(`${B}/brands/${f}`);
      ok(`logo ${f} is served and its source is recorded in SOURCES.md`, res.ok && md.includes(f), `${res.status}`);
    }
  }
}

for (const e of engines) {
  which = e;
  if (e === engines[0]) await sources();
  await libraries();
  await notifications();
  for (const [th, w] of [['light', 1440], ['dark', 1440], ['light', 390], ['dark', 390]]) await yourAi(th, w);
}
const fails = results.filter(r => !r.pass);
fs.writeFileSync(`${OUT}/results-${arg}.json`, JSON.stringify({ when: new Date().toISOString(), pass: results.length - fails.length, total: results.length, fails }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed${fails.length ? `; ${fails.length} failed` : ''}`);
process.exit(fails.length ? 1 : 0);
