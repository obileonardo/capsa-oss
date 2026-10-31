// Makes fixtures/main-before-libraries.json: a browser's raw storage as written by the code on main BEFORE libraries
// arrived (one database, capsa-web). Run it against a dev server started from an export of that main commit, never
// against this branch. It drives main's own UI: sample data (Inbox and Library), a Library image (file and thumbnail), a
// board with a brief, an item sent to Deleted, a filing rule and a saved search (organise), and a theme. Then it dumps
// IndexedDB (state + blobs, bytes as base64) and localStorage, so verify/libraries can load it into a fresh browser.
// Usage: CAPSA_BASE=http://127.0.0.1:3303 node verify/libraries/make-fixture.mjs <main commit>
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const OUT = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3303';
const commit = process.argv[2] || 'unknown';

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const go = async p => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };
const step = m => console.log('step:', m);

await go('/library');
step('sample data loaded');
// a Library image (main's capture box)
const png = Buffer.from(await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 480; c.height = 300;
  const g = c.getContext('2d'); g.fillStyle = '#7aa7d9'; g.fillRect(0, 0, 480, 300); g.fillStyle = '#111'; g.font = 'bold 48px sans-serif'; g.fillText('Fixture shot', 30, 110);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  return [...new Uint8Array(await b.arrayBuffer())];
}));
await page.locator('[data-capture-box] input[type="file"]').setInputFiles({ name: 'Fixture shot.png', mimeType: 'image/png', buffer: png });
await page.getByText('Kept in Library · image').waitFor({ timeout: 10000 });
step('library image kept');
// a board with a brief
await go('/playground');
await page.getByRole('button', { name: 'New board' }).first().click();
await page.waitForURL(/\/boards\/b-/); await page.waitForTimeout(300);
await page.keyboard.type('Fixture board');
await page.getByLabel('What is this board for?').fill('Kept from before libraries');
await page.waitForTimeout(600);
step('board made');
// a filing rule and a saved search (organise)
await go('/settings/rules');
await page.selectOption('#rule-when', 'words');
await page.fill('#rule-value', 'fixture words');
await page.selectOption('#rule-to', 'collections:c-agent');
await page.getByRole('button', { name: 'Add rule' }).click();
await page.waitForTimeout(300);
await go('/library');
await page.fill('#lib-q', 'review'); await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Save search' }).click(); await page.waitForTimeout(300);
await page.fill('#lib-q', '');
step('rule and saved search');
// an item to Deleted (through its page)
const first = await page.evaluate(async () => {
  const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
  const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
  db.close();
  return st.artifacts.find(a => !a.image && a.type === 'prompt')?.id;
});
await go('/library/' + first);
await page.getByRole('button', { name: /^Delete/ }).first().click();
await page.waitForTimeout(300);
const confirm = page.locator('dialog[open]').getByRole('button', { name: /^Delete/ });
if (await confirm.count()) await confirm.first().click();
await page.waitForTimeout(800);
step('item deleted');
// a theme (an app-wide preference after libraries)
await go('/settings/appearance');
await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
await page.waitForTimeout(800);
await go('/library'); await page.waitForTimeout(800);

const dump = await page.evaluate(async () => {
  const names = (await indexedDB.databases?.() ?? []).map(d => d.name);
  const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
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
  const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
  return { databases: names, state, blobs, localStorage: ls };
});
const s = dump.state;
const summary = {
  sources: s.sources.length, artifacts: s.artifacts.length, images: s.artifacts.filter(a => a.image).length, boards: s.boards.length,
  trash: s.trash.length, collections: s.collections.length, projects: s.projects.length, rules: s.organise?.rules?.length ?? 0,
  savedSearches: s.organise?.searches?.length ?? 0, blobs: Object.keys(dump.blobs).length, theme: s.prefs.theme,
};
console.log('summary', JSON.stringify(summary));
fs.mkdirSync(path.join(OUT, 'fixtures'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'fixtures', 'main-before-libraries.json'),
  JSON.stringify({ madeBy: `origin/main ${commit} (before libraries), verify/libraries/make-fixture.mjs`, madeAt: new Date().toISOString(), summary, ...dump }));
await browser.close();
