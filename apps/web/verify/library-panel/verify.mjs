// The Library's right-hand panel, rebuilt (issue #91; Elvis, 27 Oct: "some more details, but not in four cards, not as
// four cards... This screen needs to look better than this"). Replaces the two-card version of #57. Checks, on the
// labelled demo and on worst-case data:
// - one surface: no stat tiles anywhere; the preview a fixed 220px (it used to fill three quarters of the column);
// - with an item: its title, then Copy, Open and Bookmark on one line, then Details as label and value rows (Type, Source,
//   Collection, Tags, Saved, Used, and Project and Related when there are any), then the note; Source names the site
//   and opens the original in a new tab; Saved says what the card says; Bookmark toggles and is named Bookmark;
// - worst case: four tags with a very long one (cut with an ellipsis inside the panel), a note, uses, a related item that
//   opens in the panel, a very long title (wraps, no sideways scroll), an item with no source, a video's item;
// - nothing selected: the same frame, the drop zone where the preview goes and the library at a glance as the same rows,
//   each a way in (Last saved opens it in the panel; Bookmarked and Inbox link to their places, Inbox counts as the sidebar);
// - the screen: the panel takes a calmer share (about 360px at 1440, 380 at most) so the grid has three columns at 1440
//   and four at 2000; the toolbar's filters, sort and view switch sit on one line;
// - a phone: the item opens as a sheet with the same details inside it, fitting the screen;
// - the Ask face stays clear of the panel; axe (no serious or critical) at 1440 and 390 in Classic and Paper, light and
//   dark, empty and with an item; no sideways scroll. Screenshots land in CAPSA_SHOTS (default ./shots).
// Usage (dev server): CAPSA_BASE=http://127.0.0.1:<port> node verify/library-panel/verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.CAPSA_SHOTS || path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const engines = (process.argv[2] ?? 'chromium') === 'all' ? ['chromium', 'webkit'] : [process.argv[2] ?? 'chromium'];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const go = async (page, p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(600); };
const glance = page => page.getByRole('region', { name: 'Your library at a glance' });
const about = (page, title) => page.getByRole('region', { name: `About ${title}` });
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** The rows of a details list: [label, value text, the value's element info]. */
const rowsOf = region => region.locator('dl > div').evaluateAll(ds => ds.map(d => {
  // what the eye reads: the value without its screen-reader extras
  const dd = d.querySelector('dd').cloneNode(true); dd.querySelectorAll('.sr-only').forEach(x => x.remove());
  return [d.querySelector('dt').textContent.trim(), dd.textContent.replace(/\s+/g, ' ').trim()];
}));
async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.nodes.length).map(v => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')}`));
}
async function openInPanel(page, title) {
  await page.getByRole('button', { name: `More for ${title}` }).click({ force: true });
  await page.getByRole('button', { name: 'Open in panel' }).click(); await page.waitForTimeout(400);
}
async function setLook(page, look, theme) {
  await go(page, '/settings/general');
  await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: look === 'paper' ? 'Paper' : 'Classic' }).click();
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
  await page.waitForTimeout(300);
}
async function patchState(page, fn) {
  await page.waitForTimeout(400);
  await page.evaluate(async src => {
    const f = eval(src);
    const db = await new Promise((res, rej) => { const r = indexedDB.open('capsa-web'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const st = await new Promise(res => { const r = db.transaction('state').objectStore('state').get('app'); r.onsuccess = () => res(r.result); });
    const next = f(st);
    await new Promise(res => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(next, 'app'); tx.oncomplete = res; });
    db.close();
  }, fn.toString());
}
const TITLE = 'Deploy readiness checklist';
const LONG = 'A very long title for an item that keeps going well past where any sensible title would stop, to see how the panel wraps it';
const LONG_TAG = 'a-very-long-tag-name-that-should-end-in-an-ellipsis-inside-the-panel';
const WORST = `st => {
  const d = n => new Date(Date.now() - n * 864e5).toISOString();
  const arts = st.artifacts.map(a => {
    if (a.id === 'a-deploy') return { ...a, tags: ['release', 'checklist', 'deploy', '${LONG_TAG}'], note: 'Run this before every Friday deploy. It caught a missing env var twice in October.',
      uses: [{ kind: 'copy', at: d(9) }, { kind: 'copy', at: d(4) }, { kind: 'fill', at: d(2) }], links: [{ rel: 'requires', to: st.artifacts.find(x => x.id !== 'a-deploy').id }] };
    return a;
  });
  const i = arts.findIndex(a => a.id !== 'a-deploy' && a.sourceId && !/plan back/.test(a.title));
  arts[i] = { ...arts[i], title: '${LONG}' };
  const j = arts.findIndex((a, k) => k !== i && a.id !== 'a-deploy' && a.sourceId && !/plan back/.test(a.title));
  arts[j] = { ...arts[j], sourceId: undefined, title: 'No source at all' };
  return { ...st, artifacts: arts };
}`;

for (const engine of engines) {
  const browser = await pw[engine].launch();
  const T = `[${engine}]`;
  for (const [width, height, cols] of [[1440, 900, 3], [2000, 1075, 4]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'light' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await go(page, '/library');
    const W = `${T} ${width}`;

    /* ---------- the screen: the panel's share, the grid, the toolbar ---------- */
    const scr = await page.evaluate(() => {
      const panel = document.querySelector('[data-item-drop="panel"] > section').getBoundingClientRect();
      const grid = document.querySelector('main ul[aria-label="Items"]');
      const facets = document.querySelector('main [class*="facets"]').getBoundingClientRect(), tools = document.querySelector('main [class*="viewTools"]').getBoundingClientRect();
      return { panelW: Math.round(panel.width), cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, rowGap: getComputedStyle(grid).rowGap,
        oneLine: Math.abs((facets.top + facets.height / 2) - (tools.top + tools.height / 2)) <= 1, toolsRight: Math.round(tools.right), gridRight: Math.round(grid.getBoundingClientRect().right) };
    });
    ok(`${W} the panel takes a calmer share (${width === 1440 ? 'about 360px' : '380px at most'}) and the grid has ${cols} columns`, scr.panelW <= 380 && scr.panelW >= (width === 1440 ? 340 : 380) && scr.cols === cols, JSON.stringify(scr));
    ok(`${W} filters, sort and the view switch sit on one line, ending at the grid's right edge`, scr.oneLine && Math.abs(scr.toolsRight - scr.gridRight) <= 1, JSON.stringify(scr));
    ok(`${W} card rows breathe more than columns (28px)`, scr.rowGap === '28px', scr.rowGap);

    /* ---------- nothing selected: the same frame, the library at a glance as rows ---------- */
    const empty = await page.evaluate(() => {
      const p = document.querySelector('[data-item-drop="panel"] > section');
      const drop = p.querySelector('[class*="dropZone"]').getBoundingClientRect();
      return { tiles: p.querySelectorAll('[class*="dTile"], [class*="tile3"]').length, splits: document.querySelectorAll('[class*="split"]').length, drop: Math.round(drop.height), head: p.querySelector('h2')?.textContent };
    });
    ok(`${W} empty: one surface, no tiles; the drop zone where the preview goes (220px); headed by the library's name`, empty.tiles === 0 && empty.splits === 0 && empty.drop === 220 && empty.head === 'Your library', JSON.stringify(empty));
    const g = await rowsOf(glance(page));
    ok(`${W} empty: rows for Items, Last saved, Most used, Bookmarked, Inbox`, g.map(r => r[0]).join() === 'Items,Last saved,Most used,Bookmarked,Inbox', g.map(r => r[0]).join());
    ok(`${W} empty: Last saved is the newest item, Most used says Nothing yet in the demo`, g[1][1] === TITLE && g[2][1] === 'Nothing yet', JSON.stringify(g));
    const sideInbox = (await page.locator('nav[aria-label="Main"] a[href="/inbox"]').innerText()).match(/\d+/)?.[0];
    ok(`${W} empty: Inbox counts what's waiting, as the sidebar does, and links there; Bookmarked links to its filter`, g[4][1] === `${sideInbox} to review`
      && await glance(page).getByRole('link', { name: `${sideInbox} to review` }).getAttribute('href') === '/inbox' && await glance(page).locator('a[href="/library?starred=1"]').count() === 1);
    await glance(page).getByRole('button', { name: TITLE }).click(); await page.waitForTimeout(400);
    ok(`${W} empty: clicking Last saved shows that item in the panel`, await page.getByRole('region', { name: `Selected item: ${TITLE}` }).count() === 1 && await about(page, TITLE).count() === 1);
    if (engine === 'chromium') { await go(page, '/library'); await page.screenshot({ path: path.join(SHOTS, `panel-empty-${width}.png`) }); }

    /* ---------- an item, on the demo ---------- */
    await go(page, '/library'); await openInPanel(page, TITLE);
    const geo = await page.evaluate(() => {
      const p = document.querySelector('[data-lib-panel="item"]'), sky = p.querySelector('[class*="sky"]').getBoundingClientRect(), pr = p.getBoundingClientRect();
      const btns = [...p.querySelectorAll('[class*="mbtn"] > *')].map(b => b.getBoundingClientRect());
      return { tiles: p.querySelectorAll('[class*="dTile"], [class*="tile3"], [class*="details"]').length, sky: Math.round(sky.height), share: sky.height / pr.height,
        oneLine: btns.every(b => Math.abs(b.top - btns[0].top) < 1), n: btns.length, hScroll: p.scrollWidth > p.clientWidth };
    });
    ok(`${W} an item: no stat tiles; the preview is 220px, under 30% of the panel`, geo.tiles === 0 && geo.sky === 220 && geo.share < 0.3, JSON.stringify(geo));
    ok(`${W} an item: Copy prompt, Open and Bookmark on one line`, geo.n === 3 && geo.oneLine);
    const r = await rowsOf(about(page, TITLE));
    const labels = r.map(x => x[0]);
    const order = ['Type', 'Source', 'Collection', 'Tags', 'Saved', 'Used'];
    ok(`${W} an item: Details as rows, in order: ${order.join(', ')} (Project when it has one)`, order.every(l => labels.includes(l)) && order.map(l => labels.indexOf(l)).every((v, i, a) => i === 0 || v > a[i - 1]), labels.join());
    const val = l => r.find(x => x[0] === l)?.[1];
    ok(`${W} Type says Prompt; Collection names it; Tags says None on the demo`, val('Type') === 'Prompt' && val('Collection') === 'Prompts I reuse' && val('Tags') === 'None', JSON.stringify(r));
    const cardSaved = (await page.locator('main').getByText(/^Saved .* ago/).first().innerText()).match(/Saved (.*? ago)/)?.[1];
    ok(`${W} Saved says what the card says; Used says Not yet`, val('Saved').toLowerCase() === cardSaved && val('Used') === 'Not yet', `${val('Saved')} vs ${cardSaved}`);
    const src = about(page, TITLE).locator('dd a[target="_blank"]');
    ok(`${W} Source names the site, says how the words were found, and opens the original in a new tab`, /^x\.com/.test(await src.innerText()) && /^https?:\/\//.test(await src.getAttribute('href')) && /Quoted/.test(val('Source')), val('Source'));
    const bm = page.getByRole('region', { name: `Selected item: ${TITLE}` }).getByRole('button', { name: 'Bookmark' });
    ok(`${W} Bookmark is named Bookmark, its state carried by pressed`, await bm.count() === 1 && await bm.getAttribute('aria-pressed') === 'false');
    await bm.click(); await page.waitForTimeout(300);
    ok(`${W} Bookmark toggles the item's bookmark (the sidebar's Bookmarks shows it)`, await bm.getAttribute('aria-pressed') === 'true' && await page.locator('nav[aria-label="Main"]').getByText(TITLE).count() >= 1);
    await bm.click(); await page.waitForTimeout(300);
    ok(`${W} and back`, await bm.getAttribute('aria-pressed') === 'false');
    // WebKit, like Safari, skips links on Tab unless Option is held
    await bm.focus(); await page.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab');
    ok(`${W} Tab from Bookmark reaches the Source link, with a focus ring`, await src.evaluate(a => document.activeElement === a && getComputedStyle(a).outlineStyle !== 'none'));
    const vid = 'Explain the plan back before coding';
    await go(page, '/library'); await openInPanel(page, vid);
    const vr = await rowsOf(about(page, vid));
    ok(`${W} a video's item: Source is youtube.com and how the words were found`, /^youtube\.com/.test(vr.find(x => x[0] === 'Source')?.[1] ?? '') && /creator/i.test(vr.find(x => x[0] === 'Source')?.[1] ?? ''), JSON.stringify(vr));
    if (engine === 'chromium') await page.screenshot({ path: path.join(SHOTS, `panel-video-${width}.png`) });

    /* ---------- worst case ---------- */
    await patchState(page, WORST); await go(page, '/library'); await openInPanel(page, TITLE);
    const wr = await rowsOf(about(page, TITLE));
    const wv = l => wr.find(x => x[0] === l)?.[1];
    const tags = await about(page, TITLE).evaluate((s, long) => {
      const p = s.closest('section[data-lib-panel]').getBoundingClientRect(), t = [...s.querySelectorAll('dd a[href^="/library?tag="]')];
      const lt = t.find(a => a.textContent === long);
      return { n: t.length, longCut: !!lt && lt.scrollWidth > lt.clientWidth, inside: t.every(a => a.getBoundingClientRect().right <= p.right - 16) };
    }, LONG_TAG);
    ok(`${W} worst case: four tags, the very long one cut with an ellipsis inside the panel`, tags.n === 4 && tags.longCut && tags.inside, JSON.stringify(tags));
    ok(`${W} worst case: Used counts the uses; Related lists the linked item; the note shows`, wv('Used') === 'Used 3 times' && !!wv('Related') && /Friday deploy/.test(await about(page, TITLE).innerText()), JSON.stringify(wr));
    const rel = wv('Related');
    await about(page, TITLE).locator('dd button', { hasText: rel }).click(); await page.waitForTimeout(400);
    ok(`${W} worst case: a related item opens in the panel`, await page.getByRole('region', { name: `Selected item: ${rel}` }).count() === 1, rel);
    if (engine === 'chromium') { await go(page, '/library'); await openInPanel(page, TITLE); await page.screenshot({ path: path.join(SHOTS, `panel-worst-${width}.png`) }); }
    await go(page, '/library'); await openInPanel(page, LONG);
    const lg = await page.evaluate(() => { const p = document.querySelector('[data-lib-panel="item"]'), h = p.querySelector('h2'); return { lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)), hScroll: p.scrollWidth > p.clientWidth, inside: h.getBoundingClientRect().right <= p.getBoundingClientRect().right }; });
    ok(`${W} worst case: a very long title wraps inside the panel, no sideways scroll`, lg.lines >= 2 && !lg.hScroll && lg.inside, JSON.stringify(lg));
    if (engine === 'chromium') await page.screenshot({ path: path.join(SHOTS, `panel-long-title-${width}.png`) });
    await go(page, '/library'); await openInPanel(page, 'No source at all');
    ok(`${W} worst case: an item with no source says Unknown`, (await rowsOf(about(page, 'No source at all'))).find(x => x[0] === 'Source')?.[1] === 'Unknown');

    /* ---------- the Ask face keeps clear of the panel ---------- */
    const clear = await page.evaluate(() => {
      const f = document.querySelector('button[aria-label="Ask your library"]').getBoundingClientRect();
      const p = document.querySelector('[data-item-drop="panel"]').firstElementChild.getBoundingClientRect();
      return { faceRight: Math.round(f.right), panelLeft: Math.round(p.left) };
    });
    ok(`${W} the Ask face sits left of the panel`, clear.faceRight <= clear.panelLeft, JSON.stringify(clear));
    ok(`${W} no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ---------- a phone: the sheet carries the details ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await go(page, '/library');
    ok(`${T} 390: no docked panel, so no glance`, await glance(page).count() === 0);
    await page.getByText(TITLE, { exact: true }).first().click(); await page.waitForTimeout(600);
    const sheet = page.locator('dialog[open]');
    const d = sheet.getByRole('region', { name: `About ${TITLE}` });
    ok(`${T} 390: a card opens as a sheet with the details inside it, no tiles`, await sheet.count() === 1 && (await d.locator('dl > div').count()) >= 6 && await sheet.locator('[class*="dTile"]').count() === 0);
    ok(`${T} 390: the sheet's details fit the screen`, await d.evaluate(r => r.getBoundingClientRect().right <= innerWidth));
    if (engine === 'chromium') await page.screenshot({ path: path.join(SHOTS, 'panel-sheet-390.png') });
    await ctx.close();
  }

  /* ---------- styles, themes and widths: axe and sideways scroll ---------- */
  for (const [look, scheme] of [['classic', 'light'], ['classic', 'dark'], ['paper', 'light'], ['paper', 'dark']]) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
    const pg = await c.newPage();
    await setLook(pg, look, scheme);
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await pg.setViewportSize({ width, height });
      await go(pg, '/library');
      const tag = `${T} ${look} ${scheme} ${width}`;
      const bad = await axe(pg);
      ok(`${tag}: axe has no serious or critical issues`, bad.length === 0, bad.join(' | '));
      ok(`${tag}: no sideways page scroll`, await sideways(pg) <= 0, `${await sideways(pg)}px`);
      if (width === 1440) {
        await openInPanel(pg, TITLE);
        const b2 = await axe(pg); ok(`${tag}: axe with an item in the panel`, b2.length === 0, b2.join(' | '));
      } else {
        await pg.getByText(TITLE, { exact: true }).first().click(); await pg.waitForTimeout(600);
        const b2 = await axe(pg); ok(`${tag}: axe with the item's sheet open`, b2.length === 0, b2.join(' | '));
      }
      if (engine === 'chromium') await pg.screenshot({ path: path.join(SHOTS, `panel-${look}-${scheme}-${width}.png`) });
    }
    await c.close();
  }
  await browser.close();
}
console.log(`\n${pass}/${pass + fail} library panel checks passed`);
process.exit(fail ? 1 : 0);
