// The rename to Capsa (29 Oct 2026, issue #113) strands no one's data. fixtures/before-capsa.json is a browser's raw
// storage as LibraryKit wrote it (make-fixture.mjs, run against the last build before the rename): two libraries, each in
// its own database under the old names, the old registry (v 1), app-wide prefs, images, a board, Deleted, a filing
// rule, a saved search; fixtures/before-capsa-backup.zip is a backup that build downloaded. This suite checks:
//  1. Upgrade: the new build opens it with nothing to click. Both libraries read in place from their old databases,
//     every record and file byte for byte, no new database, keys moved from lk- to capsa- with their values, and the
//     prefs (dark, Paper, Line icons, the rail) on the first paint.
//  2. The second library switches and shows its item and image; reloads change nothing.
//  3. A backup made before the rename restores (Replace) into a library.
//  4. A new browser starts on the new names (capsa-web, capsa- keys) and never creates the old database.
// Usage: CAPSA_BASE=http://127.0.0.1:3100 node verify/rename/verify.mjs [chromium|webkit|all]
//        CAPSA_BASE=… node verify/rename/verify.mjs chromium --profile <dir>   (open a profile the old build wrote, via
//        make-fixture.mjs --profile <dir> on the same address: checks 1 and 2 against that storage)
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const pi = process.argv.indexOf('--profile');
const PROFILE = pi > 0 ? path.resolve(process.argv[pi + 1]) : null;
const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
const engines = PROFILE ? ['chromium'] : arg === 'all' ? ['chromium', 'webkit'] : [arg];
const FX = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'before-capsa.json'), 'utf8'));
// The old names (lib/legacy.ts keeps the same ones).
const OLD_DB = 'librarykit-web';
const OLD_KEY = /^lk-/;
let which = engines[0];
const results = [];
const ok = (name, cond, extra = '') => { results.push({ engine: which, name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ' · ' + extra : ''}`); };

let second = JSON.parse(FX.localStorage['lk-libraries']).libs.find(l => l.id !== 'main');
let secondDb = `${OLD_DB}--${second.id}`;
const DATA_KEYS = ['sources', 'artifacts', 'projects', 'collections', 'boards', 'references', 'trash', 'imports', 'organise', 'easels', 'seededDemo'];
const pickData = st => Object.fromEntries(DATA_KEYS.map(k => [k, st?.[k] ?? null]));
const hash = u => { let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u[i]) >>> 0; return h; };
const fixtureFiles = name => Object.fromEntries(Object.entries(FX.databases[name].blobs).map(([k, v]) => {
  const u = Buffer.from(v.b64, 'base64'); return [k, `${v.t}:${u.length}:${hash(u)}`];
}).sort(([a], [b]) => a.localeCompare(b)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A page on the app's address that runs none of its code, to read or write storage before the app does. */
async function blank(ctx) {
  const page = await ctx.newPage();
  await page.route(B + '/__seed', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
  await page.goto(B + '/__seed');
  return page;
}
async function seed(ctx) {
  const page = await blank(ctx);
  await page.evaluate(async ({ databases, ls }) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    for (const [name, { state, blobs }] of Object.entries(databases)) {
      const db = await new Promise((res, rej) => {
        const q = indexedDB.open(name, 1);
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
    }
  }, { databases: FX.databases, ls: FX.localStorage });
  return page;
}

const raw = (page, name) => page.evaluate(async name => {
  if (!(await indexedDB.databases()).some(d => d.name === name)) return null;
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
const dbs = page => page.evaluate(async () => (await indexedDB.databases()).map(d => d.name).sort());
const storage = page => page.evaluate(() => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).map(k => [k, localStorage.getItem(k)])));
const go = async (page, p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(400); };
const nav = page => page.getByRole('navigation', { name: 'Main' });
const libName = async page => (await nav(page).locator('button[aria-haspopup="menu"]').first().innerText()).trim();
const items = page => page.locator('main ul[aria-label="Items"] > li');
const mainText = page => page.locator('main').innerText();

async function upgrade(browser) {
  const T = PROFILE ? 'old build → new build' : 'upgrade';
  const ctx = PROFILE ? browser : await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  const errs = [];
  const page = PROFILE ? await blank(ctx) : await seed(ctx);
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().split('\n')[0].slice(0, 200)); });
  const lsBefore = PROFILE ? await storage(page) : FX.localStorage;
  if (PROFILE) { second = JSON.parse(lsBefore['lk-libraries']).libs.find(l => l.id !== 'main'); secondDb = `${OLD_DB}--${second.id}`; }
  const before = { main: PROFILE ? await raw(page, OLD_DB) : null, second: PROFILE ? await raw(page, secondDb) : null };
  const expect = name => (PROFILE ? before[name === OLD_DB ? 'main' : 'second'] : { state: FX.databases[name].state, files: fixtureFiles(name) });

  await go(page, '/library');
  // the very first paint: the prefs are on <html> before React runs
  const first = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  await page.waitForTimeout(1200); // past the save debounce
  ok(`${T}: the title is Capsa`, /Capsa/.test(await page.title()) && !/LibraryKit/.test(await page.title()), await page.title());
  ok(`${T}: opens "Your library" with nothing to click`, await libName(page) === 'Your library' && await page.locator('dialog[open]').count() === 0, await libName(page));
  ok(`${T}: no new database; both libraries stay on theirs`, same(await dbs(page), [OLD_DB, secondDb].sort()), (await dbs(page)).join(','));
  let r = await raw(page, OLD_DB);
  ok(`${T}: every record in Your library is as LibraryKit left it`, same(pickData(r.state), pickData(expect(OLD_DB).state)), DATA_KEYS.filter(k => !same(r.state?.[k] ?? null, expect(OLD_DB).state?.[k] ?? null)).join(','));
  ok(`${T}: every file in Your library, byte for byte`, same(r.files, expect(OLD_DB).files), Object.keys(r.files).length + ' files');
  ok(`${T}: the Library shows every item`, await items(page).count() === r.state.artifacts.length, `${await items(page).count()} of ${r.state.artifacts.length}`);
  const imgItem = r.state.artifacts.find(a => a.image);
  if (imgItem) {
    const img = items(page).filter({ hasText: imgItem.title }).first().locator('img').first();
    await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 8000 }).catch(() => {});
    ok(`${T}: its image shows`, await img.evaluate(el => el.complete && el.naturalWidth > 0));
  }
  const ls = await storage(page);
  const oldKeys = Object.keys(ls).filter(k => OLD_KEY.test(k));
  ok(`${T}: no key is left under the old prefix`, oldKeys.length === 0, oldKeys.join(','));
  const moved = Object.entries(lsBefore).filter(([k]) => OLD_KEY.test(k) && k !== 'lk-libraries');
  ok(`${T}: every old key moved with its value`, moved.every(([k, v]) => ls[k.replace(OLD_KEY, 'capsa-')] === v), moved.filter(([k, v]) => ls[k.replace(OLD_KEY, 'capsa-')] !== v).map(([k]) => k).join(','));
  const reg = JSON.parse(ls['capsa-libraries'] ?? 'null');
  ok(`${T}: the registry names each library's old database`, reg?.v === 2 && reg.libs.length === 2
    && reg.libs.find(l => l.id === 'main')?.db === OLD_DB && reg.libs.find(l => l.id === second.id)?.db === secondDb, JSON.stringify(reg?.libs?.map(l => [l.name, l.db])));
  ok(`${T}: names, colours and app-wide prefs carried over`, same(reg.libs.map(l => [l.id, l.name, l.icon, l.color]), JSON.parse(lsBefore['lk-libraries']).libs.map(l => [l.id, l.name, l.icon, l.color])) && same(reg.app, JSON.parse(lsBefore['lk-libraries']).app));
  ok(`${T}: dark, Paper, Line icons and the rail on the first paint`, first.theme === 'dark' && first.look === 'paper' && first.icons === 'line' && first.side === 'rail', JSON.stringify(first));
  await go(page, '/playground');
  ok(`${T}: the board is there`, (await mainText(page)).includes('Fixture board'));
  await go(page, '/deleted');
  ok(`${T}: Deleted keeps its item`, (await mainText(page)).includes(expect(OLD_DB).state.trash[0].item.title));
  await go(page, '/settings/rules');
  ok(`${T}: the filing rule is there`, (await mainText(page)).includes('fixture words'));

  /* 2. the second library */
  await go(page, '/library');
  await page.keyboard.press('ControlOrMeta+2');
  await page.waitForFunction(n => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === n, second.name, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const r2 = await raw(page, secondDb);
  ok(`${T}: ⌘2 opens "${second.name}" from its old database`, await libName(page) === second.name && await items(page).count() === r2.state.artifacts.length && r2.state.artifacts.length > 0, `${await libName(page)}, ${await items(page).count()} items`);
  const sImg = r2.state.artifacts.find(a => a.image);
  if (sImg) {
    const img = items(page).filter({ hasText: sImg.title }).first().locator('img').first();
    await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 8000 }).catch(() => {});
    ok(`${T}: its image shows`, await img.evaluate(el => el.complete && el.naturalWidth > 0));
  }
  ok(`${T}: its records and files byte for byte`, same(pickData(r2.state), pickData(expect(secondDb).state)) && same(r2.files, expect(secondDb).files));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  ok(`${T}: a reload stays in "${second.name}" and creates nothing`, await libName(page) === second.name && same(await dbs(page), [OLD_DB, secondDb].sort()));
  await page.keyboard.press('ControlOrMeta+1'); await page.waitForTimeout(1200);
  ok(`${T}: back in Your library, still every record and file`, same(pickData((await raw(page, OLD_DB)).state), pickData(expect(OLD_DB).state)) && same((await raw(page, OLD_DB)).files, expect(OLD_DB).files));
  ok(`${T}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  if (!PROFILE) await ctx.close();
  return page;
}

async function oldBackup(browser) {
  const T = 'backup from before';
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await go(page, '/library');
  await page.waitForTimeout(800);
  await go(page, '/settings/storage');
  await page.locator('input[type="file"]').first().setInputFiles(path.join(HERE, 'fixtures', 'before-capsa-backup.zip')); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Replace everything' }).click(); await page.waitForTimeout(1200);
  await go(page, '/library');
  const want = FX.databases[secondDb].state.artifacts;
  ok(`${T}: a LibraryKit backup (librarykit-backup-….zip) restores`, await items(page).count() === want.length && (await mainText(page)).includes(want[0].title), `${await items(page).count()} of ${want.length}`);
  const img = want.find(a => a.image);
  if (img) {
    const el = items(page).filter({ hasText: img.title }).first().locator('img').first();
    await page.waitForFunction(e => e.complete && e.naturalWidth > 0, await el.elementHandle(), { timeout: 8000 }).catch(() => {});
    ok(`${T}: with its image`, await el.evaluate(e => e.complete && e.naturalWidth > 0));
  }
  await ctx.close();
}

async function fresh(browser) {
  const T = 'new browser';
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await go(page, '/library'); await page.waitForTimeout(1200);
  ok(`${T}: starts on the new database only`, same(await dbs(page), ['capsa-web']), (await dbs(page)).join(','));
  const ls = await storage(page);
  const reg = JSON.parse(ls['capsa-libraries'] ?? 'null');
  ok(`${T}: the registry names capsa-web`, reg?.v === 2 && reg.libs[0].db === 'capsa-web', JSON.stringify(reg?.libs));
  ok(`${T}: no key under the old prefix`, !Object.keys(ls).some(k => OLD_KEY.test(k)), Object.keys(ls).join(','));
  await ctx.close();
}

for (const e of engines) {
  which = e;
  if (PROFILE) {
    const ctx = await pw.chromium.launchPersistentContext(PROFILE, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    await upgrade(ctx);
    await ctx.close();
    continue;
  }
  const browser = await pw[e].launch();
  try { await upgrade(browser); await oldBackup(browser); await fresh(browser); }
  catch (err) { ok('suite ran to the end', false, err.message.split('\n')[0]); }
  await browser.close();
}
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} rename checks passed`);
process.exit(failed.length ? 1 : 0);
