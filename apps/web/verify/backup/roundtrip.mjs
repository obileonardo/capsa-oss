// A full-app backup round-trips through a release build (release plan, R2-11): the full app backs up a library that uses
// every feature, the release build restores it, opens its screens and backs it up again, and the full app restores that.
// Every saved field and every image must come back unchanged, including those of features the release leaves out.
// Usage (both on next dev):  FULL=http://127.0.0.1:3100 SLICE=http://127.0.0.1:3390 node verify/backup/roundtrip.mjs [chromium|webkit]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const FULL = process.env.FULL || 'http://127.0.0.1:3100';
const SLICE = process.env.SLICE || 'http://127.0.0.1:3390';
const which = process.argv[2] ?? 'chromium';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-roundtrip-'));
const results = [];
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ': ' + extra : ''}`); };

async function open(base) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0].slice(0, 200)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.split('\n')[0]));
  const go = async p => { await page.waitForTimeout(400); await page.goto(base + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(250); };
  return { browser, page, errs, go };
}
const idb = (page, fn) => page.evaluate(async (src) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('capsa-web', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const st = await new Promise(res => { const r = db.transaction('state').objectStore('state').get('app'); r.onsuccess = () => res(r.result); });
  if (src) await new Promise(res => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(eval(src)(st), 'app'); tx.oncomplete = res; });
  db.close(); return st;
}, fn ? fn.toString() : null);
const readState = async page => { await page.waitForTimeout(600); return idb(page); };
async function backup(page, go, name) {
  await go('/settings/data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
  const file = path.join(TMP, name);
  await dl.saveAs(file);
  return file;
}
async function restore(page, go, file) {
  await go('/settings/data');
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await page.waitForTimeout(800);
}
/** The paths where a and b differ (at most 20). */
function diff(a, b, at = '$', out = []) {
  if (out.length >= 20 || JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}.${k}`, out);
  } else out.push(`${at}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`);
  return out;
}
// a round trip may change only _at (the time the store last saved) and lastBackupAt (set by each backup)
const comparable = st => ({ ...st, _at: undefined, prefs: { ...st.prefs, lastBackupAt: undefined } });
/** Each image in a backup: its key, type and bytes. */
const images = async file => {
  const { unzipSync, strFromU8 } = await import('../d1/_unzip.mjs');
  const z = unzipSync(fs.readFileSync(file));
  const idx = JSON.parse(strFromU8(z['manifest.json'])).blobIndex;
  return Object.keys(idx).sort().map(k => `${k} ${idx[k].type} ${Buffer.from(z[idx[k].name]).toString('base64')}`);
};
// a 1×1 PNG, stored the way the app stores images ({ t: type, d: bytes })
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// 1. the full app: the demo library, plus data that only later features write
let { browser, page, errs, go } = await open(FULL);
await go('/library');
await page.evaluate(async (b64) => {
  const d = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const db = await new Promise((res, rej) => { const r = indexedDB.open('capsa-web', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise(res => { const tx = db.transaction('blobs', 'readwrite'); for (const k of ['img:rt-ref', 'img:rt-thumb', 'eimg:rt-easel']) tx.objectStore('blobs').put({ t: 'image/png', d }, k); tx.oncomplete = res; });
  db.close();
}, PNG);
const T0 = '2026-10-25T09:00:00.000Z';
await idb(page, `st => ({ ...st,
  boards: [...st.boards, { id: 'b-rt', title: 'Round trip board', note: 'A board note', sections: [{ id: 'bs-rt', title: 'Type', note: '' }], createdAt: '${T0}', updatedAt: '${T0}' }],
  references: [...st.references, { id: 'r-rt', boardId: 'b-rt', sectionId: 'bs-rt', order: 0, title: 'A reference', sourceUrl: 'https://example.com/ref', creator: 'Someone', capturedAt: '${T0}', rights: 'unknown', likes: [], note: 'Why I kept it', avoid: false, regions: [], imageKey: 'img:rt-ref', thumbKey: 'img:rt-thumb', mime: 'image/png', width: 1, height: 1 }],
  easels: [...(st.easels ?? []), { id: 'e-rt', title: 'Round trip easel', createdAt: '${T0}', updatedAt: '${T0}', view: { x: 0, y: 0, z: 1 }, items: [{ kind: 'card', id: 'ec1', x: 0, y: 0, w: 200, h: 120, title: 'A card', text: 'Some text' }, { kind: 'image', id: 'ei1', x: 240, y: 0, w: 100, h: 100, key: 'eimg:rt-easel', mime: 'image/png' }, { kind: 'arrow', id: 'ea1', from: { item: 'ec1' }, to: { item: 'ei1' }, shape: 'elbow' }] }],
  organise: { smart: [{ id: 'sc-rt', name: 'Deploy prompts', rules: { type: 'prompt', text: 'deploy' }, createdAt: '2026-10-25T09:00:00.000Z' }], searches: [{ id: 'ss-rt', name: '“review”', query: '?q=review', pinned: true, createdAt: '2026-10-25T09:00:00.000Z' }], rules: [{ id: 'fr-rt', when: 'site', value: 'github.com/demo-org', to: { field: 'collections', id: 'c-agent' }, createdAt: '2026-10-25T09:00:00.000Z' }], domains: ['Climate'], types: [{ id: 'ct-rt', name: 'Preset', base: 'template', fields: [{ id: 'f-made', label: 'Made for' }], createdAt: '2026-10-25T09:00:00.000Z' }] }, artifacts: st.artifacts.map(a => a.id === 'a-style' ? { ...a, customType: 'ct-rt', fields: { 'f-made': 'Midjourney' } } : a.id === 'a-deploy' ? { ...a, note: 'Run before every release.', tried: { status: 'worked', note: 'Caught a missing env var', at: '2026-10-24T09:00:00.000Z' }, tags: ['shipping'], links: [{ rel: 'requires', to: 'a-docsmcp' }] } : a) })`);
await go('/library');
const s1 = await readState(page);
const file1 = await backup(page, go, 'from-full.zip');
const s1b = comparable(await readState(page));
ok('the full app backs up a library using later features', s1.organise?.types?.length === 1 && s1.artifacts.some(a => a.note) && fs.statSync(file1).size > 0,
  `${s1.artifacts.length} items, ${s1.boards.length} boards, ${s1.references.length} references, ${(s1.easels ?? []).length} easels, ${s1.trash.length} deleted`);
ok('the full app shows no console errors', errs.length === 0, errs.join(' | '));
await browser.close();

// 2. the release build: restore, open its screens, back up again
({ browser, page, errs, go } = await open(SLICE));
await go('/library');
await restore(page, go, file1);
const s2 = comparable(await readState(page));
const d12 = diff(s1b, s2);
ok('the release build restores every field, later features too', d12.length === 0, d12.join('; '));
for (const p of ['/library', '/library/a-deploy', '/library/a-style', '/collections', '/projects', '/inbox', '/deleted', '/ai', '/settings/data']) {
  await go(p);
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  ok(`the release build opens ${p}`, h1 && !/nothing here|went wrong/i.test(h1), h1);
}
const s2b = comparable(await readState(page));
const d22 = diff(s2, s2b);
ok('opening its screens changes nothing it saved', d22.length === 0, d22.join('; '));
const file2 = await backup(page, go, 'from-release.zip');
ok('the release build shows no console errors', errs.length === 0, errs.join(' | '));
const [k1, k2] = [await images(file1), await images(file2)];
ok('its backup keeps every image, byte for byte', k1.length === 3 && JSON.stringify(k1) === JSON.stringify(k2), `${k1.length} → ${k2.length}`);
await browser.close();

// 3. back to the full app
({ browser, page, errs, go } = await open(FULL));
await go('/library');
await restore(page, go, file2);
const s3 = comparable(await readState(page));
const d13 = diff(s1b, s3);
ok('the full app gets back exactly what it backed up', d13.length === 0, d13.join('; '));
await go('/library/a-style');
ok('the custom type is still on its item', await page.getByRole('button', { name: /^Type: Preset\. Change$/ }).isVisible());
ok('the full app shows no console errors after', errs.length === 0, errs.join(' | '));
await browser.close();

fs.rmSync(TMP, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} round-trip checks passed`);
process.exit(passed === results.length ? 0 : 1);
