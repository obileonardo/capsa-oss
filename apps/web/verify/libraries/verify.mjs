// Libraries and your data (design review 25 Oct, item 1). The checks that keep people's data safe when one library
// becomes many:
//  1. Upgrade: a browser holding data written by main BEFORE libraries (fixtures/main-before-libraries.json, made by
//     make-fixture.mjs against that commit: Inbox, Library, a Library image, a board, Deleted, a filing rule, a saved search,
//     the theme) opens as "Your library" with nothing to click, no new database, and every record and file byte for byte.
//     The closing copy main wrote (capsa-state-shadow) is still picked up.
//  2. Separation: nothing from one library shows in another (Library, search, ⌘K, Inbox and its count, the bell, Deleted,
//     boards, collections, Files for agents, the MCP file, backups), and each library's images stay in its own database.
//  3. Backup and restore of one library leave the other byte for byte as it was.
//  4. Deleting a library needs its name typed exactly and deletes only that library's database.
//  5. A failed load never deletes or overwrites anything: not on opening, not on switching (no save, no closing copy, no
//     image sweep until a library loads cleanly).
// Usage (dev server): CAPSA_BASE=http://127.0.0.1:3303 node verify/libraries/verify.mjs [chromium|webkit|all]
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { unzipSync, strFromU8 } from '../d1/_unzip.mjs';
const require = createRequire(playwrightFrom());
const pw = require('playwright');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const arg = process.argv[2] || 'all';
const engines = arg === 'all' ? ['chromium', 'webkit'] : [arg];
const FX = JSON.parse(fs.readFileSync(path.join(OUT, 'fixtures', 'main-before-libraries.json'), 'utf8'));
let which = engines[0];
const results = [];
const ok = (name, cond, extra = '') => { results.push({ engine: which, name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ' · ' + extra : ''}`); };

// The fixture's Deleted entry is dated the day it was made; "After 30 days" is off in it, so nothing expires, but keep
// the date recent anyway so the check never depends on when it runs.
const RUN_AT = new Date().toISOString();
const fixtureState = () => ({ ...FX.state, trash: FX.state.trash.map(t => ({ ...t, deletedAt: RUN_AT })) });
const DATA_KEYS = ['sources', 'artifacts', 'projects', 'collections', 'boards', 'references', 'trash', 'imports', 'organise', 'seededDemo'];
const pickData = st => Object.fromEntries(DATA_KEYS.map(k => [k, st?.[k] ?? null]));
const imageItem = FX.state.artifacts.find(a => a.image);
const plainItem = FX.state.artifacts.find(a => !a.image && a.type === 'prompt') ?? FX.state.artifacts.find(a => !a.image);
const deletedTitle = FX.state.trash[0].item.title;
const reviewSource = FX.state.sources.find(s => s.status === 'review') ?? FX.state.sources[0];

/** Writes the fixture into a fresh browser exactly as main left it: the database and localStorage, before any app code runs. */
async function seed(ctx, extraLs = {}, mutate = st => st) {
  const page = await ctx.newPage();
  await page.route(B + '/__seed', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
  await page.goto(B + '/__seed');
  await page.evaluate(async ({ state, blobs, ls }) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open('capsa-web', 1);
      q.onupgradeneeded = () => { q.result.createObjectStore('state'); q.result.createObjectStore('blobs'); };
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction(['state', 'blobs'], 'readwrite');
      tx.objectStore('state').put(state, 'app');
      for (const [k, v] of Object.entries(blobs)) {
        const bin = atob(v.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        tx.objectStore('blobs').put({ t: v.t, d: u.buffer }, k);
      }
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, { state: mutate(fixtureState()), blobs: FX.blobs, ls: { ...FX.localStorage, ...extraLs } });
  return page;
}

/** One database as stored: the state and every file (type, size and a checksum). null when the database doesn't exist. */
const raw = (page, name = 'capsa-web') => page.evaluate(async name => {
  const names = (await indexedDB.databases()).map(d => d.name);
  if (!names.includes(name)) return null;
  const db = await new Promise((res, rej) => { const q = indexedDB.open(name); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const get = (store, fn) => new Promise(r => { const q = fn(db.transaction(store).objectStore(store)); q.onsuccess = () => r(q.result); });
  const state = await get('state', s => s.get('app'));
  const keys = (await get('blobs', s => s.getAllKeys())).map(String).sort();
  const files = {};
  for (const k of keys) {
    const v = await get('blobs', s => s.get(k));
    const u = new Uint8Array(v.d); let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u[i]) >>> 0;
    files[k] = `${v.t}:${u.length}:${h}`;
  }
  db.close();
  return { state, files };
}, name);
const fixtureFiles = () => Object.fromEntries(Object.entries(FX.blobs).map(([k, v]) => {
  const u = Buffer.from(v.b64, 'base64'); let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u[i]) >>> 0;
  return [k, `${v.t}:${u.length}:${h}`];
}).sort(([a], [b]) => a.localeCompare(b)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dbs = page => page.evaluate(async () => (await indexedDB.databases()).map(d => d.name).sort());
const registry = page => page.evaluate(() => JSON.parse(localStorage.getItem('capsa-libraries') || 'null'));

const go = async (page, p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(400); };
const mainNav = page => page.getByRole('navigation', { name: 'Main' });
const wsBtn = page => mainNav(page).locator('button[aria-haspopup="menu"]').first();
const libName = async page => (await wsBtn(page).innerText()).trim();
const items = page => page.locator('main ul[aria-label="Items"] > li');
const inboxBadge = page => mainNav(page).locator('a[href="/inbox"] [class*="badge"]');
const bellLabel = page => page.getByRole('button', { name: /^Notifications/ }).getAttribute('aria-label');
const mainText = page => page.locator('main').innerText();
async function palette(page, q) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k'); await page.waitForTimeout(300);
  await page.keyboard.type(q); await page.waitForTimeout(500);
  const n = await page.locator('dialog[open] [role="option"]').filter({ hasText: q }).count();
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  return n;
}
/** The library's own Library search (#lib-q): how many items match. */
async function librarySearch(page, q) {
  await go(page, '/library');
  await page.fill('#lib-q', q); await page.waitForTimeout(400);
  const n = await items(page).count();
  await page.fill('#lib-q', ''); await page.waitForTimeout(150);
  return n;
}
async function newLibrary(page, name) {
  await wsBtn(page).click();
  await page.getByRole('menu', { name: 'Libraries' }).getByRole('menuitem', { name: 'New library' }).click();
  const dlg = page.getByRole('dialog', { name: 'New library' });
  await dlg.getByLabel('Name').fill(name);
  await dlg.getByRole('button', { name: 'Create library' }).click();
  await page.waitForFunction(n => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === n, name, { timeout: 8000 });
  await page.waitForTimeout(400);
}
const png = (page, seed) => page.evaluate(async seed => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const g = c.getContext('2d'); g.fillStyle = `hsl(${seed * 83 % 360} 55% 65%)`; g.fillRect(0, 0, 320, 200); g.fillStyle = '#111'; g.font = 'bold 32px sans-serif'; g.fillText(`Lib shot ${seed}`, 20, 80);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  return [...new Uint8Array(await b.arrayBuffer())];
}, seed).then(a => Buffer.from(a));

async function upgradeAndSeparation() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  const errs = [];
  const page = await seed(ctx);
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().split('\n')[0].slice(0, 200)); });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-libs-'));
  const T = 'upgrade';

  /* 1. upgrade */
  await go(page, '/library');
  await page.waitForTimeout(1200); // past the save debounce: anything the app was going to write has been written
  ok(`${T}: opens as "Your library"`, await libName(page) === 'Your library', await libName(page));
  ok(`${T}: nothing to click (no dialog, no prompt)`, await page.locator('dialog[open]').count() === 0);
  ok(`${T}: no new database, the original is used`, same(await dbs(page), ['capsa-web']), (await dbs(page)).join(','));
  let r = await raw(page);
  ok(`${T}: every record is as main left it`, same(pickData(r.state), pickData(fixtureState())), DATA_KEYS.filter(k => !same(r.state?.[k] ?? null, fixtureState()[k] ?? null)).join(','));
  ok(`${T}: every file (Library image and thumbnail) byte for byte`, same(r.files, fixtureFiles()), Object.keys(r.files).join(','));
  ok(`${T}: the Library shows every item`, await items(page).count() === FX.state.artifacts.length, `${await items(page).count()} of ${FX.state.artifacts.length}`);
  const card = items(page).filter({ hasText: imageItem.title }).first();
  const img = card.locator('img').first();
  await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 8000 }).catch(() => {});
  ok(`${T}: the Library image shows its picture`, await img.evaluate(el => el.complete && el.naturalWidth > 0));
  ok(`${T}: the Inbox count is there`, Number(await inboxBadge(page).innerText().catch(() => '0')) > 0);
  ok(`${T}: the theme is kept (dark)`, await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  const reg = await registry(page);
  ok(`${T}: one library, "Your library", on the original database`, reg?.libs?.length === 1 && reg.libs[0].id === 'main' && reg.libs[0].name === 'Your library', JSON.stringify(reg?.libs));
  ok(`${T}: theme and icon style became app-wide`, reg?.app?.theme === 'dark');
  await go(page, '/inbox');
  ok(`${T}: Inbox keeps its sources`, (await mainText(page)).includes(reviewSource.title), reviewSource.title);
  await go(page, '/playground');
  ok(`${T}: the board is there`, (await mainText(page)).includes('Fixture board'));
  await go(page, '/deleted');
  ok(`${T}: Deleted keeps its item`, (await mainText(page)).includes(deletedTitle), deletedTitle);
  await go(page, '/settings/rules');
  ok(`${T}: the filing rule is there`, (await mainText(page)).includes('fixture words'));
  ok(`${T}: the saved search is in the sidebar`, await page.getByRole('link', { name: /“review”/ }).count() >= 1 || await go(page, '/library').then(() => page.getByRole('link', { name: /“review”/ }).count()) >= 1);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  r = await raw(page);
  ok(`${T}: after a reload, still every record and file`, same(pickData(r.state), pickData(fixtureState())) && same(r.files, fixtureFiles()));
  // a custom type (#9, Settings › Types) in this library
  await go(page, '/settings/types');
  await page.getByRole('button', { name: 'Preset', exact: true }).click(); await page.waitForTimeout(900);
  ok(`${T}: a custom type is kept in this library`, ((await raw(page)).state.organise?.types ?? []).some(t => t.name === 'Preset'));
  const beforeA = await raw(page);

  /* 2. a second library sees nothing of the first */
  const S = 'separate';
  await go(page, `/library/${plainItem.id}`);
  await newLibrary(page, 'Design');
  ok(`${S}: the new library opens, from an item page to the Library`, await libName(page) === 'Design' && new URL(page.url()).pathname === '/library', page.url());
  const names = await dbs(page);
  const bName = names.find(n => n.startsWith('capsa-web--'));
  ok(`${S}: it has its own database`, names.length === 2 && !!bName, names.join(','));
  ok(`${S}: Library: none of the other library's items`, await items(page).count() === 0);
  ok(`${S}: no Inbox count`, await inboxBadge(page).count() === 0);
  ok(`${S}: the bell has nothing`, /none/.test(await bellLabel(page)), await bellLabel(page));
  ok(`${S}: ⌘K doesn't find the other library's item`, await palette(page, plainItem.title) === 0, plainItem.title);
  await go(page, '/inbox');
  ok(`${S}: Inbox: none of the other library's sources`, !(await mainText(page)).includes(reviewSource.title));
  await go(page, '/deleted');
  ok(`${S}: Deleted: none of the other library's items`, !(await mainText(page)).includes(deletedTitle));
  await go(page, '/playground');
  ok(`${S}: Boards: none of the other library's boards`, !(await mainText(page)).includes('Fixture board'));
  await go(page, '/collections');
  ok(`${S}: Collections: none of the other library's`, !(await mainText(page)).includes(FX.state.collections[0].name), FX.state.collections[0].name);
  await go(page, '/ai/files');
  ok(`${S}: Files for agents: nothing to export from the other library`, !(await mainText(page)).includes(FX.state.collections[0].name));
  await go(page, '/settings/rules');
  ok(`${S}: filing rules belong to each library`, !(await mainText(page)).includes('fixture words'));
  await go(page, '/settings/types');
  ok(`${S}: custom types belong to each library`, await page.getByText('No types of your own yet').isVisible() && !((await raw(page, (await dbs(page)).find(n => n.startsWith('capsa-web--')))).state.organise?.types ?? []).length);
  ok(`${S}: the theme is app-wide (dark here too)`, await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  // its own items and image
  await go(page, '/library');
  await page.fill('#lib-cap', 'Design only: zebracorn contrast on every swatch.'); await page.locator('#lib-cap').press('Enter'); await page.waitForTimeout(700);
  await page.locator('[data-capture-box] input[type="file"]').setInputFiles({ name: 'Design shot.png', mimeType: 'image/png', buffer: await png(page, 7) });
  // an image attaches to the capture bar and is kept on Send (#88), as a Visual reference by default
  await page.locator('[data-capture-box] [data-att]').first().waitFor(); await page.waitForFunction(() => !document.querySelector('[data-capture-box] [data-reading]'));
  await page.locator('[data-capture-box]').getByRole('button', { name: 'Keep (Enter)' }).click();
  await page.getByText(/^Kept in Library · Visual reference$/).waitFor({ timeout: 10000 }); await page.waitForTimeout(900);
  ok(`${S}: the new library keeps its own items`, await items(page).count() === 2, `${await items(page).count()}`);
  let rb = await raw(page, bName);
  const bImage = rb.state.artifacts.find(a => a.image);
  ok(`${S}: its image is stored in its own database`, !!bImage && !!rb.files[bImage.image.key]);
  let ra = await raw(page, 'capsa-web');
  ok(`${S}: the first library's database is untouched, byte for byte`, same(ra, beforeA));
  // MCP file and backup: this library only
  await go(page, '/ai/mcp');
  const [mcp] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download capsa-/ }).click()]);
  const mcpPath = path.join(tmp, mcp.suggestedFilename()); await mcp.saveAs(mcpPath);
  const mcpText = fs.readFileSync(mcpPath, 'utf8');
  ok(`${S}: the MCP file is named for this library and holds only its items`, /^capsa-design\.json$/.test(mcp.suggestedFilename()) && mcpText.includes('zebracorn contrast') && !mcpText.includes(plainItem.title), mcp.suggestedFilename());
  await go(page, '/library');
  const [dl] = await Promise.all([page.waitForEvent('download'), mainNav(page).getByRole('button', { name: 'Back up now' }).click()]);
  const zipPath = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(zipPath);
  const zipFiles = unzipSync(fs.readFileSync(zipPath));
  const zlib = JSON.parse(strFromU8(zipFiles['library.json']));
  ok(`${S}: the backup is named for this library`, /^capsa-backup-design-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  ok(`${S}: the backup holds only this library (items, image, nothing of the other)`, zlib.artifacts.length === 2 && !zlib.sources.some(x => FX.state.sources.some(y => y.id === x.id)) && !zlib.boards.length
    && !Object.keys(zipFiles).some(f => f.includes(imageItem.id)) && Object.keys(zipFiles).some(f => f.includes(bImage.id)), `${zlib.artifacts.length} items, ${zlib.sources.length} sources, ${zlib.boards.length} boards; ${Object.keys(zipFiles).join(',')}; ${bImage.id}`);
  await page.waitForTimeout(600);
  rb = await raw(page, bName);

  // back to the first: ⌘1
  await go(page, '/playground');
  await page.keyboard.press('ControlOrMeta+1');
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === 'Your library', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  ok(`${S}: ⌘1 switches back and stays on the Playground`, await libName(page) === 'Your library' && new URL(page.url()).pathname === '/playground' && (await mainText(page)).includes('Fixture board'));
  ok(`${S}: ⌘K here doesn't find the other library's item`, await palette(page, 'zebracorn') === 0);
  ok(`${S}: the Library search here doesn't either`, await librarySearch(page, 'zebracorn') === 0);
  ok(`${S}: the bell counts this library's events`, /\d/.test(await bellLabel(page)), await bellLabel(page));
  ok(`${S}: all items here, as before`, await items(page).count() === FX.state.artifacts.length);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200); // a clean load sweeps this library's unused images
  ok(`${S}: a reload stays in Your library`, await libName(page) === 'Your library');
  ok(`${S}: this library's sweep never touches the other library's images`, same(await raw(page, bName), rb));
  ok(`${S}: and the first library is still byte for byte`, same(await raw(page, 'capsa-web'), beforeA));
  // ⌘2: the other library's image still shows after its own sweep
  await page.keyboard.press('ControlOrMeta+2');
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === 'Design', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const bImg = items(page).filter({ hasText: 'Design shot' }).first().locator('img').first();
  await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await bImg.elementHandle(), { timeout: 8000 }).catch(() => {});
  ok(`${S}: ⌘2: Design's image still shows after the switch and its sweep`, await bImg.evaluate(el => el.complete && el.naturalWidth > 0) && same((await raw(page, bName)).files, rb.files));

  /* 3. restore one library: the other stays byte for byte */
  const R = 'restore';
  await page.fill('#lib-cap', 'A second Design note, made after the backup.'); await page.locator('#lib-cap').press('Enter'); await page.waitForTimeout(700);
  const aBefore = await raw(page, 'capsa-web');
  await go(page, '/settings/storage');
  await page.locator('input[type="file"]').first().setInputFiles(zipPath); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Replace everything' }).click(); await page.waitForTimeout(1200);
  await go(page, '/library');
  ok(`${R}: Replace restores this library from its backup`, await libName(page) === 'Design' && await items(page).count() === 2, `${await items(page).count()}`);
  ok(`${R}: the other library is byte for byte as it was`, same(await raw(page, 'capsa-web'), aBefore));
  ok(`${R}: and still has no Design items`, !JSON.stringify((await raw(page, 'capsa-web')).state).includes('zebracorn'));

  /* 4. delete: the typed name, and only that library */
  const D = 'delete';
  await wsBtn(page).click();
  await page.getByRole('menu', { name: 'Libraries' }).getByRole('menuitem', { name: 'Manage libraries' }).click();
  const mg = page.getByRole('dialog', { name: 'Manage libraries' });
  await mg.getByRole('button', { name: 'Delete Design' }).click();
  const del = page.getByRole('dialog', { name: 'Delete “Design”' });
  const delBtn = del.getByRole('button', { name: 'Delete library' });
  ok(`${D}: the button waits for the name`, await delBtn.isDisabled());
  await del.getByRole('textbox').fill('design');
  ok(`${D}: a near miss ("design") doesn't unlock it`, await delBtn.isDisabled());
  await del.getByRole('textbox').press('Enter'); await page.waitForTimeout(400);
  ok(`${D}: Enter with a near miss deletes nothing`, (await dbs(page)).includes(bName) && (await registry(page)).libs.length === 2);
  await del.getByRole('textbox').fill('Design');
  ok(`${D}: the exact name unlocks it`, await delBtn.isEnabled());
  await delBtn.click(); await page.waitForTimeout(1200);
  ok(`${D}: that library and its database are gone`, !(await dbs(page)).includes(bName) && (await registry(page)).libs.length === 1, (await dbs(page)).join(','));
  ok(`${D}: you're in the other library, which is byte for byte as it was`, await libName(page) === 'Your library' && same(await raw(page, 'capsa-web'), aBefore));
  await page.keyboard.press('Escape');
  await wsBtn(page).click();
  await page.getByRole('menu', { name: 'Libraries' }).getByRole('menuitem', { name: 'Manage libraries' }).click();
  ok(`${D}: the last library has no Delete`, await page.getByRole('dialog', { name: 'Manage libraries' }).getByRole('button', { name: /^Delete/ }).count() === 0);
  await page.keyboard.press('Escape');
  ok(`no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

/** IDBObjectStore.get('app') throws for the database named in localStorage capsa-test-break: a library that can't be read. */
const BREAK = () => {
  const orig = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (k) {
    let b = null; try { b = localStorage.getItem('capsa-test-break'); } catch { /* */ }
    if (b && k === 'app' && this.transaction.db.name === b) throw new DOMException('test: this library can’t be read', 'UnknownError');
    return orig.call(this, k);
  };
};

async function failedLoads() {
  const browser = await pw[which].launch();
  const T = 'failed load';
  // opening: the library can't be read
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(BREAK);
  let page = await seed(ctx, { 'capsa-test-break': 'capsa-web' });
  await go(page, '/library');
  ok(`${T}: the app says it can't use storage`, /blocked local storage/.test(await mainNav(page).innerText()));
  await page.fill('#lib-cap', 'Typed while the library could not be read.'); await page.locator('#lib-cap').press('Enter');
  await page.waitForTimeout(1200);
  await go(page, '/playground'); // pagehide: the closing copy would be written now
  await page.waitForTimeout(400);
  const shadowKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('capsa-state-shadow')));
  ok(`${T}: no closing copy is written over it`, shadowKeys.length === 0, shadowKeys.join(','));
  await page.evaluate(() => localStorage.removeItem('capsa-test-break'));
  let r = await raw(page);
  ok(`${T}: nothing was saved over the library`, same(pickData(r.state), pickData(fixtureState())));
  ok(`${T}: no image was swept`, same(r.files, fixtureFiles()), Object.keys(r.files).join(','));
  await go(page, '/library'); await page.waitForTimeout(800);
  ok(`${T}: once it can be read, everything is there`, await items(page).count() === FX.state.artifacts.length && !/blocked local storage/.test(await mainNav(page).innerText()));
  await ctx.close();

  // switching: the other library can't be read, so you stay where you are and nothing is lost
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(BREAK);
  page = await seed(ctx);
  await go(page, '/library');
  await newLibrary(page, 'Design');
  await page.fill('#lib-cap', 'Design note kept before the failure.'); await page.locator('#lib-cap').press('Enter'); await page.waitForTimeout(900);
  const bName = (await dbs(page)).find(n => n.startsWith('capsa-web--'));
  const bBefore = await raw(page, bName);
  await page.keyboard.press('ControlOrMeta+1');
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === 'Your library', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  const aBefore = await raw(page);
  await page.evaluate(n => localStorage.setItem('capsa-test-break', n), bName);
  await page.keyboard.press('ControlOrMeta+2'); await page.waitForTimeout(1500);
  ok(`${T} on switching: you stay in the library you were in, with everything`, await libName(page) === 'Your library' && await items(page).count() === FX.state.artifacts.length);
  await page.fill('#lib-cap', 'Typed after the failed switch.'); await page.locator('#lib-cap').press('Enter'); await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.removeItem('capsa-test-break'));
  ok(`${T} on switching: the unreadable library is untouched`, same(await raw(page, bName), bBefore));
  const aAfter = await raw(page);
  ok(`${T} on switching: a change made after it lands in the open library only`, JSON.stringify(aAfter.state).includes('after the failed switch') && same(aAfter.files, aBefore.files)
    && !JSON.stringify((await raw(page, bName)).state).includes('after the failed switch'), `${aBefore.state.artifacts.length} → ${aAfter.state.artifacts.length} items, ${aBefore.state.sources.length} → ${aAfter.state.sources.length} sources`);
  await page.keyboard.press('ControlOrMeta+2');
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === 'Design', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  ok(`${T} on switching: once readable, it opens with its item`, await libName(page) === 'Design' && await items(page).count() === 1);
  await ctx.close();

  // main's closing copy (written as a tab closed mid-save) is still picked up, newer than the database
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const extra = { ...fixtureState(), artifacts: [{ ...plainItem, id: 'a-shadow-only', title: 'Only in the closing copy' }, ...FX.state.artifacts], _at: Date.now() + 60_000 };
  page = await seed(ctx, { 'capsa-state-shadow': JSON.stringify(extra) });
  await go(page, '/library'); await page.waitForTimeout(800);
  ok(`upgrade: main's closing copy (capsa-state-shadow) is picked up`, await items(page).count() === FX.state.artifacts.length + 1 && (await mainText(page)).includes('Only in the closing copy'));
  ok(`upgrade: …and saved into the original database`, (await raw(page)).state.artifacts.some(a => a.id === 'a-shadow-only') && await page.evaluate(() => localStorage.getItem('capsa-state-shadow')) === null);
  await ctx.close();
  await browser.close();
}

for (const e of engines) {
  which = e;
  await upgradeAndSeparation();
  await failedLoads();
}
const fails = results.filter(r => !r.pass);
fs.writeFileSync(`${OUT}/results-${arg}.json`, JSON.stringify({ when: new Date().toISOString(), pass: results.length - fails.length, total: results.length, fails }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed${fails.length ? `; ${fails.length} failed` : ''}`);
process.exit(fails.length ? 1 : 0);
