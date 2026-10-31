// Settings, grouped, with search (Elvis, 26 Oct). Proves: every setting that existed is still reachable; the old
// addresses land on the right group, scrolled to the section; search finds by name, explanation and other words, has an
// empty state and works from the keyboard; the groups and sections render with their one-line explanations; the Sidebar
// section's icon; axe (no serious or critical) at 1440 and 390, light and dark, Classic and Paper; no sideways scroll;
// screenshots at 1440, 390 and 2560 in ./shots.
// 27 Oct (issue #91): /settings, the sidebar's gear, the breadcrumb and the command menu open Profile, deep links still
// land where they point; every group's sections hang off a tree line drawn like the Activity page's (from under the
// group's icon, a branch to each section, ending at the last one), in Classic and Paper, with focus, the in-view marker
// and right to left.
// Usage: CAPSA_BASE=http://127.0.0.1:<port> node verify/settings/verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
import { features } from '../_features.mjs'; // a release snapshot can lack Profile, Imports, Organise, Playground and the command menu
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

// The structure Elvis will see: group → sections (with the one-line explanation each must show).
// A build without a feature leaves out its sections and renames a group (sections.ts, `feature` and `without`).
const groupsFor = F => {
  const f = id => F.has(id);
  return [
    f('avatar') && ['profile', 'Profile', [['profile', 'Your library card']]],
    ['general', 'General', [['appearance', 'Appearance'], ['sidebar', 'Sidebar'], ['notifications', 'Notifications'], ['shortcuts', 'Keyboard shortcuts']]],
    ['capture-import', f('imports') ? 'Capture and import' : 'Capture', [['capture', 'Capture'], f('imports') && ['import', 'Import']].filter(Boolean)],
    ['organising', 'Organising', [['groups', 'Collections and projects'], f('organise') && ['rules', 'Filing rules'], f('organise') && ['views', 'Cards and views']].filter(Boolean)],
    ['labels', f('organise') ? 'Tags, types and domains' : 'Tags', [['tags', 'Tags'], f('organise') && ['types', 'Types'], f('organise') && ['domains', 'Domains']].filter(Boolean)],
    ['boards-ai', f('playground') ? 'Playground and AI' : 'AI', [f('playground') && ['briefs', 'Briefs'], ['ai', 'MCP server and exports']].filter(Boolean)],
    ['data', 'Data', [['storage', 'Storage and backup'], ['deleted', 'Deleted'], ['danger', 'Danger zone']]],
    ['about', 'About', [['about', 'About Capsa']]],
  ].filter(Boolean);
};

// Inventory: every control the 18 old pages had (25 Oct), by its accessible name, and where it lives now.
const INVENTORY = {
  profile: [['textbox', 'Name'], ['button', 'Edit avatar'], ['article', 'Your library card'], ['textbox', 'Role'], ['switch', 'Animated avatar']],
  general: [
    ['group', 'Theme'], ['group', 'Style', 'avatar'], ['group', 'Icon style'], ['group', 'Default review view'],
    ['radiogroup', 'Sidebar view'], ['switch', 'Show Collections'], ['button', /^Move Collections/],
    ['switch', 'Ready to review'], ['switch', 'Couldn’t be read'], ['switch', 'Board changed since its brief', 'playground'], ['switch', 'Board brief updated', 'playground'],
    ['switch', 'Saved items that fit a project', 'organise'], ['switch', 'What’s new'], ['group', 'Backup reminder'],
    ['button', 'Change shortcut for Search and commands', 'search'], ['button', 'Change shortcut for Capture'],
  ],
  'capture-import': [
    ['switch', 'Reading public GitHub links (asks first)'], ['text', 'Reading links, videos and posts'], ['link', 'Save to Capsa', 'imports'], ['button', 'Copy the bookmarklet', 'imports'],
    ['text', 'Browser bookmarks', 'imports'], ['text', 'Raindrop, Instapaper or Pocket', 'imports'], ['textbox', 'GitHub stars', 'imports'], ['text', 'Prompts', 'imports'], ['text', 'Notes', 'imports'],
  ],
  organising: [
    ['button', 'New collection'], ['button', 'New project'], ['text', 'Smart collections', 'organise'], ['text', 'Saved searches', 'organise'],
    ['text', 'New rule', 'organise'], ['text', 'On Library cards', 'organise'], ['group', 'All items view', 'organise'],
  ],
  labels: [['text', 'New type', 'organise'], ['text', 'Tags'], ['text', 'Domains', 'organise']],
  'boards-ai': [['switch', 'Marked regions', 'playground'], ['switch', 'Palettes', 'playground'], ['switch', 'Avoid list', 'playground'], ['switch', 'Credits section', 'playground'], ['group', 'Brief format', 'playground'], ['text', 'AI inside Capsa'], ['link', 'Set up']],
  data: [['button', 'Back up everything'], ['button', 'Restore from backup…'], ['link', 'Open'], ['group', 'Keep deleted items'], ['button', 'Remove demo data'], ['button', 'Delete everything…']],
  about: [['text', 'Capsa web'], ['text', 'Fonts: Inter']],
};
// Search anchors (sections.ts) that need data the sample doesn't have
const NEEDS_DATA = new Set(['h-imports', 'shortcut-reset']); // shown only after an import, or after a shortcut is changed

const go = async (page, p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(350); };
const snav = page => page.getByRole('navigation', { name: 'Settings' });
const search = page => snav(page).getByRole('combobox', { name: 'Search settings' });
async function axe(page, label) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.map(x => x.target.join(' ')).filter(t => !/nextjs/.test(t)) })));
  const bad = r.filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.n.length);
  ok(`axe ${label}: no serious or critical`, !bad.length, bad.length ? JSON.stringify(bad).slice(0, 600) : `${r.length} minor or moderate`);
}
/** How far the page (or the main panel) scrolls sideways, in px. */
const sideways = page => page.evaluate(() => { const m = document.getElementById('main'); return Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, m ? m.scrollWidth - m.clientWidth : 0); });
const inView = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return 'missing'; const r = el.getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight - 40 ? true : `top ${Math.round(r.top)}`; }, sel);
const setLook = async (page, look) => { await go(page, '/settings/general'); await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: look === 'paper' ? 'Paper' : 'Classic' }).click(); await page.waitForTimeout(400); };

for (const engine of engines) {
  const browser = await pw[engine].launch();
  const T = `[${engine}]`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text())) errs.push(m.text().split('\n')[0].slice(0, 200)); });

  /* ---------- the groups and their sections, each with its explanation ---------- */
  await go(page, '/settings/general');
  const F = await features(page);
  const GROUPS = groupsFor(F);
  const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([g, , secs]) => secs.map(([id]) => [id, g])));
  const HOME = F.has('avatar') ? '/settings/profile' : '/settings/general'; // sections.ts SETTINGS_HOME
  const HOME_H1 = F.has('avatar') ? 'Profile' : 'General';
  const inBuild = ([, , feature]) => !feature || F.has(feature);
  const LOOKS = F.has('avatar') ? ['classic', 'paper'] : ['classic']; // the Style setting (and Paper) come with Profile
  const navGroups = await snav(page).locator(':scope > div[class*="groups"] > div > a').allInnerTexts();
  ok(`${T} the sidebar lists the ${GROUPS.length} groups, in order`, navGroups.map(x => x.trim()).join('|') === GROUPS.map(g => g[1]).join('|'), navGroups.join('|'));
  for (const [id, label, secs] of GROUPS) {
    await go(page, `/settings/${id}`);
    const h1 = (await page.locator('main h1').innerText()).trim();
    const shown = await page.locator('main section[data-sub]').evaluateAll(els => els.map(e => ({ id: e.id, h2: e.querySelector('h2')?.textContent.trim(), p: e.querySelector('header p')?.textContent.trim() ?? '' })));
    ok(`${T} /settings/${id}: "${label}" with ${secs.length} section${secs.length > 1 ? 's' : ''}`, h1 === label && shown.map(x => `${x.id}:${x.h2}`).join('|') === secs.map(([i, l]) => `${i}:${l}`).join('|'), `${h1} · ${shown.map(x => x.h2).join(', ')}`);
    ok(`${T} /settings/${id}: every section has a one-line explanation, no em dash`, shown.every(x => x.p.length > 10 && x.p.length <= 80 && !x.p.includes('—')), shown.map(x => x.p).join(' / '));
    ok(`${T} /settings/${id}: the group is current in the sidebar`, await snav(page).getByRole('link', { name: label, exact: true }).getAttribute('aria-current') === 'page');
    if (secs.length > 1) ok(`${T} /settings/${id}: its sections are listed under it`, (await snav(page).getByRole('list', { name: `${label} sections` }).getByRole('link').allInnerTexts()).join('|') === secs.map(s => s[1]).join('|'));
    // every control the old pages had is here
    const missing = [];
    for (const [role, name] of INVENTORY[id].filter(inBuild)) {
      const m = page.locator('main');
      const n = role === 'text' ? await m.getByText(name, { exact: typeof name === 'string' && !name.startsWith('Fonts') }).count()
        : role === 'textbox' ? await m.getByRole('textbox', { name }).count()
        : await m.getByRole(role, { name, exact: typeof name === 'string' }).count();
      if (!n) missing.push(`${role} ${name}`);
    }
    ok(`${T} /settings/${id}: every setting from before is here (${INVENTORY[id].filter(inBuild).length})`, !missing.length, missing.join(', '));
  }

  /* ---------- the Sidebar section: its icon and its place ---------- */
  await go(page, '/settings/general');
  const sb = await page.evaluate(() => { const s = document.getElementById('sidebar'); return { ic: s?.querySelector('header svg')?.dataset.ic, prev: s?.previousElementSibling?.id }; });
  ok(`${T} Sidebar uses the sidebar panel glyph (panel-left, solid like its neighbours) and sits right after Appearance`, sb.ic === 'panel-left' && sb.prev === 'appearance', JSON.stringify(sb));

  /* ---------- old addresses ---------- */
  const OLD = ['appearance', 'notifications', 'sidebar', 'shortcuts', 'capture', 'import', 'groups', 'tags', 'types', 'domains', 'rules', 'views', 'deleted', 'briefs', 'ai', 'storage', 'danger', 'about'];
  for (const id of OLD) {
    await page.goto(B + `/settings/${id}`, { waitUntil: 'networkidle' });
    await page.waitForURL(u => u.pathname !== `/settings/${id}` || id === 'about', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(700);
    const u = new URL(page.url());
    if (!GROUP_OF[id]) { ok(`${T} /settings/${id} (not in this build) is not found`, u.pathname === `/settings/${id}` && /Nothing here/.test(await page.locator('h1').first().innerText()), `${u.pathname} · ${await page.locator('h1').first().innerText()}`); continue; }
    ok(`${T} /settings/${id} lands on /settings/${GROUP_OF[id]}#${id}, scrolled to it`, u.pathname === `/settings/${GROUP_OF[id]}` && (u.hash === `#${id}` || id === 'about') && (await inView(page, `#${id}`)) === true, `${u.pathname}${u.hash} ${await inView(page, `#${id}`)}`);
  }
  for (const [from, want, el] of [['/settings#backup', '/settings/data#backup', '#backup'], ['/settings#reading', '/settings/capture-import#reading', '#reading'], ['/settings#tags', '/settings/labels#tags', '#tags'],
    F.has('organise') ? ['/settings#smart', '/settings/organising#smart', '#smart'] : ['/settings#smart', '/settings/organising#smart', 'main h1'], ['/settings', HOME, 'main h1'], ['/settings/storage#backup', '/settings/data#backup', '#backup'], ['/settings/capture#reading', '/settings/capture-import#reading', '#reading']]) {
    await page.goto(B + from, { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
    const u = new URL(page.url());
    ok(`${T} ${from} lands on ${want}`, u.pathname + u.hash === want && (await inView(page, el)) === true, `${u.pathname}${u.hash} ${await inView(page, el)}`);
  }
  /* ---------- Settings opens on Profile, from every way in (Elvis, 27 Oct) ---------- */
  await go(page, '/library');
  ok(`${T} the sidebar's gear links to ${HOME}`, await page.locator('nav[data-shell-nav] a[aria-label="Settings"]').getAttribute('href') === HOME);
  await page.locator('nav[data-shell-nav] a[aria-label="Settings"]').click(); await page.waitForURL(u => u.pathname === HOME, { timeout: 5000 }).catch(() => {});
  ok(`${T} clicking the gear opens ${HOME_H1}`, new URL(page.url()).pathname === HOME && (await page.locator('main h1').innerText()) === HOME_H1, page.url());
  ok(`${T} the Settings breadcrumb links to ${HOME_H1}`, await page.locator('main header nav[aria-label="Breadcrumb"] a', { hasText: 'Settings' }).getAttribute('href') === HOME);
  if (F.has('search')) {
  await go(page, '/library');
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(300);
  await page.keyboard.type('Settings'); await page.waitForTimeout(250);
  const palOpt = page.locator('#pal-list [role="option"]').filter({ hasText: /^\s*Settings\s*$/ });
  if (await palOpt.count()) await palOpt.first().click(); else await page.keyboard.press('Enter');
  await page.waitForURL(/\/settings\//, { timeout: 5000 }).catch(() => {});
  ok(`${T} the command menu's Settings opens ${HOME_H1}`, new URL(page.url()).pathname === HOME, page.url());
  }
  for (const [from, want] of [['/settings/general#theme', '/settings/general'], ['/settings/data', '/settings/data'], ['/settings/organising#rules', '/settings/organising']]) {
    await page.goto(B + from, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    ok(`${T} a deep link still lands where it points: ${from}`, new URL(page.url()).pathname === want, page.url());
  }

  /* ---------- the sidebar's tree lines (Elvis, 27 Oct: "the way the Activity has this branching") ---------- */
  const treeOf = () => page.evaluate(() => {
    const ul = document.querySelector('nav[data-shell-nav] ul[aria-label$=" sections"]');
    if (!ul) return null;
    const lis = [...ul.children], row = ul.parentElement.querySelector('a[aria-current="page"]');
    const icon = row.querySelector('svg').getBoundingClientRect(), rowR = row.getBoundingClientRect();
    const geo = lis.map(li => {
      const r = li.getBoundingClientRect(), b = getComputedStyle(li, '::before'), a = getComputedStyle(li, '::after');
      const x = r.left + parseFloat(b.left);
      return { x, top: r.top + parseFloat(b.top), bottom: r.bottom - parseFloat(b.bottom), elbowY: r.top + parseFloat(a.top), elbowX: r.left + parseFloat(a.left), elbowW: parseFloat(a.width),
        liTop: r.top, liBottom: r.bottom, liMid: r.top + r.height / 2, text: li.querySelector('a').getBoundingClientRect().left + parseFloat(getComputedStyle(li.querySelector('a')).paddingLeft) };
    });
    const label = row.querySelector('span').getBoundingClientRect().left;
    return { n: lis.length, iconX: icon.left + icon.width / 2, rowBottom: rowR.bottom, label, geo };
  });
  for (const look of LOOKS) {
    if (LOOKS.length > 1) await setLook(page, look);
    for (const [id, , secs] of GROUPS.filter(g => g[2].length > 1)) {
      await go(page, `/settings/${id}`);
      const t = await treeOf();
      const L = `${T} ${look} ${id}`;
      if (!t) { ok(`${L}: the open group lists its sections as a tree`, false, 'no list'); continue; }
      const last = t.geo[t.geo.length - 1];
      ok(`${L}: one branch per section (${secs.length})`, t.n === secs.length && t.geo.every(g => g.elbowW >= 6 && g.elbowW <= 9 && Math.abs(g.elbowX - g.x) < 0.6), JSON.stringify(t.geo.map(g => g.elbowW)));
      ok(`${L}: the line drops from under the group's icon (centre within 1px)`, t.geo.every(g => Math.abs(g.x + 0.5 - t.iconX) <= 1) && Math.abs(t.geo[0].top - t.rowBottom) <= 2, `icon ${t.iconX.toFixed(1)}, line ${t.geo[0].x + 0.5}, starts ${t.geo[0].top.toFixed(1)} vs row ${t.rowBottom.toFixed(1)}`);
      ok(`${L}: the line is unbroken and ends at the last section's branch, not below it`, t.geo.every((g, i) => i === 0 || g.top <= t.geo[i - 1].bottom + 0.5) && Math.abs(last.bottom - (last.elbowY + 1)) <= 1 && last.bottom < last.liBottom - 4,
        `ends ${last.bottom.toFixed(1)}, last branch ${last.elbowY.toFixed(1)}, last row bottom ${last.liBottom.toFixed(1)}`);
      ok(`${L}: each branch meets its section at the middle, and the words line up with the group's label`, t.geo.every(g => Math.abs(g.elbowY + 0.5 - g.liMid) <= 1 && Math.abs(g.text - t.label) <= 1.5), JSON.stringify(t.geo.map(g => [Math.round(g.text), Math.round(t.label)])));
    }
  }
  if (LOOKS.length > 1) await setLook(page, 'classic');
  await go(page, '/settings/general');
  await page.locator('nav[data-shell-nav] ul[aria-label="General sections"] a').first().focus();
  const focusRing = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { name: a.textContent, outline: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' }; });
  ok(`${T} a section in the tree takes keyboard focus with a visible ring`, focusRing.name === 'Appearance' && focusRing.outline, JSON.stringify(focusRing));
  ok(`${T} the section in view is marked in the tree, its branch a shade darker`, await page.evaluate(() => {
    const li = document.querySelector('nav[data-shell-nav] ul[aria-label="General sections"] a[aria-current="location"]')?.parentElement;
    const other = [...document.querySelectorAll('nav[data-shell-nav] ul[aria-label="General sections"] li')].find(x => x !== li);
    return !!li && getComputedStyle(li, '::after').backgroundColor !== getComputedStyle(other, '::after').backgroundColor;
  }));
  const rtl = await page.evaluate(() => {
    // a right-to-left page says so with its language as well (the build turns logical sides into rules keyed to both)
    const h = document.documentElement, lang = h.lang;
    h.dir = 'rtl'; h.lang = 'ar';
    // a page that is right to left from the start: rebuild the sidebar's styles, as a fresh load would
    const nav = document.querySelector('nav[data-shell-nav]'); nav.style.display = 'none'; void nav.offsetHeight; nav.style.display = '';
    const li = document.querySelector('nav[data-shell-nav] ul[aria-label="General sections"] li');
    const ul = li.parentElement.getBoundingClientRect(), r = li.getBoundingClientRect();
    const out = { right: getComputedStyle(li, '::before').right, indent: Math.round(ul.right - r.right), left: Math.round(r.left - ul.left) };
    h.dir = ''; h.lang = lang;
    return out;
  });
  ok(`${T} right to left, the tree mirrors (the line and its indent move to the right)`, rtl.right === '-9px' && rtl.indent === 26 && rtl.left === 0, JSON.stringify(rtl));

  await page.goto(B + '/settings/nope', { waitUntil: 'networkidle' });
  ok(`${T} an unknown settings address is a 404, not a blank page`, /Nothing here/.test(await page.locator('body').innerText()));

  /* ---------- search ---------- */
  await go(page, '/settings/data');
  await page.locator('main').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('/');
  ok(`${T} search: / focuses the field`, await search(page).evaluate(el => el === document.activeElement));
  const hitsFor = async q => { await search(page).fill(q); await page.waitForTimeout(150); return (await snav(page).getByRole('option').evaluateAll(els => els.map(e => e.querySelector('b').textContent + ' @ ' + e.querySelector('span').textContent))); };
  let h = await hitsFor('theme');
  ok(`${T} search by name: "theme" finds Theme first`, h[0] === 'Theme @ General › Appearance', h.slice(0, 3).join('; '));
  h = await hitsFor('dark');
  ok(`${T} search by another word: "dark" finds Theme`, h.includes('Theme @ General › Appearance'), h.join('; '));
  h = await hitsFor('backup');
  ok(`${T} search by another word: "backup" finds Storage and backup`, h.includes('Storage and backup @ Data') && h.includes('Back up @ Data › Storage and backup'), h.join('; '));
  h = await hitsFor('trash');
  ok(`${T} search by another word: "trash" finds Deleted`, h.includes('Deleted @ Data'), h.join('; '));
  h = await hitsFor('reviews open');
  ok(`${T} search by explanation: "reviews open" finds Appearance`, h[0] === 'Appearance @ General', h.join('; '));
  h = await hitsFor('how long');
  ok(`${T} search by explanation: "how long" finds Deleted`, h.includes('Deleted @ Data'), h.join('; '));
  if (F.has('avatar')) { h = await hitsFor('paper'); ok(`${T} search: "paper" finds the Style row`, h[0] === 'Style @ General › Appearance', h.join('; ')); }
  h = await hitsFor('sidebar');
  ok(`${T} search: "sidebar" finds the Sidebar section first`, h[0] === 'Sidebar @ General', h.join('; '));
  ok(`${T} search: while searching, the groups step aside`, !(await snav(page).getByRole('link', { name: 'Organising' }).isVisible()));
  h = await hitsFor('qqzz');
  ok(`${T} search: nothing matches → an empty state that says so`, !h.length && await snav(page).getByText('No settings match “qqzz”').isVisible());
  ok(`${T} search: the count is announced`, (await snav(page).getByRole('status').innerText()) === 'No matches');
  // keyboard: ↓ moves, ↵ opens, the match is scrolled to, highlighted and focused
  await hitsFor('keep deleted');
  await search(page).press('ArrowDown'); await search(page).press('ArrowUp');
  const ad = await search(page).getAttribute('aria-activedescendant');
  ok(`${T} search: arrows move the active match (aria-activedescendant)`, !!ad && (await page.locator(`[id="${ad}"]`).getAttribute('aria-selected')) === 'true');
  await search(page).press('Enter'); await page.waitForTimeout(500);
  const landed = await page.evaluate(() => ({ hash: location.hash, flash: !!document.querySelector('[data-setting="keep-deleted"][data-flash]'), focus: !!document.activeElement?.closest('[data-setting="keep-deleted"]') }));
  ok(`${T} search: ↵ jumps to "Keep deleted items", highlights it and moves focus into it`, landed.hash === '#keep-deleted' && landed.flash && landed.focus && (await inView(page, '[data-setting="keep-deleted"]')) === true, JSON.stringify(landed));
  ok(`${T} search: the field clears after a jump`, (await search(page).inputValue()) === '');
  // across groups: from Data to General's Notifications
  await page.keyboard.press('/'); await page.keyboard.type('bell');
  await page.waitForTimeout(150); await page.keyboard.press('Enter');
  await page.waitForURL(/\/settings\/general#notifications/, { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(800);
  ok(`${T} search: a match in another group opens it, at the section`, new URL(page.url()).hash === '#notifications' && (await inView(page, '#notifications')) === true, page.url());
  // Escape clears, then leaves the field
  await page.keyboard.press('/'); await page.keyboard.type('icons');
  await page.keyboard.press('Escape');
  ok(`${T} search: Esc clears the search and the groups come back`, (await search(page).inputValue()) === '' && await snav(page).getByRole('link', { name: 'Organising' }).isVisible());
  await search(page).fill('xyz'); await snav(page).getByRole('button', { name: 'Clear the search' }).click();
  ok(`${T} search: the clear button empties it`, (await search(page).inputValue()) === '');
  // clicking a match
  await search(page).fill('mcp'); await page.waitForTimeout(150);
  await snav(page).getByRole('option').first().click(); await page.waitForURL(/\/settings\/boards-ai/, { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(600);
  ok(`${T} search: clicking a match goes there`, /\/settings\/boards-ai#(ai|mcp)$/.test(page.url()), page.url());
  // the sidebar's section links jump within the page
  await go(page, '/settings/general');
  await snav(page).getByRole('list', { name: 'General sections' }).getByRole('link', { name: 'Keyboard shortcuts' }).click(); await page.waitForTimeout(600);
  ok(`${T} the open group's section links scroll to the section and mark it`, (await inView(page, '#shortcuts')) === true && (await snav(page).getByRole('link', { name: 'Keyboard shortcuts' }).getAttribute('aria-current')) === 'location');
  // "/" is listed with the shortcuts, and doesn't fire while typing in a field
  ok(`${T} the shortcuts list has Search Settings (/)`, await page.locator('main [data-action], main dt').filter({ hasText: 'Search Settings' }).count() >= 1);
  if (F.has('imports')) {
    await go(page, '/settings/capture-import');
    await page.getByRole('textbox', { name: 'GitHub stars' }).click(); await page.keyboard.type('a/b');
    ok(`${T} "/" types normally in other fields`, (await page.getByRole('textbox', { name: 'GitHub stars' }).inputValue()) === 'a/b' && !(await search(page).evaluate(el => el === document.activeElement)));
  }

  /* ---------- every search anchor resolves on its group's page ---------- */
  // the anchors, as sections.ts lists them (read from the source, so the test can't drift from it)
  const src = fs.readFileSync(path.join(HERE, '../../src/components/settings/sections.ts'), 'utf8');
  const byGroup = {};
  let cur = null, secOut = false; // a section whose feature this build lacks takes its settings with it
  for (const line of src.split('\n')) {
    const g = line.match(/^\s*\{ id: '([a-z-]+)', label: '[^']+', icon: \w+, blurb: '[^']*'.*sections: \[/);
    if (g) { cur = g[1]; byGroup[cur] = []; continue; }
    const x = line.match(/^\s*\{ id: '([a-z0-9-]+)', label: '/);
    if (!x || !cur) continue;
    const feat = line.match(/feature: '([a-z]+)'/)?.[1];
    const out = !!feat && !F.has(feat);
    if (/icon: \w+/.test(line)) secOut = out; // a section line; its settings follow
    if (out || secOut) continue;
    byGroup[cur].push(x[1]);
  }
  for (const g of Object.keys(byGroup)) if (!byGroup[g].length) delete byGroup[g]; // a group left with no sections goes too
  const lost = [];
  let total = 0;
  for (const [g, ids] of Object.entries(byGroup)) {
    await go(page, `/settings/${g}`);
    for (const id of ids) {
      if (NEEDS_DATA.has(id)) continue;
      total++;
      const n = await page.evaluate(i => !!(document.getElementById(i) || document.querySelector(`[data-setting="${i}"]`)), id);
      if (!n) lost.push(`${g}#${id}`);
    }
  }
  ok(`${T} every section and setting search can reach is on its group's page (${total})`, total > (F.size >= 9 ? 60 : 30) && !lost.length, lost.join(', '));

  /* ---------- the icon rail ---------- */
  await go(page, '/settings/general');
  await page.keyboard.press(engine === 'webkit' ? 'Meta+Backslash' : 'Control+Backslash'); await page.waitForTimeout(400);
  const rail = await page.evaluate(() => { const n = document.querySelector('nav[aria-label="Settings"]'); return { side: document.documentElement.dataset.side, w: Math.round(n.getBoundingClientRect().width), groups: [...n.querySelectorAll('a[aria-current], a')].filter(a => a.getBoundingClientRect().width > 0 && a.querySelector('svg')).length, field: n.querySelector('input').getBoundingClientRect().width }; });
  ok(`${T} rail: icons only, the search becomes an icon`, rail.side === 'rail' && rail.field === 0 && rail.groups === GROUPS.length + 1 && await snav(page).getByRole('button', { name: 'Search settings' }).isVisible(), JSON.stringify(rail));
  await page.screenshot({ path: path.join(SHOTS, `${engine}-1440-light-rail.png`) });
  await page.keyboard.press('/'); await page.waitForTimeout(500);
  ok(`${T} rail: / opens the sidebar and focuses the search`, await page.evaluate(() => document.documentElement.dataset.side) === 'full' && await search(page).evaluate(el => el === document.activeElement));

  ok(`${T} no page errors`, !errs.length, errs.slice(0, 3).join(' | '));
  await ctx.close();

  /* ---------- looks: 1440 and 390, light and dark, Classic and Paper (axe on Chromium); 2560 too ---------- */
  for (const look of LOOKS) for (const theme of ['light', 'dark']) for (const w of [1440, 390]) {
    const c = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, colorScheme: theme, deviceScaleFactor: w < 600 ? 2 : 1, reducedMotion: 'reduce' });
    const p = await c.newPage();
    if (LOOKS.length > 1) await setLook(p, look); else await go(p, '/settings/general');
    const L = `${T} ${w} ${theme} ${look}`;
    ok(`${L}: the style is on`, await p.evaluate(() => document.documentElement.dataset.look ?? 'classic') === look);
    let over = 0;
    for (const [id] of GROUPS) {
      await go(p, `/settings/${id}`);
      over = Math.max(over, await sideways(p));
      if (engine === 'chromium') await axe(p, `${L} /settings/${id}`);
      if (['general', 'data', 'labels'].includes(id) || w < 600) await p.screenshot({ path: path.join(SHOTS, `${engine}-${w}-${theme}-${look}-${id}.png`), fullPage: w < 600 && id === 'general' });
    }
    ok(`${L}: no sideways scroll on any group`, over <= 0, `${over}px`);
    // search open, with matches, and empty
    if (w < 600) {
      await go(p, '/settings/general');
      await p.getByRole('button', { name: 'Search settings' }).first().click(); await p.waitForTimeout(450);
      ok(`${L}: the page's search button opens the drawer with the field focused`, await search(p).evaluate(el => el === document.activeElement));
    } else {
      await go(p, '/settings/general'); await p.keyboard.press('/');
    }
    await p.keyboard.type('back'); await p.waitForTimeout(200);
    if (engine === 'chromium') await axe(p, `${L} search open`);
    await p.screenshot({ path: path.join(SHOTS, `${engine}-${w}-${theme}-${look}-search.png`) });
    await search(p).fill('qqzz'); await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(SHOTS, `${engine}-${w}-${theme}-${look}-search-empty.png`) });
    if (w < 600) {
      await search(p).fill('theme'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
      ok(`${L}: a match closes the drawer and lands on the row`, await p.evaluate(() => document.querySelector('nav[data-shell-nav]').dataset.open) !== 'true' && (await inView(p, '[data-setting="theme"]')) === true);
      ok(`${L}: still no sideways scroll`, (await sideways(p)) <= 0);
    }
    await c.close();
  }
  for (const theme of ['light', 'dark']) {
    const c = await browser.newContext({ viewport: { width: 2560, height: 1440 }, colorScheme: theme, reducedMotion: 'reduce' });
    const p = await c.newPage();
    for (const id of ['general', 'organising', 'data']) { await go(p, `/settings/${id}`); await p.screenshot({ path: path.join(SHOTS, `${engine}-2560-${theme}-${id}.png`) }); }
    ok(`${T} 2560 ${theme}: the settings column stays readable (760 px or less)`, (await p.locator('main section[data-sub]').first().evaluate(e => e.getBoundingClientRect().width)) <= 760);
    await c.close();
  }
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
