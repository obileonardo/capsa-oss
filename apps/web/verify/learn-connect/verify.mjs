// Learn and connecting an AI (issue #92, Elvis 27 Oct) and the one tab system. Proves, in a real browser:
//   centring    Learn and Activity sit centred in the panel, at their column widths;
//   sticky nav  after a jump from Learn's section bar the bar is still in view under the top bar, the section lands just
//               below it, and the bar marks it; scrolling by hand moves the mark (scroll-spy); Activity's, the Library's
//               and the Playground's tab bars stay in view under the top bar when the page scrolls;
//   one system  every tab bar has the same tab height, type, padding and chosen state, and every segmented control the
//               same; in Paper the tab bar is underlined in red and the segmented control is not underlined at all;
//   videos      each video file loads (MP4, under 8 MB), has a poster and captions (WebVTT), and plays (WebKit: the
//               open-source Chromium build has no H.264); the player has no autoplay, a captions track on by default
//               and a transcript that seeks; Learn's cards open it and carry no Soon tag;
//   connect     the modal opens from + Add AI, from an AI's row in the sidebar and from Learn's cards, walks its steps,
//               copies the command, keeps focus inside, closes with Esc and gives focus back to what opened it; on a
//               phone it fills the screen;
//   axe         no serious or critical issues at 1440 and 390, light and dark, Classic and Paper (Learn, Activity, a
//               video, the modal).
// Screenshots: ./shots. Usage (dev server): CAPSA_BASE=http://127.0.0.1:3420 node verify/learn-connect/verify.mjs
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
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PUB = path.resolve(HERE, '../../public/videos');
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const go = async (page, p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await page.waitForTimeout(500); };
const look = (page, l) => page.evaluate(x => { document.documentElement.dataset.look = x; }, l);
async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.nodes.length).map(v => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')}`));
}
const scrollMain = (page, y) => page.evaluate(y => { const m = document.querySelector('main'); (m.scrollHeight > m.clientHeight ? m : document.scrollingElement).scrollTop = y; }, y);
/** The bar and the top bar: the bar's top, the header's bottom, and whether the bar is on screen. */
const barState = page => page.evaluate(() => {
  const bar = document.querySelector('main [data-tabbar]'); const hdr = document.querySelector('main header');
  const b = bar.getBoundingClientRect(), h = hdr.getBoundingClientRect();
  return { top: Math.round(b.top), bottom: Math.round(b.bottom), hdr: Math.round(h.bottom), shown: b.bottom > h.bottom && b.top < innerHeight };
});

const browser = await pw.chromium.launch();

/* ---------- 1. centring ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const [route, sel, width] of [['/learn', '[data-tabbar]', 1040], ['/activity', '[data-tabbar]', 880]]) {
    await go(page, route);
    const m = await page.evaluate(s => {
      const col = document.querySelector('main ' + s).parentElement; const body = col.parentElement;
      const c = col.getBoundingClientRect(), bd = body.getBoundingClientRect(); const cs = getComputedStyle(body);
      const inner = { l: bd.left + parseFloat(cs.paddingLeft), r: bd.right - parseFloat(cs.paddingRight) };
      return { w: Math.round(c.width), left: Math.round(c.left - inner.l), right: Math.round(inner.r - c.right), title: Math.round(document.querySelector('main h1').getBoundingClientRect().left - c.left) };
    }, sel);
    ok(`${route}: the column is centred in the panel`, Math.abs(m.left - m.right) <= 2 && m.left > 24, JSON.stringify(m));
    ok(`${route}: the column is ${width} px wide and the title starts on its edge`, m.w === width && m.title === 0, JSON.stringify(m));
  }
  await page.close();
}

/* ---------- 2. sticky nav and scroll-spy ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await go(page, '/learn');
  const bar = page.getByRole('navigation', { name: 'On this page' });
  for (const [label, id] of [['Connect your AI', 'ai'], ['Guides', 'guides'], ['Start here', 'start']]) {
    await bar.getByRole('link', { name: label }).click(); await page.waitForTimeout(1100);
    const s = await barState(page);
    const land = await page.evaluate(id => Math.round(document.getElementById(id).getBoundingClientRect().top), id);
    const cur = await bar.locator('[aria-current="location"]').innerText();
    if (id === 'start') ok('Learn: Start here goes back to the top, so the page head returns', (await page.evaluate(() => document.querySelector('main').scrollTop)) === 0 && cur === 'Start here', cur);
    else {
      ok(`Learn: after the ${label} jump the bar is still in view, right under the top bar`, s.shown && Math.abs(s.top - s.hdr) <= 1, JSON.stringify(s));
      ok(`Learn: ${label} lands just below the bar`, land >= s.bottom && land <= s.bottom + 40, `section at ${land}, bar ends at ${s.bottom}`);
      ok(`Learn: the bar marks ${label}`, cur === label, cur);
      ok(`Learn: the address says #${id}`, page.url().endsWith('#' + id));
    }
  }
  // by hand: the mark follows the reading position
  await scrollMain(page, await page.evaluate(() => document.getElementById('guides').offsetTop + 40)); await page.waitForTimeout(400);
  ok('Learn: scrolling by hand to Guides marks Guides', (await bar.locator('[aria-current="location"]').innerText()) === 'Guides');
  await scrollMain(page, 99999); await page.waitForTimeout(400);
  ok('Learn: at the end of the page Videos is marked', (await bar.locator('[aria-current="location"]').innerText()) === 'Videos');
  await page.screenshot({ path: path.join(SHOTS, 'learn-sticky-1440.png') });
  // keyboard: a jump moves focus to the section's heading
  await scrollMain(page, 0); await bar.getByRole('link', { name: 'Guides' }).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  ok('Learn: a keyboard jump moves focus to the section heading', await page.evaluate(() => document.activeElement?.id === 'guides-h'));

  for (const [route, prep] of [['/activity'], ['/library'], ['/playground', async () => {
    if (await page.getByRole('button', { name: 'Try with sample images' }).count()) { await page.getByRole('button', { name: 'Try with sample images' }).click(); await page.waitForTimeout(2500); await go(page, '/playground'); }
  }]]) {
    await go(page, route); if (prep) await prep();
    await scrollMain(page, 1200); await page.waitForTimeout(300);
    const s = await barState(page);
    const scrolled = await page.evaluate(() => document.querySelector('main').scrollTop);
    const sticky = await page.evaluate(() => getComputedStyle(document.querySelector('main [data-tabbar]')).position === 'sticky');
    if (scrolled > 0) ok(`${route}: the tab bar stays in view under the top bar after scrolling ${scrolled}px`, s.shown && Math.abs(s.top - s.hdr) <= 1, JSON.stringify(s));
    else ok(`${route}: too short to scroll here; the tab bar is set to stick under the top bar`, sticky && s.shown);
    await page.screenshot({ path: path.join(SHOTS, `sticky${route.replace(/\//g, '-')}-1440.png`) });
  }
  // keyboard on real tabs: arrows move and choose (Activity)
  await go(page, '/activity');
  const tl = page.getByRole('tablist', { name: 'Show' });
  await tl.getByRole('tab', { name: 'Everything' }).focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250);
  ok('Activity: → moves to and chooses Library (tablist)', await page.evaluate(() => document.activeElement?.getAttribute('aria-selected') === 'true' && document.activeElement.textContent.includes('Library')));
  await page.keyboard.press('End'); await page.waitForTimeout(250);
  ok('Activity: End chooses the last tab', await page.evaluate(() => document.activeElement?.textContent.includes('Deleted')));
  ok('Activity: the panel is labelled by its tab', await page.evaluate(() => { const p = document.getElementById('activity-log'); return p?.getAttribute('role') === 'tabpanel' && document.getElementById(p.getAttribute('aria-labelledby'))?.getAttribute('aria-selected') === 'true'; }));
  await page.close();
}

/* ---------- 3. one tab system: the same metrics everywhere ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const tabsOf = () => page.evaluate(() => [...document.querySelectorAll('main [data-tabbar], dialog[open] [data-tabbar]')].flatMap((bar, bi) => [...bar.querySelectorAll('[data-tab]')].map(t => {
    const cs = getComputedStyle(t), face = getComputedStyle(t.firstElementChild), lbl = getComputedStyle(t.querySelector('[data-text]'));
    return { bi, h: Math.round(t.getBoundingClientRect().height), fs: cs.fontSize, fw: lbl.fontWeight, on: t.hasAttribute('data-on'), pad: face.paddingLeft, fh: Math.round(t.firstElementChild.getBoundingClientRect().height), color: cs.color };
  })));
  const segsOf = () => page.evaluate(() => [...document.querySelectorAll('main .seg, dialog[open] .seg')].filter(s => s.getClientRects().length).flatMap(s => [...s.querySelectorAll(':scope > button')].map(b => {
    const cs = getComputedStyle(b); return { h: Math.round(b.getBoundingClientRect().height), fs: cs.fontSize, fw: cs.fontWeight, track: Math.round(s.getBoundingClientRect().height), under: cs.boxShadow.includes('inset') };
  })));
  for (const l of ['classic', 'paper']) {
    const all = [], segs = [];
    for (const r of ['/learn', '/activity', '/library', '/library/sources', '/library/health', '/playground']) {
      await go(page, r);
      if (r === '/playground' && await page.getByRole('button', { name: 'Try with sample images' }).count()) { await page.getByRole('button', { name: 'Try with sample images' }).click(); await page.waitForTimeout(2500); await go(page, r); }
      await look(page, l); await page.waitForTimeout(150);
      all.push(...(await tabsOf()).map(t => ({ ...t, r })));
    }
    for (const r of ['/library', '/library/sources', '/library/health', '/settings/general', '/library/a-deploy', '/inbox/s-video']) {
      await go(page, r); await look(page, l); await page.waitForTimeout(150);
      segs.push(...(await segsOf()).map(t => ({ ...t, r })));
    }
    const uniq = k => [...new Set(all.map(t => t[k]))];
    ok(`${l}: ${all.length} tabs in ${new Set(all.map(t => t.r)).size} places, all 40 px tall with a 28 px face`, uniq('h').join() === '40' && uniq('fh').join() === '28', JSON.stringify({ h: uniq('h'), fh: uniq('fh') }));
    ok(`${l}: every tab is 13 px type with the same face padding`, uniq('fs').join() === '13px' && uniq('pad').join() === '10px', JSON.stringify({ fs: uniq('fs'), pad: uniq('pad') }));
    ok(`${l}: chosen tabs are 600, the rest 500, in every place`, [...new Set(all.filter(t => t.on).map(t => t.fw))].join() === '600' && [...new Set(all.filter(t => !t.on).map(t => t.fw))].join() === '500');
    const bars = [...new Set(all.map(t => `${t.r}#${t.bi}`))];
    ok(`${l}: each of the ${bars.length} tab bars has exactly one chosen tab`, bars.every(b => all.filter(t => `${t.r}#${t.bi}` === b && t.on).length === 1));
    const su = k => [...new Set(segs.map(t => t[k]))];
    ok(`${l}: ${segs.length} segments in ${new Set(segs.map(t => t.r)).size} places, 24 px in a 28 px track, 12 px type`, su('h').join() === '24' && su('track').join() === '28' && su('fs').join() === '12px', JSON.stringify({ h: su('h'), track: su('track'), fs: su('fs') }));
    ok(`${l}: no segment is underlined (underlines are the tab bar's)`, su('under').join() === 'false');
  }
  // Paper: the ink is the red rule; Classic: ink
  await go(page, '/activity'); const classicInk = await page.evaluate(() => getComputedStyle(document.querySelector('[data-tabbar] [aria-hidden][class*="ink"]')).backgroundColor);
  await look(page, 'paper'); await page.waitForTimeout(100);
  const paperInk = await page.evaluate(() => getComputedStyle(document.querySelector('[data-tabbar] [aria-hidden][class*="ink"]')).backgroundColor);
  ok('the chosen tab is underlined in ink in Classic and in red in Paper', classicInk !== paperInk && /rgb\((2[0-4]\d|1\d\d), /.test(paperInk), `${classicInk} / ${paperInk}`);
  const ink = await page.evaluate(() => { const on = document.querySelector('[data-tabbar] [data-on]').getBoundingClientRect(); const i = document.querySelector('[data-tabbar] [class*="ink"]').getBoundingClientRect(); return { dx: Math.round(i.left - on.left), dw: Math.round(i.width - on.width), dy: Math.round(on.bottom - i.bottom) }; });
  ok('the underline sits under the chosen tab, its full width', ink.dx === 0 && ink.dw === 0 && Math.abs(ink.dy) <= 1, JSON.stringify(ink));
  await page.close();
}

/* ---------- 4. videos: files ---------- */
const SLUGS = ['first-tour', 'quote-check', 'skills-mcp'];
{
  const page = await browser.newPage();
  for (const s of SLUGS) {
    const r = await page.request.get(`${B}/videos/${s}.mp4`);
    const buf = await r.body();
    ok(`${s}.mp4: loads as video/mp4, under 8 MB`, r.ok() && /video\/mp4/.test(r.headers()['content-type'] ?? '') && buf.length < 8 * 1024 * 1024, `${(buf.length / 1048576).toFixed(2)} MB`);
    ok(`${s}.mp4: an MP4 with H.264 video and its index at the front (starts before it's all loaded)`, buf.includes(Buffer.from('avc1')) && buf.indexOf(Buffer.from('moov')) < buf.indexOf(Buffer.from('mdat')));
    const p = await page.request.get(`${B}/videos/${s}.jpg`);
    ok(`${s}.jpg: the poster loads`, p.ok() && /image\/jpeg/.test(p.headers()['content-type'] ?? ''));
    const v = await page.request.get(`${B}/videos/${s}.vtt`); const vt = await v.text();
    ok(`${s}.vtt: WebVTT captions with timed cues`, v.ok() && vt.startsWith('WEBVTT') && (vt.match(/-->/g) ?? []).length >= 5);
    ok(`${s}: files in public/ match what the server sent`, fs.statSync(path.join(PUB, `${s}.mp4`)).size === buf.length);
  }
  await page.close();
}

/* ---------- 5. connect modal ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await go(page, '/library');
  const dlg = page.locator('dialog[data-connect]');
  const add = page.locator('nav[data-shell-nav] button', { hasText: 'Add AI' });
  await add.click(); await page.waitForTimeout(400);
  ok('+ Add AI opens the connect modal at the picker', await dlg.isVisible() && await dlg.getByRole('list', { name: 'AIs' }).isVisible());
  await dlg.getByRole('button', { name: /^Claude/ }).click(); await page.waitForTimeout(300);
  ok('picking Claude shows step 1 of 4 and the steps list', /Step 1 of 4/.test(await dlg.innerText()) && (await dlg.getByRole('list', { name: 'Steps' }).locator('li').count()) === 4);
  ok('the step title takes focus', await page.evaluate(() => document.activeElement?.id === 'connect-title'));
  await dlg.getByRole('button', { name: /^Download/ }).click(); await page.waitForTimeout(300);
  ok('downloading says so in place', /Downloaded just now/.test(await dlg.innerText()));
  await dlg.getByRole('button', { name: /Continue/ }).click(); await page.waitForTimeout(300);
  ok('step 2: Add Capsa to Claude, with Claude Code and Claude Desktop', /Add Capsa to Claude/.test(await dlg.innerText()) && await dlg.getByRole('group', { name: 'Where' }).isVisible());
  await dlg.getByRole('button', { name: 'Copy' }).click(); await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok('Copy puts the claude mcp add command on the clipboard and says Copied', /^claude mcp add .*capsa/.test(clip) && /Copied/.test(await dlg.locator('pre').locator('..').innerText()), clip.slice(0, 60));
  await dlg.getByRole('group', { name: 'Where' }).getByRole('button', { name: 'Claude Desktop' }).click(); await page.waitForTimeout(200);
  ok('Claude Desktop shows its JSON', /mcpServers/.test(await dlg.locator('pre').innerText()));
  // focus trap: Tab many times, focus stays inside
  // (a native modal dialog lets Tab reach the browser's own controls between rounds, never the page behind it)
  let behind = 0; for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => { const a = document.activeElement; return !!a && a !== document.body && !a.closest('dialog[data-connect]'); })) behind++; }
  ok('focus never reaches the page behind the modal (24 Tabs)', behind === 0, `${behind} behind`);
  await dlg.getByRole('button', { name: /Continue/ }).click(); await dlg.getByRole('button', { name: /Continue/ }).click(); await page.waitForTimeout(200);
  ok('step 4 says what the browser can see and how to check, without claiming "connected"', /If Claude finds the checklist, it’s connected/.test(await dlg.innerText()) && /Library file downloaded/.test(await dlg.innerText()));
  await dlg.getByRole('button', { name: 'Finish' }).click(); await page.waitForTimeout(300);
  ok('Finish: Claude is set up, with Done and a link to its page', /Claude is set up/.test(await dlg.innerText()) && await dlg.getByRole('link', { name: 'Claude page' }).isVisible());
  await page.screenshot({ path: path.join(SHOTS, 'connect-done-1440.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok('Esc closes it and focus goes back to + Add AI', !(await dlg.isVisible()) && await page.evaluate(() => document.activeElement?.textContent?.includes('Add AI')));
  // from the AI's row in the sidebar (Claude was added)
  const row = page.locator('nav[data-shell-nav] [data-ai-row="claude"]');
  await row.click(); await page.waitForTimeout(400);
  ok('the sidebar\'s Claude row opens the modal on Claude\'s steps', await dlg.isVisible() && /Connect Claude/.test(await dlg.innerText()) && /Step 1 of 4/.test(await dlg.innerText()));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok('closing gives focus back to the row', await page.evaluate(() => document.activeElement?.getAttribute('data-ai-row') === 'claude'));
  // from Learn
  await go(page, '/learn');
  await page.locator('#ai').getByRole('button', { name: /Cursor/ }).click(); await page.waitForTimeout(400);
  ok('Learn\'s Cursor card opens the modal on Cursor\'s steps', await dlg.isVisible() && /Connect Cursor/.test(await dlg.innerText()));
  for (const th of ['light', 'dark']) for (const l of ['classic', 'paper']) {
    await page.emulateMedia({ colorScheme: th }); await look(page, l); await page.waitForTimeout(200);
    const bad = await axe(page); ok(`modal ${th} ${l} 1440: axe clean`, bad.length === 0, bad.join(' | '));
  }
  await page.emulateMedia({ colorScheme: 'light' }); await look(page, 'classic');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // phone: a full-height sheet
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  await page.locator('#ai').getByRole('button', { name: /Claude/ }).click(); await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const c = document.querySelector('dialog[data-connect] .dlg-card').getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), top: Math.round(c.top) }; });
  ok('on a phone it fills the screen', r.w === 390 && r.h === 844 && r.top === 0, JSON.stringify(r));
  ok('on a phone the steps become a progress line', await page.evaluate(() => getComputedStyle(document.querySelector('dialog[data-connect] ol[aria-label="Steps"]')).display === 'none'));
  const bad = await axe(page); ok('modal 390: axe clean', bad.length === 0, bad.join(' | '));
  await page.screenshot({ path: path.join(SHOTS, 'connect-390.png') });
  await ctx.close();
}

/* ---------- 6. Learn's cards and the player page; axe across styles and themes ---------- */
{
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const th of ['light', 'dark']) for (const l of ['classic', 'paper']) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: th });
    for (const r of ['/learn', '/activity', '/learn/videos/first-tour']) {
      await go(page, r); await look(page, l); await page.waitForTimeout(200);
      const bad = await axe(page); ok(`${r} ${w} ${th} ${l}: axe clean`, bad.length === 0, bad.join(' | '));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${r} ${w} ${th} ${l}: no sideways scroll`, over <= 0, `${over}px`);
      if (w === 1440 || r !== '/activity') await page.screenshot({ path: path.join(SHOTS, `${r.replace(/\//g, '_')}-${w}-${th}-${l}.png`) });
    }
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await go(page, '/learn');
  const cards = page.locator('#videos li');
  ok('Learn: three video cards, none marked Soon', (await cards.count()) === 3 && (await page.locator('#videos .tag').count()) === 0);
  ok('Learn: the video cards link to their players and show their lengths', (await page.locator('#videos a').evaluateAll(as => as.map(a => a.getAttribute('href')))).join() === SLUGS.map(s => `/learn/videos/${s}`).join() && /\d:\d\d/.test(await cards.first().innerText()));
  await page.close();
}
await browser.close();

/* ---------- 7. the player plays (WebKit has H.264 on macOS) ---------- */
{
  const wk = await pw.webkit.launch();
  const page = await wk.newPage({ viewport: { width: 1440, height: 900 } });
  for (const s of SLUGS) {
    await go(page, `/learn/videos/${s}`);
    const v = page.locator('video');
    const a = await v.evaluate(e => ({ poster: e.getAttribute('poster'), autoplay: e.autoplay, controls: e.controls, paused: e.paused, track: [...e.querySelectorAll('track')].map(t => `${t.kind}|${t.default}|${t.srclang}`).join() }));
    ok(`${s}: poster, native controls, a default captions track, no autoplay`, a.poster === `/videos/${s}.jpg` && a.controls && !a.autoplay && a.paused && a.track === 'captions|true|en', JSON.stringify(a));
    await page.waitForFunction(() => document.querySelector('video').readyState >= 1, null, { timeout: 15000 }).catch(() => {});
    const dur = await v.evaluate(e => e.duration);
    ok(`${s}: the browser reads its length (${dur?.toFixed?.(1)} s, 45 to 90 s expected)`, dur > 40 && dur < 95);
    await page.locator('button', { hasText: /^0:0\d/ }).nth(1).click(); await page.waitForTimeout(1500);
    const st = await v.evaluate(e => ({ t: e.currentTime, paused: e.paused, err: e.error?.code ?? null }));
    ok(`${s}: a transcript line seeks and it plays`, st.t > 1 && !st.err, JSON.stringify(st));
    ok(`${s}: the transcript marks the line being played`, (await page.locator('button[aria-current="true"]').count()) === 1);
    await v.evaluate(e => e.pause());
  }
  await page.screenshot({ path: path.join(SHOTS, 'player-webkit-1440.png') });
  await wk.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
