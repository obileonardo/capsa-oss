// The service worker after the rename to Capsa (issue #113): caches a LibraryKit build left behind (lk-static-…,
// lk-pages-…) are carried over like any previous build's (a page visited offline still opens) and then deleted.
// Needs a PRODUCTION server (the worker is never registered by `next dev`):
//   npm run build && npx next start --port 3101 --hostname 127.0.0.1
//   CAPSA_BASE=http://127.0.0.1:3101 node verify/rename/sw.mjs
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
const require = createRequire(playwrightFrom());
const pw = require('playwright');
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3101';
const results = [];
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };

const browser = await pw.chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.route(B + '/__seed', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
await page.goto(B + '/__seed');
// what a LibraryKit build left: a visited record page and the script it needs, under the old prefix
const VISITED = '/library/a-old-visit', ASSET = '/_next/static/chunks/old-build-only.js';
await page.evaluate(async ({ VISITED, ASSET }) => {
  const statics = await caches.open('lk-static-oldbuild'), pages = await caches.open('lk-pages-oldbuild');
  await statics.put(ASSET, new Response('/* old build */', { headers: { 'Content-Type': 'text/javascript' } }));
  await pages.put(VISITED, new Response(`<!doctype html><title>Visited before the rename</title><script src="${ASSET}"></script>`, { headers: { 'Content-Type': 'text/html' } }));
  await caches.open('lk-rsc-oldbuild');
}, { VISITED, ASSET });
ok('the old build\'s caches are there to begin with', (await page.evaluate(() => caches.keys())).filter(n => n.startsWith('lk-')).length === 3);

await page.goto(B + '/library', { waitUntil: 'networkidle' });
await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return r?.active?.state === 'activated'; }, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const after = await page.evaluate(async ({ VISITED, ASSET }) => {
  const names = await caches.keys();
  const pages = names.find(n => n.startsWith('capsa-pages-')), statics = names.find(n => n.startsWith('capsa-static-'));
  return { names, page: !!(pages && await (await caches.open(pages)).match(VISITED)), asset: !!(statics && await (await caches.open(statics)).match(ASSET)) };
}, { VISITED, ASSET });
ok('no cache is left under the old prefix', !after.names.some(n => n.startsWith('lk-')), after.names.join(', '));
ok('the new caches use the capsa- prefix', after.names.length > 0 && after.names.every(n => n.startsWith('capsa-')), after.names.join(', '));
ok('a page visited under the old build is carried over', after.page);
ok('with the script it needs', after.asset);
await ctx.setOffline(true);
const off = await ctx.newPage();
await off.goto(B + VISITED).catch(() => {});
ok('offline, that page still opens', /Visited before the rename/.test(await off.title().catch(() => '')), await off.title().catch(() => ''));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} service worker checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
