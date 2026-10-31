// PWA verification: manifest and icons, service worker, offline reload and client navigation, the offline page,
// the update toast, the Settings install row, and what applies in WebKit.
//
// Needs a PRODUCTION server (the worker is never registered by `next dev`):
//   npm run build && npx next start --port 3101 --hostname 127.0.0.1
//   node verify/pwa/verify.mjs [all|chromium|webkit]            (default: all)
// A real rebuild instead of the simulated one (step 6) is checked in two runs with one browser profile:
//   node verify/pwa/verify.mjs prime  ->  npm run build, restart next start  ->  node verify/pwa/verify.mjs after-rebuild
// Screenshots land next to this script. CAPSA_BASE overrides the server URL.
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.CAPSA_BASE || 'http://127.0.0.1:3101';
const PROFILE = path.join(os.tmpdir(), 'capsa-pwa-verify-profile');
const MODE = (process.argv[2] || 'all').toLowerCase();
if (!['all', 'chromium', 'webkit', 'prime', 'after-rebuild'].includes(MODE)) {
  console.error('Usage: node verify.mjs [all|chromium|webkit|prime|after-rebuild]'); process.exit(2);
}

let engine = 'chromium';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ engine, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ' — ' + detail : ''}`);
};
const info = (msg) => console.log(`INFO [${engine}] ${msg}`);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${engine}-${name}.png`) });
const u = p => BASE + p;

/* ---------------- page helpers ---------------- */
async function appReady(page) {
  await page.waitForFunction(() => {
    const m = document.querySelector('main');
    return !!m && !m.textContent.includes('Loading your library');
  }, null, { timeout: 15000 });
}
const h1 = page => page.evaluate(() => document.querySelector('main h1')?.textContent?.trim() ?? '');
// (read again if the page navigated meanwhile: a worker that takes control can reload the page once)
const links = async (page, prefix, tries = 3) => {
  try { return await page.evaluate(p => [...new Set([...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith(p)))], prefix); }
  catch (e) { if (tries > 1 && /Execution context was destroyed/.test(e.message)) { await page.waitForLoadState('load'); await appReady(page); return links(page, prefix, tries - 1); } throw e; }
};

// Inbox rows select on a wide-screen click and open on Enter (like the user's keyboard flow).
const openByKeyboard = async (page, sel) => { await page.focus(sel); await page.keyboard.press('Enter'); };
const atPath = (page, p) => page.waitForFunction(x => location.pathname === x, p, { timeout: 15000 });

async function swState(page) {
  return page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 15000))]);
    if (!reg) return null;
    if (!navigator.serviceWorker.controller) await new Promise(r => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 10000); });
    const a = reg.active;
    if (a && a.state !== 'activated') await new Promise(r => { a.addEventListener('statechange', () => a.state === 'activated' && r(), { once: false }); setTimeout(r, 10000); });
    return { state: reg.active?.state, url: reg.active?.scriptURL, controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() };
  });
}
async function cachedPaths(page, kind = 'pages') {
  return page.evaluate(async k => {
    const names = (await caches.keys()).filter(n => n.startsWith(`capsa-${k}-`));
    const out = [];
    for (const n of names) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return out;
  }, kind);
}
async function waitCached(page, pathname, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if ((await cachedPaths(page)).includes(pathname)) return true; await page.waitForTimeout(250); }
  return false;
}
async function runAxe(page) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length })));
  return r.filter(v => v.impact === 'serious' || v.impact === 'critical');
}
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
function watchConsole(page, bucket) {
  page.on('console', m => { if (m.type() === 'error') bucket.push(`${m.text()} @ ${page.url()}`); });
  page.on('pageerror', e => bucket.push(`pageerror: ${e.message} @ ${page.url()}`));
}

// Type hints lab: generate the sample image and press "Measure type" (OCR in a worker from /typehints/).
async function measureOnLab(page, url) {
  await page.goto(url); await appReady(page);
  await page.getByRole('button', { name: 'Generate sample' }).click();
  await page.getByRole('button', { name: 'Measure type', exact: true }).click();
  const out = await Promise.race([
    page.locator('[data-testid="typehints-json"]').waitFor({ state: 'attached', timeout: 90000 }).then(() => 'result'),
    page.getByText('Couldn’t run the text reader').waitFor({ timeout: 90000 }).then(() => 'error'),
  ]).catch(() => 'timeout');
  const detail = out === 'result'
    ? (j => `measured from pixels by ${j.engine} in ${j.run?.ms} ms`)(JSON.parse(await page.locator('[data-testid="typehints-json"]').textContent()))
    : out === 'error' ? (await page.locator('main').innerText()).match(/Couldn’t run the text reader[^\n]*\n?[^\n]*/)?.[0] : out;
  return { ok: out === 'result', detail };
}
const typehintsCached = page => page.evaluate(async () => {
  const out = [];
  for (const n of (await caches.keys()).filter(k => k.startsWith('capsa-static-'))) for (const r of await (await caches.open(n)).keys()) { const p = new URL(r.url).pathname; if (p.startsWith('/typehints/')) out.push(p.replace('/typehints/', '')); }
  return out;
});

/* ---------------- 1. manifest and icons ---------------- */
async function checkManifest(page) {
  await page.goto(u('/inbox'), { waitUntil: 'networkidle' });
  const href = await page.evaluate(() => document.querySelector('head link[rel="manifest"]')?.getAttribute('href'));
  ok('manifest linked in <head>', href === '/manifest.webmanifest', href);
  const res = await page.request.get(u('/manifest.webmanifest'));
  const m = await res.json().catch(() => ({}));
  ok('manifest loads (200, JSON)', res.status() === 200, `${res.status()} ${res.headers()['content-type']}`);
  ok('name and short_name are "Capsa"', m.name === 'Capsa' && m.short_name === 'Capsa');
  ok('display standalone, start_url in scope', m.display === 'standalone' && m.start_url === '/inbox' && m.scope === '/');
  ok('theme and background match light --bg #f7f7f6', m.theme_color === '#f7f7f6' && m.background_color === '#f7f7f6');
  const want = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable'], ['180x180', undefined]];
  for (const [sizes, purpose] of want) {
    const icon = (m.icons || []).find(i => i.sizes === sizes && (purpose ? i.purpose === purpose : !i.purpose));
    if (!icon) { ok(`icon ${sizes} ${purpose ?? 'apple'} declared`, false); continue; }
    const r = await page.request.get(u(icon.src));
    const buf = await r.body();
    const { w, h } = pngSize(buf);
    const n = Number(sizes.split('x')[0]);
    ok(`icon ${icon.src} resolves as a ${sizes} PNG`, r.status() === 200 && r.headers()['content-type'] === 'image/png' && w === n && h === n, `${r.status()} ${w}x${h}`);
  }
  const apple = await page.evaluate(() => {
    const l = document.querySelector('head link[rel="apple-touch-icon"]');
    return l ? l.getAttribute('href') : null;
  });
  ok('apple-touch-icon linked in <head>', apple === '/icons/apple-touch-icon.png', apple);
}

/* ---------------- Chromium: full flow ---------------- */
async function chromiumFlow() {
  engine = 'chromium';
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = { online: [], offline: [] };
  let phase = 'online';
  page.on('console', m => { if (m.type() === 'error') errors[phase].push(`${m.text()} @ ${page.url()}`); });
  page.on('pageerror', e => errors[phase].push(`pageerror: ${e.message} @ ${page.url()}`));

  await checkManifest(page);

  // 2. service worker
  await appReady(page);
  const sw = await swState(page);
  ok('service worker activates', sw?.state === 'activated', sw?.url);
  ok('worker URL carries the build stamp', /\/sw\.js\?v=[\w-]+$/.test(sw?.url || ''));
  ok('page is controlled (clients.claim on first visit)', sw?.controlled === true);
  const v = new URL(sw.url).searchParams.get('v');
  ok('versioned caches exist for this build', ['static', 'pages'].every(k => sw.caches.includes(`capsa-${k}-${v}`)), sw.caches.join(', '));
  const pre = await cachedPaths(page);
  ok('offline page and shell pages precached', ['/offline', '/inbox', '/library', '/playground', '/settings'].every(p => pre.includes(p)), pre.join(' '));

  // 3. visit Inbox, one inbox record, Library, one artifact, Boards, one board (client navigation, like a user)
  await page.reload(); await appReady(page);
  const inboxLinks = await links(page, '/inbox/');
  const inboxCountOnline = inboxLinks.length;
  const sourceUrl = inboxLinks[0];
  await openByKeyboard(page, `main a[href=\"${sourceUrl}\"]`); await atPath(page, sourceUrl); await appReady(page);
  const sourceTitle = await h1(page);
  await page.click('nav a[href="/library"]'); await atPath(page, '/library'); await appReady(page);
  const artifactLinks = await links(page, '/library/');
  const artifactUrl = artifactLinks[0];
  await page.click(`main a[href="${artifactUrl}"]`); await atPath(page, artifactUrl); await appReady(page);
  const artifactTitle = await h1(page);
  await page.click('nav a[href="/playground"]'); await atPath(page, '/playground'); await appReady(page);
  await page.getByRole('button', { name: /sample (board|images)/i }).first().click();
  await page.waitForFunction(() => /^\/boards\/[^/]+$/.test(location.pathname), null, { timeout: 15000 }); await appReady(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-card] img').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const cardCount = await page.locator('[data-card]').count();
  const boardUrl = new URL(page.url()).pathname;
  const boardTitle = await h1(page);
  info(`visited ${sourceUrl} "${sourceTitle}", ${artifactUrl} "${artifactTitle}", ${boardUrl} "${boardTitle}"`);
  for (const p of [sourceUrl, artifactUrl, boardUrl]) ok(`page opened by client navigation is saved for offline: ${p}`, await waitCached(page, p));
  await shot(page, '01-board-online');
  const labOnline = await measureOnLab(page, u('/typehints-lab'));
  ok('type hints: Measure type works online (assets fetched once)', labOnline.ok, labOnline.detail);
  const th = await typehintsCached(page);
  ok('type hints: worker, one WASM core and traineddata cached', th.includes('worker.min.js') && th.some(x => x.startsWith('core/')) && th.some(x => x.startsWith('lang/eng.traineddata')), th.join(', '));

  // 4. offline
  phase = 'offline';
  await context.setOffline(true);
  const reload = async (p) => { const r = await page.goto(u(p)); await appReady(page); return r; };
  let r = await reload('/inbox');
  ok('offline reload: Inbox shows its list from IndexedDB', !page.url().includes('/offline') && (await links(page, '/inbox/')).length === inboxCountOnline, `${(await links(page, '/inbox/')).length}/${inboxCountOnline} rows, status ${r?.status()}`);
  await reload('/library');
  ok('offline reload: Library shows its artifacts', (await links(page, '/library/')).length === artifactLinks.length);
  await reload('/boards');
  ok('offline reload: Boards lists the board', (await links(page, '/boards/')).includes(boardUrl));
  await reload(boardUrl);
  await page.waitForFunction(n => document.querySelectorAll('[data-card]').length === n, cardCount, { timeout: 10000 }).catch(() => {});
  const imgs = await page.evaluate(() => [...document.querySelectorAll('[data-card] img')].filter(i => i.complete && i.naturalWidth > 0).length);
  ok(`offline reload: board shows its title and ${cardCount} references with images`, (await h1(page)) === boardTitle && imgs >= cardCount, `"${await h1(page)}", ${imgs} images`);
  await shot(page, '02-board-offline-reload');
  await reload(artifactUrl);
  ok('offline reload: artifact detail shows the same artifact', (await h1(page)) === artifactTitle, await h1(page));
  await reload(sourceUrl);
  ok('offline reload: inbox record shows the same source', (await h1(page)) === sourceTitle, await h1(page));

  // OCR from a cold page load, offline: a fresh worker loads its script, WASM core and traineddata from the cache
  const labOffline = await measureOnLab(page, u('/typehints-lab'));
  ok('type hints: Measure type works offline', labOffline.ok, labOffline.detail);
  await shot(page, '02b-typehints-offline');

  // client navigation between visited pages, offline
  await reload('/inbox');
  await page.evaluate(() => { window.__lkSoft = true; });
  await page.click('nav a[href="/library"]'); await atPath(page, '/library'); await appReady(page);
  ok('offline client nav: Inbox -> Library', (await links(page, '/library/')).length === artifactLinks.length);
  await page.click(`main a[href="${artifactUrl}"]`); await atPath(page, artifactUrl); await appReady(page);
  ok('offline client nav: Library -> artifact', (await h1(page)) === artifactTitle);
  await page.click('nav a[href="/playground"]'); await atPath(page, '/playground'); await appReady(page);
  ok('offline client nav: artifact -> Boards', (await links(page, '/boards/')).includes(boardUrl));
  await page.click(`main a[href="${boardUrl}"]`); await atPath(page, boardUrl); await appReady(page);
  await page.waitForFunction(n => document.querySelectorAll('[data-card]').length === n, cardCount, { timeout: 10000 }).catch(() => {});
  ok('offline client nav: Boards -> board', (await h1(page)) === boardTitle && (await page.locator('[data-card]').count()) === cardCount);
  await page.click('nav a[href="/inbox"]'); await atPath(page, '/inbox'); await appReady(page);
  await openByKeyboard(page, `main a[href=\"${sourceUrl}\"]`); await atPath(page, sourceUrl); await appReady(page);
  ok('offline client nav: Inbox -> inbox record', (await h1(page)) === sourceTitle);
  const soft = await page.evaluate(() => window.__lkSoft === true);
  ok('offline client navigation stayed in-app (no full reload)', soft, soft ? 'soft navigation throughout' : 'fell back to a full page load');

  // unvisited dynamic pages -> offline page, never another record
  await page.goto(u('/boards/b-never-opened')); await appReady(page);
  const offUrl = new URL(page.url());
  ok('unvisited board (typed URL) shows the offline page', offUrl.pathname === '/offline' && offUrl.searchParams.get('from') === '/boards/b-never-opened', page.url());
  const offText = await page.evaluate(() => document.querySelector('main').innerText);
  ok('offline page says what works', offText.includes('You’re offline') && offText.includes('Pages you’ve opened before still work. Your library is on this device.'));
  ok('offline page explains the unopened item', offText.includes('hasn’t been opened on this device yet'));
  const offLinks = await page.evaluate(() => [...document.querySelectorAll('main a')].map(a => `${a.textContent.trim()}=${a.getAttribute('href')}`));
  ok('offline page links to Inbox, Library and Playground (Boards was renamed Playground in #84)', ['Inbox=/inbox', 'Library=/library', 'Playground=/playground'].every(x => offLinks.includes(x)), offLinks.join(' '));
  ok('offline page doesn’t show another record', !offText.includes(boardTitle) || boardTitle === '', boardTitle);
  await shot(page, '03-offline-page-1440-light');
  let axe = await runAxe(page);
  ok('axe: offline page has no serious/critical issues (light)', axe.length === 0, JSON.stringify(axe));
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(500); // let colour transitions settle before measuring contrast
  axe = await runAxe(page);
  ok('axe: offline page has no serious/critical issues (dark)', axe.length === 0, JSON.stringify(axe));
  await shot(page, '04-offline-page-1440-dark');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700); // the shell's sidebar slides away at this width
  await shot(page, '05-offline-page-390-light');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok('offline page fits 390 px without sideways scroll', !overflow);
  await page.setViewportSize({ width: 1440, height: 900 });

  const otherSource = inboxLinks.find(h => h !== sourceUrl);
  await reload('/inbox');
  await openByKeyboard(page, `main a[href=\"${otherSource}\"]`);
  await page.waitForURL(/\/offline\?from=/, { timeout: 10000 }).catch(() => {});
  await appReady(page);
  ok('unvisited inbox record (client nav) shows the offline page, not the cached record', new URL(page.url()).pathname === '/offline' && (await h1(page)) === 'You’re offline', page.url());
  await page.click('main a[href="/library"]'); await atPath(page, '/library'); await appReady(page);
  ok('offline page’s Library link works offline', (await links(page, '/library/')).length === artifactLinks.length);

  // 5. typing is never interrupted; back online, a new build shows the update toast
  phase = 'online';
  await context.setOffline(false);
  const fakeBuild = `verify-${Date.now().toString(36)}`;
  await context.route('**/offline/build', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: fakeBuild }) }));
  await page.goto(u('/inbox')); await appReady(page);
  const toast = page.locator('.toast', { hasText: 'Update available' });
  const toastShown = await toast.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
  ok('new build: "Update available · Reload" toast appears', toastShown && (await toast.getByRole('button', { name: 'Reload' }).count()) === 1);
  await shot(page, '06-update-toast');
  // the user is typing: nothing reloads by itself
  const t0 = await page.evaluate(() => performance.timeOrigin);
  await page.keyboard.press('c');
  const field = page.locator('dialog[open] :is(textarea, input):focus'); // C focuses Capture's field (its file input comes first)
  await field.fill('half-typed note');
  await page.waitForTimeout(3000);
  const t1 = await page.evaluate(() => performance.timeOrigin);
  ok('no reload while typing (update waits for the user)', t0 === t1 && (await field.inputValue()) === 'half-typed note');
  await page.keyboard.press('Escape');
  if (!(await toast.isVisible())) { await page.reload(); await appReady(page); await toast.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}); }
  await Promise.all([page.waitForEvent('load', { timeout: 20000 }), toast.getByRole('button', { name: 'Reload' }).click()]);
  await appReady(page);
  const sw2 = await swState(page);
  ok('Reload activates the new worker and reloads', sw2?.url?.endsWith(`v=${fakeBuild}`), sw2?.url);
  ok('old caches are deleted on activate', !sw2.caches.some(c => c.endsWith(v)) && sw2.caches.includes(`capsa-pages-${fakeBuild}`), sw2.caches.join(', '));
  const carried = await cachedPaths(page);
  ok('pages opened before the update are carried over', [boardUrl, artifactUrl, sourceUrl].every(p => carried.includes(p)));
  await context.unroute('**/offline/build');
  phase = 'offline';
  await context.setOffline(true);
  await reload(boardUrl);
  ok('after the update, the board still opens offline', (await h1(page)) === boardTitle);
  await context.setOffline(false);
  phase = 'online';

  // 6. Settings: Install app row (Chromium path via beforeinstallprompt)
  await page.goto(u('/settings/about')); await appReady(page);
  const row = page.locator('[data-install-row]');
  ok('Settings has an "Install app" row', (await row.count()) === 1 && (await row.innerText()).includes('Install app'));
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { window.__lkPrompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(e);
  });
  const btn = row.getByRole('button', { name: 'Install app' });
  ok('beforeinstallprompt shows an Install app button', await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false));
  await row.scrollIntoViewIfNeeded();
  await shot(page, '07-settings-install-row');
  await btn.click();
  const prompted = await page.waitForFunction(() => window.__lkPrompted === true, null, { timeout: 5000 }).then(() => true, () => false);
  ok('Install app calls the browser prompt and confirms', prompted && await page.locator('.toast', { hasText: 'Capsa installed' }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  ok('after install the row says it’s installed', (await row.innerText()).includes('Capsa is installed'));
  await page.waitForTimeout(600); // let the toast finish animating in before measuring contrast
  axe = await runAxe(page);
  ok('axe: Settings has no serious/critical issues', axe.length === 0, JSON.stringify(axe));

  // 7. privacy: nothing cross-origin in any cache
  const all = await page.evaluate(async () => {
    const out = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(r.url);
    return out;
  });
  ok('caches hold only same-origin URLs', all.length > 0 && all.every(x => x.startsWith(BASE + '/')), `${all.length} entries`);

  ok('no console errors online', errors.online.length === 0, errors.online.slice(0, 5).join(' | '));
  ok('no console errors offline', errors.offline.length === 0, errors.offline.slice(0, 5).join(' | '));
  await browser.close();
}

/* ---------------- WebKit: what applies ---------------- */
// Playwright's offline emulation in WebKit fails every request before the service worker can answer (even
// cache-first assets), so it can't show offline behaviour. Instead WebKit runs against a local proxy that is
// switched off: a real "can't reach the server" failure that the worker has to handle.
function startProxy(port) {
  const sockets = new Set();
  const target = new URL(BASE);
  let stamp = null; // when set, the proxy answers the build-stamp URL itself, as a new build would
  const server = http.createServer((req, res) => {
    if (stamp && req.url.startsWith('/offline/build')) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' }); res.end(JSON.stringify({ build: stamp })); return; }
    const up = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => res.destroy());
    req.pipe(up);
  });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return {
    up: () => new Promise(r => server.listen(port, '127.0.0.1', r)),
    newBuild: s => { stamp = s; },
    down: () => new Promise(r => { server.close(() => r()); sockets.forEach(s => s.destroy()); }),
  };
}

async function webkitFlow() {
  engine = 'webkit';
  const browser = await pw.webkit.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errs = { online: [], down: [] };
  let phase = 'online';
  page.on('console', m => { if (m.type() === 'error') errs[phase].push(`${m.text()} @ ${page.url()}`); });
  page.on('pageerror', e => errs[phase].push(`pageerror: ${e.message} @ ${page.url()}`));
  const failedDown = new Map();
  page.on('requestfailed', r => { if (phase === 'down') { const k = new URL(r.url()).pathname.replace(/[^/]+\.(js|css)$/, '*.$1'); failedDown.set(k, (failedDown.get(k) || 0) + 1); } });
  await checkManifest(page);

  const PORT = Number(new URL(BASE).port || 80) + 2;
  const P = `http://127.0.0.1:${PORT}`;
  const w = p => P + p;
  const proxy = startProxy(PORT);
  await proxy.up();
  try {
    await page.goto(w('/inbox')); await appReady(page);
    const sw = await swState(page);
    ok('service worker activates and controls the page', sw?.state === 'activated' && sw?.controlled, sw?.url);
    // visit pages the way a user would
    const inboxN = (await links(page, '/inbox/')).length;
    await page.click('nav a[href="/library"]'); await atPath(page, '/library'); await appReady(page);
    const artifactLinks = await links(page, '/library/');
    const artifactUrl = artifactLinks[0];
    await page.click(`main a[href="${artifactUrl}"]`); await atPath(page, artifactUrl); await appReady(page);
    const artifactTitle = await h1(page);
    await page.click('nav a[href="/playground"]'); await atPath(page, '/playground'); await appReady(page);
    await page.getByRole('button', { name: /sample (board|images)/i }).first().click();
    await page.waitForFunction(() => /^\/boards\/[^/]+$/.test(location.pathname), null, { timeout: 20000 }); await appReady(page);
    await page.waitForFunction(() => document.querySelectorAll('[data-card] img').length > 0, null, { timeout: 20000 });
    const boardUrl = new URL(page.url()).pathname;
    const boardTitle = await h1(page);
    ok('pages opened by client navigation are saved', await waitCached(page, boardUrl) && await waitCached(page, artifactUrl));
    const labOnline = await measureOnLab(page, w('/typehints-lab'));
    ok('type hints: Measure type works online', labOnline.ok, labOnline.detail);
    info(`type hints assets cached: ${(await typehintsCached(page)).join(', ') || 'none'}`);

    phase = 'down';
    await proxy.down();
    const reload = async p => { await page.goto(w(p)); await appReady(page); };
    await reload('/inbox');
    ok('server unreachable: Inbox reloads with its list', (await links(page, '/inbox/')).length === inboxN);
    await reload(artifactUrl);
    ok('server unreachable: artifact reloads (same artifact)', (await h1(page)) === artifactTitle);
    await reload(boardUrl);
    ok('server unreachable: board reloads (same board)', (await h1(page)) === boardTitle);
    await shot(page, '02-board-server-down');
    const labDown = await measureOnLab(page, w('/typehints-lab'));
    ok('type hints: Measure type works with the server unreachable', labDown.ok, labDown.detail);
    await page.evaluate(() => { window.__lkSoft = true; });
    await page.click('nav a[href="/library"]'); await atPath(page, '/library'); await appReady(page);
    await page.click(`main a[href="${artifactUrl}"]`); await atPath(page, artifactUrl); await appReady(page);
    ok('server unreachable: client nav Board -> Library -> artifact', (await h1(page)) === artifactTitle);
    info(`client navigation while unreachable: ${await page.evaluate(() => window.__lkSoft === true) ? 'stayed in-app' : 'fell back to full page loads'}`);
    await page.goto(w('/library/a-never-opened')); await appReady(page);
    ok('server unreachable: unopened artifact shows the offline page', new URL(page.url()).pathname === '/offline' && (await h1(page)) === 'You’re offline', page.url());
    await shot(page, '03-offline-page-1440-light');
    const axe = await runAxe(page);
    ok('axe: offline page has no serious/critical issues', axe.length === 0, JSON.stringify(axe));
    info(`console errors while the server was unreachable (expected network failures): ${errs.down.length}${errs.down.length ? ' — ' + errs.down[0] : ''}`);
    info(`distinct errors while unreachable: ${[...new Set(errs.down.map(e => e.replace(/ @ .*/, "")))].join(" | ")}`);
    info(`requests that failed while unreachable: ${[...failedDown].map(([k, n]) => `${k} ×${n}`).join(', ') || 'none'}`);

    phase = 'online';
    await proxy.up();
    const fakeBuild = `verify-wk-${Date.now().toString(36)}`;
    proxy.newBuild(fakeBuild);
    await page.goto(w('/inbox')); await appReady(page);
    const toast = page.locator('.toast', { hasText: 'Update available' });
    ok('new build: update toast appears', await toast.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false));
    await shot(page, '06-update-toast');
    await Promise.all([page.waitForEvent('load', { timeout: 20000 }), toast.getByRole('button', { name: 'Reload' }).click()]);
    await appReady(page);
    const sw2 = await swState(page);
    ok('Reload switches to the new worker', !!sw2?.url?.endsWith(`v=${fakeBuild}`), sw2?.url);
  } finally {
    await proxy.down().catch(() => {});
  }

  // Playwright's own offline switch, reported for the record
  const p2 = await context.newPage();
  await p2.goto(u('/library')); await appReady(p2); await swState(p2);
  await context.setOffline(true);
  const res = await p2.goto(u('/library')).then(() => 'loads', e => `fails (${e.message.split('\n')[0]})`);
  info(`context.setOffline(true) + reload in Playwright WebKit: ${res}`);
  await context.setOffline(false);
  await p2.close();

  await page.goto(u('/settings/about')); await appReady(page);
  const rowText = await page.locator('[data-install-row]').innerText();
  ok('Settings tells Safari users: File › Add to Dock', rowText.includes('In Safari: File › Add to Dock'), rowText.replace(/\s+/g, ' '));
  ok('no Install button where beforeinstallprompt isn’t supported', (await page.locator('[data-install-row] button').count()) === 0);
  await page.locator('[data-install-row]').scrollIntoViewIfNeeded();
  await shot(page, '07-settings-install-row');
  ok('no console errors while online', errs.online.length === 0, errs.online.slice(0, 5).join(' | '));
  await browser.close();
}

/* ---------------- real rebuild: prime, then after-rebuild ---------------- */
async function prime() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const context = await pw.chromium.launchPersistentContext(PROFILE, { viewport: { width: 1440, height: 900 } });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(u('/boards')); await appReady(page);
  const sw = await swState(page);
  ok('prime: worker active', sw?.state === 'activated', sw?.url);
  await page.getByRole('button', { name: /sample (board|images)/i }).first().click();
  await page.waitForFunction(() => /^\/boards\/[^/]+$/.test(location.pathname), null, { timeout: 15000 }); await appReady(page);
  const boardUrl = new URL(page.url()).pathname;
  ok('prime: board saved for offline', await waitCached(page, boardUrl));
  // make sure the board itself is written to IndexedDB before the profile is closed
  await page.waitForTimeout(1500);
  await page.reload(); await appReady(page);
  ok('prime: board persisted on this device', !(await page.locator('main').innerText()).includes('isn’t on this device'));
  const boardTitle = await h1(page);
  const lab = await measureOnLab(page, u('/typehints-lab'));
  ok('prime: type hints measured (OCR assets cached)', lab.ok, lab.detail);
  fs.writeFileSync(path.join(PROFILE, 'capsa-verify.json'), JSON.stringify({ build: new URL(sw.url).searchParams.get('v'), boardUrl, boardTitle }));
  await context.close();
  console.log('Now rebuild (npm run build), restart next start, then run: node verify/pwa/verify.mjs after-rebuild');
}
async function afterRebuild() {
  const saved = JSON.parse(fs.readFileSync(path.join(PROFILE, 'capsa-verify.json'), 'utf8'));
  const context = await pw.chromium.launchPersistentContext(PROFILE, { viewport: { width: 1440, height: 900 } });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(u('/inbox')); await appReady(page);
  const toast = page.locator('.toast', { hasText: 'Update available' });
  ok('real rebuild: update toast appears', await toast.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false));
  await shot(page, '08-update-toast-real-rebuild');
  await Promise.all([page.waitForEvent('load', { timeout: 20000 }), toast.getByRole('button', { name: 'Reload' }).click()]);
  await appReady(page);
  const sw = await swState(page);
  const now = new URL(sw.url).searchParams.get('v');
  ok('real rebuild: new worker took over', now !== saved.build, `${saved.build} -> ${now}`);
  ok('real rebuild: old caches removed', !sw.caches.some(c => c.endsWith(saved.build)), sw.caches.join(', '));
  ok('real rebuild: board opened before the update is still saved', (await cachedPaths(page)).includes(saved.boardUrl));
  await context.setOffline(true);
  await page.goto(u(saved.boardUrl)); await appReady(page);
  ok('real rebuild: that board opens offline', (await h1(page)) === saved.boardTitle);
  const th = await typehintsCached(page);
  ok('real rebuild: OCR assets kept (revalidated, not re-downloaded)', th.includes('worker.min.js') && th.some(x => x.startsWith('core/')), th.join(', '));
  const lab = await measureOnLab(page, u('/typehints-lab'));
  ok('real rebuild: Measure type works offline', lab.ok, lab.detail);
  await context.close();
}

try {
  if (MODE === 'all' || MODE === 'chromium') await chromiumFlow();
  if (MODE === 'all' || MODE === 'webkit') await webkitFlow();
  if (MODE === 'prime') { engine = 'chromium'; await prime(); }
  if (MODE === 'after-rebuild') { engine = 'chromium'; await afterRebuild(); }
} catch (e) {
  ok(`run completed without an exception`, false, e.stack?.split('\n').slice(0, 3).join(' '));
}
fs.writeFileSync(path.join(OUT, `results-${MODE}.json`), JSON.stringify(results, null, 2));
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
