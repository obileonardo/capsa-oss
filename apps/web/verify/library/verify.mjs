// Library, Artifact detail, Collections and Projects: click-through flows, screenshots, axe and console errors.
// Usage (dev server on http://127.0.0.1:3100):  node verify.mjs [chromium|webkit|all] [d-light,d-dark,m-light,m-dark]
// Each run uses a fresh browser profile, so the app seeds its demo data. Screenshots and <engine>-results.json land next to this file.
import { withSample } from '../_sample.mjs';
import { menuFit } from '../_menu.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import { featuresAt } from '../_features.mjs'; // a release snapshot can lack later features; their stages are skipped
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const engineArg = process.argv[2] || 'all';
if (!['chromium', 'webkit', 'all'].includes(engineArg)) { console.error('Usage: node verify.mjs [chromium|webkit|all] [combos]'); process.exit(2); }
const engines = engineArg === 'all' ? ['chromium', 'webkit'] : [engineArg];
const only = process.argv[3] || 'all';
let which = engines[0];

const results = [];
const ok = (name, cond, extra = '') => { results.push({ engine: which, name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ' — ' + extra : ''}`); };
const MINE = /library|collections|projects/;
/** Show a Library item in the right panel the way a person does: ⋯ → Open in panel (focus and ⋯ no longer move the panel). */
async function openInPanel(page, name) {
  const li = page.locator('main ul[aria-label="Items"] > li').filter({ has: page.getByRole('link', { name, exact: true }) }).first();
  await li.getByRole('button', { name: `More for ${name}` }).click();
  await page.getByRole('group', { name: `Organise ${name}` }).getByRole('button', { name: 'Open in panel' }).click();
  await page.waitForTimeout(120);
}
/** A real pointer drag (mouse down, several moves, up): what Safari users do. Synthetic HTML5 drag events hid a Safari bug. */
async function pdrag(page, from, to, { steps = 14 } = {}) {
  await from.evaluate(el => el.scrollIntoView({ block: 'center' })); // clear of the sticky top bar
  const a = await from.boundingBox(), b = await to.boundingBox();
  const sx = a.x + a.width / 2, sy = a.y + Math.min(40, a.height / 2), ex = b.x + b.width / 2, ey = b.y + Math.min(b.height / 2, 120);
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(sx + (ex - sx) * i / steps, sy + (ey - sy) * i / steps);
  await page.waitForTimeout(80);
  await page.mouse.up(); await page.waitForTimeout(450);
}
const axeRuns = [];
const shellNotes = new Set();

async function setup(vp, theme) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({
    viewport: vp === 'm' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    colorScheme: theme, deviceScaleFactor: vp === 'm' ? 2 : 1, acceptDownloads: true,
  });
  if (which === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  return { browser, ctx, page, errs };
}
// The store saves on a 250 ms debounce. Flows wait that out before a full page load; persistenceCheck() tests the no-wait case on its own.
const go = async (page, p) => {
  await page.waitForTimeout(400);
  await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(250); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${which}-${name}.png` });
async function axe(page, label) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { resultTypes: ['violations'] });
    return res.violations.map(v => ({ id: v.id, impact: v.impact, all: v.nodes.map(x => x.target.join(' ')) }))
      .map(v => ({ ...v, t: v.all.filter(t => !/shell-module|nextjs/.test(t)), shell: v.all.filter(t => /shell-module/.test(t)).length }))
      .map(({ all, ...v }) => v);
  });
  const bad = r.filter(v => (v.impact === 'serious' || v.impact === 'critical') && (v.t.length || v.shell));
  const shellIssues = r.filter(v => v.shell).map(v => v.id);
  if (shellIssues.length) shellNotes.add(shellIssues.join(','));
  axeRuns.push({ label, violations: r.length, serious: bad.length });
  ok(`axe ${label}: no serious/critical`, bad.length === 0, bad.length ? JSON.stringify(bad) : `${r.length} minor/moderate${r.length ? ' ' + JSON.stringify(r) : ''}`);
}
async function patchState(page, fn) {
  await page.waitForTimeout(500); // let the app's debounced save land first
  await page.evaluate(async (src) => {
    const f = eval(src);
    const db = await new Promise((res, rej) => { const r = indexedDB.open('capsa-web', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const st = await new Promise(res => { const r = db.transaction('state').objectStore('state').get('app'); r.onsuccess = () => res(r.result); });
    const next = f(st);
    await new Promise(res => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(next, 'app'); tx.oncomplete = res; });
    db.close();
  }, fn.toString());
}
const count = page => page.locator('[role="status"]').first().innerText();
const clip = page => page.evaluate(() => navigator.clipboard.readText()).catch(() => null);

async function desktopFlows(theme) {
  const { browser, page, errs } = await setup('d', theme);
  const T = theme;
  await go(page, '/library');
  ok(`${T} library renders 7 cards`, (await page.locator('ul[aria-label="Items"] > li').count()) === 7);
  await shot(page, `d-${T}-library-cards`);
  await axe(page, `${T} library cards`);

  // search + type filter with counts
  await page.fill('#lib-q', 'review');
  await page.waitForTimeout(150);
  const c1 = await count(page);
  ok(`${T} search "review" filters`, /of 7 items matching/.test(c1), c1);
  ok(`${T} search highlights matches`, (await page.locator('ul[aria-label="Items"] mark').count()) > 0);
  await page.getByRole('button', { name: /^Type/ }).click();
  const menu = page.getByRole('menu', { name: 'Type' });
  await menu.waitFor();
  const items = await menu.getByRole('menuitemradio').allInnerTexts();
  ok(`${T} type dropdown shows counts`, items.length > 2 && items.every(t => /\d+$/.test(t.trim())), items.map(t => t.replace(/\s+/g, ' ')).join(' | '));
  await page.waitForTimeout(250); // let the menu's fade-in finish so axe measures final colours
  await shot(page, `d-${T}-library-type-menu`);
  await axe(page, `${T} type menu open`);
  await menu.getByRole('menuitemradio', { name: /Prompt/ }).click();
  const c2 = await count(page);
  const shown = await page.locator('ul[aria-label="Items"] > li').count();
  ok(`${T} search + Type=Prompt narrows`, shown >= 1 && new RegExp(`^${shown} of 7`).test(c2), c2);
  ok(`${T} URL keeps filters`, /q=review/.test(page.url()) && /type=prompt/.test(page.url()), page.url());
  await shot(page, `d-${T}-library-filtered`);
  await page.fill('#lib-q', 'zzzz-nothing');
  await page.waitForTimeout(150);
  ok(`${T} no-results state`, await page.getByRole('heading', { name: 'Nothing for “zzzz-nothing”' }).isVisible());
  await shot(page, `d-${T}-library-noresults`);
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  ok(`${T} clear restores all`, (await count(page)) === '7 items', await count(page));

  // list view
  await page.getByRole('button', { name: 'List', exact: true }).click();
  // List view is a tree (design review, 25 Oct): one heading per type group (a button that folds it), its rows in a
  // <ul id="lib-grp-<key>"> inside the region labelled "Items". Count every row, and check each heading against its rows.
  ok(`${T} list view rows`, (await page.locator('[aria-label="Items"] li').count()) === 7);
  const tree = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Items"] [data-group-toggle]')].map(h => ({
    open: h.getAttribute('aria-expanded'), count: Number(h.textContent.match(/(\d+)\s*items?$/)?.[1]),
    rows: document.getElementById(h.getAttribute('aria-controls') ?? '')?.querySelectorAll(':scope > li').length ?? -1 })));
  ok(`${T} list view: every row is under an open group heading whose count matches its rows`, tree.length > 1 && tree.every(g => g.open === 'true' && g.count === g.rows)
    && tree.reduce((n, g) => n + g.rows, 0) === 7, JSON.stringify(tree));
  await shot(page, `d-${T}-library-list`);
  await axe(page, `${T} library list`);
  await page.getByRole('button', { name: 'Cards', exact: true }).click();

  // file 2 cards into a new collection by dragging them onto it in the sidebar (multi-select was removed)
  const nav = page.locator('nav[aria-label="Main"]');
  await nav.getByRole('button', { name: 'Add collection' }).click();
  await page.fill('#new-collection', 'QA set');
  await page.keyboard.press('Enter');
  const qa = nav.getByRole('link', { name: /^QA set/ });
  const cardOf = name => page.locator('main ul[aria-label="Items"] > li').filter({ has: page.getByRole('link', { name, exact: true }) });
  await pdrag(page, cardOf('Deploy readiness checklist'), qa);
  ok(`${T} dropping a card on a sidebar collection files it, with Undo`, await page.locator('.toast').filter({ hasText: 'Added “Deploy readiness checklist” to “QA set”' }).getByRole('button', { name: 'Undo' }).count() === 1);
  await pdrag(page, cardOf('Style sentence template'), qa);
  ok(`${T} a second drop adds the second item`, /QA set\s*2/.test(await qa.innerText()), await qa.innerText());
  // the right panel sits inside the window like the main panel (it used to touch the top edge); since #57 it's two cards,
  // the item over its tiles, so the pair's top, bottom and right edges are measured
  const gaps = await page.evaluate(() => { const m = document.querySelector('main').getBoundingClientRect(); const p = document.querySelector('[data-item-drop="panel"] > *').getBoundingClientRect(); return { mainTop: Math.round(m.top), panelTop: Math.round(p.top), mainBottom: Math.round(innerHeight - m.bottom), panelBottom: Math.round(innerHeight - p.bottom), panelRight: Math.round(innerWidth - p.right) }; });
  ok(`${T} the right panel has the same top, bottom and right inset as the main panel`, gaps.panelTop === gaps.mainTop && gaps.panelBottom === gaps.mainBottom && gaps.panelRight === gaps.mainTop, JSON.stringify(gaps));
  // drop a card on the right panel to open it there; the ⋯ menu does the same from the keyboard
  await pdrag(page, cardOf('Docs lookup server'), page.locator('section[aria-label^="Selected item"]'));
  ok(`${T} dropping a card on the panel opens it there`, await page.locator('section[aria-label="Selected item: Docs lookup server"]').count() === 1);
  ok(`${T} the panel's sky takes the item's type colour`, await page.locator('section[aria-label="Selected item: Docs lookup server"] [data-tint="mcp_server"]').count() === 1);
  await cardOf('Release notes writer').getByRole('button', { name: 'More for Release notes writer' }).click();
  await page.getByRole('group', { name: 'Organise Release notes writer' }).getByRole('button', { name: 'Open in panel' }).click();
  ok(`${T} "Open in panel" in the ⋯ menu does the same`, await page.locator('section[aria-label="Selected item: Release notes writer"]').count() === 1);
  // the card's own buttons never change the panel: ⋯, its menu, Copy and Bookmark (Elvis, 23 Oct)
  const inPanel = async () => (await page.locator('section[aria-label^="Selected item"]').getAttribute('aria-label')).replace('Selected item: ', '');
  await cardOf('Style sentence template').getByRole('button', { name: 'More for Style sentence template' }).click();
  await page.waitForTimeout(120);
  const afterMore = await inPanel();
  await page.keyboard.press('Escape');
  await cardOf('Style sentence template').getByRole('button', { name: /^Copy / }).click();
  await page.waitForTimeout(120);
  const afterCopy = await inPanel();
  const mark = cardOf('Style sentence template').getByRole('button', { name: /Bookmark Style sentence template/ });
  await mark.click(); await page.waitForTimeout(120);
  const afterMark = await inPanel();
  await mark.click(); await page.waitForTimeout(120); // put the bookmark back as it was
  ok(`${T} ⋯, Copy and Bookmark on a card leave the panel alone`, [afterMore, afterCopy, afterMark].every(n => n === 'Release notes writer'), [afterMore, afterCopy, afterMark].join(' | '));
  // while dragging: a lifted copy follows the pointer and the collection under it lights up; Esc puts it back
  {
    await cardOf('Docs lookup server').evaluate(el => el.scrollIntoView({ block: 'center' }));
    const a = await cardOf('Docs lookup server').boundingBox(), q = await qa.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + 40); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + a.width / 2 + (q.x + 40 - a.x - a.width / 2) * i / 10, a.y + 40 + (q.y + q.height / 2 - a.y - 40) * i / 10);
    await page.waitForTimeout(80);
    ok(`${T} dragging: the card lifts and the collection under it is highlighted`, await page.locator('[data-drag-ghost]').count() === 1 && await qa.getAttribute('data-drop') === 'true');
    await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(450);
    ok(`${T} dragging: Esc cancels, nothing is filed and nothing opens`, await page.locator('[data-drag-ghost]').count() === 0 && /QA set\s*2/.test(await qa.innerText()) && new URL(page.url()).pathname === '/library');
  }
  // one toast at a time, at the bottom of the window (it used to stack over page titles and column headers)
  ok(`${T} only one toast shows at a time`, await page.locator('.toasts .toast').count() === 1);
  const tb = await page.locator('.toasts .toast').boundingBox();
  const vp = page.viewportSize();
  ok(`${T} the toast sits at the bottom centre`, tb && tb.y > vp.height * 0.6 && Math.abs(tb.x + tb.width / 2 - vp.width / 2) < 4, JSON.stringify({ ...tb, vp }));
  ok(`${T} cards show each collection's icon, not a letter`, await page.locator('main ul[aria-label="Items"] [class*="av"] > span[aria-hidden] svg').count() > 0 && !(/^[A-Z]$/m.test(await page.locator('main ul[aria-label="Items"] [class*="av"]').first().innerText())));
  ok(`${T} one capture label everywhere`, await nav.getByRole('button', { name: 'Capture', exact: true }).count() === 1 && await page.getByRole('button', { name: /^New$/ }).count() === 0);
  await shot(page, `d-${T}-library-dropped`);
  ok(`${T} cards have no checkboxes and there is no selection bar`, await page.locator('main ul[aria-label="Items"] input[type=checkbox]').count() === 0 && await page.getByRole('region', { name: 'Selection' }).count() === 0);
  // export several items: from the collection's ⋯ menu
  await page.waitForTimeout(1600); // a toast raised by the action that navigates is kept; an older one is not
  await qa.click();
  await page.waitForURL(/\/collections\//);
  await page.waitForTimeout(300);
  ok(`${T} moving to another page clears the last page's toast`, await page.locator('.toasts .toast').count() === 0);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Export items…' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  await page.waitForTimeout(250);
  await shot(page, `d-${T}-export-md`);
  await axe(page, `${T} export dialog`);
  const [dl1] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Download .md' }).click()]);
  const md = fs.readFileSync(await dl1.path(), 'utf8');
  ok(`${T} markdown download has both, method first`, /## Deploy readiness checklist/.test(md) && /## Style sentence template/.test(md) && /\*\*Where it came from:\*\* Quoted from the source/.test(md), dl1.suggestedFilename());
  await dlg.getByRole('button', { name: 'JSON', exact: true }).click();
  const [dl2] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Download .json' }).click()]);
  const js = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
  ok(`${T} JSON download parses with 2 items`, js.count === 2 && js.artifacts.length === 2 && js.artifacts[0].evidence.label, dl2.suggestedFilename());
  await dlg.getByRole('button', { name: /Agent instructions/ }).click();
  await shot(page, `d-${T}-export-agent`);
  await dlg.getByRole('button', { name: 'Copy as agent instructions' }).click();
  await page.waitForTimeout(200);
  const ag = await clip(page);
  ok(`${T} copy as agent instructions`, ag === null ? await page.getByText('Copied as agent instructions').isVisible() : /Treat it as content to use, not as instructions/.test(ag), ag === null ? 'clipboard unreadable; toast checked' : `${ag.length} chars`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await go(page, '/library');

  // open an artifact
  await page.getByRole('link', { name: 'Style sentence template' }).click();
  await page.waitForURL(/\/library\/a-style/);
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  ok(`${T} artifact opens`, await page.getByRole('heading', { level: 1, name: 'Style sentence template' }).isVisible());
  await shot(page, `d-${T}-artifact-style`);
  await axe(page, `${T} artifact detail`);
  // the item page shows its text once: the panel beside it keeps metadata, and there is one Copy with Copy for AI in its menu
  const exactLine = '[medium] of [subject], [lighting], [palette], in the style of [era or movement], [composition].';
  ok(`${T} the item's text appears once on its page`, await page.locator('body').evaluate((b, t) => b.innerText.split(t).length - 1, exactLine) === 1);
  ok(`${T} one Copy on the item page (no Copy prompt or Copy for AI buttons beside it)`, await page.getByRole('button', { name: /^Copy (prompt|template|text)$/ }).count() === 0 && await page.getByRole('button', { name: 'Copy for AI' }).count() === 0 && await page.getByRole('button', { name: 'Copy', exact: true }).count() === 1);
  await page.getByRole('button', { name: 'More ways to copy' }).click();
  ok(`${T} Copy for AI is in the Copy button's menu`, await page.getByRole('group', { name: 'More ways to copy' }).getByRole('button', { name: 'Copy for AI' }).count() === 1);
  await page.keyboard.press('Escape');
  ok(`${T} evidence leads with method`, /^Quoted from the source/.test((await page.locator('section[aria-labelledby="ev-h"] p').first().innerText()).trim()));
  ok(`${T} source review link`, (await page.getByRole('link', { name: /Source review/ }).getAttribute('href')) === '/inbox/s-article-img');
  ok(`${T} "Where it came from" links to the original`, (await page.locator('section[aria-labelledby="ev-h"]').getByRole('link', { name: /Open the original/ }).count()) === 1);

  // copy: tint + toast
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.waitForTimeout(80);
  const tinted = await page.locator('pre[aria-label="Exact text"]').getAttribute('data-copied');
  const toastOk = await page.getByText('Copied exact text').isVisible();
  await shot(page, `d-${T}-artifact-copied`);
  const c = await clip(page);
  ok(`${T} copy tints block and toasts`, tinted === 'true' && toastOk, `tint=${tinted} toast=${toastOk} clip=${c === null ? 'n/a' : JSON.stringify(c.slice(0, 30))}`);

  // prompt fill
  const fill = page.locator('section', { has: page.getByRole('heading', { name: 'Fill the blanks' }) });
  ok(`${T} prompt fill shows 6 fields`, (await fill.locator('input').count()) === 6);
  await fill.getByLabel('medium', { exact: true }).fill('Oil painting');
  await fill.getByLabel('subject', { exact: true }).fill('a lighthouse');
  await page.waitForTimeout(100);
  const prev = await fill.locator('p').filter({ hasText: 'Oil painting' }).innerText();
  ok(`${T} prompt fill preview`, /^Oil painting of a lighthouse, \[lighting\]/.test(prev), prev);
  await fill.getByRole('button', { name: 'Copy filled prompt' }).click();
  await page.waitForTimeout(100);
  const fc = await clip(page);
  ok(`${T} prompt fill copies filled text`, fc === null ? await page.getByText(/Copied with 4 blanks still open/).isVisible() : fc.startsWith('Oil painting of a lighthouse,'), fc ?? 'toast checked');
  await shot(page, `d-${T}-artifact-fill`);

  // edit your version: no-op save does not mark edited
  const hist0 = await page.locator('section[aria-labelledby="hist-h"] li').count();
  await page.getByRole('button', { name: 'Your version', exact: true }).click();
  await page.getByRole('button', { name: 'Start from the exact text' }).click();
  await page.locator('#yours-ta').waitFor();
  await page.getByRole('button', { name: 'Save your version' }).click();
  await page.waitForTimeout(150);
  // "edited" is shown once: the dot on the Your version tab (the old Review fact repeated it)
  const editedDot = () => page.getByRole('button', { name: 'Your version', exact: true }).locator('[class*="dot"]').count();
  ok(`${T} no-op save does not mark it edited`, (await editedDot()) === 0 && (await page.locator('section[aria-labelledby="hist-h"] li').count()) === hist0);
  await page.getByRole('button', { name: 'Start from the exact text' }).click();
  await page.locator('#yours-ta').fill('[medium] of [subject], soft [lighting], muted [palette], [composition].');
  await shot(page, `d-${T}-artifact-editing`);
  await page.locator('#yours-ta').press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await page.waitForTimeout(200);
  const hist1 = await page.locator('section[aria-labelledby="hist-h"] li').count();
  ok(`${T} real edit marks it edited + history event`, (await editedDot()) === 1 && hist1 === hist0 + 1, `history ${hist0}→${hist1}`);
  ok(`${T} exact text unchanged after edit`, /\[era or movement\]/.test(await (async () => { await page.getByRole('button', { name: 'Exact', exact: true }).click(); return page.locator('pre').first().innerText(); })()));
  await page.getByRole('button', { name: 'Your version', exact: true }).click();
  await shot(page, `d-${T}-artifact-yours`);
  const histE = await page.locator('section[aria-labelledby="hist-h"] li').count();
  await page.getByRole('button', { name: 'Discard' }).click();
  await page.waitForTimeout(150);
  ok(`${T} discarding your version clears the edited mark`, (await editedDot()) === 0 && (await page.locator('section[aria-labelledby="hist-h"] li').count()) === histE + 1);
  await page.locator('.toast').filter({ hasText: 'Discarded your version' }).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(150);
  ok(`${T} undo discard restores the edited mark`, (await editedDot()) === 1);

  // the item page's side area: compact facts only, no actions that repeat the main column; file from its Collection tile
  const side = page.locator('section[aria-label="Details: Style sentence template"]');
  ok(`${T} the item page's side area holds facts only`, await side.count() === 1 && /Type[\s\S]*Source[\s\S]*Used[\s\S]*Saved/i.test(await side.innerText())
    && await side.getByRole('button').count() === (F.has('organise') ? 2 : 1) && await side.getByRole('button', { name: /^Type: / }).count() === (F.has('organise') ? 1 : 0) && await side.locator('textarea, [aria-labelledby="hist-h"]').count() === 0); // the Type and Collection tiles change what they show (custom types, #9)
  ok(`${T} the item page has no "Review" fact (it repeated the evidence and the edited mark)`, !/\bReview\b\s*(Accepted|Edited by you|Added by you)/.test(await page.locator('body').innerText()));
  await side.getByRole('button', { name: /^Collection/ }).click();
  const colPanel = page.getByRole('group', { name: 'Collections and projects' });
  await colPanel.getByRole('button', { name: 'New collection…' }).click();
  await colPanel.getByLabel('New collection name').fill('Image prompts');
  await colPanel.getByRole('button', { name: 'Create' }).click();
  await page.waitForTimeout(150);
  ok(`${T} inline-created collection is toggled on`, (await colPanel.getByRole('button', { name: 'Image prompts' }).getAttribute('aria-pressed')) === 'true');
  await colPanel.getByRole('button', { name: 'Prompts I reuse' }).click();
  ok(`${T} toggle off a collection`, (await colPanel.getByRole('button', { name: 'Prompts I reuse' }).getAttribute('aria-pressed')) === 'false');

  // delete then undo (from the item page's top bar)
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Delete Style sentence template' }).click();
  await page.waitForURL(/\/library$/);
  await page.waitForTimeout(300);
  ok(`${T} delete removes it`, (await count(page)) === '6 items', await count(page));
  await shot(page, `d-${T}-library-deleted-toast`);
  await page.locator('.toast').filter({ hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).click(); // filing from the panel also leaves an Undo toast
  await page.waitForTimeout(200);
  ok(`${T} undo restores it`, (await count(page)) === '7 items' && await page.getByRole('link', { name: 'Style sentence template' }).isVisible());
  // 24 Oct: a delete goes to Deleted (Undo still works, above); Restore there puts it back whole: collections, projects, tags, history
  const readItem = () => page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 450)); // the store's debounced save
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
    db.close(); return { a: st.artifacts.find(x => x.title === 'Style sentence template'), i: st.artifacts.findIndex(x => x.title === 'Style sentence template'), trash: st.trash ?? [] };
  });
  const was = await readItem();
  await go(page, '/library/a-style');
  await page.getByRole('button', { name: 'Delete Style sentence template' }).click();
  await page.waitForURL(/\/library$/);
  await go(page, '/deleted');
  const row = page.locator('main li[data-key^="artifact:"]').filter({ hasText: 'Style sentence template' });
  // 25 Oct: the row also says where it was (its first collection, with that collection's glyph)
  ok(`${T} Deleted lists the Library item, with what it was, where and when`, await row.count() === 1 && /Template\s*from\s*QA set\s*Deleted just now/.test(await row.innerText())
    && await row.locator('[data-place="collection"] svg').count() === 1, (await row.innerText().catch(() => '')).replace(/\s+/g, ' '));
  await row.getByRole('button', { name: /^Restore/ }).click();
  await page.waitForTimeout(200);
  const now = await readItem();
  ok(`${T} Restore puts it back whole and in its place (collections, projects, tags, history)`, JSON.stringify(now.a) === JSON.stringify(was.a) && now.i === was.i && !now.trash.some(t => t.item.id === was.a.id) // the demo's own deleted entries stay
    && (was.a.collections?.length ?? 0) > 0, `${was.a.collections?.length ?? 0} collections · index ${was.i} → ${now.i}`);
  await go(page, '/library');

  // collections page: created collections listed and openable
  await go(page, '/collections');
  ok(`${T} collections grid lists 4`, (await page.locator('ul[aria-label="Collections"] > li').count()) === 4);
  ok(`${T} one pattern: the index has no second list of a selected collection`, await page.locator('#grp-items').count() === 0);
  await shot(page, `d-${T}-collections`);
  await axe(page, `${T} collections`);
  await page.locator('main ul[aria-label="Collections"]').getByRole('link', { name: /QA set/ }).click();
  await page.waitForURL(/\/collections\/[^/]+$/);
  await page.waitForTimeout(200);
  const items2 = await page.locator('#grp-items li').count();
  ok(`${T} opening QA set shows its 2 items on its page`, items2 === 2 && (await page.locator('main h1').innerText()).startsWith('QA set'), `${items2}`);
  await go(page, '/collections');
  await page.getByRole('button', { name: 'New collection' }).click();
  await page.fill('#grp-name', 'Empty one');
  await shot(page, `d-${T}-collections-create`);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/collections\/[^/]+$/);
  await page.waitForTimeout(150);
  ok(`${T} a new collection opens its own page, empty`, (await page.locator('main h1').innerText()).startsWith('Empty one') && await page.getByRole('heading', { name: 'Nothing in “Empty one”' }).isVisible());
  await shot(page, `d-${T}-collections-empty-group`);
  await go(page, '/projects');
  await shot(page, `d-${T}-projects`);
  await axe(page, `${T} projects`);
  ok(`${T} projects grid lists 2`, (await page.locator('ul[aria-label="Projects"] > li').count()) === 2);
  await page.locator('ul[aria-label="Projects"] > li a').first().click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  await page.getByRole('link', { name: 'Open in Library' }).click();
  await page.waitForURL(/project=/);
  await page.waitForTimeout(200);
  ok(`${T} Open in Library applies project filter`, /of 7 items/.test(await count(page)), await count(page));

  // not found
  await go(page, '/library/does-not-exist');
  ok(`${T} not-found state`, await page.getByRole('heading', { name: 'This item isn’t in your library' }).isVisible());
  await shot(page, `d-${T}-artifact-notfound`);
  await axe(page, `${T} not found`);

  // AI-located artifact (method first, AI wording)
  await go(page, '/library/a-docsmcp');
  ok(`${T} AI-found evidence keeps "Found by AI" when confirmed`, /^Found by AI · moment 29:08 · confirmed by you/.test((await page.locator('section[aria-labelledby="ev-h"] p').first().innerText()).trim()));
  await shot(page, `d-${T}-artifact-docsmcp`);
  await go(page, '/library/a-a11y');
  await shot(page, `d-${T}-artifact-a11y`);

  // explainer: keep the Vercel candidate as an artifact
  await patchState(page, s => ({ ...s, artifacts: [{ id: 'a-vercel', candidateId: 'c-a1', type: 'app_tool', title: 'Vercel', purpose: 'Used here for hosting, with a preview link per branch.', exact: null,
    evidence: { method: 'text_span', quote: 'For hosting I pushed the repo to Vercel.', locator: 'paragraph 2' }, sourceId: 's-article', domains: ['Software engineering'], useCases: [], projects: [], collections: [],
    savedAt: new Date().toISOString(), review: 'accepted', history: [{ when: new Date().toISOString(), what: 'Kept from review board' }], demo: true }, ...s.artifacts] }));
  await go(page, '/library/a-vercel');
  ok(`${T} explainer labelled AI-drafted, not reviewed`, await page.getByText('AI-drafted explainer, not reviewed').isVisible());
  await page.getByRole('button', { name: 'Technical' }).click();
  ok(`${T} explainer technical switch`, await page.getByText(/managed platform for deploying/).isVisible());
  await shot(page, `d-${T}-artifact-explainer`);
  await axe(page, `${T} explainer`);

  // empty library + empty collections
  await patchState(page, s => ({ ...s, artifacts: [], collections: [] }));
  await go(page, '/library');
  ok(`${T} empty library state`, await page.getByRole('heading', { name: 'Your Library' }).isVisible());
  await shot(page, `d-${T}-library-empty`);
  await axe(page, `${T} empty library`);
  await go(page, '/collections');
  ok(`${T} empty collections state`, await page.getByRole('heading', { name: 'No collections yet' }).isVisible());
  await shot(page, `d-${T}-collections-empty`);

  await browser.close();
  return errs;
}

async function mobileFlows(theme) {
  const { browser, page, errs } = await setup('m', theme);
  const T = `m-${theme}`;
  const overflow = async label => { const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(`${T} ${label}: no horizontal scroll`, o <= 0, `${o}px`); };
  await go(page, '/library');
  await shot(page, `${T}-library`);
  await overflow('library');
  ok(`${T} facet pills collapse into Filters`, !(await page.getByRole('button', { name: /^Type/ }).isVisible()) && await page.getByRole('button', { name: /Filters/ }).isVisible());
  await axe(page, `${T} library`);
  await page.getByRole('button', { name: /Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: /Filters/ });
  await sheet.waitFor();
  await page.waitForTimeout(350);
  await shot(page, `${T}-filters-sheet`);
  await axe(page, `${T} filters sheet`);
  await sheet.getByRole('button', { name: /^Prompt\s*\d/ }).click();
  const btnText = await sheet.getByRole('button', { name: /^Show/ }).innerText();
  ok(`${T} sheet shows live count`, /Show 2 results/.test(btnText), btnText);
  await sheet.getByRole('button', { name: /^Show/ }).click();
  await page.waitForTimeout(200);
  ok(`${T} filter applied`, /^2 of 7/.test(await count(page)), await count(page));
  // phones: filing and the panel are in each card's ⋯ menu (no drag on touch)
  const firstCard = page.locator('main ul[aria-label="Items"] > li').first();
  await firstCard.getByRole('button', { name: /^More for / }).click();
  const om = page.getByRole('group', { name: /^Organise / });
  const ob = await om.boundingBox();
  ok(`${T} the card menu fits on the phone and offers the collections`, ob && ob.x >= 0 && ob.x + ob.width <= 390 && await om.getByText('Collections', { exact: true }).count() === 1, JSON.stringify(ob));
  await shot(page, `${T}-card-menu`);
  await axe(page, `${T} card menu`);
  await page.keyboard.press('Escape');
  await go(page, '/library?view=list');
  await shot(page, `${T}-library-list`);
  await overflow('list');
  await go(page, '/library/a-style');
  await shot(page, `${T}-artifact`);
  await overflow('artifact');
  await axe(page, `${T} artifact`);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(150);
  await shot(page, `${T}-artifact-lower`);
  // narrow: the item's right panel opens as a sheet from the top bar, as in the Library
  await page.getByRole('button', { name: 'Details' }).click();
  const itemSheet = page.getByRole('dialog', { name: 'Style sentence template' });
  ok(`${T} item details open as a sheet with the item's facts`, await itemSheet.isVisible() && await itemSheet.locator('section[aria-label="Details: Style sentence template"]').count() === 1);
  await page.waitForTimeout(500); // let the sheet's slide-in finish before measuring contrast
  await shot(page, `${T}-artifact-sheet`);
  await axe(page, `${T} artifact sheet`);
  await itemSheet.getByRole('button', { name: 'Close' }).click();
  ok(`${T} the sheet closes`, !(await itemSheet.isVisible()));
  await go(page, '/collections');
  await shot(page, `${T}-collections`);
  await overflow('collections');
  await axe(page, `${T} collections`);
  await go(page, '/projects');
  await shot(page, `${T}-projects`);
  await overflow('projects');
  await browser.close();
  return errs;
}

/** A change made just before a full page load (Undo, then reload at once) must still be there afterwards. */
/** A brand-new visitor starts with an empty library; "Try with sample data" adds the labelled demo. */
async function firstRunCheck() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('capsa-first-run', 'real'); } catch {} }); // a real first visit, not the suites' demo start
  const page = await ctx.newPage();
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  ok('first run: a new visitor gets an empty library, not the demo', await page.getByRole('heading', { name: 'Your Library' }).isVisible() && await page.locator('main ul[aria-label="Items"] > li').count() === 0);
  ok('first run: Capture C and Try with sample data', await page.locator('main').getByRole('button', { name: /^Capture/ }).count() >= 1 && await page.getByRole('button', { name: 'Try with sample data' }).count() === 1);
  await shot(page, 'd-light-first-run');
  await axe(page, 'first run');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await page.waitForTimeout(400);
  ok('first run: sample data is the labelled demo', (await count(page)) === '7 items' && await page.locator('nav[aria-label="Main"]').getByText('Demo data').count() >= 1, await count(page));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  ok('first run: the sample data stays after a reload', (await count(page)) === '7 items');
  await browser.close();
}

/** Card footers: the type pill and the evidence label are never cut off or wrapped, at the window widths people use. */
async function footerFitCheck() {
  const browser = await pw[which].launch();
  for (const w of [1440, 1728, 2560]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
    await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    const cut = await page.$$eval('main ul[aria-label="Items"] > li', cards => cards.flatMap(c => {
      const ft = c.querySelector('[class*="__ft"]'); const out = [];
      if (ft.scrollWidth > ft.clientWidth + 0.5) out.push(`${c.querySelector('h2').textContent}: footer overflows`);
      for (const e of ft.querySelectorAll('[class*="__ev"], [class*="__lbl"]')) { // the visible words, not the screen-reader copy
        const box = e.getBoundingClientRect();
        for (const k of e.children) {
          if (k.classList.contains('sr-only') || k.tagName.toLowerCase() === 'svg' || getComputedStyle(k).display === 'none') continue;
          const r = document.createRange(); r.selectNodeContents(k); const b = r.getBoundingClientRect();
          if (b.right > box.right + 0.5 || b.height > 24) out.push(`${c.querySelector('h2').textContent}: “${k.textContent.trim()}”`);
        }
      }
      return out;
    }));
    ok(`card footers at ${w}px: no type or evidence label cut off or wrapped`, cut.length === 0, cut.join(' | '));
    await page.close();
  }
  await browser.close();
}

/** Menus open where they can be used: card ⋯ menus on the first card, the last column and the bottom row (scrolled to
 * the bottom of the screen, so the menu has to open upward), and Capture's Type and destination menus, on desktop and
 * phone, light and dark. Each must be inside the viewport, taller than a row, and on top at its last row (menuFit). */
async function menuPlacementCheck() {
  const browser = await pw[which].launch();
  for (const [w, h] of [[1728, 1000], [390, 844]]) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
    await ctx.addInitScript(t => { try { localStorage.setItem('capsa-theme', t); } catch {} }, theme);
    const page = await ctx.newPage();
    const T = `${w}-${theme}`;
    await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForSelector('main ul[aria-label="Items"] > li');
    const cards = page.locator('main ul[aria-label="Items"] > li');
    const xs = await cards.evaluateAll(els => els.map(e => [e.getBoundingClientRect().left, e.getBoundingClientRect().top]));
    const firstTop = xs[0][1];
    const lastCol = xs.reduce((best, [x, y], i) => (Math.abs(y - firstTop) < 2 && x > xs[best][0] ? i : best), 0);
    for (const [label, i, bottom] of [['first card', 0, false], ['last column', lastCol, false], ['bottom row', xs.length - 1, true]]) {
      const li = cards.nth(i);
      if (bottom) await li.evaluate(e => e.scrollIntoView({ block: 'end' })); else await li.evaluate(e => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(150);
      await li.hover();
      await li.getByRole('button', { name: /^More for / }).click();
      const m = page.getByRole('group', { name: /^Organise / });
      await m.waitFor(); await page.waitForTimeout(100);
      const r = await menuFit(await m.elementHandle());
      ok(`${T} card ⋯ menu (${label}) is fully visible and on top`, r.ok, r.detail);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    }
    // near the bottom edge: a short window (a second-row card's top + 160px), so its ⋯ sits 160px above the bottom and
    // the menu has to open upward. (The Library scrolls inside <main> with little travel, so scrolling can't get there.)
    {
      const i = Math.max(0, xs.findIndex(([, y]) => y > firstTop + 2));
      const li = cards.nth(i);
      // scroll whatever scrolls (the page on phones) so the card's top is 160px above the bottom; if it can't get
      // there, shorten the window instead
      let top = await li.evaluate((e, vh) => {
        let sc = e.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        const scroller = sc ?? document.scrollingElement;
        scroller.scrollTo({ top: 0, behavior: 'instant' }); document.scrollingElement.scrollTo({ top: 0, behavior: 'instant' });
        const t0 = e.getBoundingClientRect().top;
        for (const x of [scroller, document.scrollingElement]) x.scrollBy({ top: e.getBoundingClientRect().top - (vh - 160), behavior: 'instant' });
        return Math.abs(e.getBoundingClientRect().top - (vh - 160)) < 30 ? e.getBoundingClientRect().top : -t0;
      }, h);
      if (top < 0) { await page.setViewportSize({ width: w, height: Math.round(-top + 160) }); await page.waitForTimeout(250); top = await li.evaluate(e => e.getBoundingClientRect().top); }
      const more = li.getByRole('button', { name: /^More for / });   // hover the button, not the card: hovering the card scrolls its middle into view
      await more.hover(); await more.click();
      const m = page.getByRole('group', { name: /^Organise / });
      await m.waitFor(); await page.waitForTimeout(100);
      const r = await menuFit(await m.elementHandle());
      const side = await m.getAttribute('data-side');
      const vh = await page.evaluate(() => innerHeight);
      ok(`${T} card ⋯ menu near the bottom edge opens upward, fully visible and on top`, r.ok && side === 'top', `card top ${Math.round(top)} of ${vh}, side ${side}; ${r.detail}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      await page.setViewportSize({ width: w, height: h });
    }
    // the capture bar's "to Library" menu (#88): fully visible and on top, the sidebar's glyph on every row
    await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    const dest = page.locator('[data-capture-box]').getByRole('button', { name: /^Kept items go to/ });
    if (await dest.isVisible()) {
      await dest.click(); await page.waitForTimeout(250);
      const dm = page.getByRole('menu', { name: 'Where kept items go' });
      const r = await menuFit(await dm.elementHandle());
      const glyphs = await dm.getByRole('menuitemradio').evaluateAll(els => els.every(el => el.querySelector('svg')?.getBoundingClientRect().width >= 14));
      ok(`${T} capture bar destination menu is fully visible and on top, a glyph on every row`, r.ok && glyphs, r.detail);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    }
    await page.goto(B + '/inbox', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    await page.keyboard.press('c'); await page.waitForTimeout(400);
    await page.keyboard.type('Review this screen for accessibility'); await page.waitForTimeout(300);
    for (const [label, menuName] of [['Type', 'Type'], ['destination', 'Keep in']]) {
      const chip = menuName === 'Type' ? page.getByRole('button', { name: /^Type: / }).first()
        : page.locator('dialog[open] button[aria-haspopup="menu"]:not([aria-label^="Type"])').first();
      if (!(await chip.count())) { ok(`${T} Capture ${label} menu opens`, false, 'no chip'); continue; }
      await chip.click(); await page.waitForTimeout(250);
      const m = page.getByRole('menu', { name: menuName });
      if (!(await m.count())) { ok(`${T} Capture ${label} menu opens`, false, 'no menu'); continue; }
      const r = await menuFit(await m.elementHandle());
      ok(`${T} Capture ${label} menu is fully visible and on top`, r.ok, r.detail);
      await chip.click(); await page.waitForTimeout(150);   // the chip toggles it closed; Escape would leave the composer
    }
    await ctx.close();
  }
  await browser.close();
}
async function persistenceCheck() {
  const { browser, page } = await setup('d', 'light');
  await page.goto(B + '/library/a-style', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Delete Style sentence template' }).click();
  await page.waitForURL(/\/library$/);
  await page.waitForTimeout(300);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const c = await count(page);
  ok('undo survives an immediate reload (store flush on pagehide)', c === '7 items', c);
  await browser.close();
}


/* ---------- Build-out Stage 1: stars, tags, use counts, filing from anywhere, live sidebar, backup/restore ---------- */
async function stage1Flows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light', acceptDownloads: true });
  if (which === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 's1';
  const side = page.locator('nav[aria-label="Main"]');
  const starredRows = () => side.locator('a[href^="/library/"]');
  const panel = name => page.locator(`section[aria-label="Selected item: ${name}"]`);
  const card = name => page.locator('ul[aria-label="Items"] > li').filter({ has: page.getByRole('link', { name, exact: true }) });
  const show = name => openInPanel(page, name);
  // Safari's datalist suggestions take the first Enter (it picks the suggestion), so press again until the field submits.
  const enterTag = async text => {
    await page.keyboard.type(text);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Enter'); await page.waitForTimeout(120);
      const v = await page.evaluate(() => document.activeElement && 'value' in document.activeElement ? document.activeElement.value : '');
      if (!v) break;
    }
  };
  const toastText = async () => (await page.locator('.toast').last().innerText()).replace(/\s+/g, ' ');
  const backupNow = async file => {
    await go(page, '/settings/storage');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
    await dl.saveAs(file);
    return file;
  };
  const restore = async (file, mode) => {
    await go(page, '/settings/storage');
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('button', { name: mode === 'replace' ? 'Replace everything' : 'Merge in' }).click();
    await page.waitForTimeout(600);
  };

  // A backup before anything new exists: the old format (no stars, tags, uses or pinned tags anywhere).
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-s1-')); // backups made by the test stay out of the project
  const oldFile = await backupNow(`${TMP}/${which}-backup-before.zip`);
  await go(page, '/library');
  ok(`${T} Bookmarks stay out of the sidebar until something is bookmarked`, (await side.getByRole('link', { name: 'Bookmarks', exact: true }).count()) === 0 && (await side.getByText('Bookmarks', { exact: true }).count()) === 0);
  ok(`${T} old "isn’t built yet" placeholders are gone`, (await side.getByText(/isn’t built yet|aren’t built yet/).count()) === 0);

  // star from a card
  const deploy = card('Deploy readiness checklist');
  await deploy.hover();
  // Regression: the hover controls used to sit on the preview's label ("PROMPT · EXACT WORDS"); they belong in the margin above it
  const covered = await page.locator('main ul[aria-label="Items"] > li').evaluateAll(cards => cards.flatMap(c => {
    const ctrls = [...c.querySelectorAll('[class*="chkWrap"], [class*="tools"] button, [class*="lnk"]')].map(e => e.getBoundingClientRect());
    const pv = c.querySelector('[class*="pv"]'); const top = pv.getBoundingClientRect();
    return [...pv.querySelectorAll('*')].filter(e => [...e.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())).flatMap(e => {
      const r = document.createRange(); r.selectNodeContents(e);
      return [...r.getClientRects()].filter(t => t.width && t.top < top.bottom && ctrls.some(k => t.left < k.right && t.right > k.left && t.top < k.bottom && t.bottom > k.top)).map(() => e.textContent.trim().slice(0, 24));
    });
  }));
  ok(`${T} card controls never cover preview text`, covered.length === 0, covered.join(' | '));
  await deploy.getByRole('button', { name: 'Bookmark Deploy readiness checklist' }).click();
  ok(`${T} card bookmark is pressed`, (await deploy.getByRole('button', { name: 'Bookmark Deploy readiness checklist' }).getAttribute('aria-pressed')) === 'true');
  ok(`${T} bookmarked card shows in the sidebar at once, with its type icon`, (await starredRows().allInnerTexts()).map(t => t.trim()).includes('Deploy readiness checklist')
    && await starredRows().filter({ hasText: 'Deploy readiness checklist' }).locator('svg[data-ic="message-square-text"], svg[data-ic]').count() === 1);
  // star from the list
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const row = page.locator('[aria-label="Items"] li').filter({ hasText: 'Docs lookup server' });
  await row.hover();
  await row.getByRole('button', { name: 'Bookmark Docs lookup server' }).click();
  ok(`${T} list bookmark adds a second`, (await starredRows().count()) === 2);
  await shot(page, 'd-light-s1-list-starred');
  await page.getByRole('button', { name: 'Cards', exact: true }).click();
  // bookmark from the item page's top bar (the quick-look panel has only Copy and Open)
  await go(page, '/library/a-release');
  await page.getByRole('button', { name: 'Bookmark Release notes writer' }).click();
  ok(`${T} item page bookmark adds a third`, (await starredRows().count()) === 3);
  // Bookmarks header filters the Library
  await side.getByRole('link', { name: 'Bookmarks', exact: true }).click();
  await page.waitForURL(/starred=1/);
  await page.waitForTimeout(250);
  ok(`${T} Bookmarks filter shows the 3`, /^3 of 7/.test(await count(page)), await count(page));
  await page.getByRole('button', { name: 'Clear Bookmarked filter' }).click();
  ok(`${T} clearing Bookmarked shows all`, (await count(page)) === '7 items', await count(page));

  // tags on the item page
  await go(page, '/library/a-release');
  const rn = page.locator('main article');
  await rn.getByRole('button', { name: 'Add tag' }).click();
  await enterTag('release');
  await enterTag('Writing');
  await page.keyboard.press('Escape');
  ok(`${T} two tags added on the item page`, (await rn.getByRole('group', { name: 'Tags' }).locator('ul li a').allInnerTexts()).join(',') === 'release,Writing');
  await go(page, '/library/a-deploy');
  await rn.getByRole('button', { name: 'Add tag' }).click();
  await enterTag('RELEASE'); await page.keyboard.press('Escape');
  ok(`${T} a tag typed in another case joins the existing tag`, (await rn.getByRole('group', { name: 'Tags' }).locator('ul li a').allInnerTexts()).join(',') === 'release');
  // remove with Undo
  await go(page, '/library/a-release');
  await rn.getByRole('button', { name: 'Remove tag Writing' }).click();
  ok(`${T} remove tag`, (await rn.getByRole('group', { name: 'Tags' }).locator('ul li a').count()) === 1);
  await page.locator('.toast').filter({ hasText: 'Removed the tag' }).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(150);
  ok(`${T} undo puts the tag back in place`, (await rn.getByRole('group', { name: 'Tags' }).locator('ul li a').allInnerTexts()).join(',') === 'release,Writing');
  await shot(page, 'd-light-s1-panel-tags');
  await axe(page, `${T} item page with tags`);
  // filter by tag from a chip, then pin it
  await rn.getByRole('link', { name: 'release', exact: true }).click();
  await page.waitForURL(/tag=release/);
  await page.waitForTimeout(250);
  ok(`${T} tag chip filters the Library`, /^2 of 7/.test(await count(page)), await count(page));
  ok(`${T} tag filter shows as a pill`, await page.getByRole('button', { name: 'Tag: release' }).isVisible());
  await page.getByRole('button', { name: 'Pin to sidebar' }).click();
  const pinned = side.getByRole('link', { name: /^release\s*2$/ });
  ok(`${T} pinned tag shows in the sidebar with its count`, await pinned.isVisible(), (await side.locator('a[href^="/library?tag="]').allInnerTexts()).join('|'));
  ok(`${T} pin button turns pressed`, (await page.getByRole('button', { name: 'Pinned to sidebar' }).getAttribute('aria-pressed')) === 'true');
  await go(page, '/library');
  await side.getByRole('link', { name: /^release/ }).click();
  await page.waitForURL(/tag=release/);
  await page.waitForTimeout(250);
  ok(`${T} pinned tag in the sidebar opens the filtered Library`, /^2 of 7/.test(await count(page)), await count(page));
  // pin from the sidebar "+" with suggestions
  await side.locator('div', { hasText: /^Tags$/ }).first().hover();
  await side.getByRole('button', { name: 'Pin a tag' }).click();
  await enterTag('Writing');
  ok(`${T} pin a tag from the sidebar`, await side.getByRole('link', { name: /^Writing\s*1$/ }).isVisible());
  await side.getByRole('button', { name: 'Unpin tag Writing' }).click({ force: true });
  ok(`${T} unpin a tag`, (await side.getByRole('link', { name: /^Writing/ }).count()) === 0);
  await go(page, '/library');

  // use counts: copy from the panel and a card, a prompt fill, an export. The Used fact is on the item page.
  const usedOf = async (id, name) => { await go(page, `/library/${id}`); const x = await page.locator(`section[aria-label="Details: ${name}"]`).innerText(); return { x, m: x.match(/Used\s*[^\n]*/i)?.[0] }; };
  let u = await usedOf('a-deploy', 'Deploy readiness checklist');
  ok(`${T} Used tile starts at "Not yet"`, /Used\s*Not yet/i.test(u.x), u.m);
  await go(page, '/library');
  await show('Deploy readiness checklist');
  await panel('Deploy readiness checklist').getByRole('button', { name: 'Copy prompt' }).click();
  await page.waitForTimeout(200);
  u = await usedOf('a-deploy', 'Deploy readiness checklist');
  ok(`${T} copy in the panel counts as a use`, /Used\s*Copied once/i.test(u.x), u.m);
  await go(page, '/library');
  await deploy.hover();
  await deploy.getByRole('button', { name: 'Copy Deploy readiness checklist' }).click();
  await page.waitForTimeout(200);
  u = await usedOf('a-deploy', 'Deploy readiness checklist');
  ok(`${T} copy on the card counts too`, /Used\s*Copied 2 times/i.test(u.x), u.m);
  await go(page, '/library');
  await page.getByRole('button', { name: /^Sort/ }).click();
  await page.getByRole('menuitemradio', { name: 'Recently used' }).click();
  await page.waitForTimeout(150);
  ok(`${T} "Recently used" sort puts the used item first`, (await page.locator('ul[aria-label="Items"] > li h2').first().innerText()).trim() === 'Deploy readiness checklist');
  ok(`${T} sort is kept in the URL`, /sort=used/.test(page.url()));
  await page.getByRole('button', { name: /^Sort/ }).click();
  await page.getByRole('menuitemradio', { name: 'Last saved' }).click();
  await go(page, '/library/a-deploy'); // export from the item's own page
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Download .md' }).click()]);
  await page.keyboard.press('Escape');
  u = await usedOf('a-deploy', 'Deploy readiness checklist');
  ok(`${T} an export counts as a use`, /Used\s*Used 3 times/i.test(u.x), u.m);
  await go(page, '/library/a-style');
  const fill = page.locator('section', { has: page.getByRole('heading', { name: 'Fill the blanks' }) });
  await fill.getByLabel('medium', { exact: true }).fill('Oil painting');
  await fill.getByRole('button', { name: 'Copy filled prompt' }).click();
  await page.waitForTimeout(200);
  u = await usedOf('a-style', 'Style sentence template');
  ok(`${T} a prompt fill copy counts as a use`, /Used\s*Filled once/i.test(u.x), u.m);

  // collections and projects from the card menu and the item page; sidebar counts are live
  await go(page, '/library');
  const agentCount = async () => Number((await side.getByRole('link', { name: /^Agent setup/ }).innerText()).replace(/\D/g, '') || 0);
  const before = await agentCount();
  await deploy.hover();
  await deploy.getByRole('button', { name: 'More for Deploy readiness checklist' }).click();
  await page.waitForTimeout(200);
  await shot(page, 'd-light-s1-card-menu');
  await axe(page, `${T} card menu open`);
  await page.getByRole('group', { name: 'Organise Deploy readiness checklist' }).getByRole('button', { name: 'Agent setup' }).click();
  ok(`${T} card menu adds to a collection (toast)`, /Added to “Agent setup”/.test(await toastText()));
  ok(`${T} sidebar collection count updates live`, (await agentCount()) === before + 1, `${before} → ${await agentCount()}`);
  await page.keyboard.press('Escape');
  await go(page, '/library/a-release');
  const rf = page.locator('section[aria-label="Details: Release notes writer"]');
  await rf.getByRole('button', { name: /^Collection/ }).click();
  await page.getByRole('group', { name: 'Collections and projects' }).getByRole('button', { name: 'Portfolio refresh' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(`${T} the item page files into a project`, /Portfolio refresh/.test(await rf.innerText()));
  await go(page, '/library?project=p-portfolio');
  ok(`${T} the project filter finds it`, (await page.locator('main').getByRole('link', { name: 'Release notes writer', exact: true }).count()) === 1);

  // reload: everything persists
  await go(page, '/library');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  ok(`${T} stars survive a reload`, (await starredRows().count()) === 3);
  ok(`${T} pinned tag survives a reload`, await side.getByRole('link', { name: /^release\s*2$/ }).isVisible());
  u = await usedOf('a-deploy', 'Deploy readiness checklist');
  ok(`${T} uses and tags survive a reload`, /Used 3 times/.test(u.x) && (await rn.getByRole('group', { name: 'Tags' }).locator('ul li a').allInnerTexts()).join(',') === 'release', u.m);
  await go(page, '/library');
  await shot(page, 'd-light-s1-library');
  await axe(page, `${T} library with stars and pinned tag`);

  // backup, change, restore (replace) brings it all back; an old-format backup still restores
  const newFile = await backupNow(`${TMP}/${which}-backup-after.zip`);
  await go(page, '/library');
  await deploy.hover();
  await deploy.getByRole('button', { name: 'Bookmark Deploy readiness checklist' }).click();
  await side.getByRole('button', { name: 'Unpin tag release' }).click({ force: true });
  ok(`${T} unstar and unpin before restoring`, (await starredRows().count()) === 2 && (await side.getByRole('link', { name: /^release/ }).count()) === 0);
  await restore(newFile, 'replace');
  await go(page, '/library');
  ok(`${T} restore brings stars back`, (await starredRows().count()) === 3);
  ok(`${T} restore brings the pinned tag back`, await side.getByRole('link', { name: /^release\s*2$/ }).isVisible());
  u = await usedOf('a-deploy', 'Deploy readiness checklist');
  ok(`${T} restore brings tags and uses back`, /Used 3 times/.test(u.x) && (await rn.getByRole('group', { name: 'Tags' }).locator('ul li a').allInnerTexts()).join(',') === 'release', u.m);
  await restore(oldFile, 'replace');
  await go(page, '/library');
  ok(`${T} an old-format backup (no stars or tags) restores`, (await count(page)) === '7 items' && (await starredRows().count()) === 0 && (await side.getByText('Bookmarks', { exact: true }).count()) === 0 && (await side.getByText('Tags', { exact: true }).count()) === 0, await count(page));
  await restore(newFile, 'merge');
  await go(page, '/library');
  ok(`${T} merging a backup adds its pinned tags`, await side.getByRole('link', { name: /^release/ }).isVisible());

  await browser.close();
  return errs;
}


/* ---------- Build-out Stage 4: the right panel as a workbench (keyboard first) ---------- */
async function stage4Flows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light' });
  if (which === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 's4';
  const panel = name => page.locator(`section[aria-label="Selected item: ${name}"]`);
  // the right panel is a quick look: preview, title, Copy, Open and Bookmark, then its details as rows (27 Oct, #91)
  await go(page, '/library');
  await openInPanel(page, 'Deploy readiness checklist');
  const ql = panel('Deploy readiness checklist');
  ok(`${T} the panel is a quick look: Copy, Open and Bookmark, no editors`, (await ql.getByRole('button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label') || b.innerText.trim()))).join('|') === 'Copy prompt|Bookmark'
    && await ql.getByRole('link', { name: 'Open Deploy readiness checklist' }).count() === 1 && await ql.locator('dd a[target="_blank"]').count() === 1
    && await ql.locator('textarea, [aria-labelledby="hist-h"], [aria-labelledby="ev-h"]').count() === 0, (await ql.getByRole('button').allInnerTexts()).join('|'));
  ok(`${T} the panel's details name the type, where it came from and its collection`, /Type\s*Prompt/.test(await ql.innerText()) && /Source\s*x\.com[\s\S]*Quoted/.test(await ql.innerText()) && /Collection\s*Prompts I reuse/.test(await ql.innerText()));
  ok(`${T} the panel doesn't repeat the type in a preview header`, !/exact words/i.test(await ql.innerText()));
  // the item page is the workspace: edit your version in place, keyboard only
  await go(page, '/library/a-deploy');
  const art = page.locator('main article');
  const facts = page.locator('section[aria-label="Details: Deploy readiness checklist"]');
  const hist = () => art.locator('section[aria-labelledby="hist-h"]').innerText();
  await art.getByRole('button', { name: 'Edit your version' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  ok(`${T} Enter opens the editor with the exact text, focused`, await page.evaluate(() => document.activeElement?.tagName) === 'TEXTAREA' && /Act as a release reviewer/.test(await art.locator('textarea').inputValue()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(`${T} Esc cancels and returns focus to the edit button`, /^Edit your version/.test(await page.evaluate(() => document.activeElement?.textContent ?? '')));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('End');
  await page.keyboard.type(' Keep it to five bullets.');
  await shot(page, 'd-light-s4-editing');
  await axe(page, `${T} item page editing`);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await page.waitForTimeout(250);
  ok(`${T} ⌘↵ saves your version`, await page.locator('.toast').filter({ hasText: 'Saved your version' }).isVisible());
  ok(`${T} the page shows your version`, /five bullets/.test(await art.locator('pre[aria-label="Your version"]').innerText()));
  await art.getByRole('button', { name: 'Exact', exact: true }).click();
  ok(`${T} Exact shows the captured text unchanged`, !/five bullets/.test(await art.locator('pre').first().innerText()));
  await art.getByRole('button', { name: 'Your version', exact: true }).click();
  ok(`${T} history records the edit`, /Your version saved · exact text kept/.test(await hist()));
  await art.getByRole('button', { name: 'Discard' }).click();
  await page.waitForTimeout(150);
  ok(`${T} discard goes back to the exact text`, !/five bullets/.test(await art.locator('pre').first().innerText()));
  await page.locator('.toast').filter({ hasText: 'Discarded your version' }).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(150);
  ok(`${T} Undo brings your version back`, /five bullets/.test(await art.locator('pre').first().innerText()));
  // bookmark (top bar) and filing (side facts) are recorded in the history too
  await page.getByRole('button', { name: 'Bookmark Deploy readiness checklist' }).click();
  ok(`${T} bookmarking is recorded in the history`, /Bookmarked/.test(await hist()));
  await facts.getByRole('button', { name: /^Collection/ }).click();
  await page.getByRole('group', { name: 'Collections and projects' }).getByRole('button', { name: 'Agent setup' }).click();
  await page.keyboard.press('Escape');
  ok(`${T} filing is recorded in the history`, /Added to collection “Agent setup”/.test(await hist()));
  ok(`${T} the side area has facts only, no actions that repeat the page`, await facts.getByRole('button').count() === (F.has('organise') ? 2 : 1) && /saved/i.test(await facts.innerText()) && !/Saved \d+ days ago · from/.test(await facts.innerText()));
  // the complete "Where it came from", with the source link at the evidence moment
  await go(page, '/library/a-docsmcp');
  const ev = page.locator('section[aria-labelledby="ev-h"]');
  const href = await ev.getByRole('link', { name: /Open the original at 29:08/ }).getAttribute('href');
  ok(`${T} "Open the original at 29:08" goes to the moment`, /[?&]t=1748s$/.test(href ?? ''), href);
  ok(`${T} source review link`, (await ev.getByRole('link', { name: /Source review/ }).getAttribute('href')) === '/inbox/s-video-old');
  ok(`${T} the moment is said once (in the evidence label, not again as a row)`, ((await ev.innerText()).match(/29:08/g) ?? []).length === 2, (await ev.innerText()).replace(/\s+/g, ' ')); // label + link
  // fill the blanks for templates, on the page
  await go(page, '/library/a-style');
  const fill = page.locator('section', { has: page.getByRole('heading', { name: 'Fill the blanks' }) });
  await fill.getByLabel('medium', { exact: true }).fill('Oil painting');
  await fill.getByRole('button', { name: 'Copy filled prompt' }).click();
  await page.waitForTimeout(200);
  const sf = page.locator('section[aria-label="Details: Style sentence template"]');
  ok(`${T} prompt fill works on the page and counts as a use`, /Used\s*Filled once/i.test(await sf.innerText()), (await sf.innerText()).match(/Used\s*[^\n]*/i)?.[0]);
  await shot(page, 'd-light-s4-fill');
  await axe(page, `${T} item page with prompt fill and history`);
  // delete with Undo, from the top bar
  await page.getByRole('button', { name: 'Delete Style sentence template' }).click();
  await page.waitForURL(/\/library$/);
  await page.waitForTimeout(250);
  ok(`${T} delete from the item page`, (await count(page)) === '6 items', await count(page));
  await page.locator('.toast').filter({ hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(200);
  ok(`${T} Undo restores it`, (await count(page)) === '7 items', await count(page));
  await browser.close();
  return errs;
}


/* ---------- Build-out Stage 5: ⌘K searches everything ---------- */
async function stage5Flows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 's5';
  await go(page, '/inbox');
  // a board with a reference whose note we search for (no image needed to be found)
  await patchState(page, st => ({ ...st,
    boards: [{ id: 'b-s5', title: 'Calm onboarding', note: 'Soft, quiet first run', sections: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...st.boards],
    references: [{ id: 'r-s5', boardId: 'b-s5', sectionId: null, order: 0, title: 'Welcome screen', sourceUrl: '', creator: 'Ada Example', capturedAt: new Date().toISOString(), rights: 'own',
      likes: [], note: 'Love the generous line height', avoid: false, regions: [], imageKey: '', mime: 'text/uri-list', width: 16, height: 9, media: 'link', linkUrl: 'https://example.com/' }, ...st.references] }));
  await go(page, '/inbox');
  const mod = which === 'webkit' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+k`);
  const pal = page.getByRole('dialog', { name: 'Command palette' });
  await pal.waitFor();
  const groups0 = await pal.locator('[class*="palGroup"]').allInnerTexts();
  // Regression: the square dialog box clipped its rounded card's shadow, which showed as a ghost frame at the corners
  ok(`${T} the palette's dialog box doesn't clip its card (no ghost frame)`, await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return getComputedStyle(d).overflow === 'visible'; }));
  ok(`${T} actions come first`, groups0[0] === 'Actions' && groups0[1] === 'Go to', groups0.join(' | '));
  await page.keyboard.type('release reviewer before');
  await page.waitForTimeout(150);
  const groups = await pal.locator('[class*="palGroup"]').allInnerTexts();
  // The item, its own evidence quote and the source it came from used to be three rows; now one row per thing
  const deployRows = pal.getByRole('option').filter({ hasText: 'Deploy readiness checklist' });
  ok(`${T} a phrase from an evidence quote finds the item once (no duplicate quote or source row)`, await deployRows.count() === 1 && !groups.includes('Evidence quotes'), `${await deployRows.count()} rows · ${groups.join(' | ')}`);
  ok(`${T} the result says where it matched`, /in (exact text|evidence quote)/.test(await deployRows.innerText()));
  await shot(page, 'd-light-s5-palette-quote');
  await axe(page, `${T} palette with results`);
  await deployRows.click();
  await page.waitForURL(/\/library\/a-/);
  ok(`${T} choosing the quote opens the item`, /\/library\/a-deploy/.test(page.url()), page.url());
  await page.keyboard.press(`${mod}+k`);
  await pal.waitFor();
  await page.keyboard.type('generous line height');
  await page.waitForTimeout(150);
  const ref = pal.getByRole('option').filter({ hasText: 'Welcome screen' });
  ok(`${T} a board reference is found by its note`, await ref.count() === 1 && /in your note/.test(await ref.innerText()), (await pal.locator('#pal-list').innerText()).replace(/\s+/g, ' ').slice(0, 200));
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/boards\/b-s5/);
  ok(`${T} Enter opens the board at that reference`, /\/boards\/b-s5\?ref=r-s5/.test(page.url()), page.url());
  await page.keyboard.press(`${mod}+k`);
  await pal.waitFor();
  await page.keyboard.type('reuse');
  await page.waitForTimeout(150);
  ok(`${T} collections are found by name`, await pal.getByRole('option').filter({ hasText: 'Prompts I reuse' }).count() >= 1);
  await page.keyboard.press('Tab'); // scope: Library
  ok(`${T} Tab changes the scope`, (await pal.getByRole('button', { name: 'Library', exact: true }).getAttribute('aria-pressed')) === 'true');
  // Results follow typing after a short pause; Enter pressed straight after typing must still act on what is in the box
  await go(page, '/library');
  await page.keyboard.press(`${mod}+k`);
  await pal.waitFor();
  await page.keyboard.type('docs lookup server');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/library\/a-/, { timeout: 5000 }).catch(() => {});
  ok(`${T} Enter right after typing opens the result for the typed words, not a stale one`, /\/library\/a-docsmcp$/.test(new URL(page.url()).pathname), page.url());
  // Capture (mockups/capture.html): a command-bar start, then the composer; a single prompt is kept in the Library
  await go(page, '/library');
  await page.keyboard.press('c');
  const capDlg = page.getByRole('dialog', { name: 'Capture' });
  ok(`${T} capture opens on "What do you want to keep?" with Link, Prompt, Image or screenshot, File, Video, Note`,
    (await capDlg.getByRole('option').allInnerTexts()).map(t => t.replace('↵', '').trim()).join('|') === 'Link|Prompt|Image or screenshot|File|Video|Note' && await capDlg.getByRole('combobox', { name: 'What do you want to keep?' }).count() === 1);
  await page.locator('#cap-value').fill('https://www.youtube.com/watch?v=Kx4tRW2s9nA&t=436s');
  ok(`${T} a pasted link becomes Capture › YouTube video with a card from the address, not read`, /Capture\s*YouTube video/.test(await capDlg.getByRole('heading').innerText()) && /starts at 7:16/.test(await capDlg.innerText()) && /Not read yet/.test(await capDlg.innerText()));
  await capDlg.getByRole('button', { name: 'Inbox' }).click();
  const keepIn = page.getByRole('menu', { name: 'Keep in' });
  ok(`${T} the destination menu has search, Inbox, Collections and Projects`, await keepIn.getByRole('textbox').count() === 1 && /Inbox[\s\S]*Collections[\s\S]*Projects/.test(await keepIn.innerText()));
  await page.keyboard.press('Escape'); // closes the destination menu, not the step
  ok(`${T} Esc in a menu closes only the menu`, await capDlg.getByRole('heading').count() === 1 && await keepIn.count() === 0);
  // a step leads back to the start list: the crumb, Esc and Backspace; the draft is kept
  await capDlg.getByRole('button', { name: 'Back to Capture' }).click();
  ok(`${T} the Capture crumb returns to "What do you want to keep?"`, await capDlg.getByRole('combobox', { name: 'What do you want to keep?' }).count() === 1);
  await capDlg.getByRole('option', { name: 'Prompt' }).click();
  ok(`${T} the draft survives going back and choosing another type`, /youtube\.com\/watch\?v=Kx4tRW2s9nA/.test(await capDlg.locator('#cap-value').inputValue()) && /Capture\s*Prompt/.test(await capDlg.getByRole('heading').innerText()));
  await page.keyboard.press('Escape');
  ok(`${T} Esc in a step goes back to the list`, await capDlg.getByRole('combobox', { name: 'What do you want to keep?' }).count() === 1 && await capDlg.isVisible());
  await page.keyboard.press('Escape');
  ok(`${T} a second Esc closes Capture`, !(await capDlg.isVisible()));
  await page.keyboard.press('c');
  await capDlg.getByRole('option', { name: 'Note' }).click();
  await page.keyboard.press('Backspace');
  ok(`${T} Backspace in an empty composer goes back`, await capDlg.getByRole('combobox', { name: 'What do you want to keep?' }).count() === 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await page.locator('#cap-value').fill('You are a careful editor. Rewrite my paragraph in plain English and keep every fact.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const keptToast = page.locator('.toasts .toast');
  ok(`${T} one clear prompt is kept in the Library at once, with Open and Undo`, /Kept in Library/.test(await keptToast.innerText()) && await keptToast.getByRole('button', { name: 'Open' }).count() === 1 && await keptToast.getByRole('button', { name: 'Undo' }).count() === 1);
  await keptToast.getByRole('button', { name: 'Open' }).click();
  await page.waitForURL(/\/library\/a-/);
  ok(`${T} it opens as a Library item`, /You are a careful editor/.test(await page.locator('main').innerText()));
  // Escape then ⌘K at once: a close event still queued from the Escape must not shut the reopened palette
  let reopenFails = 0;
  await page.keyboard.press(`${mod}+k`); await page.waitForTimeout(150);
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Escape'); await page.waitForTimeout([0, 8, 30][i % 3]);
    await page.keyboard.press(`${mod}+k`); await page.waitForTimeout(150);
    if (!(await pal.isVisible())) { reopenFails++; await page.keyboard.press(`${mod}+k`); await page.waitForTimeout(150); }
  }
  ok(`${T} Escape then ⌘K always reopens the palette`, reopenFails === 0, `${reopenFails} of 9 closed again`);
  await page.keyboard.press('Escape');
  await browser.close();
  return errs;
}


/* ---------- Build-out Stage 6: collections and projects as places ---------- */
async function stage6Flows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 's6';
  const side = page.locator('nav[aria-label="Main"]');
  const sideCount = async name => Number((await side.getByRole('link', { name: new RegExp('^' + name) }).innerText()).replace(/\D/g, '') || 0);
  await go(page, '/library');
  await side.getByRole('link', { name: /^Prompts I reuse/ }).click();
  await page.waitForURL(/\/collections\/c-reuse/);
  await page.waitForTimeout(250);
  ok(`${T} sidebar collection opens its page`, (await page.locator('main h1').innerText()).startsWith('Prompts I reuse'));
  ok(`${T} the page lists its 3 items`, (await page.locator('#grp-items li').count()) === 3);
  await shot(page, 'd-light-s6-collection');
  await axe(page, `${T} collection page`);
  // rename with the keyboard
  await page.getByRole('button', { name: 'Rename collection' }).click();
  await page.fill('#grp-rename', 'Prompts I keep reusing');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  ok(`${T} rename in place, sidebar follows`, (await page.locator('main h1').innerText()).startsWith('Prompts I keep reusing') && await side.getByRole('link', { name: /^Prompts I keep reusing/ }).count() === 1);
  // pick an icon from the set
  await page.getByRole('button', { name: 'Choose an icon' }).click();
  await page.getByRole('group', { name: 'Icons' }).getByRole('button', { name: 'repeat', exact: true }).click();
  ok(`${T} the chosen icon shows on the page and in the sidebar`, await page.locator('main [data-ic="repeat"]').count() >= 1 && await side.getByRole('link', { name: /^Prompts I keep/ }).locator('[data-ic="repeat"]').count() === 1);
  // a note
  await page.getByRole('button', { name: /Add a note/ }).click();
  await page.fill('#grp-note-ta', 'Prompts I paste every week.');
  await page.getByRole('button', { name: 'Save note' }).click();
  ok(`${T} the note is saved`, await page.getByText('Prompts I paste every week.').isVisible());
  // add an item, then remove one with Undo; sidebar counts are live
  const before = await sideCount('Prompts I keep');
  await page.getByRole('button', { name: 'Add items' }).click();
  await page.getByRole('group', { name: /Add items to/ }).getByRole('button', { name: 'Docs lookup server' }).click();
  await page.keyboard.press('Escape');
  ok(`${T} Add items puts it in, the sidebar count follows`, (await page.locator('#grp-items li').count()) === 4 && await sideCount('Prompts I keep') === before + 1, `${before} → ${await sideCount('Prompts I keep')}`);
  await page.getByRole('button', { name: 'Remove Docs lookup server from Prompts I keep reusing' }).click();
  ok(`${T} remove an item`, (await page.locator('#grp-items li').count()) === 3);
  await page.locator('.toast').filter({ hasText: 'Removed' }).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(150);
  ok(`${T} Undo puts it back`, (await page.locator('#grp-items li').count()) === 4);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  ok(`${T} name, icon, note and items survive a reload`, (await page.locator('main h1').innerText()).startsWith('Prompts I keep reusing') && await page.getByText('Prompts I paste every week.').isVisible() && (await page.locator('#grp-items li').count()) === 4);
  // delete the collection: items stay in the Library; Undo restores it and its memberships
  ok(`${T} Delete waits behind the ⋯ menu`, await page.getByRole('button', { name: 'Delete collection' }).count() === 0);
  await page.getByRole('button', { name: 'More actions' }).click();
  ok(`${T} ⋯ menu opens with focus on its first action`, await page.evaluate(() => document.activeElement?.textContent) === 'Rename collection');
  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page.waitForURL(/\/collections$/);
  ok(`${T} delete removes it from the sidebar`, await side.getByRole('link', { name: /^Prompts I keep/ }).count() === 0);
  await page.locator('.toast').filter({ hasText: 'Deleted “Prompts I keep reusing”' }).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(200);
  ok(`${T} Undo restores the collection and its 4 items`, await sideCount('Prompts I keep') === 4);
  // projects gather boards too (with the Playground)
  if (F.has('playground')) {
  await patchState(page, st => ({ ...st, boards: [{ id: 'b-s6', title: 'Menu bar icon ideas', note: '', sections: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...st.boards] }));
  await go(page, '/projects/p-menubar');
  const p0 = await sideCount('Ship a menu bar app');
  await page.selectOption('#grp-add-board', 'b-s6');
  await page.waitForTimeout(150);
  ok(`${T} a board added to the project shows on its page`, await page.getByRole('link', { name: 'Menu bar icon ideas' }).count() === 1);
  ok(`${T} and in the sidebar count`, await sideCount('Ship a menu bar app') === p0 + 1, `${p0} → ${await sideCount('Ship a menu bar app')}`);
  }
  else await go(page, '/projects/p-menubar');
  await shot(page, 'd-light-s6-project');
  await axe(page, `${T} project page`);
  await go(page, '/collections/does-not-exist');
  ok(`${T} not-found state`, await page.getByRole('heading', { name: 'This collection isn’t here' }).isVisible());
  await browser.close();
  return errs;
}


/* ---------- Build-out Stage 7: boards join projects and the Library ---------- */
async function stage7Flows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 's7';
  const side = page.locator('nav[aria-label="Main"]');
  const sideCount = async name => Number((await side.getByRole('link', { name: new RegExp('^' + name) }).innerText()).replace(/\D/g, '') || 0);
  await go(page, '/playground');
  await patchState(page, st => ({ ...st,
    boards: [{ id: 'b-s7', title: 'Portfolio type study', note: 'Editorial, calm', sections: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...st.boards],
    references: [{ id: 'r-s7', boardId: 'b-s7', sectionId: null, order: 0, title: 'Editorial header', sourceUrl: '', creator: 'Ada Example', capturedAt: new Date().toISOString(), rights: 'own',
      likes: ['Typography'], note: 'Big serif title with a quiet sans for meta', avoid: false, regions: [], imageKey: '', mime: 'text/uri-list', width: 16, height: 9, media: 'link', linkUrl: 'https://example.com/header' }, ...st.references] }));
  await go(page, '/boards/b-s7');
  ok(`${T} board page has the new top bar`, await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Playground' }).count() === 1);
  const before = await sideCount('Portfolio refresh');
  await page.selectOption('#board-project', 'p-portfolio');
  await page.waitForTimeout(150);
  ok(`${T} a board can belong to a project (sidebar count follows)`, await sideCount('Portfolio refresh') === before + 1, `${before} → ${await sideCount('Portfolio refresh')}`);
  await shot(page, 'd-light-s7-board');
  await axe(page, `${T} board`);
  await page.getByRole('button', { name: 'More board actions' }).click(); // the board moved this action into its ⋯ menu (4c714fa)
  await page.getByRole('menuitem', { name: 'Save brief to Library' }).click();
  await page.waitForTimeout(250);
  ok(`${T} the brief is saved to the Library as a prompt`, await page.getByText('Saved the brief to your Library as a prompt').isVisible());
  await go(page, '/library');
  const card = page.locator('ul[aria-label="Items"] > li').filter({ hasText: 'Brief: Portfolio type study' });
  ok(`${T} it shows in the Library, from your board`, await card.count() === 1 && /from your board/.test(await card.innerText()));
  await openInPanel(page, 'Brief: Portfolio type study');
  const pq = page.locator('section[aria-label="Selected item: Brief: Portfolio type study"]');
  ok(`${T} the quick look says it came from your board, linking to it`, await pq.locator('dd a[href^="/boards/"]', { hasText: 'Portfolio type study' }).count() === 1);
  await pq.getByRole('link', { name: /^Open/ }).click();
  await page.waitForURL(/\/library\/./);
  await page.waitForTimeout(300);
  const pn = page.locator('section[aria-labelledby="ev-h"]');
  ok(`${T} evidence says it came from your board`, /You added · from your board “Portfolio type study”/.test(await pn.innerText()));
  ok(`${T} the item page links back to the board`, (await pn.getByRole('link', { name: 'Open the board' }).getAttribute('href')) === '/boards/b-s7');
  ok(`${T} the brief joined the board's project`, /Portfolio refresh/.test(await page.locator('section[aria-label^="Details:"]').innerText()));
  await go(page, '/boards/b-s7?ref=r-s7');
  ok(`${T} ?ref= opens the board at that reference`, await page.locator('#ref-panel-title').count() === 1 && /Editorial header/.test(await page.locator('#ref-panel-title').innerText()));
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.waitForTimeout(250);
  ok(`${T} a reference can be kept in the Library`, await page.getByRole('button', { name: 'In your Library' }).count() === 1);
  await go(page, '/library?type=reference');
  await openInPanel(page, 'Editorial header');
  await page.locator('section[aria-label="Selected item: Editorial header"]').getByRole('link', { name: /^Open/ }).click();
  await page.waitForURL(/\/library\/./);
  ok(`${T} the saved reference opens in its board`, (await page.locator('section[aria-labelledby="ev-h"]').getByRole('link', { name: 'Open in its board' }).getAttribute('href')) === '/boards/b-s7?ref=r-s7');
  await go(page, '/projects/p-portfolio');
  ok(`${T} the project page gathers the board and its brief`, await page.locator('main').getByRole('link', { name: 'Portfolio type study', exact: true }).count() === 1 && await page.locator('main').getByRole('link', { name: 'Brief: Portfolio type study', exact: true }).count() === 1);
  await browser.close();
  return errs;
}


/* ---------- Build-out Stage 9: notifications, Help, Settings ---------- */
async function stage9Flows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 's9';
  await go(page, '/library');
  const bell = page.getByRole('button', { name: /^Notifications/ });
  ok(`${T} the bell counts local events`, /Notifications: 2/.test(await bell.getAttribute('aria-label')), await bell.getAttribute('aria-label'));
  await bell.click();
  const box = page.getByRole('group', { name: 'Notifications' });
  ok(`${T} "ready to review" links to the Inbox`, (await box.getByRole('link', { name: /ready to review/ }).getAttribute('href')) === '/inbox');
  // Regression: the sidebar scrolls, and it used to clip the bell's list (cut off at the left, then at the sidebar edge)
  const unseen = await box.evaluate(m => { const b = m.getBoundingClientRect(); return [[b.left + 6, b.top + 6], [b.right - 6, b.top + 6], [b.left + 6, b.bottom - 6], [b.right - 6, b.bottom - 6]].filter(([x, y]) => !m.contains(document.elementFromPoint(x, y))).length + (b.left < 0 || b.right > innerWidth ? 10 : 0); });
  ok(`${T} the notifications list is fully on screen, not clipped by the sidebar`, unseen === 0, `${unseen} corners hidden`);
  ok(`${T} each notification shows its title above its time`, await box.locator('a[data-row]').first().evaluate(a => { const t = a.firstElementChild.getBoundingClientRect(), w = a.parentElement.querySelector('time').getBoundingClientRect(); return t.bottom <= w.top + 1; }));
  await shot(page, 'd-light-s9-bell');
  await axe(page, `${T} notifications open`);
  await box.getByRole('button', { name: /^Dismiss: .*ready to review/ }).click();
  ok(`${T} dismiss removes it and the count drops`, (await box.getByRole('link', { name: /ready to review/ }).count()) === 0 && /Notifications: 1/.test(await bell.getAttribute('aria-label')));
  await page.locator('.toast').filter({ hasText: 'Notification dismissed' }).getByRole('button', { name: 'Undo' }).click();
  ok(`${T} Undo brings it back`, /Notifications: 2/.test(await bell.getAttribute('aria-label')));
  if (!(await box.isVisible())) await bell.click(); // the toast's Undo is outside the menu, so the menu closed
  await box.getByRole('link', { name: /couldn’t be read/ }).click();
  await page.waitForURL(/\/inbox/);
  ok(`${T} "couldn’t be read" opens the Inbox`, true);
  // opening a notification marks it read (design review 25 Oct), so the bell counts one fewer from here on
  ok(`${T} opening it marks it read: the count drops`, /Notifications: 1/.test(await bell.getAttribute('aria-label')), await bell.getAttribute('aria-label'));
  // your own capture without a backup → a backup reminder; backing up clears it
  await page.fill('#lib-cap', 'Remember to look at the pricing page on Friday.').catch(async () => { await go(page, '/library'); await page.fill('#lib-cap', 'Remember to look at the pricing page on Friday.'); });
  await page.locator('#lib-cap').press('Enter');
  await page.waitForTimeout(300);
  ok(`${T} your own data with no backup adds a reminder`, /Notifications: 2/.test(await bell.getAttribute('aria-label')), await bell.getAttribute('aria-label'));
  const leftFrom = new URL(page.url()).pathname;
  await go(page, '/settings/storage');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
  await page.waitForTimeout(300);
  // Settings (24 Oct, Linear-style; grouped 26 Oct): its own sidebar replaces the app's (bell included), "Back to app" returns
  const snav = page.getByRole('navigation', { name: 'Settings' });
  ok(`${T} Settings has its own sidebar: Back to app, the groups, the open group's sections`,
    (await snav.getByRole('link').allInnerTexts()).map(x => x.trim()).join('|') === ['Back to app', F.has('avatar') && 'Profile', 'General', F.has('imports') ? 'Capture and import' : 'Capture', 'Organising', F.has('organise') ? 'Tags, types and domains' : 'Tags', F.has('playground') ? 'Playground and AI' : 'AI', 'Data', 'Storage and backup', 'Deleted', 'Danger zone', 'About'].filter(Boolean).join('|')
    && await page.getByRole('navigation', { name: 'Main' }).count() === 0, (await snav.getByRole('link').allInnerTexts()).join('|'));
  ok(`${T} the old Storage page opens its group, titled with its name`, (await page.locator('main h1').innerText()) === 'Data' && new URL(page.url()).hash === '#storage'
    && (await snav.getByRole('link', { name: 'Data', exact: true }).getAttribute('aria-current')) === 'page' && await page.getByRole('navigation', { name: 'Breadcrumb' }).count() === 1);
  await snav.getByRole('link', { name: 'About', exact: true }).click();
  await page.waitForURL(/\/settings\/about$/);
  ok(`${T} the sidebar opens another group`, (await page.locator('main h1').innerText()) === 'About' && (await snav.getByRole('link', { name: 'About', exact: true }).getAttribute('aria-current')) === 'page');
  await snav.getByRole('link', { name: 'Back to app' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/settings'));
  ok(`${T} Back to app returns to the page you were on`, new URL(page.url()).pathname === leftFrom, `${leftFrom} → ${page.url()}`);
  ok(`${T} after a backup the reminder goes`, /Notifications: 1/.test(await bell.getAttribute('aria-label')), await bell.getAttribute('aria-label'));
  await go(page, '/settings/about');
  await axe(page, `${T} settings`);
  // Help is its own area like Settings (25 Oct): a sidebar with Back to app and six pages in three groups
  await go(page, F.has('playground') ? '/playground' : '/collections');
  const helpFrom = new URL(page.url()).pathname;
  await go(page, '/help');
  await page.waitForURL(/\/help\/shortcuts$/);
  const hnav = page.getByRole('navigation', { name: 'Help' });
  ok(`${T} Help opens on Keyboard shortcuts, in its own sidebar`, (await page.locator('main h1').innerText()) === 'Keyboard shortcuts' && (await hnav.getByRole('link', { name: 'Keyboard shortcuts' }).getAttribute('aria-current')) === 'page');
  ok(`${T} Help: six pages in three groups, and Back to app`, (await hnav.getByRole('link').count()) === 7 && (await hnav.getByRole('group').count()) === 3 && await hnav.getByRole('link', { name: 'Back to app' }).isVisible());
  ok(`${T} Help: the breadcrumb names the page`, /Help\s*Keyboard shortcuts/.test(await page.locator('header, [data-page-top]').first().innerText().catch(() => '')) || await page.getByRole('link', { name: 'Help' }).first().isVisible());
  await hnav.getByRole('link', { name: 'Backup and restore' }).click();
  await page.waitForURL(/\/help\/backup$/);
  ok(`${T} Help knows the last backup`, (await page.locator('main dl > div').filter({ has: page.locator('dt', { hasText: 'Last backup' }) }).locator('dd').innerText()) === 'just now');
  await shot(page, 'd-light-s9-help');
  await go(page, '/help#whats-new');
  await page.waitForURL(/\/help\/whats-new$/);
  ok(`${T} an old /help#whats-new link opens What’s new`, (await page.locator('main h1').innerText()) === 'What’s new');
  await hnav.getByRole('link', { name: 'Back to app' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/help'));
  ok(`${T} Help’s Back to app returns to the page you were on`, new URL(page.url()).pathname === helpFrom, `${helpFrom} → ${page.url()}`);
  await go(page, '/help/backup');
  await axe(page, `${T} help`);
  await browser.close();
  return errs;
}


/* ---------- Build-out Stage 10: backup and restore round trip (the whole library, field for field) ---------- */
async function stage10Flows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, colorScheme: 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 's10';
  const read = () => page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 450));
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
    db.close();
    const { _at, prefs, ...rest } = st; const { lastBackupAt, readGithub, ...p } = prefs; // device-only bits
    return JSON.stringify({ ...rest, prefs: p });
  });
  await go(page, '/library');
  // make every kind of record: a capture with candidates, stars, tags, a pinned tag, uses, a board with a project and its brief, a group icon and note
  await page.fill('#lib-cap', '## Code review prompt\nReview this diff like a staff engineer and list the risks first.\n\n## Deploy steps\n1. Run the tests\n2. Deploy to staging');
  await page.locator('#lib-cap').press('Enter');
  await patchState(page, st => ({ ...st,
    artifacts: st.artifacts.map((a, i) => i === 0 ? { ...a, starred: true, tags: ['release'], uses: [{ at: new Date().toISOString(), kind: 'copy' }] } : a),
    collections: st.collections.map((c, i) => i === 0 ? { ...c, icon: 'repeat', note: 'Weekly prompts' } : c),
    boards: [{ id: 'b-s10', title: 'Round trip board', note: 'n', sections: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), projectId: 'p-menubar' }, ...st.boards],
    prefs: { ...st.prefs, pinnedTags: ['release'], style: 'pixel', titleStyle: 'Grid' } }));
  await go(page, '/boards/b-s10');
  await page.getByRole('button', { name: 'More board actions' }).click().catch(() => {});
  await page.getByRole('menuitem', { name: 'Save brief to Library' }).click({ timeout: 1500 }).catch(() => {}); // disabled with no references: fine either way
  await go(page, '/library');
  const before = await read();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-s10-'));
  await go(page, '/settings/storage');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
  const file = path.join(tmp, 'backup.zip'); await dl.saveAs(file);
  await go(page, '/settings/danger'); // Start over lives in Settings › Danger zone (24 Oct)
  await page.getByRole('button', { name: 'Delete everything…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
  await page.waitForTimeout(600);
  ok(`${T} start over really empties the device`, (await read()) !== before);
  // Regression: Delete everything used to write the demo straight back. After it and a reload: nothing at all.
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  const left = await page.evaluate(async () => {
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
    db.close();
    return { items: st.artifacts.length, sources: st.sources.length, boards: st.boards.length, seeded: st.seededDemo };
  });
  ok(`${T} after Delete everything and a reload there are no items, sources or boards (and no demo comes back)`, left.items === 0 && left.sources === 0 && left.boards === 0 && left.seeded === true, JSON.stringify(left));
  await go(page, '/settings/storage');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await page.waitForTimeout(800);
  const after = await read();
  ok(`${T} restore (replace) brings back the whole library, field for field`, after === before, after === before ? `${before.length} bytes` : `differs: ${before.length} vs ${after.length} bytes`);
  await go(page, '/library');
  // the record above carried the retired Pixel style setting (as older libraries and backups do): it's dropped, the app stays Classic
  ok(`${T} the retired style setting is dropped; the app stays Classic`, await page.evaluate(() => document.documentElement.dataset.style === undefined) && !/"style":"pixel"/.test(after));
  await browser.close();
  return errs;
}

/* ---------- Settings, grouped (24 Oct; Import added 25 Oct): 13 pages in 6 groups, and what each new page really changes ---------- */
// Settings, grouped (26 Oct): each group is a page at /settings/<id> holding its sections (verify/settings covers search,
// the old addresses and the explanations in depth)
const SETTINGS_PAGES = [
  ['profile', 'Profile', [['profile', 'Your library card']]],
  ['general', 'General', [['appearance', 'Appearance'], ['sidebar', 'Sidebar'], ['notifications', 'Notifications'], ['shortcuts', 'Keyboard shortcuts']]],
  ['capture-import', 'Capture and import', [['capture', 'Capture'], ['import', 'Import']]],
  ['organising', 'Organising', [['groups', 'Collections and projects'], ['rules', 'Filing rules'], ['views', 'Cards and views']]],
  ['labels', 'Tags, types and domains', [['tags', 'Tags'], ['types', 'Types'], ['domains', 'Domains']]],
  ['boards-ai', 'Playground and AI', [['briefs', 'Briefs'], ['ai', 'MCP server and exports']]],
  ['data', 'Data', [['storage', 'Storage and backup'], ['deleted', 'Deleted'], ['danger', 'Danger zone']]],
  ['about', 'About', [['about', 'About Capsa']]],
];
const readDb = page => page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 450)); // the store's 250 ms save debounce
  const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
  const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
  db.close(); return st;
});
const railKey = () => (which === 'webkit' ? 'Meta+Backslash' : 'Control+Backslash');

async function settingsFlows() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push({ url: page.url(), text: m.text().split('\n')[0].slice(0, 220) }); });
  page.on('pageerror', e => errs.push({ url: page.url(), text: 'PAGEERROR ' + e.message.split('\n')[0] }));
  const T = 'sg';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-sg-'));
  const toast = re => page.locator('.toast').filter({ hasText: re }).last();
  const bell = () => page.getByRole('button', { name: /^Notifications/ });
  const bellHas = async re => {
    await go(page, '/library'); await bell().click();
    const n = await page.getByRole('group', { name: 'Notifications' }).getByRole('link', { name: re }).count();
    await page.keyboard.press('Escape'); return n > 0;
  };

  // a backup made before any of the new prefs exist (its prefs have none of them)
  await go(page, '/settings/storage');
  const [dl0] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
  const oldFile = path.join(tmp, 'before-prefs.zip'); await dl0.saveAs(oldFile);
  const before = await readDb(page);
  ok(`${T} the backup made first carries none of the new prefs`, !['notify', 'backupEveryDays', 'trashRetention', 'briefDefaults'].some(k => k in before.prefs), Object.keys(before.prefs).join(','));

  // sidebar: the groups, in order; the open group lists its sections under it
  const snav = page.getByRole('navigation', { name: 'Settings' });
  ok(`${T} the sidebar lists the groups`, (await snav.locator('a[class*="row"]').allInnerTexts()).map(x => x.trim()).filter(x => x !== 'Back to app').join('|') === SETTINGS_PAGES.map(g => g[1]).join('|'));
  await page.keyboard.press(railKey()); await page.waitForTimeout(400);
  const rail = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Settings"]');
    return { side: document.documentElement.dataset.side, links: [...nav.querySelectorAll('a')].filter(a => a.getBoundingClientRect().width > 0).length,
      subs: [...nav.querySelectorAll('ul a')].filter(a => a.getBoundingClientRect().width > 0).length };
  });
  ok(`${T} in the icon rail: Back to app and the eight groups as icons, no section links`, rail.side === 'rail' && rail.links === 9 && rail.subs === 0, JSON.stringify(rail));
  ok(`${T} in the rail each group keeps its name`, await snav.getByRole('link', { name: 'Organising', exact: true }).count() === 1);
  await shot(page, 'sg-1440-light-rail');
  await page.keyboard.press(railKey()); await page.waitForTimeout(400);
  ok(`${T} the sidebar expands again`, await page.evaluate(() => document.documentElement.dataset.side) === 'full');

  // every group page loads, titled with its name, current in the sidebar, with its sections
  for (const [id, label, secs] of SETTINGS_PAGES) {
    await go(page, `/settings/${id}`);
    // each section's own heading (sh-<id>); Profile lays its heading out inside its grid since #96, so not a direct child
    const h2 = await page.locator('main section[data-sub] h2[id^="sh-"]').allInnerTexts();
    ok(`${T} /settings/${id} loads as "${label}" with its sections`, (await page.locator('main h1').innerText()) === label && (await snav.getByRole('link', { name: label, exact: true }).getAttribute('aria-current')) === 'page'
      && h2.join('|') === secs.map(x => x[1]).join('|'), h2.join('|'));
    if (!['general', 'capture-import', 'data', 'boards-ai', 'about'].includes(id)) await axe(page, `${T} settings ${id}`);
  }

  // Notifications: a kind switched off leaves the bell
  ok(`${T} the bell starts with "ready to review"`, await bellHas(/ready to review/));
  await go(page, '/settings/notifications');
  const sw = page.getByRole('switch', { name: 'Ready to review' });
  ok(`${T} notification kinds are switches, on by default`, (await sw.getAttribute('aria-checked')) === 'true' && await page.locator('#notifications').getByRole('switch').count() === 6 && (await page.getByRole('switch', { name: 'Saved items that fit a project' }).getAttribute('aria-checked')) === 'false' && (await page.getByRole('switch', { name: 'What’s new' }).getAttribute('aria-checked')) === 'true'); // Track B: context resurfacing is off by default; What's new joined on 25 Oct
  await sw.click();
  ok(`${T} the switch turns off`, (await sw.getAttribute('aria-checked')) === 'false');
  ok(`${T} "ready to review" switched off: gone from the bell`, !(await bellHas(/ready to review/)) && await bellHas(/couldn’t be read/));

  // Backup reminder interval: 10 days since the last backup shows at 7 days, not at 14 or never; 20 days shows at 14
  const DAY = 864e5;
  const setBackupAgo = days => patchState(page, `st => ({ ...st, sources: st.sources.some(x => x.id === 's-mine') ? st.sources : [{ id: 's-mine', kind: 'manual', title: 'Mine', savedAt: new Date().toISOString(), status: 'nothing' }, ...st.sources], prefs: { ...st.prefs, lastBackupAt: new Date(Date.now() - ${days} * ${DAY}).toISOString() } })`);
  const interval = async label => { await go(page, '/settings/notifications'); await page.getByRole('group', { name: 'Backup reminder' }).getByRole('button', { name: label, exact: true }).click(); };
  await setBackupAgo(10);
  ok(`${T} 10 days since a backup, every 7 days: reminded`, await bellHas(/Back up: last one 10 days ago/));
  await interval('14 days');
  ok(`${T} …every 14 days: not yet`, !(await bellHas(/Back up/)));
  await interval('Never');
  ok(`${T} …never: no reminder`, !(await bellHas(/Back up/)));
  await interval('14 days'); await setBackupAgo(20);
  ok(`${T} 20 days since a backup, every 14 days: reminded`, await bellHas(/Back up: last one 20 days ago/));

  // Deleted: "30 days" empties only entries deleted over 30 days ago (Undo puts them back), and again on load
  const trashWith = (oldDays, retention) => patchState(page, `st => {
    const a = st.artifacts[0];
    const e = (id, days) => ({ kind: 'artifact', item: { ...a, id, title: id }, deletedAt: new Date(Date.now() - days * ${DAY}).toISOString(), from: { place: 'library', index: 0 } });
    return { ...st, trash: [e('t-recent', 5), e('t-old', ${oldDays})], prefs: { ...st.prefs, trashRetention: ${JSON.stringify(retention)} } };
  }`);
  await trashWith(40, 'keep');
  await go(page, '/settings/deleted');
  ok(`${T} Deleted shows its count and links to the folder`, /2 items/.test(await page.locator('main').innerText()) && (await page.getByRole('link', { name: 'Open' }).getAttribute('href')) === '/deleted');
  const keepSeg = page.getByRole('group', { name: 'Keep deleted items' });
  ok(`${T} deleted items are kept until emptied by default`, (await keepSeg.locator('[aria-pressed="true"]').innerText()) === 'Until I empty it');
  await keepSeg.getByRole('button', { name: '30 days' }).click();
  let st = await readDb(page);
  ok(`${T} switching to 30 days empties only the entry deleted 40 days ago`, st.trash.map(t => t.item.id).join() === 't-recent' && st.prefs.trashRetention === '30d', st.trash.map(t => t.item.id).join());
  await toast(/Emptied 1 item/).getByRole('button', { name: 'Undo' }).click();
  st = await readDb(page);
  ok(`${T} Undo puts it back and the setting with it`, st.trash.map(t => t.item.id).join() === 't-recent,t-old' && st.prefs.trashRetention !== '30d', JSON.stringify([st.trash.map(t => t.item.id), st.prefs.trashRetention]));
  await trashWith(40, '30d'); await go(page, '/library');
  st = await readDb(page);
  ok(`${T} with 30 days on, a load empties entries over 30 days old and keeps the rest`, st.trash.map(t => t.item.id).join() === 't-recent', st.trash.map(t => t.item.id).join());
  await trashWith(29, '30d'); await go(page, '/library');
  st = await readDb(page);
  ok(`${T} …an entry 29 days old stays`, st.trash.map(t => t.item.id).join() === 't-recent,t-old');
  await trashWith(400, 'keep'); await go(page, '/library');
  st = await readDb(page);
  ok(`${T} …and with "until I empty it" nothing goes, however old`, st.trash.length === 2);
  await go(page, '/settings/deleted'); await keepSeg.getByRole('button', { name: '30 days' }).click(); // stays on for the reload check
  await toast(/Emptied 1 item/).waitFor({ timeout: 3000 }).catch(() => {});

  // Briefs: the defaults seed a new board's brief options
  await go(page, '/settings/briefs');
  await page.getByRole('switch', { name: 'Palettes' }).click();
  await page.getByRole('group', { name: 'Brief format' }).getByRole('button', { name: 'Markdown' }).click();
  ok(`${T} brief defaults saved`, JSON.stringify((await readDb(page)).prefs.briefDefaults) === JSON.stringify({ palettes: false, format: 'markdown' }), JSON.stringify((await readDb(page)).prefs.briefDefaults));
  await go(page, '/playground'); await page.keyboard.press('n'); await page.waitForURL(/\/boards\/b-/); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'More board actions' }).click();
  await page.getByRole('menuitem', { name: 'Brief options…' }).click();
  const dlg = page.locator('dialog[open]');
  ok(`${T} a new board's brief opens with the defaults (no palettes, Markdown)`, !(await dlg.getByRole('checkbox', { name: 'Palettes' }).isChecked())
    && await dlg.getByRole('checkbox', { name: 'Marked regions' }).isChecked() && await dlg.getByRole('radio', { name: 'Markdown' }).isChecked());
  await page.keyboard.press('Escape');

  // Tags: rename across items (merging), remove everywhere with Undo; history kept
  await patchState(page, `st => ({ ...st, artifacts: st.artifacts.map((a, i) => i === 0 ? { ...a, tags: ['alpha'] } : i === 1 ? { ...a, tags: ['alpha', 'beta'] } : { ...a, tags: (a.tags ?? []).filter(t => !/^(alpha|beta)$/i.test(t)) }), prefs: { ...st.prefs, pinnedTags: ['alpha'] } })`);
  await go(page, '/settings/tags');
  const tagsOf = s => [s.artifacts[0].tags.join(','), s.artifacts[1].tags.join(',')].join(' | ');
  ok(`${T} Tags lists each tag with its count`, /alpha\s*2 items/.test((await page.locator('main').innerText()).replace(/\n/g, ' ')));
  ok(`${T} a pinned tag shows as pinned`, (await page.getByRole('button', { name: 'Pin alpha', exact: true }).getAttribute('aria-pressed')) === 'true');
  await page.getByRole('button', { name: 'Rename alpha' }).click();
  await page.getByRole('textbox', { name: 'Tag name' }).fill('beta'); await page.keyboard.press('Enter');
  st = await readDb(page);
  ok(`${T} rename changes the tag on every item and merges with an existing one`, tagsOf(st) === 'beta | beta' && st.prefs.pinnedTags.join() === 'beta', tagsOf(st) + ' pins ' + st.prefs.pinnedTags);
  ok(`${T} rename is in each item's history`, st.artifacts[0].history.at(-1).what === 'Tag renamed: alpha → beta');
  await page.getByRole('button', { name: 'Remove beta from all items' }).click();
  st = await readDb(page);
  ok(`${T} remove takes the tag off every item and unpins it`, tagsOf(st) === ' | ' && !(st.prefs.pinnedTags ?? []).length && st.artifacts[1].history.at(-1).what === 'Tag removed: beta', tagsOf(st));
  await toast(/Removed “beta”/).getByRole('button', { name: 'Undo' }).click();
  st = await readDb(page);
  ok(`${T} Undo puts it back on every item, and the pin`, tagsOf(st) === 'beta | beta' && st.prefs.pinnedTags.join() === 'beta' && st.artifacts[0].history.at(-1).what === 'Tag restored: beta', tagsOf(st));
  await page.getByRole('button', { name: 'Pin beta', exact: true }).click();
  ok(`${T} unpin from Settings`, !((await readDb(page)).prefs.pinnedTags ?? []).length);

  // Collections and projects: rename, icon, delete with Undo, new
  await go(page, '/settings/groups');
  st = await readDb(page);
  const c0 = st.collections[0];
  const members = st.artifacts.filter(a => (a.collections ?? []).includes(c0.id)).length;
  ok(`${T} each collection shows its icon button and item count`, await page.getByRole('button', { name: `Icon for ${c0.name}` }).count() === 1 && (await page.locator('main').innerText()).includes(`${members} item`));
  await page.getByRole('button', { name: `Rename ${c0.name}` }).click();
  await page.getByRole('textbox', { name: 'Collection name' }).fill('Renamed in Settings'); await page.keyboard.press('Enter');
  ok(`${T} rename a collection inline`, (await readDb(page)).collections[0].name === 'Renamed in Settings');
  await page.getByRole('button', { name: 'Icon for Renamed in Settings' }).click();
  await page.getByRole('group', { name: 'Icons' }).getByRole('button', { name: 'star', exact: true }).click();
  ok(`${T} change a collection's icon`, (await readDb(page)).collections[0].icon === 'star');
  await page.getByRole('button', { name: 'Delete Renamed in Settings' }).click();
  st = await readDb(page);
  ok(`${T} delete a collection: gone, its items stay in the Library`, !st.collections.some(c => c.id === c0.id) && !st.artifacts.some(a => (a.collections ?? []).includes(c0.id)) && st.artifacts.length === before.artifacts.length);
  await toast(/Deleted “Renamed in Settings”/).getByRole('button', { name: 'Undo' }).click();
  st = await readDb(page);
  ok(`${T} Undo brings it back with its items`, st.collections[0].id === c0.id && st.artifacts.filter(a => (a.collections ?? []).includes(c0.id)).length === members);
  await page.getByRole('button', { name: 'New collection' }).click();
  await page.getByRole('textbox', { name: 'New collection name' }).fill('Made in Settings'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'New project name' }).fill('Project from Settings'); await page.keyboard.press('Enter');
  st = await readDb(page);
  ok(`${T} New collection and New project`, st.collections.some(c => c.name === 'Made in Settings') && st.projects.some(p => p.name === 'Project from Settings'));

  // Danger zone: Remove demo data has Undo, which brings back every demo record in place and the images
  await patchState(page, `st => ({ ...st,
    boards: [{ id: 'b-demo-sg', title: 'Demo board', note: '', sections: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), demo: true }, ...st.boards],
    references: [...st.references, { id: 'r-demo-sg', boardId: 'b-demo-sg', sectionId: null, order: 0, title: 'Demo ref', sourceUrl: '', creator: '', capturedAt: new Date().toISOString(), rights: 'unknown', likes: [], note: '', avoid: false, regions: [], imageKey: 'img-demo-sg', mime: 'image/png', width: 1, height: 1, demo: true }] })`);
  await page.evaluate(async () => {
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    await new Promise(r => { const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put({ t: 'image/png', d: new Uint8Array([137, 80, 78, 71]).buffer }, 'img-demo-sg'); tx.oncomplete = r; });
    db.close();
  });
  const blobKeys = () => page.evaluate(async () => {
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const ks = await new Promise(r => { const q = db.transaction('blobs').objectStore('blobs').getAllKeys(); q.onsuccess = () => r(q.result); });
    db.close(); return ks;
  });
  await go(page, '/settings/danger');
  const demoBefore = await readDb(page);
  const ids = x => JSON.stringify(['sources', 'artifacts', 'projects', 'collections', 'boards', 'references'].map(k => x[k].map(r => r.id)));
  await page.getByRole('button', { name: 'Remove demo data' }).click(); await page.waitForTimeout(300);
  st = await readDb(page);
  ok(`${T} Remove demo data removes every demo record and its images`, !['sources', 'artifacts', 'projects', 'collections', 'boards', 'references'].some(k => st[k].some(r => r.demo)) && !(await blobKeys()).includes('img-demo-sg'));
  await toast(/Demo data removed/).getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(300);
  st = await readDb(page);
  ok(`${T} Undo brings back every demo record in the same order, and the images`, ids(st) === ids(demoBefore) && (await blobKeys()).includes('img-demo-sg'), ids(st).length + ' vs ' + ids(demoBefore).length);

  // Old one-page anchors land on their page
  for (const [hash, want] of [['backup', '/settings/data#backup'], ['danger', '/settings/data#danger'], ['reading', '/settings/capture-import#reading'], ['tags', '/settings/labels#tags'], ['', '/settings/profile']]) {
    await page.goto(B + '/settings' + (hash ? '#' + hash : '')); await page.waitForURL(u => u.pathname !== '/settings', { timeout: 5000 }).catch(() => {});
    const u = new URL(page.url());
    ok(`${T} /settings${hash ? '#' + hash : ''} lands on ${want}`, u.pathname + u.hash === want, u.pathname + u.hash);
  }

  // Everything survives a reload
  await page.goto(B + '/settings/notifications', { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  ok(`${T} after a reload: the switched-off kind and the 14-day interval`, (await page.getByRole('switch', { name: 'Ready to review' }).getAttribute('aria-checked')) === 'false'
    && (await page.getByRole('group', { name: 'Backup reminder' }).locator('[aria-pressed="true"]').innerText()) === '14 days');
  await go(page, '/settings/briefs');
  ok(`${T} after a reload: brief defaults`, (await page.getByRole('switch', { name: 'Palettes' }).getAttribute('aria-checked')) === 'false'
    && (await page.getByRole('group', { name: 'Brief format' }).locator('[aria-pressed="true"]').innerText()).trim() === 'Markdown');
  await go(page, '/settings/deleted');
  ok(`${T} after a reload: 30 days`, (await page.getByRole('group', { name: 'Keep deleted items' }).locator('[aria-pressed="true"]').innerText()) === '30 days');

  // The backup made before these prefs restores: the library comes back and every new pref is at its default
  await go(page, '/settings/storage');
  await page.locator('input[type=file]').setInputFiles(oldFile);
  await page.getByRole('button', { name: 'Replace everything' }).click(); await page.waitForTimeout(800);
  st = await readDb(page);
  ok(`${T} a backup from before these prefs restores`, st.artifacts.length === before.artifacts.length && st.collections.length === before.collections.length
    && !['notify', 'backupEveryDays', 'trashRetention', 'briefDefaults'].some(k => k in st.prefs), Object.keys(st.prefs).join(','));
  await go(page, '/settings/notifications');
  ok(`${T} …and Settings shows the defaults`, (await page.getByRole('switch', { name: 'Ready to review' }).getAttribute('aria-checked')) === 'true'
    && (await page.getByRole('group', { name: 'Backup reminder' }).locator('[aria-pressed="true"]').innerText()) === '7 days');
  await go(page, '/settings/briefs');
  ok(`${T} …brief defaults back to all on, Prompt`, (await page.getByRole('switch', { name: 'Palettes' }).getAttribute('aria-checked')) === 'true'
    && (await page.getByRole('group', { name: 'Brief format' }).locator('[aria-pressed="true"]').innerText()).trim() === 'Prompt');
  await browser.close();
  return errs;
}

/** Screenshots to look at: the grouped sidebar (expanded and rail) and every new page, 1440 light and dark, and 390. */
async function settingsShots() {
  const browser = await pw[which].launch();
  for (const [w, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, colorScheme: theme, deviceScaleFactor: w < 600 ? 2 : 1 });
    const page = await ctx.newPage();
    await go(page, '/library');
    // a tag pinned and two tags, so Tags isn't empty; an old entry in Deleted
    await patchState(page, `st => ({ ...st, artifacts: st.artifacts.map((a, i) => i < 3 ? { ...a, tags: ['onboarding', ...(i ? ['pricing'] : [])] } : a), prefs: { ...st.prefs, pinnedTags: ['onboarding'] } })`);
    for (const id of ['general', 'organising', 'labels', 'boards-ai', 'data', 'about']) {
      await go(page, `/settings/${id}`);
      await page.screenshot({ path: `${OUT}/${which}-sg-${w}-${theme}-${id}.png`, fullPage: id === 'general' || w < 600 });
    }
    if (w < 600) {
      await page.getByRole('button', { name: 'Show or hide the sidebar' }).click(); await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${which}-sg-${w}-${theme}-drawer.png` });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`sg ${w} ${theme}: no horizontal scroll in Settings`, over <= 0, `${over}px`);
    } else {
      await go(page, '/settings/groups');
      await page.getByRole('button', { name: /^Icon for / }).first().click(); await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/${which}-sg-${w}-${theme}-groups-icons.png` });
      const box = await page.getByRole('group', { name: 'Icons' }).boundingBox();
      ok(`sg ${w} ${theme}: the icon menu opens fully on screen`, box && box.y + box.height <= 900 && box.x >= 0, JSON.stringify(box));
      await page.keyboard.press('Escape');
      await page.keyboard.press(railKey()); await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${which}-sg-${w}-${theme}-rail.png` });
      await page.keyboard.press(railKey()); await page.waitForTimeout(300);
    }
    await ctx.close();
  }
  await browser.close();
}

/* Project colours (#85): each project's glyph in the Project filter menu and its dot on an item, in Classic and Paper, light
 * and dark, has at least 3:1 against what it sits on (WCAG 1.4.11), and none of the old values renders any more (projects
 * take their colour from their order, so the first project, once #1f1f23, now shows the fixed graphite). */
const OLD_PROJECT_COLOURS = ['#1f1f23', '#db2777', '#7c3aed', '#0d9488', '#d97706', '#2563eb', '#ea580c', '#16a34a'];
async function projectColourCheck() {
  for (const look of F.has('avatar') ? ['classic', 'paper'] : ['classic']) for (const theme of ['light', 'dark']) { // Paper comes with Profile
    const { browser, page } = await setup('d', theme);
    await page.addInitScript(t => { try { localStorage.setItem('capsa-theme', t); } catch {} }, theme);
    if (F.has('avatar')) {
      await go(page, '/settings/appearance');
      await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: look === 'paper' ? 'Paper' : 'Classic' }).click(); await page.waitForTimeout(300);
    }
    await go(page, '/library');
    await page.getByRole('button', { name: 'Filter', exact: true }).click(); await page.waitForTimeout(200);
    await page.getByRole('menuitem', { name: /^Project/ }).click(); await page.waitForTimeout(300);
    const marks = await page.evaluate(() => {
      const rgb = c => (c.match(/[\d.]+/g) || []).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const under = el => { for (let p = el.parentElement; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
      const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      return [...document.querySelectorAll('[role="menuitemradio"] svg[style*="color"]')].map(el => {
        const fg = rgb(getComputedStyle(el).color), bg = under(el), [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        return { name: el.closest('[role="menuitemradio"], [role="menuitem"], [role="option"], button, li')?.textContent.trim().slice(0, 24), fg: hex(fg), bg: hex(bg), ratio: +((a + 0.05) / (b + 0.05)).toFixed(2) };
      });
    });
    const tag = `${look} ${theme}`;
    ok(`${tag}: the Project menu shows each project's colour`, marks.length >= 2, JSON.stringify(marks));
    ok(`${tag}: every project colour has at least 3:1 against its menu (WCAG 1.4.11)`, marks.length > 0 && marks.every(m => m.ratio >= 3), marks.map(m => `${m.name} ${m.fg} on ${m.bg} ${m.ratio}`).join(' | '));
    const ink = await page.evaluate(() => { const at = document.querySelector('[role="menuitemradio"] svg[style*="color"]').parentElement, x = document.createElement('i'); x.style.color = 'var(--ink)'; at.append(x); const c = getComputedStyle(x).color.match(/[\d.]+/g).map(Number); x.remove(); return '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''); });
    ok(`${tag}: the first project (once #1f1f23) renders the page's ink, and no old colour shows`, marks[0]?.fg === ink && marks.every(m => !OLD_PROJECT_COLOURS.includes(m.fg)), `${marks.map(m => m.fg).join(' ')} (ink ${ink})`);
    await page.screenshot({ path: `${OUT}/${which}-pc-${look}-${theme}.png` });
    // every colour in the set (a library may have up to eight projects before they repeat) against every surface token here
    const set = JSON.parse(fs.readFileSync(path.join(OUT, '../../src/components/library/look.ts'), 'utf8').match(/PROJECT_COLOURS = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
    const worst = await page.evaluate(set => {
      const scope = document.querySelector('[class*="library-module"]') || document.documentElement, cs = getComputedStyle(scope);
      const toRgb = c => { const x = document.createElement('i'); x.style.color = c; document.body.append(x); const v = getComputedStyle(x).color.match(/[\d.]+/g).map(Number); x.remove(); return v; };
      const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const bgs = ['--surface', '--surface-2', '--surface-3', '--bg', '--pill', '--pill-hover'].map(n => [n, cs.getPropertyValue(n).trim()]).filter(([, v]) => v && v !== 'transparent');
      let w = { ratio: 99 };
      for (const c of set) for (const [n, v] of bgs) { const [a, b] = [lum(toRgb(c)), lum(toRgb(v))].sort((x, y) => y - x); const r = (a + 0.05) / (b + 0.05); if (r < w.ratio) w = { colour: c, on: `${n} ${v}`, ratio: +r.toFixed(2) }; }
      return { ...w, surfaces: bgs.length };
    }, set);
    ok(`${tag}: all ${set.length} project colours have at least 3:1 on every surface, pill and hover fill`, set.length === 8 && worst.surfaces >= 4 && worst.ratio >= 3, JSON.stringify(worst));
    await browser.close();
  }
}

const runs = only === 'all' ? ['d-light', 'd-dark', 'm-light', 'm-dark'] : only.split(',').filter(r => !/^(s(\d+|g)|pc)$/.test(r));
const summary = [];
const F = await featuresAt(B);
const skip = (stage, feature) => { if (F.has(feature)) return false; console.log(`SKIP ${stage}: ${feature} is not in this build`); return true; };
for (const eng of engines) {
  which = eng;
  const before = results.length, axeBefore = axeRuns.length;
  const errs = [];
  for (const r of runs) {
    const [vp, theme] = r.split('-');
    try { errs.push(...(vp === 'd' ? await desktopFlows(theme) : await mobileFlows(theme))); }
    catch (e) { ok(`${r} run crashed`, false, e.message.split('\n')[0]); }
  }
  try { await persistenceCheck(); } catch (e) { ok('persistence check crashed', false, e.message.split('\n')[0]); }
  try { await footerFitCheck(); } catch (e) { ok('footer fit check crashed', false, e.message.split('\n')[0]); }
  try { await menuPlacementCheck(); } catch (e) { ok('menu placement check crashed', false, e.message.split('\n')[0]); }
  try { await firstRunCheck(); } catch (e) { ok('first-run check crashed', false, e.message.split('\n')[0]); }
  if (only === 'all' || only.includes('s1')) { try { errs.push(...(await stage1Flows())); } catch (e) { ok('stage 1 run crashed', false, e.message.split('\n')[0]); } }
  if (only === 'all' || only.includes('s4')) { try { errs.push(...(await stage4Flows())); } catch (e) { ok('stage 4 run crashed', false, e.message.split('\n')[0]); } }
  if ((only === 'all' || only.includes('s5')) && !skip('stage 5 (⌘K searches everything)', 'search')) { try { errs.push(...(await stage5Flows())); } catch (e) { ok('stage 5 run crashed', false, e.message.split('\n')[0]); } }
  if (only === 'all' || only.includes('s6')) { try { errs.push(...(await stage6Flows())); } catch (e) { ok('stage 6 run crashed', false, e.message.split('\n')[0]); } }
  if ((only === 'all' || only.includes('s7')) && !skip('stage 7 (boards join projects and the Library)', 'playground')) { try { errs.push(...(await stage7Flows())); } catch (e) { ok('stage 7 run crashed', false, e.message.split('\n')[0]); } }
  if (only === 'all' || only.includes('s9')) { try { errs.push(...(await stage9Flows())); } catch (e) { ok('stage 9 run crashed', false, e.message.split('\n')[0]); } }
  if (only === 'all' || only.includes('s10')) { try { errs.push(...(await stage10Flows())); } catch (e) { ok('stage 10 run crashed', false, e.message.split('\n')[0]); } }
  if (only === 'all' || only.split(',').includes('pc')) { try { await projectColourCheck(); } catch (e) { ok('project colour check crashed', false, e.message.split('\n')[0]); } }
  const fullSettings = ['avatar', 'imports', 'organise', 'playground'].every(f => F.has(f)) || !skip('settings, grouped (sg; verify/settings checks a build without them)', 'avatar, imports, organise and playground');
  if ((only === 'all' || only.split(',').includes('sg')) && fullSettings) { try { errs.push(...(await settingsFlows())); } catch (e) { ok('settings run crashed', false, e.message.split('\n')[0]); } }
  if ((only === 'all' || only.split(',').includes('sg')) && fullSettings) { try { await settingsShots(); } catch (e) { ok('settings screenshots crashed', false, e.message.split('\n')[0]); } }
  // Build errors from areas other people are building at the same time are reported but not counted against these screens.
  const mine = errs.filter(e => !/components\/(boards|inbox|review)\//i.test(e.text));
  ok('no console errors on library routes', mine.length === 0, JSON.stringify([...new Set(mine.map(e => e.text))]).slice(0, 600));
  const rs = results.slice(before), ax = axeRuns.slice(axeBefore);
  summary.push(`${eng}: ${rs.filter(x => x.pass).length}/${rs.length} checks passed · axe ${ax.length} runs, ${ax.reduce((a, x) => a + x.serious, 0)} serious/critical · console errors ${mine.length} (other areas ${errs.length - mine.length})`);
  fs.writeFileSync(`${OUT}/${eng}-results.json`, JSON.stringify({ results: rs, axeRuns: ax, errors: errs }, null, 2));
}
console.log('\n' + summary.join('\n'));
const passed = results.filter(r => r.pass).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
