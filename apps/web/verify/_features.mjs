// Which features the app under test has (src/lib/features.ts). A public release snapshot leaves later features out, so a
// suite skips the steps that need one, and checks instead that the core doesn't show it. The app lists its features in
// <meta name="capsa-features"> (app/layout.tsx); call features() after any page of the app has loaded.
let cached;
/** The build's feature ids, read once from the page. */
export async function features(page) {
  if (!cached) cached = new Set((await page.evaluate(() => document.querySelector('meta[name="capsa-features"]')?.getAttribute('content') ?? '')).split(' ').filter(Boolean)); // no wait: read what the page has
  return cached;
}
/** Whether the build has a feature: has(page, 'playground'). */
export const has = async (page, id) => (await features(page)).has(id);
/** The full app has every feature; a snapshot doesn't. For a suite's log line. */
export const featureNote = async page => { const f = await features(page); return f.size ? `features: ${[...f].join(', ')}` : 'features: none (core only)'; };
/** The same, without a browser: read from the server's HTML (the meta is server-rendered). featuresAt('http://127.0.0.1:3100') */
export async function featuresAt(base) {
  const html = await (await fetch(`${base}/library`)).text();
  const m = html.match(/<meta name="capsa-features" content="([^"]*)"/);
  return new Set((m?.[1] ?? '').split(' ').filter(Boolean));
}
