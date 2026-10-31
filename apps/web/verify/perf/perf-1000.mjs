// A large library stays fast (build-out Stage 10): 1,000 items and 300 sources, measured in a real browser.
// Usage (dev server on :3100; dev mode is slower than a production build): node verify/perf/perf-1000.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
const LIMIT = { library: 3000, search: 400, palette: 400, inbox: 2500, panel: 400 }; // ms, generous for dev mode
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

for (const which of engines) {
  const browser = await pw[which].launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1080 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  // write a 1,000-item library straight into IndexedDB (the app's own format), then reload
  await page.evaluate(async () => {
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
    const base = st.artifacts, srcs = st.sources;
    const words = ['deploy', 'review', 'agent', 'design', 'release', 'docs', 'image', 'plan', 'test', 'search', 'brief', 'prompt'];
    const arts = Array.from({ length: 1000 }, (_, i) => { const a = base[i % base.length]; const w = words[i % words.length]; return { ...a, id: `perf-a${i}`, title: `${a.title} ${i} ${w}`, savedAt: new Date(Date.now() - i * 36e5).toISOString(), tags: [w], starred: i % 50 === 0 }; });
    const sources = Array.from({ length: 300 }, (_, i) => ({ ...srcs[i % srcs.length], id: `perf-s${i}`, title: `${srcs[i % srcs.length].title} ${i}`, savedAt: new Date(Date.now() - i * 36e5).toISOString() }));
    await new Promise(r => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put({ ...st, artifacts: arts, sources, _at: Date.now() + 1e7 }, 'app'); tx.oncomplete = r; });
  });
  const T = `[${which}]`;
  let t0 = Date.now();
  await page.goto(B + '/library', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('main ul[aria-label="Items"] > li').length > 0, null, { timeout: 30000 });
  const lib = Date.now() - t0;
  const shown = await page.locator('main ul[aria-label="Items"] > li').count();
  ok(`${T} Library with 1,000 items shows its first cards in < ${LIMIT.library} ms`, lib < LIMIT.library, `${lib} ms, ${shown} cards rendered`);
  ok(`${T} the result count says 1,000`, /1000 items/.test(await page.locator('[role="status"]').first().innerText()));
  ok(`${T} only the first page of cards is drawn (150), with a way to see more`, shown === 150 && await page.getByRole('button', { name: /Show 150 more/ }).count() === 1, `${shown}`);
  await page.waitForTimeout(500);
  t0 = Date.now();
  await page.fill('#lib-q', 'release 99');
  await page.waitForFunction(() => /matching/.test(document.querySelector('[role="status"]')?.textContent ?? ''), null, { timeout: 10000 });
  const search = Date.now() - t0;
  ok(`${T} searching 1,000 items updates in < ${LIMIT.search} ms`, search < LIMIT.search, `${search} ms · ${await page.locator('[role="status"]').first().innerText()}`);
  await page.fill('#lib-q', '');
  // wait until the whole library is back before scrolling (the clear once lost to the URL catching up; LibraryView)
  await page.waitForFunction(() => !/matching/.test(document.querySelector('[role="status"]')?.textContent ?? '') && document.querySelectorAll('main ul[aria-label="Items"] > li').length >= 150, null, { timeout: 10000 }).catch(() => {});
  await page.locator('main').evaluate(m => m.scrollTo(0, m.scrollHeight));
  await page.waitForFunction(() => document.querySelectorAll('main ul[aria-label="Items"] > li').length >= 300, null, { timeout: 10000 }).catch(() => {});
  ok(`${T} scrolling to the end loads the next page`, (await page.locator('main ul[aria-label="Items"] > li').count()) >= 300, String(await page.locator('main ul[aria-label="Items"] > li').count()));
  await page.locator('main').evaluate(m => m.scrollTo(0, 0));
  // focus no longer moves the right panel (Elvis, 23 Oct): time "Open in panel" from a card's ⋯ menu instead
  await page.locator('main ul[aria-label="Items"] > li').nth(3).getByRole('button', { name: /^More for / }).click();
  const openIn = page.getByRole('group', { name: /^Organise / }).getByRole('button', { name: 'Open in panel' });
  await openIn.waitFor();
  t0 = Date.now();
  await openIn.click();
  await page.waitForFunction(() => !!document.querySelector('section[aria-label^="Selected item:"]'), null, { timeout: 10000 });
  const panel = Date.now() - t0;
  ok(`${T} Open in panel shows the item in < ${LIMIT.panel} ms`, panel < LIMIT.panel, `${panel} ms`);
  await page.keyboard.press(which === 'webkit' ? 'Meta+k' : 'Control+k');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
  t0 = Date.now();
  await page.keyboard.type('deploy release');
  // Wait for results that belong to the typed words (the list carries the query it shows), not the list from before typing
  await page.waitForFunction(() => document.querySelector('#pal-list')?.dataset.q === 'deploy release' && document.querySelectorAll('#pal-list [role="option"]').length > 3, null, { timeout: 10000 });
  const pal = Date.now() - t0;
  ok(`${T} ⌘K search across everything answers in < ${LIMIT.palette} ms`, pal < LIMIT.palette, `${pal} ms (typing included)`);
  await page.keyboard.press('Escape');
  t0 = Date.now();
  await page.goto(B + '/inbox', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('[data-inbox-list] a').length > 0, null, { timeout: 30000 });
  const inbox = Date.now() - t0;
  ok(`${T} Inbox with 300 sources shows in < ${LIMIT.inbox} ms`, inbox < LIMIT.inbox, `${inbox} ms`);
  ok(`${T} no page errors`, errs.length === 0, errs.join(' | '));
  await browser.close();
}
console.log(`\n${pass}/${pass + fail} performance checks passed`);
process.exit(fail ? 1 : 0);
