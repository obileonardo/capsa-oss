// Makes fixtures/before-capsa.json and fixtures/before-capsa-backup.zip: a browser's raw storage as the app wrote it
// BEFORE the rename to Capsa (29 Oct 2026, issue #113), when it was LibraryKit. Run it against a dev server started from
// the last commit before the rename (87f7b68), never against this branch: that build's own code writes everything.
//  - It starts from the libraries fixture (verify/libraries, real data from main before libraries) under the old names
//    (database librarykit-web, keys lk-…), then lets the old app load it: it writes its registry and app-wide prefs.
//  - Through the old app's UI: a second library, "Research", with a note and an image (its own database), Paper, Line
//    icons, the sidebar folded to the rail, and a backup of "Research" downloaded (librarykit-backup-….zip).
//  - Then it dumps every database (state and blobs, bytes as base64), localStorage and the database list.
// Usage: CAPSA_BASE=http://127.0.0.1:3520 node verify/rename/make-fixture.mjs <commit> [--profile <dir>]
//   --profile keeps the browser profile in <dir>, so verify.mjs --profile <dir> can open the very same storage with the
//   new build on the same address (stop the old server, start the new one on the same port).
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3520';
const commit = process.argv[2] || 'unknown';
const pi = process.argv.indexOf('--profile');
const PROFILE = pi > 0 ? path.resolve(process.argv[pi + 1]) : null;
const LIBS = JSON.parse(fs.readFileSync(path.join(HERE, '../libraries/fixtures/main-before-libraries.json'), 'utf8'));
// The old names. This file and verify.mjs are, with lib/legacy.ts, where they are allowed to stay.
const OLD_DB = 'librarykit-web';
const toOld = k => k.replace(/^capsa-/, 'lk-');

const opts = { viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true };
const browser = PROFILE ? null : await pw.chromium.launch();
const ctx = PROFILE ? await pw.chromium.launchPersistentContext(PROFILE, opts) : await browser.newContext(opts);
const page = await ctx.newPage();
const step = m => console.log('step:', m);
const go = async p => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(500); };
const nav = () => page.getByRole('navigation', { name: 'Main' });
const ws = () => nav().locator('button[aria-haspopup="menu"]').first();

await page.route(B + '/__seed', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
await page.goto(B + '/__seed');
await page.evaluate(async ({ state, blobs, ls, name }) => {
  localStorage.clear();
  for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
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
}, { state: { ...LIBS.state, trash: LIBS.state.trash.map(t => ({ ...t, deletedAt: new Date().toISOString() })) }, blobs: LIBS.blobs,
  ls: Object.fromEntries(Object.entries(LIBS.localStorage).map(([k, v]) => [toOld(k), v])), name: OLD_DB });
step('seeded the libraries fixture under the old names');

await go('/library');
await page.waitForTimeout(1200);
const title = await page.title();
if (!/LibraryKit/.test(title)) throw new Error(`this is not the build from before the rename (title "${title}")`);
step(`the old app loaded it ("${title}")`);

// a second library, with a note and an image
await ws().click();
await page.getByRole('menu', { name: 'Libraries' }).getByRole('menuitem', { name: 'New library' }).click();
const dlg = page.getByRole('dialog', { name: 'New library' });
await dlg.getByLabel('Name').fill('Research');
await dlg.getByRole('button', { name: 'Create library' }).click();
await page.waitForFunction(() => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === 'Research', null, { timeout: 8000 });
await go('/library');
await page.fill('#lib-cap', 'Research only: quokka grids hold their rhythm at every width.'); await page.locator('#lib-cap').press('Enter'); await page.waitForTimeout(800);
const png = Buffer.from(await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const g = c.getContext('2d'); g.fillStyle = '#c9a26b'; g.fillRect(0, 0, 320, 200); g.fillStyle = '#111'; g.font = 'bold 30px sans-serif'; g.fillText('Research shot', 20, 80);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  return [...new Uint8Array(await b.arrayBuffer())];
}));
await page.locator('[data-capture-box] input[type="file"]').setInputFiles({ name: 'Research shot.png', mimeType: 'image/png', buffer: png });
await page.locator('[data-capture-box] [data-att]').first().waitFor(); await page.waitForFunction(() => !document.querySelector('[data-capture-box] [data-reading]'));
await page.locator('[data-capture-box]').getByRole('button', { name: 'Keep (Enter)' }).click();
await page.getByText(/^Kept in Library · Visual reference$/).waitFor({ timeout: 10000 }); await page.waitForTimeout(900);
step('second library "Research" with a note and an image');

// a backup of Research, the old way (librarykit-backup-research-<date>.zip)
const [dl] = await Promise.all([page.waitForEvent('download'), nav().getByRole('button', { name: 'Back up now' }).click()]);
if (!/^librarykit-backup-research-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename())) throw new Error(`unexpected backup name ${dl.suggestedFilename()}`);
if (!PROFILE) await dl.saveAs(path.join(HERE, 'fixtures', 'before-capsa-backup.zip'));
step(`backup downloaded (${dl.suggestedFilename()})`);

// app-wide preferences: Paper, Line icons, and the sidebar folded to the rail
await go('/settings/appearance');
await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Paper' }).click();
await page.getByRole('group', { name: 'Icon style' }).getByRole('button', { name: 'Line' }).click();
await page.waitForTimeout(500);
await go('/library');
await page.getByRole('button', { name: 'Show or hide the sidebar' }).first().click();
await page.waitForTimeout(800);
// back to the first library, so the next load opens it
await page.keyboard.press('ControlOrMeta+1');
await page.waitForFunction(() => document.querySelector('nav[aria-label="Main"] button[aria-haspopup="menu"]')?.textContent?.trim() === 'Your library', null, { timeout: 8000 });
await go('/library'); await page.waitForTimeout(1200);
step(`prefs: ${JSON.stringify(await page.evaluate(() => ({ ...document.documentElement.dataset })))}`);

const dump = await page.evaluate(async () => {
  const names = (await indexedDB.databases()).map(d => d.name).sort();
  const databases = {};
  for (const name of names) {
    const db = await new Promise(r => { const q = indexedDB.open(name); q.onsuccess = () => r(q.result); });
    const get = (store, fn) => new Promise(r => { const q = fn(db.transaction(store).objectStore(store)); q.onsuccess = () => r(q.result); });
    const state = await get('state', s => s.get('app'));
    const keys = (await get('blobs', s => s.getAllKeys())).map(String);
    const blobs = {};
    for (const k of keys) {
      const v = await get('blobs', s => s.get(k));
      const buf = new Uint8Array(v.d); let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      blobs[k] = { t: v.t, b64: btoa(bin) };
    }
    db.close();
    databases[name] = { state, blobs };
  }
  const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
  return { databaseNames: names, databases, localStorage: ls };
});
const reg = JSON.parse(dump.localStorage['lk-libraries'] ?? 'null');
const summary = {
  databases: dump.databaseNames, libraries: reg?.libs?.map(l => l.name), registryVersion: reg?.v,
  items: Object.fromEntries(Object.entries(dump.databases).map(([n, d]) => [n, d.state?.artifacts?.length ?? 0])),
  blobs: Object.fromEntries(Object.entries(dump.databases).map(([n, d]) => [n, Object.keys(d.blobs).length])),
  keys: Object.keys(dump.localStorage).sort(), app: reg?.app,
};
console.log('summary', JSON.stringify(summary));
if (!PROFILE) fs.writeFileSync(path.join(HERE, 'fixtures', 'before-capsa.json'),
  JSON.stringify({ madeBy: `LibraryKit ${commit} (before the rename to Capsa), verify/rename/make-fixture.mjs`, madeAt: new Date().toISOString(), summary, ...dump }));
await (browser ?? ctx).close();
