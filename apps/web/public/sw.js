/* Capsa service worker (plan item B1: installable, usable offline).
 *
 * Registered only in production builds by src/components/pwa/RegisterServiceWorker.tsx, as /sw.js?v=<build stamp>.
 * The stamp changes with every `next build`, so each build installs a new worker with its own caches, and the page
 * shows "Update available · Reload" while it waits. The library itself lives in IndexedDB and is never touched here.
 *
 * Strategies
 *   /_next/static/*, fonts, /icons/*    cache-first (file names are content-hashed)
 *   /typehints/** (OCR worker, WASM     cache-first at first use (only the core variant this device loads);
 *   core, traineddata)                  a new build revalidates them with a cheap conditional request
 *   page navigations                    network-first; every page opened is kept; offline -> cached copy or /offline
 *   RSC / flight requests               network-first with cache fallback, so client navigation works offline
 *   anything cross-origin               never handled, never cached (privacy)
 *
 * Dynamic records (/inbox/[id], /library/[id], /boards/[id], /easels/[id]) are rendered on demand. Only the exact URLs the user
 * opened are cached; an unopened record shows the offline page instead of another record's page.
 */
'use strict';

const BUILD = new URL(self.location.href).searchParams.get('v') || 'unversioned';
const PREFIX = 'capsa-';
// Cache names from before the rename to Capsa (29 Oct 2026): the first Capsa build carries their visited pages and OCR
// files over like any previous build's, then deletes them.
const PREFIXES = [PREFIX, 'lk-'];
const isOurs = (n, kind = '') => PREFIXES.some(p => n.startsWith(p + kind));
const STATIC = `${PREFIX}static-${BUILD}`;
const PAGES = `${PREFIX}pages-${BUILD}`;
const RSC = `${PREFIX}rsc-${BUILD}`;
const CURRENT = [STATIC, PAGES, RSC];

const OFFLINE = '/offline';
const BUILD_STAMP_URL = '/offline/build';
// Static pages whose HTML carries no record data (it all comes from IndexedDB), so precaching them is safe.
// Pages a feature adds (Library › Sources, the Playground, their Settings sections...) aren't listed here: each feature.ts
// lists its own, and scripts/features.mjs writes this build's into sw-features.gen.js as FEATURE_PAGES (src/lib/features.ts).
try { importScripts('/sw-features.gen.js'); } catch { /* not written: no feature pages */ }
const SETTINGS = ['appearance', 'notifications', 'shortcuts', 'capture', 'groups', 'tags', 'deleted', 'ai', 'storage', 'danger', 'about'].map(x => `/settings/${x}`);
// /capture (the save address, the bookmarklet and the Android share target) saves on this device, so it works offline too
const HELP = ['shortcuts', 'glossary', 'device', 'backup', 'whats-new', 'not-connected'].map(x => `/help/${x}`);
const AI = ['overview', 'mcp', 'files', 'claude', 'chatgpt', 'cursor', 'vscode', 'gemini', 'lechat', 'perplexity'].map(x => `/ai/${x}`);
const SHELL = ['/inbox', '/library', '/collections', '/projects', '/settings', ...SETTINGS, '/help', ...HELP, '/ai', ...AI, ...(self.FEATURE_PAGES ?? []), '/capture', OFFLINE];
const APP_FILES = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
const TYPEHINTS = '/typehints/'; // self-hosted OCR assets (~7 MB); names aren't content-hashed
const MAX_PAGES = 200;
const MAX_RSC = 300;
const NAV_TIMEOUT_MS = 4000; // slow network ("lie-fi"): fall back to a cached copy if one exists

const ASSET_RE = /\/_next\/static\/[A-Za-z0-9_\-.~/%]+?\.(?:js|css|woff2?|ttf|otf)/g;

/* ---------------- install: precache the offline page, the static shell pages and their assets ---------------- */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const [pages, assets] = await Promise.all([caches.open(PAGES), caches.open(STATIC)]);
    await cachePage(OFFLINE, pages, assets); // required: install fails (and is retried later) without it
    await Promise.allSettled([
      ...SHELL.filter(p => p !== OFFLINE).map(p => cachePage(p, pages, assets)),
      // the installed app re-reads its manifest and icons, also offline
      ...APP_FILES.map(async p => { const r = await fetch(p, { cache: 'no-store' }); if (r.ok) await assets.put(p, r); }),
      carryOverTypehints(assets),
      // brand heroes (empty states, both themes): the list is written by scripts/sync-brand-icons.mjs
      (async () => { const r = await fetch('/icons/brand/files.json', { cache: 'no-store' }); if (!r.ok) return; const files = await r.json();
        await Promise.allSettled(files.map(async f => { const x = await fetch(f, { cache: 'no-store' }); if (x.ok) await assets.put(f, x); })); })(),
    ]);
  })());
  // No skipWaiting() here: an update waits until the user chooses "Reload" (or closes every tab).
});

/* ---------------- activate: keep visited pages from the previous build, drop its caches ---------------- */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(n => isOurs(n) && !CURRENT.includes(n));
    await carryOverVisitedPages(names).catch(() => {});
    await Promise.all(names.map(n => caches.delete(n)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------------- fetch routing ---------------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never handle or cache cross-origin requests
  if (url.pathname === BUILD_STAMP_URL || url.pathname === '/sw.js') return;
  // The design-system page (public/design-system/, a static file with its own assets) is not part of the app: never
  // cached, never answered offline, so it can't take room from the user's pages or go stale.
  if (url.pathname === '/design-system' || url.pathname.startsWith('/design-system/')) return;
  if (url.pathname === '/illustrations' || url.pathname.startsWith('/illustrations/')) return; // redirects to the design system's Illustrations tab
  // The taste board and component study (/board, /study -> public/refs/, ~180 MB of images) and their picks: never cached.
  if (/^\/(board|study|refs|api)(\/|$)/.test(url.pathname)) return;

  if (req.mode === 'navigate') { event.respondWith(navigation(event, url)); return; }
  if (req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) { event.respondWith(flight(event, url)); return; }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith(TYPEHINTS) || /\.(?:woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname === '/manifest.webmanifest') { event.respondWith(networkFirstAsset(req)); return; }
  // Everything else (blob/data URLs never reach here) goes to the network untouched.
});

/* Pages: network-first. Successful HTML is stored under its exact URL. */
async function navigation(event, url) {
  const pages = await caches.open(PAGES);
  const key = pageKey(url);
  const network = (async () => {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    if (isCacheableHtml(res)) event.waitUntil(putPage(pages, key, res.clone()));
    return res;
  })();
  try {
    return await withTimeout(network, NAV_TIMEOUT_MS, () => cachedPage(pages, url));
  } catch {
    const hit = await cachedPage(pages, url);
    if (hit) return hit;
    if (url.pathname === '/' && await pages.match('/inbox')) return Response.redirect('/inbox', 302);
    if (url.pathname === OFFLINE) return Response.error(); // offline page missing: don't loop
    const from = url.pathname + url.search;
    return Response.redirect(`${OFFLINE}?from=${encodeURIComponent(from)}`, 302);
  }
}

// Exact URL first; then the same path with another query string (same record, since ids are in the path).
async function cachedPage(pages, url) {
  return (await pages.match(pageKey(url))) || (await pages.match(pageKey(url), { ignoreSearch: true })) || null;
}

/* RSC payloads: network-first; cached under a key that ignores the per-request `_rsc` hash. */
async function flight(event, url) {
  const req = event.request;
  const cache = await caches.open(RSC);
  const key = flightKey(req, url);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').startsWith('text/x-component')) {
      const copy = res.clone();
      const headers = new Headers(copy.headers);
      headers.delete('Vary'); // the key already encodes what varies
      event.waitUntil(cache.put(key, new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers }))
        .then(() => trim(cache, MAX_RSC)).catch(() => {}));
      // A client-side navigation never fetches the page's HTML. Save it too, so the page also survives a reload
      // or a cold start offline (prefetches are skipped: the user hasn't opened those pages).
      if (!req.headers.get('Next-Router-Prefetch')) event.waitUntil(cachePageIfMissing(pagePathFromFlight(url)).catch(() => {}));
    }
    return res;
  } catch {
    const hit = await cache.match(key, { ignoreVary: true });
    if (hit) return hit;
    // An empty, non-flight answer: the Next router quietly falls back to a browser navigation (prefetches just
    // fail), which the navigation handler answers from the page cache or with the offline page. A 204 rather
    // than a 5xx keeps the console free of a "failed to load" error for every link while offline.
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Capsa-Offline': '1' } });
  }
}

function flightKey(req, url) {
  const u = new URL(url.pathname, self.location.origin);
  url.searchParams.forEach((v, k) => { if (k !== '_rsc') u.searchParams.append(k, v); });
  const prefetch = req.headers.get('Next-Router-Prefetch') || '';
  const segment = req.headers.get('Next-Router-Segment-Prefetch') || '';
  u.searchParams.set('__lk_rsc', `${prefetch}|${segment}`);
  return u.href;
}

function pagePathFromFlight(url) {
  const u = new URL(url.pathname, self.location.origin);
  url.searchParams.forEach((v, k) => { if (k !== '_rsc') u.searchParams.append(k, v); });
  return u.pathname + u.search;
}

async function cachePageIfMissing(path) {
  const [pages, assets] = await Promise.all([caches.open(PAGES), caches.open(STATIC)]);
  if (await pages.match(new URL(path, self.location.origin).href)) return;
  await cachePage(path, pages, assets);
  await trim(pages, MAX_PAGES, k => !SHELL.includes(new URL(k).pathname));
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirstAsset(req) {
  const cache = await caches.open(STATIC);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

/* ---------------- helpers ---------------- */
function pageKey(url) { return new URL(url.pathname + url.search, self.location.origin).href; }

function isCacheableHtml(res) {
  return !!res && res.ok && res.status === 200 && res.type === 'basic' && !res.redirected
    && (res.headers.get('content-type') || '').includes('text/html');
}

async function putPage(pages, key, res) {
  await pages.put(key, res);
  await trim(pages, MAX_PAGES, k => !SHELL.includes(new URL(k).pathname));
}

// Oldest entries go first (Cache keys come back in insertion order).
async function trim(cache, max, canDelete = () => true) {
  const keys = await cache.keys();
  const extra = keys.length - max;
  if (extra <= 0) return;
  const victims = keys.filter(r => canDelete(r.url)).slice(0, extra);
  await Promise.all(victims.map(r => cache.delete(r)));
}

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(async () => {
      const alt = await fallback().catch(() => null);
      if (!settled && alt) { settled = true; resolve(alt); }
    }, ms);
    promise.then(
      v => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
      e => { clearTimeout(timer); if (!settled) { settled = true; reject(e); } },
    );
  });
}

// Fetch a page and store it with every /_next/static asset its HTML references (scripts, styles, fonts and the
// client chunks listed in the inline RSC payload), so it renders fully offline.
async function cachePage(path, pages, assets) {
  const res = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
  if (!isCacheableHtml(res)) throw new Error(`Could not cache ${path} (${res.status})`);
  const html = await res.clone().text();
  await pages.put(new URL(path, self.location.origin).href, res);
  await cacheAssets(html, assets);
}

async function cacheAssets(html, assets) {
  const urls = [...new Set((html.match(ASSET_RE) || []))];
  await Promise.allSettled(urls.map(async u => {
    if (await assets.match(u)) return;
    const r = await fetch(u, { credentials: 'same-origin' });
    if (r.ok) await assets.put(u, r);
  }));
}

// The OCR assets are large and keep their names across builds. Install runs online, so keep the previous build's
// copies when the server says they're unchanged (If-None-Match -> 304) and take the new file when it isn't.
async function carryOverTypehints(assets) {
  const old = (await caches.keys()).filter(n => isOurs(n, 'static-') && n !== STATIC);
  for (const name of old) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      if (!new URL(req.url).pathname.startsWith(TYPEHINTS) || await assets.match(req)) continue;
      const prev = await cache.match(req);
      if (!prev) continue;
      const etag = prev.headers.get('ETag');
      try {
        const res = await fetch(req.url, { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {} });
        if (res.status === 304) await assets.put(req, prev);
        else if (res.ok) await assets.put(req, res);
      } catch { /* offline during install is unusual; the file is fetched again on first use */ }
    }
  }
}

// After an update, pages opened under the previous build (records especially) should keep working offline.
// Copy their HTML and the old assets they reference into the new caches; no network needed. Visiting them online
// replaces them with the new build's version.
async function carryOverVisitedPages(oldNames) {
  const oldPages = oldNames.filter(n => isOurs(n, 'pages-'));
  const oldStatic = oldNames.filter(n => isOurs(n, 'static-'));
  if (!oldPages.length) return;
  const [pages, assets] = await Promise.all([caches.open(PAGES), caches.open(STATIC)]);
  for (const name of oldPages) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      if (SHELL.includes(new URL(req.url).pathname) || await pages.match(req)) continue;
      const res = await cache.match(req);
      if (!res) continue;
      const html = await res.clone().text();
      const urls = [...new Set((html.match(ASSET_RE) || []))];
      let complete = true;
      for (const u of urls) {
        if (await assets.match(u)) continue;
        let found = null;
        for (const s of oldStatic) { found = await (await caches.open(s)).match(u); if (found) break; }
        if (found) await assets.put(u, found); else if (/\.(?:js|css)$/.test(u)) complete = false;
      }
      if (complete) await pages.put(req, res); // never carry over a page that would load without its code
    }
  }
  await trim(pages, MAX_PAGES, k => !SHELL.includes(new URL(k).pathname));
}
