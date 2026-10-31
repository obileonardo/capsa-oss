// Brand icon guard: no Lucide icon is rendered anywhere once the brand set is in, and the brand glyphs are there.
// Usage (dev server on http://127.0.0.1:3100):  node verify/brand/verify.mjs [chromium|webkit|all] [--report]
//   --report  list every Lucide icon still rendered (name and place) and exit 0; without it, any Lucide icon fails.
// Also: no glyph in a light-mode menu paints a red pixel (sampled from screenshots); every glyph in both sets paints pixels standalone; every rendered glyph has a box and paints; no menu row lacks an
// icon while its siblings have one. Places: Library, Inbox, Boards, a board, an item page, Settings, Help, the Library Type menu, a card's ⋯ menu, the
// workspace menu, the bell, ⌘K, Capture and the empty-search hero, each in light and dark at 1728, and each in both icon styles.
// Icon style (Settings > Appearance > Icon style, set by clicking the control): in Solid every flat glyph shows its solid drawing,
// in Line its line drawing, exactly one of the two; menu tints draw the same shapes in both styles (the solid set's, as before)
// and heroes show glass in light and rose in dark in both styles. Pinned glyphs (data-glyph-set solid|line) appear only in the
// setting's own preview.
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const engines = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
const REPORT = process.argv.includes('--report');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const left = new Map(); // lucide name -> places
const blankInst = new Map(); // glyph name -> places where a rendered instance painted nothing
const bareRows = new Map(); // menu row label -> places where the row has no icon while its siblings do
const redGlyphs = new Map(); // glyph name -> places where a light-mode menu glyph painted red
let menuGlyphs = 0, curTheme = 'light', curStyle = 'solid';
const styleMiss = new Map(); // "glyph (shows x)" -> places where a flat glyph showed the other set, or not exactly one
const strayPins = new Map(); // glyph -> places where a pinned glyph appears outside the Icon style preview
const tintDrift = new Map(); // glyph -> places where a tint's shape differs from the solid set's drawing
const heroMiss = new Map();  // place -> hero variants shown that don't match the theme
const artMiss = new Map();   // place -> illustration variants shown that don't match the theme (or didn't load)
let artSeen = { solid: 0, line: 0 };
let flatSeen = { solid: 0, line: 0 }, tintSeen = { solid: 0, line: 0 }, heroSeen = { solid: 0, line: 0 };
const note = (m, k, place) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(place); };
// Light-mode menus carry clear grey glass, never red: red is for the mark's dot, the one primary action and focus rings.
// Red = the Ribbon red family (#d93a2b h 5°, #f0705e h 7°, #b52d1e h 5°): hue within 340–20°, HSV saturation >= .35, value >= .3.
const isRed = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, sat = mx ? (mx - mn) / mx : 0;
  if (sat < .35 || v < .3 || mx === mn) return false;
  let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  h = (h * 60 + 360) % 360;
  return h >= 340 || h <= 20;
};
/** Screenshot the viewport and count red pixels inside every visible glyph in an open menu, list box or dialog. */
const redCheck = async (p, place) => {
  const boxes = await p.evaluate(() => {
    const vis = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const pops = [...document.querySelectorAll('.menu, [role="menu"], [role="listbox"], [role="group"][aria-label^="Organise"], dialog[open]')].filter(vis);
    const out = [];
    for (const m of pops) for (const e of m.querySelectorAll('svg[data-glyph]')) {
      if (!vis(e)) continue; const b = e.getBoundingClientRect();
      if (b.width && b.height && b.bottom > 0 && b.top < innerHeight) out.push({ name: e.getAttribute('data-glyph'), x: b.x, y: b.y, w: b.width, h: b.height });
    }
    return [...new Map(out.map(o => [`${o.x},${o.y}`, o])).values()];
  });
  if (!boxes.length) return;
  menuGlyphs += boxes.length;
  const png = (await p.screenshot()).toString('base64');
  const px = await p.evaluate(async ({ png, boxes }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    return boxes.map(b => Array.from(g.getImageData(Math.round(b.x * k), Math.round(b.y * k), Math.max(1, Math.round(b.w * k)), Math.max(1, Math.round(b.h * k))).data));
  }, { png, boxes });
  boxes.forEach((b, i) => {
    const d = px[i]; let n = 0;
    for (let j = 0; j < d.length; j += 4) if (isRed(d[j], d[j + 1], d[j + 2])) n++;
    if (n) { const key = `${b.name} (${n} px)`; if (!redGlyphs.has(key)) redGlyphs.set(key, new Set()); redGlyphs.get(key).add(place); }
  });
};

// Every glyph in the generated set, rendered standalone (the same mask markup as Glyph.tsx), must paint pixels.
const GEN = fs.readFileSync(new URL('../../src/components/ui/brand-icons.gen.ts', import.meta.url), 'utf8');
const GLYPHS = JSON.parse(GEN.match(/export const GLYPHS:[^=]*= (\{[\s\S]*?\n\});/)[1]);
const GLYPHS_LINE = JSON.parse(GEN.match(/export const GLYPHS_LINE:[^=]*= (\{[\s\S]*?\n\});/)[1]);
// Every app concept (BRAND_NAME in BrandIcon.tsx) names a drawn glyph with a menu tint; a wrong name silently shows the
// flat fallback in tinted menus (Capture's Note row did, until note mapped to sticky-note).
{
  const src = fs.readFileSync(new URL('../../src/components/ui/BrandIcon.tsx', import.meta.url), 'utf8');
  const pairs = [...src.match(/BRAND_NAME = \{([\s\S]*?)\} as const/)[1].matchAll(/(\w+): '([\w-]+)'/g)].map(m => [m[1], m[2]]);
  const tints = (GEN.split('export const TINTS')[1] ?? '').split('export const')[0];
  const missing = pairs.filter(([, n]) => !GLYPHS[n] || !tints.includes(`"${n}"`)).map(([c, n]) => `${c} → ${n}`);
  ok('every app concept names a drawn glyph with a menu tint', pairs.length > 0 && missing.length === 0, missing.join(', ') || `${pairs.length} concepts`);
}
const glyphSvg = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="40" height="40"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="20" height="20">${
  d.map(([op, p, sw, cap, join]) => sw ? `<path d="${p}" fill="none" stroke="${op === '-' ? '#000' : '#fff'}" stroke-width="${sw}" stroke-linecap="${cap}" stroke-linejoin="${join}"/>` : `<path d="${p}" fill="${op === '-' ? '#000' : '#fff'}" fill-rule="evenodd"/>`).join('')
}</mask></defs><rect width="20" height="20" fill="#000" mask="url(#m)"/></svg>`;
/** painted pixels (alpha > 40) of each SVG string, rasterised at 40x40 in the page */
const painted = (p, svgs) => p.evaluate(async list => Promise.all(list.map(async src => {
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  try { await img.decode(); } catch { return -1; }
  const c = document.createElement('canvas'); c.width = 40; c.height = 40; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 40, 40);
  const a = g.getImageData(0, 0, 40, 40).data; let n = 0; for (let k = 3; k < a.length; k += 4) if (a[k] > 40) n++; return n;
})), svgs);

const scan = async (p, place) => {
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const vis = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const luc = [...document.querySelectorAll('svg.lucide')].filter(vis).map(e => e.getAttribute('data-ic') || [...e.classList].find(c => c.startsWith('lucide-'))?.slice(7) || '?');
    const inst = [...document.querySelectorAll('svg[data-glyph]')].filter(vis).map(e => {
      const b = e.getBoundingClientRect();
      // which drawing is on screen: a pinned / tinted glyph says so; a flat one shows exactly one of its two <g data-set>
      const groups = [...e.querySelectorAll(':scope > g[data-set]')];
      const shown = groups.filter(g => getComputedStyle(g).display !== 'none').map(g => g.getAttribute('data-set'));
      const set = e.getAttribute('data-glyph-set') || (shown.length === 1 ? shown[0] : `${shown.length} sets`);
      // rasterise what is on screen: drop the hidden drawing (page CSS doesn't reach an <img>)
      const c = e.cloneNode(true);
      groups.forEach((g, i) => { if (getComputedStyle(g).display === 'none') c.querySelectorAll(':scope > g[data-set]')[i].remove(); });
      const html = c.outerHTML.replace(/<svg\b/, '<svg width="40" height="40"');
      const tintD = e.classList.contains('bi-tint') ? [...e.querySelector('defs > mask').querySelectorAll(':scope > path')].map(x => x.getAttribute('d')) : null;
      const inPreview = !!e.closest('[aria-label="Icon style"]');
      return { name: e.getAttribute('data-glyph'), w: b.width, h: b.height, html, set, pinned: !!e.getAttribute('data-glyph-set') && !tintD, tintD, inPreview };
    });
    const heroes = [...document.querySelectorAll('.bi-hero')].filter(vis).map(h => [...h.querySelectorAll('img')].filter(i => getComputedStyle(i).visibility !== 'hidden').map(i => i.dataset.v).join('+'));
    // illustrations (components/ui/Illustration.tsx): exactly the theme's variant shows, and it has loaded
    const arts = [...document.querySelectorAll('.art')].filter(vis).map(a => [...a.querySelectorAll('img')].filter(i => getComputedStyle(i).visibility !== 'hidden').map(i => i.dataset.v + (i.naturalWidth ? '' : ':unloaded')).join('+'));
    // menu rows: in an open menu where some rows carry an icon, every row should
    const bare = [];
    for (const m of document.querySelectorAll('.menu, [role="menu"], [role="listbox"]')) {
      if (!vis(m)) continue;
      const rows = [...m.querySelectorAll(':scope > button, :scope > a, :scope > [role="option"], :scope > [role^="menuitem"]')].filter(vis);
      if (rows.filter(x => x.querySelector('svg')).length < 2) continue;
      // a toggle row (aria-pressed / aria-checked) shows its tick only when on; that empty slot is a state, not a missing icon
      for (const x of rows) if (!x.querySelector('svg') && !x.matches('[aria-pressed], [aria-checked]')) bare.push(x.textContent.trim().slice(0, 40));
    }
    return { luc, inst, bare, heroes, arts };
  });
  for (const i of r.inst) {
    if (i.tintD) {
      tintSeen[curStyle]++;
      if (JSON.stringify(i.tintD) !== JSON.stringify((GLYPHS[i.name] ?? []).map(l => l[1]))) note(tintDrift, i.name, `${place} (${curStyle})`);
    } else if (i.pinned) {
      if (!i.inPreview) note(strayPins, i.name, `${place} (${curStyle})`);
    } else {
      flatSeen[curStyle]++;
      if (i.set !== curStyle) note(styleMiss, `${i.name} (shows ${i.set})`, `${place} (${curStyle} ${curTheme})`);
    }
  }
  const want = curTheme === 'dark' ? 'rose' : 'glass';
  for (const h of r.heroes) { heroSeen[curStyle]++; if (h !== want) note(heroMiss, `${place} (${curStyle} ${curTheme})`, h || 'none'); }
  for (const a of r.arts) { artSeen[curStyle]++; if (a !== (curTheme === 'dark' ? 'dark' : 'light')) note(artMiss, `${place} (${curStyle} ${curTheme})`, a || 'none'); }
  for (const n of r.luc) { if (!left.has(n)) left.set(n, new Set()); left.get(n).add(place); }
  for (const t of r.bare) { if (!bareRows.has(t)) bareRows.set(t, new Set()); bareRows.get(t).add(place); }
  const uniq = [...new Map(r.inst.map(i => [i.html, i])).values()];
  const px = await painted(p, uniq.map(i => i.html));
  uniq.forEach((i, k) => { if (!(i.w > 0 && i.h > 0) || px[k] <= 8) { if (!blankInst.has(i.name)) blankInst.set(i.name, new Set()); blankInst.get(i.name).add(place); } });
  if (curTheme === 'light') await redCheck(p, place);
  return { luc: r.luc, brand: r.inst.length };
};

for (const engine of engines) {
  const browser = await pw[engine].launch();
  {
    const p = await browser.newPage(); await p.goto(B + '/offline');
    for (const [st, G] of [['solid', GLYPHS], ['line', GLYPHS_LINE]]) {
      const names = Object.keys(G); const px = await painted(p, names.map(n => glyphSvg(G[n])));
      const blank = names.filter((n, k) => px[k] <= 8);
      ok(`[${engine}] every glyph in the ${st} set paints pixels`, blank.length === 0, blank.length ? `blank: ${blank.join(', ')}` : `${names.length} glyphs, min ${Math.min(...px)} px at 40x40`);
    }
    const a = Object.keys(GLYPHS).sort().join(), b = Object.keys(GLYPHS_LINE).sort().join();
    ok(`[${engine}] solid and line sets cover the same names`, a === b, `${Object.keys(GLYPHS).length} names`);
    await p.close();
  }
  for (const style of ['solid', 'line']) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1728, height: 1000 }, colorScheme: theme });
    await ctx.addInitScript(t => { try { localStorage.setItem('capsa-theme', t); } catch {} }, theme);
    const p = await ctx.newPage();
    const tag = `[${engine} ${theme} ${style}]`;
    curTheme = theme; curStyle = style;
    // choose the style the way a person does: Settings > General > Appearance > Icon style (Settings opens on Profile since #94)
    await p.goto(B + '/settings/general'); await p.waitForSelector('[aria-label="Icon style"] button');
    await p.locator('[aria-label="Icon style"] button', { hasText: style === 'line' ? 'Line' : 'Solid' }).click();
    await p.waitForFunction(s => document.documentElement.dataset.icons === s, style);
    const visit = async (path, place, ready) => { await p.goto(B + path); if (ready) await ready(); else await p.waitForTimeout(1200); return scan(p, place); };
    const counts = [];
    const lib = await visit('/library', 'Library', () => p.waitForSelector('main ul[aria-label="Items"] > li a'));
    counts.push(lib);
    const item = await p.locator('main ul[aria-label="Items"] > li a').first().getAttribute('href');
    await p.getByRole('button', { name: /^All types|^Type/ }).first().click(); counts.push(await scan(p, 'Library Type menu')); await p.keyboard.press('Escape');
    for (const [re, place] of [[/^Where from/, 'Where from menu'], [/^Sort/, 'sort menu'], [/^(\+ )?Filter$/, 'Add a filter menu']]) {
      const b = p.getByRole('button', { name: re }).first();
      if (await b.count() && await b.isVisible()) { await b.click(); counts.push(await scan(p, place)); await p.keyboard.press('Escape'); }
    }
    await p.locator('main ul[aria-label="Items"] > li').first().hover();
    const more = p.locator('main ul[aria-label="Items"] > li').first().getByRole('button', { name: /more|actions|⋯/i }).first();
    if (await more.count()) { await more.click(); counts.push(await scan(p, 'card ⋯ menu')); await p.keyboard.press('Escape'); }
    await p.getByRole('button', { name: /Your library/ }).click(); counts.push(await scan(p, 'workspace menu')); await p.keyboard.press('Escape');
    await p.getByRole('button', { name: /^Notifications/ }).click(); counts.push(await scan(p, 'bell')); await p.keyboard.press('Escape');
    await p.keyboard.press('Meta+k'); await p.waitForTimeout(300); counts.push(await scan(p, '⌘K')); await p.keyboard.press('Escape');
    counts.push(await visit('/inbox', 'Inbox'));
    await p.keyboard.press('c'); counts.push(await scan(p, 'Capture'));
    // compose stage: the detected type is a chip whose menu lists the tinted type glyphs
    await p.keyboard.type('Review this screen for accessibility'); await p.waitForTimeout(300);
    const chip = p.getByRole('button', { name: /^Type: / }).first();
    if (await chip.count()) { await chip.click(); counts.push(await scan(p, 'Capture Type menu')); await p.keyboard.press('Escape'); }
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    counts.push(await visit(item, 'item page'));
    counts.push(await visit('/playground', 'Playground'));
    const board = await p.evaluate(() => [...document.querySelectorAll('a[href^="/boards/"]')].map(a => a.getAttribute('href')).find(h => h.length > 8));
    if (board) counts.push(await visit(board, 'a board'));
    counts.push(await visit('/settings', 'Settings'));
    counts.push(await visit('/help', 'Help'));
    counts.push(await visit('/library?q=zzqx-no-such-thing', 'empty search (illustration)', () => p.waitForSelector('.art')));
    // the choice survives a reload (prefs, mirrored to capsa-icons for the pre-paint script)
    await p.reload(); await p.waitForTimeout(800);
    ok(`${tag} icon style survives a reload`, await p.evaluate(() => document.documentElement.dataset.icons) === style);
    if (style === 'line') { // ...and "Delete everything", like the theme (the last step: it empties this context's library)
      await p.goto(B + '/settings/danger'); await p.getByRole('button', { name: 'Delete everything…' }).click();
      await p.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click(); await p.waitForTimeout(800);
      await p.goto(B + '/settings/appearance'); await p.waitForTimeout(800); // the icon style control lives on Appearance
      ok(`${tag} icon style survives Delete everything`, await p.evaluate(() => document.documentElement.dataset.icons) === 'line'
        && (await p.locator('[aria-label="Icon style"] button[aria-pressed="true"]').textContent()) === 'Line');
    }
    const nLuc = counts.reduce((a, r) => a + r.luc.length, 0), nBrand = counts.reduce((a, r) => a + r.brand, 0);
    ok(`${tag} brand glyphs render`, nBrand > 0, `${nBrand} visible`);
    if (!REPORT) ok(`${tag} no Lucide icon rendered`, nLuc === 0, `${nLuc} left`);
    await ctx.close();
  }
  await browser.close();
}
ok('solid mode: every flat glyph shows its solid drawing; line mode: its line drawing', styleMiss.size === 0 && flatSeen.solid > 0 && flatSeen.line > 0,
  styleMiss.size ? [...styleMiss].slice(0, 12).map(([n, pl]) => `${n}: ${[...pl].join(', ')}`).join('; ') : `${flatSeen.solid} solid, ${flatSeen.line} line instances`);
ok('menu tints draw the same (solid-set) shapes in both styles', tintDrift.size === 0 && tintSeen.solid > 0 && tintSeen.line > 0,
  tintDrift.size ? [...tintDrift].map(([n, pl]) => `${n}: ${[...pl].join(', ')}`).join('; ') : `${tintSeen.solid} in solid, ${tintSeen.line} in line`);
// empty states now show sketch-engine illustrations; heroes remain wherever no illustration is drawn yet
ok('heroes (where still used) show glass in light and rose in dark', heroMiss.size === 0,
  heroMiss.size ? [...heroMiss].map(([pl, v]) => `${pl}: ${[...v].join(', ')}`).join('; ') : `${heroSeen.solid} in solid, ${heroSeen.line} in line`);
ok('illustrations show their light variant in light and dark in dark, loaded, in both styles', artMiss.size === 0 && artSeen.solid > 0 && artSeen.line > 0,
  artMiss.size ? [...artMiss].map(([pl, v]) => `${pl}: ${[...v].join(', ')}`).join('; ') : `${artSeen.solid} in solid, ${artSeen.line} in line`);
ok('pinned glyphs appear only in the Icon style preview', strayPins.size === 0, [...strayPins].map(([n, pl]) => `${n}: ${[...pl].join(', ')}`).join('; '));
ok('every rendered brand glyph has a box and paints pixels', blankInst.size === 0, [...blankInst].map(([n, pl]) => `${n} (${[...pl].join(', ')})`).join('; '));
ok('no menu row without an icon among rows that have one', REPORT || bareRows.size === 0, [...bareRows].map(([t, pl]) => `"${t}" (${[...pl].join(', ')})`).join('; '));
ok(`light-mode menu glyphs paint no red (${menuGlyphs} glyphs sampled)`, menuGlyphs > 0 && redGlyphs.size === 0, [...redGlyphs].map(([n, pl]) => `${n}: ${[...pl].join(', ')}`).join('; '));
if (left.size) {
  console.log(`\nLucide icons still rendered (${left.size}):`);
  for (const [n, places] of [...left].sort()) console.log(`  ${n}: ${[...places].join(', ')}`);
}
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
