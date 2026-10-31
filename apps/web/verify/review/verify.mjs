// Design review with Chime (25 Oct), items 5–7: Deleted at scale, icons in every Library menu, the list view as a tree.
// Usage (dev server on http://127.0.0.1:3100):  node verify/review/verify.mjs [chromium|webkit|all]
//   CAPSA_BASE=http://127.0.0.1:<port> to test another server.
// Tree: indent and branch lines, coloured heading glyph with uncoloured item glyphs, collapse and expand by mouse and by
// keyboard (← →, and ← on a row), the state kept after a reload, Collapse all / Expand all, 20 items then "Show all N",
// J/K skipping collapsed groups and ⇧J/⇧K jumping between groups, and no sideways scroll at 390.
// Menus: every row of every Library toolbar menu (types, where from, collections, sort, + Filter, domain, project, tag,
// tried) and of the phone filter sheet has a glyph, in Solid and in Line, and none is a bare Lucide icon.
// Deleted: the demo seed (grouped Today / This week / Older with counts), both icons on every row, 200 entries staying
// responsive (50 rows then "Show more"), search, the kind filter, ticking rows and groups, bulk restore, bulk delete
// forever with Undo, Esc clearing the selection, and no sideways scroll at 390.
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ': ' + d : ''}`); };

/** Writes a library straight into IndexedDB (the app's own format): `arts` items (12 types, 4 in 12 are prompts) and
 * `trash` deleted entries spread over today, this week and older. Then reloads. */
async function seed(page, { arts = 0, trash = 0 } = {}) {
  await page.goto(B + '/library'); await page.waitForTimeout(1200);
  await page.evaluate(async ([arts, trash]) => {
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
    const base = st.artifacts, srcs = st.sources;
    const types = ['prompt', 'prompt', 'prompt', 'prompt', 'skill', 'mcp_server', 'technique', 'workflow', 'template', 'tool', 'command', 'reference'];
    const next = { ...st, _at: Date.now() }; localStorage.removeItem('capsa-state-shadow');
    if (arts) next.artifacts = Array.from({ length: arts }, (_, i) => ({ ...base[i % base.length], id: `rv-a${i}`, type: types[i % types.length],
      title: `Item ${String(i).padStart(3, '0')} ${types[i % types.length]}`, savedAt: new Date(Date.now() - i * 36e5).toISOString() }));
    if (trash) next.trash = Array.from({ length: trash }, (_, i) => {
      const when = new Date(Date.now() - (i < 20 ? i * 6e4 : i < 60 ? 2 * 864e5 : (8 + i) * 864e5)).toISOString();
      if (i % 4 === 0) { const s = srcs[i % srcs.length]; return { kind: 'source', item: { ...s, id: `rv-s${i}`, title: `Gone source ${i}` }, deletedAt: when, from: { place: 'inbox', column: 'review', index: 0 } }; }
      const a = base[i % base.length];
      return { kind: 'artifact', item: { ...a, id: `rv-t${i}`, type: types[i % types.length], title: `Gone item ${i} ${types[i % types.length]}` }, deletedAt: when, from: { place: 'library', index: 0 } };
    });
    await new Promise(r => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(next, 'app'); tx.oncomplete = r; });
  }, [arts, trash]);
}
const trashLen = page => page.evaluate(async () => {
  const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
  return new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result.trash.length); });
});
const noSideways = page => page.evaluate(() => {
  const m = document.querySelector('main');
  return document.scrollingElement.scrollWidth <= innerWidth + 1 && (!m || m.scrollWidth <= m.clientWidth + 1);
});
/** rows of an open menu without a glyph (the radio dot is not a glyph), and Lucide icons in it */
const menuRows = page => page.evaluate(() => {
  const m = [...document.querySelectorAll('[role="menu"]')].find(e => e.getClientRects().length);
  if (!m) return null;
  const rows = [...m.querySelectorAll('[role^="menuitem"]')];
  return { n: rows.length, bare: rows.filter(r => !r.querySelector('svg[data-glyph]')).map(r => r.textContent.trim()), lucide: m.querySelectorAll('svg.lucide').length,
    sets: [...new Set([...m.querySelectorAll('svg[data-glyph]:not(.bi-tint)')].map(e => e.getAttribute('data-glyph-set') || [...e.querySelectorAll(':scope > g[data-set]')].filter(g => getComputedStyle(g).display !== 'none').map(g => g.dataset.set).join('+')))] };
});

for (const engine of engines) {
  const T = `[${engine}]`;
  const browser = await pw[engine].launch();
  const errs = [];

  /* ---------------- 7. the list view as a tree ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
    await seed(page, { arts: 120 });
    await page.goto(B + '/library?view=list'); await page.waitForSelector('[data-group-toggle]');
    const heads = page.locator('[data-group-toggle]');
    const prompts = page.locator('[data-group-toggle="prompt"]');
    const rowsIn = key => page.locator(`#lib-grp-${key} > li`);
    ok(`${T} tree: one heading per type group, all open`, await heads.count() === 8 && (await heads.evaluateAll(hs => hs.every(h => h.getAttribute('aria-expanded') === 'true'))), String(await heads.count()));
    ok(`${T} tree: the heading's count is the group's size (40 prompts)`, /Prompts\s*40/.test(await prompts.innerText()), await prompts.innerText());
    // indent, branch lines, colour only on the heading
    const geo = await page.evaluate(() => {
      const h = document.querySelector('[data-group-toggle="prompt"]'), ul = document.querySelector('#lib-grp-prompt'), li = ul.querySelector('li');
      const hIcon = h.querySelectorAll('svg')[1]; // after the chevron
      const rIcon = li.querySelector('svg');
      const before = getComputedStyle(ul, '::before'), tick = getComputedStyle(li, '::before');
      return { indent: rIcon.getBoundingClientRect().left - h.getBoundingClientRect().left, alignIcons: Math.abs(rIcon.getBoundingClientRect().left - hIcon.getBoundingClientRect().left),
        line: before.width, lineH: parseFloat(before.height), tick: tick.height, tickW: parseFloat(tick.width),
        hColour: getComputedStyle(hIcon).color, rColour: getComputedStyle(rIcon).color, rInline: rIcon.style.color };
    });
    ok(`${T} tree: rows are indented under their heading, glyphs under the heading's glyph`, geo.indent >= 24 && geo.alignIcons <= 2, JSON.stringify(geo));
    ok(`${T} tree: thin branch lines (a 1 px stem and a 1 px tick per row)`, geo.line === '1px' && geo.lineH > 100 && geo.tick === '1px' && geo.tickW >= 8);
    ok(`${T} tree: the heading's glyph keeps its type colour; item glyphs are uncoloured`, geo.hColour !== geo.rColour && !geo.rInline, `${geo.hColour} vs ${geo.rColour}`);
    // 20 then Show all
    ok(`${T} tree: a long group shows 20 items`, await rowsIn('prompt').count() === 20);
    await page.getByRole('button', { name: 'Show all 40' }).click();
    ok(`${T} tree: "Show all 40" shows all 40`, await rowsIn('prompt').count() === 40 && await page.getByRole('button', { name: 'Show the first 20' }).count() === 1);
    await page.getByRole('button', { name: 'Show the first 20' }).click();
    // mouse
    await prompts.click();
    ok(`${T} tree: clicking a heading collapses its group`, await prompts.getAttribute('aria-expanded') === 'false' && await rowsIn('prompt').count() === 0);
    // J/K skip the collapsed group; ⇧J jumps between groups
    await page.locator('h1').click();
    await page.keyboard.press('j'); await page.waitForTimeout(150);
    const firstMcp = await page.locator('#lib-grp-mcp > li').first().getAttribute('data-id');
    ok(`${T} tree: J skips the collapsed Prompts and lands on the first MCP server`, await page.evaluate(() => document.activeElement?.closest('li')?.dataset.id) === firstMcp);
    await page.keyboard.press('Shift+J'); await page.waitForTimeout(150);
    ok(`${T} tree: ⇧J jumps to the next group's heading`, await page.evaluate(() => document.activeElement?.dataset.groupToggle) === 'skill');
    await page.keyboard.press('Shift+K'); await page.keyboard.press('Shift+K'); await page.waitForTimeout(150);
    ok(`${T} tree: ⇧K jumps back, to the collapsed Prompts heading`, await page.evaluate(() => document.activeElement?.dataset.groupToggle) === 'prompt');
    // keyboard: → expands, → again enters the group, ← on a row folds it and returns to the heading, ← on a heading folds
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    ok(`${T} tree: → on a collapsed heading expands it`, await prompts.getAttribute('aria-expanded') === 'true' && await rowsIn('prompt').count() === 20);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    ok(`${T} tree: → on an open heading moves to its first row`, await page.evaluate(() => document.activeElement?.closest('ul')?.id) === 'lib-grp-prompt');
    await page.keyboard.press('j'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
    ok(`${T} tree: ← on a row collapses its group and focuses the heading`, await prompts.getAttribute('aria-expanded') === 'false'
      && await page.evaluate(() => document.activeElement?.dataset.groupToggle) === 'prompt');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100);
    ok(`${T} tree: ← on an open heading collapses it`, await prompts.getAttribute('aria-expanded') === 'false');
    // remembered after a reload, per library
    await page.reload(); await page.waitForSelector('[data-group-toggle]');
    ok(`${T} tree: the collapsed group stays collapsed after a reload`, await prompts.getAttribute('aria-expanded') === 'false'
      && await page.locator('[data-group-toggle="skill"]').getAttribute('aria-expanded') === 'true');
    ok(`${T} tree: the state is stored under the library's key`, await page.evaluate(() => localStorage.getItem('capsa-list-collapsed:default')) === '["prompt"]');
    // Collapse all / Expand all
    await page.getByRole('button', { name: 'Collapse all' }).click();
    ok(`${T} tree: Collapse all folds every group (and the button becomes Expand all)`, await heads.evaluateAll(hs => hs.every(h => h.getAttribute('aria-expanded') === 'false'))
      && await page.locator('main [aria-label="Items"] li').count() === 0 && await page.getByRole('button', { name: 'Expand all' }).count() === 1);
    await page.getByRole('button', { name: 'Expand all' }).click();
    ok(`${T} tree: Expand all opens every group`, await heads.evaluateAll(hs => hs.every(h => h.getAttribute('aria-expanded') === 'true')));
    // the + is a quiet action: hidden until the heading is hovered
    const plusOp = async () => Number(await page.locator('h2:has([data-group-toggle="skill"]) button[aria-label="Capture"]').evaluate(e => getComputedStyle(e).opacity));
    const before = await plusOp(); await page.locator('[data-group-toggle="skill"]').hover(); await page.waitForTimeout(250);
    ok(`${T} tree: + shows quietly on hover`, before === 0 && await plusOp() === 1, `${before} → ${await plusOp()}`);

    /* ---------------- 6. icons in every Library menu, Solid then Line ---------------- */
    for (const style of ['solid', 'line']) {
      if (style === 'line') {
        await page.goto(B + '/settings/appearance'); await page.locator('[aria-label="Icon style"] button', { hasText: 'Line' }).click();
        await page.waitForFunction(() => document.documentElement.dataset.icons === 'line'); await page.waitForTimeout(600); // let the setting save
      }
      await page.goto(B + '/library'); await page.waitForSelector('main ul[aria-label="Items"] > li');
      const bad = [];
      let menus = 0, rows = 0;
      const check = async name => {
        const r = await menuRows(page);
        if (!r) { bad.push(`${name}: no menu`); return; }
        menus++; rows += r.n;
        if (r.bare.length) bad.push(`${name}: ${r.bare.join(', ')}`);
        if (r.lucide) bad.push(`${name}: ${r.lucide} Lucide`);
        if (r.sets.some(x => x !== style && x !== 'tint' && x !== '')) bad.push(`${name}: shows ${r.sets.join('/')}`);
      };
      for (const [re, name] of [[/^Type:/, 'types'], [/^Where from:/, 'where from'], [/^Collection:/, 'collections'], [/^Sort:/, 'sort']]) {
        await page.getByRole('button', { name: re }).first().click(); await page.waitForTimeout(150);
        await check(name); await page.keyboard.press('Escape');
      }
      for (const facet of ['Domain', 'Project', 'Tag', 'Tried']) {
        await page.getByRole('button', { name: /^Filter$/ }).click(); await page.waitForTimeout(150);
        if (facet === 'Domain') await check('+ Filter');
        await page.getByRole('menuitem', { name: facet }).click(); await page.waitForTimeout(200);
        await check(facet.toLowerCase()); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      }
      ok(`${T} menus (${style}): every row of every toolbar menu has a brand glyph of this style`, bad.length === 0 && menus === 9, bad.join('; ') || `${menus} menus, ${rows} rows`);
    }
    await ctx.close();
  }
  // phones: the tree reads at 390, and every chip in the filter sheet has a glyph
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
    await seed(page, { arts: 120 });
    await page.goto(B + '/library?view=list'); await page.waitForSelector('[data-group-toggle]');
    const g = await page.evaluate(() => {
      const h = document.querySelector('[data-group-toggle="prompt"]'), li = document.querySelector('#lib-grp-prompt > li');
      return { indent: li.getBoundingClientRect().left - h.getBoundingClientRect().left, title: li.querySelector('a').getBoundingClientRect().width };
    });
    ok(`${T} 390: the tree keeps its indent and titles stay readable`, g.indent >= 20 && g.title >= 180, JSON.stringify(g));
    ok(`${T} 390: no sideways scroll in the tree`, await noSideways(page));
    await page.getByRole('button', { name: /^Filters/ }).click(); await page.waitForTimeout(250);
    const chips = await page.evaluate(() => [...document.querySelectorAll('dialog[open] button.chip, dialog[open] .seg button')].filter(b => !b.querySelector('svg')).map(b => b.textContent.trim()));
    ok(`${T} 390: every chip and sort choice in the filter sheet has a glyph`, chips.length === 0, chips.join(', '));
    await ctx.close();
  }

  /* ---------------- 5. Deleted ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
    // the demo seed
    await page.goto(B + '/deleted'); await page.waitForSelector('main li[data-key]');
    const heads = (await page.locator('main section h2').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
    ok(`${T} Deleted demo: grouped Today, This week, Older, with counts`, heads.length === 3 && /^Today \d+$/.test(heads[0]) && /^This week \d+$/.test(heads[1]) && /^Older \d+$/.test(heads[2]), heads.join(' | '));
    const total = heads.reduce((n, h) => n + Number(h.match(/\d+$/)[0]), 0);
    ok(`${T} Deleted demo: enough to show grouping (20+), every one marked demo`, total >= 20 && await page.evaluate(async () => {
      const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
      const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
      return st.trash.every(t => t.item.demo);
    }), String(total));
    const icons = await page.evaluate(() => [...document.querySelectorAll('main li[data-key]')].map(li => ({
      type: !!li.querySelector(':scope > span:nth-of-type(1) svg'), from: !!li.querySelector('[data-place] svg'), place: li.querySelector('[data-place]')?.dataset.place })));
    ok(`${T} Deleted: every row shows its type glyph and a "from" glyph`, icons.every(i => i.type && i.from), `${icons.filter(i => !(i.type && i.from)).length} without`);
    ok(`${T} Deleted demo: places include the Inbox, the Library, a collection and a board`, ['inbox', 'library', 'collection', 'board'].every(k => icons.some(i => i.place === k)), [...new Set(icons.map(i => i.place))].join());
    ok(`${T} Deleted: no Lucide icon on the page`, await page.locator('main svg.lucide').count() === 0);

    // 200 entries
    await seed(page, { trash: 200 });
    let t0 = Date.now();
    await page.goto(B + '/deleted'); await page.waitForSelector('main li[data-key]');
    const load = Date.now() - t0;
    ok(`${T} Deleted with 200: shows 50 rows and a way to see more`, await page.locator('main li[data-key]').count() === 50 && await page.getByRole('button', { name: /^Show 50 more/ }).count() === 1, `${load} ms to first rows`);
    ok(`${T} Deleted with 200: the counts cover all 200`, /200 items/.test(await page.getByRole('status').first().innerText()));
    await page.getByRole('button', { name: /^Show 50 more/ }).click();
    ok(`${T} Deleted with 200: Show more adds 50`, await page.locator('main li[data-key]').count() === 100);
    t0 = Date.now();
    await page.fill('#del-q', 'gone item 1');
    await page.waitForFunction(() => /of 200/.test(document.querySelector('main [role="status"]')?.textContent ?? ''));
    const search = Date.now() - t0;
    const titles = await page.locator('main li[data-key]').evaluateAll(ls => ls.map(l => l.querySelector('span[class*="title"]').textContent));
    ok(`${T} Deleted: search narrows the list quickly (< 400 ms)`, search < 400 && titles.length > 0 && titles.every(t => /gone item 1/i.test(t)), `${search} ms, ${titles.length} rows`);
    await page.fill('#del-q', '');
    // kind filter, with a glyph on every row of its menu
    await page.getByRole('button', { name: /^Kind:/ }).click(); await page.waitForTimeout(150);
    const km = await menuRows(page);
    ok(`${T} Deleted: the kind menu has a glyph on every row`, km && km.n >= 5 && km.bare.length === 0 && km.lucide === 0, km && `${km.n} rows, bare: ${km.bare.join(', ')}`);
    await page.getByRole('menuitemradio', { name: /^MCP servers/ }).click(); await page.waitForTimeout(150);
    const whats = await page.locator('main li[data-key] span[class*="what"]').allInnerTexts();
    ok(`${T} Deleted: filtering by kind shows only that kind`, whats.length > 0 && whats.every(w => w === 'MCP server'), `${whats.length} rows`);
    await page.getByRole('button', { name: /^Kind:/ }).click(); await page.getByRole('menuitemradio', { name: /^All kinds/ }).click();
    // tick rows, restore many
    const before = await trashLen(page);
    for (const i of [0, 1, 2]) await page.locator('main li[data-key]').nth(i).getByRole('checkbox').check();
    const bar = page.getByRole('region', { name: 'Selected items' });
    ok(`${T} Deleted: ticking rows shows the selection bar`, /3 selected/.test(await bar.innerText()));
    await bar.getByRole('button', { name: /Restore/ }).click(); await page.waitForTimeout(400);
    ok(`${T} Deleted: Restore restores all ticked rows at once`, await trashLen(page) === before - 3 && await page.locator('.toast').filter({ hasText: 'Restored 3 items' }).count() === 1 && await bar.count() === 0);
    // tick a whole group, delete forever, Undo
    const today = page.locator('main section').first();
    const inToday = Number((await today.locator('h2').innerText()).match(/\d+$/)[0]);
    await today.getByRole('checkbox', { name: /^Select all/ }).check();
    ok(`${T} Deleted: a group's box ticks the whole group`, new RegExp(`^${inToday} selected`).test(await bar.innerText()), await bar.innerText());
    t0 = Date.now();
    await bar.getByRole('button', { name: /Delete forever/ }).click(); await page.waitForTimeout(300);
    ok(`${T} Deleted: Delete forever removes them all, with Undo`, await trashLen(page) === before - 3 - inToday && await page.locator('.toast').filter({ hasText: `Deleted ${inToday} items forever` }).getByRole('button', { name: 'Undo' }).count() === 1, `${Date.now() - t0} ms`);
    await page.locator('.toast').filter({ hasText: `Deleted ${inToday} items forever` }).getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(400);
    ok(`${T} Deleted: Undo puts them back`, await trashLen(page) === before - 3);
    // select all, Esc clears
    await page.locator('main li[data-key]').first().getByRole('checkbox').check();
    await bar.getByRole('button', { name: /^Select all/ }).click();
    ok(`${T} Deleted: Select all ticks every entry shown`, new RegExp(`^${before - 3} selected`).test(await bar.innerText()), await bar.innerText());
    await page.keyboard.press('Escape');
    ok(`${T} Deleted: Esc clears the selection`, await bar.count() === 0 && await page.locator('main li[data-key] input:checked').count() === 0);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
    await seed(page, { trash: 200 });
    await page.goto(B + '/deleted'); await page.waitForSelector('main li[data-key]');
    await page.locator('main li[data-key]').first().getByRole('checkbox').check();
    ok(`${T} 390: Deleted has no sideways scroll, and the selection bar fits`, await noSideways(page) && await page.getByRole('region', { name: 'Selected items' }).evaluate(b => b.getBoundingClientRect().right <= innerWidth));
    await ctx.close();
  }
  ok(`${T} no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
