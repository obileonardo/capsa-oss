// Track A (25 Oct) in the browser: duplicate links, bulk paste, files (Markdown, PDF), transcripts, the save address and
// bookmarklet, the share target, imports (bookmarks, Raindrop, GitHub stars, prompts, notes) with progress, pause and
// triage, "Read the text" on images, backup round trip; screenshots (1440 and 390, light and dark) and axe.
// Usage (dev server running): CAPSA_BASE=http://127.0.0.1:3201 node verify/imports/verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import { fileURLToPath } from 'url';
import fs from 'fs';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = fileURLToPath(new URL('.', import.meta.url));
const BASE = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
const only = process.argv[3] ?? 'all';
const results = { checks: [], errors: [], shots: [] };
const check = (engine, name, ok, detail = '') => {
  results.checks.push({ engine, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ' — ' + detail : ''}`);
};

/* ---------- fixtures ---------- */
/** A real two-page PDF with a text layer (Helvetica), built by hand so the test needs no tools. */
function makePdf(pages) {
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  const pagesId = objs.length + 1 + pages.length * 2;
  for (const lines of pages) {
    const body = 'BT /F1 14 Tf 72 720 Td 18 TL ' + lines.map(l => `(${l.replace(/[()\\]/g, m => '\\' + m)}) Tj T*`).join(' ') + ' ET';
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf([['Team handbook', 'A short intro page.'], ['Review notes', '', 'Act as a reviewer and list the three biggest risks in this plan.']]);
const MD = '# My prompts\n\nSome intro.\n\n## Editor\n\nYou are a copy editor. Rewrite the text below so it reads clearly.\n\n## Steps\n\n1. Draft\n2. Review\n3. Ship\n';
const SRT = `1
00:00:01,000 --> 00:00:04,000
Welcome back to the channel.

2
00:01:10,000 --> 00:01:14,500
You are a senior engineer reviewing a pull request.

3
00:01:14,600 --> 00:01:19,000
Point out bugs first, then style, and keep it short.

4
00:02:30,000 --> 00:02:33,000
That's it for today.`;
const bookmarks = links => `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1>\n<DL><p>\n<DT><H3>Bookmarks bar</H3>\n<DL><p>\n${links.map(([u, t]) => `<DT><A HREF="${u}" ADD_DATE="1700000000">${t}</A>`).join('\n')}\n</DL><p>\n</DL><p>`;
const SMALL = bookmarks([['https://track-a.example/first-guide', 'First guide'], ['https://track-a.example/second-guide?utm_source=x', 'Second guide'], ['https://demo-essays.example/calm/', 'Already saved (demo)']]);
const BIG = bookmarks(Array.from({ length: 2400 }, (_, i) => [`https://bulk-${i}.example/page-${i}`, `Bulk link ${i}`]));
const RAINDROP = 'id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite\n1,"Raindrop one",,,https://raindrop.example/one,AI,"ai, prompts",2024-03-01T10:00:00.000Z,,,false\n';
const PROMPTS_CSV = 'act,prompt,category\n"Linux Terminal","I want you to act as a linux terminal and reply only with what the terminal shows.",dev\n"Translator","I want you to act as a translator for [language].",writing\n';
const NOTE_A = '---\ntags: [ai]\n---\n# Daily\n\nAct as my editor and tighten this paragraph without changing its meaning.\n';
const NOTE_B = 'Nothing reusable here, just a thought.';

const consoleErr = (engine, page) => {
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|favicon/.test(m.text())) results.errors.push({ engine, url: page.url(), text: m.text().slice(0, 240) }); });
  page.on('pageerror', e => results.errors.push({ engine, url: page.url(), text: 'pageerror: ' + e.message.slice(0, 240) }));
};
async function newPage(browser, engine, { width = 1440, theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: theme, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await ctx.newPage();
  consoleErr(engine, page);
  return { ctx, page };
}
const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForSelector('main#main h1, main#main .empty', { timeout: 20000 }); await page.waitForTimeout(250); };
const toast = page => page.locator('.toasts .toast').last();
const appState = async page => { await page.waitForTimeout(450); return page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('capsa-web'); r.onsuccess = () => { const g = r.result.transaction('state').objectStore('state').get('app'); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); }; r.onerror = () => rej(r.error); })); };
async function openCapture(page) { await page.keyboard.press('Escape'); await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {}); await page.keyboard.press('c'); await page.waitForSelector('dialog[aria-label="Capture"][open]'); }
async function pasteInto(page, selector, text) {
  await page.locator(selector).evaluate((el, t) => { el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, text);
  await page.waitForTimeout(200);
}
async function shoot(page, engine, name) { const f = `${engine}-${name}.png`; await page.screenshot({ path: OUT + f }); results.shots.push(f); }
async function axe(page, engine, label) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(x => (x.impact === 'serious' || x.impact === 'critical') && x.nodes.length).map(x => `${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')}`));
  check(engine, `axe ${label}: no serious/critical`, v.length === 0, v.join(' | ') || '0');
}
const noHScroll = async (page, engine, label) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(engine, `${label}: no horizontal scroll`, o <= 0, `${o}px`); };
const waitDone = async (page, name, timeout = 30000) => page.waitForFunction(n => [...document.querySelectorAll('[data-import-status]')].some(el => el.closest('div')?.textContent?.includes(n) && !/Importing|Paused/.test(el.textContent)), name, { timeout });

for (const engine of engines) {
  const browser = await pw[engine].launch();

  /* ---------- 1. Capture: File (Markdown and PDF), duplicates, bulk paste, transcripts ---------- */
  if (only === 'all' || only === 'capture') {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox');
    await openCapture(page);
    check(engine, 'Capture lists File in Create', await page.locator('#cap-create [role="option"]', { hasText: /^File/ }).count() === 1);
    await page.locator('input[data-doc-input]').setInputFiles({ name: 'prompts.md', mimeType: 'text/markdown', buffer: Buffer.from(MD) });
    await page.waitForSelector('[aria-label="File: prompts.md"]');
    check(engine, 'File: the composer shows the file', (await page.locator('dialog[open]').innerText()).includes('Markdown'));
    await shoot(page, engine, 'capture-file');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Kept in Inbox · 2 found/.test(document.querySelector('.toasts')?.textContent ?? ''), null, { timeout: 10000 });
    check(engine, 'File (Markdown): Enter keeps it, 2 found', true);
    let st = await appState(page);
    let src = st.sources.find(x => x.file?.name === 'prompts.md');
    check(engine, 'File (Markdown): line anchors as evidence', src?.candidates?.map(c => c.evidence.locator).join('|') === 'from prompts.md, line 7|from prompts.md, lines 11–13', src?.candidates?.map(c => c.evidence.locator).join('|'));
    await go(page, `/inbox/${src.id}`);
    check(engine, 'File (Markdown): review shows the quoted line', (await page.locator('main').innerText()).includes('Quoted from prompts.md, line 7'));

    await openCapture(page);
    await page.locator('input[data-doc-input]').setInputFiles({ name: 'handbook.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Kept in Inbox · 1 found/.test(document.querySelector('.toasts')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
    st = await appState(page);
    src = st.sources.find(x => x.file?.name === 'handbook.pdf');
    check(engine, 'File (PDF): read on the device with page anchors', src?.file?.pages === 2 && src.candidates?.[0]?.evidence?.locator?.startsWith('from handbook.pdf, page 2'), JSON.stringify(src?.candidates?.map(c => c.evidence.locator) ?? src?.nothingReason ?? 'no source'));
    check(engine, 'File (PDF): the words are verbatim from the page', src?.candidates?.[0]?.exact === 'Act as a reviewer and list the three biggest risks in this plan.', src?.candidates?.[0]?.exact);

    // CAP-04 duplicates
    await openCapture(page);
    await page.locator('#cap-value').fill('http://www.demo-essays.example/calm/?utm_source=newsletter');
    await page.waitForSelector('[data-dupe]');
    check(engine, 'Duplicate: an already saved link says so', await page.locator('[data-dupe]').innerText() === 'Already saved');
    check(engine, 'Duplicate: offers Open existing and Save anyway', await page.getByRole('button', { name: /Open existing/ }).count() === 1 && await page.getByRole('button', { name: 'Save anyway' }).count() === 1);
    await shoot(page, engine, 'capture-duplicate');
    const before = (await appState(page)).sources.length;
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/inbox\/s-bookmark$/);
    check(engine, 'Duplicate: Enter opens the existing source, nothing saved', (await appState(page)).sources.length === before);
    await openCapture(page);
    await page.locator('#cap-value').fill('https://demo-essays.example/calm');
    await page.getByRole('button', { name: 'Save anyway' }).click();
    check(engine, 'Duplicate: Save anyway saves a second copy', (await appState(page)).sources.length === before + 1);
    await go(page, '/library');
    await page.fill('#lib-cap', 'https://www.demo-essays.example/calm?utm_source=x');
    await page.locator('#lib-cap').press('Enter');
    await page.waitForTimeout(300);
    check(engine, 'Duplicate (capture box): says so, offers Open existing and Save anyway, saves nothing',
      /Already saved/.test(await page.locator('.toasts').innerText()) && await page.locator('.toasts').getByRole('button', { name: 'Open existing' }).count() === 1
      && await page.locator('.toasts').getByRole('button', { name: 'Save anyway' }).count() === 1 && (await appState(page)).sources.length === before + 1);

    // CPT-16 bulk paste
    await openCapture(page);
    await pasteInto(page, '#cap-value', 'https://bulk-paste.example/one\nhttps://bulk-paste.example/two?utm_campaign=z\nhttps://demo-essays.example/calm\nnot a link\nhttps://bulk-paste.example/one/');
    await page.waitForSelector('[aria-label="Links to keep"]');
    const states = await page.locator('[aria-label="Links to keep"] li').evaluateAll(els => els.map(e => e.dataset.state));
    check(engine, 'Bulk: each line has its own status', JSON.stringify(states) === JSON.stringify(['new', 'new', 'saved', 'invalid', 'repeat']), JSON.stringify(states));
    check(engine, 'Bulk: Keep says how many', await page.getByRole('button', { name: /Keep 2 links/ }).count() === 1);
    await shoot(page, engine, 'capture-bulk');
    const n0 = (await appState(page)).sources.length;
    await page.getByRole('button', { name: /Keep 2 links/ }).click();
    await page.waitForTimeout(300);
    check(engine, 'Bulk: toast counts each outcome', /Kept 2 links in Inbox · 1 already saved · 1 repeated · 1 not a link/.test(await page.locator('.toasts').innerText()), await page.locator('.toasts').innerText());
    st = await appState(page);
    check(engine, 'Bulk: two sources, in the order pasted, each queued', st.sources.length === n0 + 2 && st.sources[0].url === 'https://bulk-paste.example/one' && st.sources[1].status === 'queued');

    // EXT-05 transcript pasted in Capture: one prompt, so it goes to the Library with its time
    await openCapture(page);
    await pasteInto(page, '#cap-value', SRT);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    st = await appState(page);
    const a = st.artifacts.find(x => x.exact?.startsWith('You are a senior engineer reviewing'));
    check(engine, 'Transcript: a prompt with its moment (01:10–01:19)', a?.evidence?.t === '01:10' && a?.evidence?.tEnd === '01:19' && !a.exact.includes("That's it"), JSON.stringify(a?.evidence));
    await go(page, `/library/${a.id}`);
    check(engine, 'Transcript: the Library shows where in the transcript', (await page.locator('main').innerText()).includes('Quoted from the transcript you pasted, 01:10–01:19'));

    // EXT-05 on a video: Paste a transcript on a saved YouTube link
    await openCapture(page);
    await page.locator('#cap-value').fill('https://www.youtube.com/watch?v=trackA00001');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const vid = (await appState(page)).sources.find(x => x.url?.includes('trackA00001'));
    await go(page, `/inbox/${vid.id}`);
    await page.getByRole('button', { name: 'Paste a transcript' }).click();
    await page.locator('textarea').last().fill(SRT);
    await page.getByRole('button', { name: 'Keep pasted text' }).click();
    await page.getByRole('button', { name: 'Attach to this source' }).click();
    await page.waitForTimeout(600);
    await go(page, `/inbox/${vid.id}`);
    check(engine, 'Video transcript: moments on the timeline from your transcript', await page.locator('button[aria-label^="01:10"]').first().getAttribute('aria-label').then(t => /From the transcript you pasted/.test(t ?? '')).catch(() => false));
    check(engine, 'Video transcript: the transcript is shown', /transcript/i.test(await page.locator('main').innerText()) && (await page.locator('main').innerText()).includes('Point out bugs first'));
    await shoot(page, engine, 'video-transcript');
    await ctx.close();
  }

  /* ---------- 2. The save address, bookmarklet and share target ---------- */
  if (only === 'all' || only === 'address') {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/capture?url=' + encodeURIComponent('https://save-address.example/post?utm_source=x') + '&title=' + encodeURIComponent('A post worth keeping'));
    check(engine, '/capture: shows the link and the given title', (await page.locator('main').innerText()).includes('A post worth keeping'));
    const n0 = (await appState(page)).sources.length;
    check(engine, '/capture: nothing saved before Keep', n0 === (await appState(page)).sources.length && !(await appState(page)).sources.some(x => x.url?.includes('save-address')));
    await shoot(page, engine, 'capture-address');
    await page.keyboard.press('Enter'); // Keep has focus
    await page.waitForSelector('#cap-done');
    const st = await appState(page);
    const s = st.sources.find(x => x.url?.includes('save-address.example'));
    check(engine, '/capture: Keep saves it with the title and shows the result', s?.title === 'A post worth keeping' && (await page.locator('#cap-done').innerText()) === 'Kept in Inbox');
    await shoot(page, engine, 'capture-address-done');
    await page.getByRole('button', { name: 'Undo' }).click();
    check(engine, '/capture: Undo takes it back', !(await appState(page)).sources.some(x => x.url?.includes('save-address.example')));
    await go(page, '/capture?url=' + encodeURIComponent('https://demo-essays.example/calm'));
    check(engine, '/capture: an already saved link offers Open existing', await page.getByRole('button', { name: /Open existing/ }).count() === 1 && await page.getByRole('button', { name: 'Save anyway' }).count() === 1);
    await go(page, '/capture?title=Shared&text=' + encodeURIComponent('Look at this https://shared-text.example/a great read'));
    check(engine, '/capture: a link inside shared text (Android share)', (await page.locator('main').innerText()).includes('shared-text.example/a'));
    await page.getByRole('button', { name: 'Keep' }).click();
    const sh = (await appState(page)).sources.find(x => x.url?.includes('shared-text.example'));
    check(engine, '/capture: the rest of the shared text is your note', sh?.description === 'Look at this great read', sh?.description);
    await go(page, '/capture?text=' + encodeURIComponent('You are a careful editor. Rewrite the text below so it reads clearly and keeps my voice.'));
    await page.getByRole('button', { name: 'Keep' }).click();
    check(engine, '/capture: text goes through the capture rules (one prompt to the Library)', (await page.locator('#cap-done').innerText()) === 'Kept in Library');
    await go(page, '/capture');
    check(engine, '/capture: with nothing to keep, offers Capture', (await page.locator('main').innerText()).includes('Nothing to keep'));
    const man = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
    check(engine, 'manifest: share_target opens /capture with title, text and url', man.share_target?.action === '/capture' && man.share_target.params.url === 'url' && man.share_target.params.text === 'text' && man.share_target.params.title === 'title', JSON.stringify(man.share_target));
    await go(page, '/settings/capture');
    const href = await page.locator('a[data-bookmarklet]').getAttribute('href');
    check(engine, 'Settings › Capture: the bookmarklet opens this app’s /capture', href?.startsWith('javascript:') && href.includes(`${BASE}/capture?url=`), href?.slice(0, 90));
    check(engine, 'Settings › Capture: the bookmarklet can be dragged', await page.locator('a[data-bookmarklet]').getAttribute('draggable') === 'true');
    // run the bookmarklet's code on another page: it opens /capture with that page's address
    const popup = page.context().waitForEvent('page');
    await page.evaluate(code => { history.replaceState(null, '', '/library?from=bm'); new Function(decodeURIComponent(code.slice('javascript:'.length)))(); }, href);
    const p2 = await popup; await p2.waitForLoadState();
    check(engine, 'Bookmarklet: opens /capture for the current page', p2.url().startsWith(`${BASE}/capture?url=${encodeURIComponent(`${BASE}/library?from=bm`)}`), p2.url());
    await shoot(page, engine, 'settings-capture');
    await ctx.close();
  }

  /* ---------- 3. Imports ---------- */
  if (only === 'all' || only === 'imports') {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/settings/import');
    await page.locator('input[data-pick="bookmarks"]').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(SMALL) });
    await waitDone(page, 'bookmarks.html');
    check(engine, 'Bookmarks: 2 added, 1 already here', /2 added · 1 already here/.test(await page.locator('main').innerText()));
    let st = await appState(page);
    const imp = st.sources.filter(x => x.importId);
    check(engine, 'Bookmarks: saved as links only, with their folder', imp.length === 2 && imp.every(x => x.status === 'bookmark' && x.labels?.includes('Bookmarks bar')));
    await go(page, '/inbox');
    check(engine, 'Bookmarks: imported links stay off the Inbox board', !(await page.locator('main').innerText()).includes('First guide'));
    await go(page, '/settings/import');
    await page.getByRole('button', { name: /Review 2/ }).click();
    await page.waitForSelector('[aria-label="Imported links"]');
    await shoot(page, engine, 'import-triage');
    await axe(page, engine, 'triage dialog');
    await page.getByRole('checkbox', { name: /First guide/ }).check();
    await page.getByRole('button', { name: 'Send to Inbox' }).click();
    await page.keyboard.press('Escape');
    st = await appState(page);
    check(engine, 'Triage: the picked link goes to the Inbox (queued)', st.sources.find(x => x.title === 'First guide')?.status === 'queued');
    await go(page, '/inbox');
    check(engine, 'Triage: it shows on the Inbox board', (await page.locator('main').innerText()).includes('First guide'));

    await go(page, '/settings/import');
    await page.locator('input[data-pick="services"]').setInputFiles({ name: 'raindrop.csv', mimeType: 'text/csv', buffer: Buffer.from(RAINDROP) });
    await waitDone(page, 'raindrop.csv');
    check(engine, 'Raindrop: named by service', (await page.locator('main').innerText()).includes('Raindrop · raindrop.csv'));

    // IMP-12 pause and resume on a big file
    await page.locator('input[data-pick="bookmarks"]').setInputFiles({ name: 'big.html', mimeType: 'text/html', buffer: Buffer.from(BIG) });
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(300);
    const paused = await page.locator('main').innerText();
    const m = paused.match(/Paused · ([\d,]+) of 2,400/);
    check(engine, 'Big import: Pause stops it part-way', !!m && Number(m[1].replace(/,/g, '')) < 2400, m?.[0]);
    check(engine, 'Big import: progress bar while paused', await page.locator('progress').count() >= 1);
    await shoot(page, engine, 'import-paused');
    st = await appState(page);
    const pend = st.imports.find(b => b.name === 'big.html');
    check(engine, 'Big import: what is left is kept for Resume', pend.state === 'paused' && pend.pending.length + pend.done === 2400);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Resume' }).click();
    await waitDone(page, 'big.html', 60000);
    st = await appState(page);
    check(engine, 'Big import: Resume (after a reload) finishes it', st.imports.find(b => b.name === 'big.html')?.added === 2400 && st.sources.filter(x => x.url?.includes('bulk-')).length === 2400);
    await go(page, '/inbox');
    check(engine, 'Big import: the Inbox board is not flooded', !(await page.locator('main').innerText()).includes('Bulk link'));

    // IMP-05 GitHub stars, network stubbed; asks before turning reading on
    const reqs = [];
    await page.route('https://api.github.com/**', route => {
      reqs.push(route.request().url());
      const pg = Number(new URL(route.request().url()).searchParams.get('page'));
      const body = pg === 1 ? Array.from({ length: 100 }, (_, i) => ({ html_url: `https://github.com/stars/r${i}`, full_name: `stars/r${i}`, language: 'TypeScript' }))
        : Array.from({ length: 5 }, (_, i) => ({ html_url: `https://github.com/stars/x${i}`, full_name: `stars/x${i}`, archived: true }));
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    });
    await go(page, '/settings/import');
    await page.getByRole('textbox', { name: 'GitHub stars' }).fill('octocat');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.waitForTimeout(300);
    check(engine, 'Stars: nothing is sent while reading GitHub is off', reqs.length === 0 && /Reading GitHub is off/.test(await page.locator('.toasts').innerText()));
    await page.getByRole('button', { name: 'Turn on and import' }).click();
    await waitDone(page, 'octocat');
    st = await appState(page);
    check(engine, 'Stars: two pages, 105 added, only the username sent', reqs.length === 2 && reqs.every(u => /\/users\/octocat\/starred\?per_page=100&page=[12]$/.test(u)) && st.sources.filter(x => x.url?.startsWith('https://github.com/stars/')).length === 105, reqs.join(' '));
    check(engine, 'Stars: the reading switch is the same one (now on)', st.prefs.readGithub === true);
    await page.unroute('https://api.github.com/**');

    // IMP-08 prompts with a mapping preview
    await page.locator('input[data-pick="prompts"]').setInputFiles({ name: 'prompts.csv', mimeType: 'text/csv', buffer: Buffer.from(PROMPTS_CSV) });
    await page.waitForSelector('dialog[open] [aria-label="Preview"]');
    const sel = await page.locator('dialog[open] select').evaluateAll(els => els.map(e => e.options[e.selectedIndex].text));
    check(engine, 'Prompts: columns guessed (prompt, act, category)', JSON.stringify(sel) === JSON.stringify(['prompt', 'act', 'category']), JSON.stringify(sel));
    await shoot(page, engine, 'import-prompts-mapping');
    await axe(page, engine, 'prompt mapping dialog');
    await page.getByRole('button', { name: 'Import 2 prompts' }).click();
    await waitDone(page, 'prompts.csv');
    st = await appState(page);
    const lt = st.artifacts.find(x => x.title === 'Linux Terminal');
    check(engine, 'Prompts: in the Library with "You added" and the row', lt?.evidence?.method === 'user_supplied' && lt.evidence.locator === 'prompts.csv, row 2' && lt.tags?.[0] === 'dev', JSON.stringify(lt?.evidence));
    check(engine, 'Prompts: a [blank] makes a template', st.artifacts.find(x => x.title === 'Translator')?.type === 'template');
    await page.locator('input[data-pick="prompts"]').setInputFiles({ name: 'prompts.csv', mimeType: 'text/csv', buffer: Buffer.from(PROMPTS_CSV) });
    await page.getByRole('button', { name: 'Import 2 prompts' }).click();
    await page.waitForTimeout(800);
    st = await appState(page);
    check(engine, 'Prompts: importing again adds nothing twice', st.artifacts.filter(x => x.title === 'Linux Terminal').length === 1 && st.imports[0].existing === 2);

    // IMP-10 notes to the Inbox
    await page.locator('input[data-pick="notes"]').setInputFiles([{ name: 'Daily.md', mimeType: 'text/markdown', buffer: Buffer.from(NOTE_A) }, { name: 'Idea.md', mimeType: 'text/markdown', buffer: Buffer.from(NOTE_B) }]);
    await page.waitForSelector('dialog[open]');
    await page.getByRole('button', { name: 'Import 2 notes' }).click();
    await waitDone(page, '2 files');
    st = await appState(page);
    const ns = st.sources.find(x => x.importId && x.status === 'review');
    check(engine, 'Notes: one Inbox source, the find keeps its note and line', ns?.candidates?.length === 1 && ns.candidates[0].evidence.locator === 'Daily.md, line 6' && ns.candidates[0].evidence.method === 'user_supplied', JSON.stringify(ns?.candidates?.[0]?.evidence));
    check(engine, 'Notes: a note with nothing found is counted as skipped', /1 added · 1 skipped/.test(await page.locator('main').innerText()));
    await page.getByRole('link', { name: 'Open' }).first().click();
    await page.waitForURL(/\/inbox\//);
    check(engine, 'Notes: Open goes to the review', (await page.locator('main').innerText()).includes('You added · Daily.md, line 6'));

    // Remove an import, with Undo
    await go(page, '/settings/import');
    await shoot(page, engine, 'import-page');
    const before = (await appState(page)).sources.length;
    await page.getByRole('button', { name: 'Remove big.html' }).click();
    await page.waitForTimeout(400);
    check(engine, 'Remove import: its links go', (await appState(page)).sources.length === before - 2400);
    await page.locator('.toasts').getByRole('button', { name: 'Undo' }).click();
    check(engine, 'Remove import: Undo brings them back', (await appState(page)).sources.length === before);
    await ctx.close();
  }

  /* ---------- 4. Read the text (OCR) on an image kept in the Inbox ---------- */
  if (only === 'all' || only === 'ocr') {
    const { ctx, page } = await newPage(browser, engine);
    await go(page, '/inbox');
    const png = Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1400; c.height = 260;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = '44px Helvetica, Arial, sans-serif';
      g.fillText('Act as a careful editor and rewrite', 40, 100); g.fillText('this paragraph so it reads clearly.', 40, 170);
      return c.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await openCapture(page);
    await page.locator('dialog[open] input[type="file"][accept="image/*"]').setInputFiles({ name: 'prompt-shot.png', mimeType: 'image/png', buffer: png });
    await page.locator('dialog[open] [aria-haspopup="menu"]').first().click();
    await page.getByRole('menuitemradio', { name: 'Inbox' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Keep', exact: true }).click();
    await page.waitForTimeout(400);
    const src = (await appState(page)).sources.find(x => x.image);
    check(engine, 'Image to Inbox: kept with its file', !!src?.image?.key && src.status === 'queued');
    await go(page, `/inbox/${src.id}`);
    await shoot(page, engine, 'image-outcome');
    await page.getByRole('button', { name: 'Read the text' }).click();
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('Reading'), null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(600);
    const after = (await appState(page)).sources.find(x => x.id === src.id);
    const c = after?.candidates?.[0];
    check(engine, 'Read the text: the prompt in the image is found', c?.type === 'prompt' && /careful editor/i.test(c.exact ?? ''), c?.exact ?? after?.nothingReason);
    check(engine, 'Read the text: evidence says it was read from the image, with how sure', !!c?.evidence?.ocr && c.evidence.ocr.confidence > 50, JSON.stringify(c?.evidence?.ocr));
    await go(page, `/inbox/${src.id}`);
    check(engine, 'Read the text: review shows "Read from the image" and the image', /Read from the image · \d+% sure/.test(await page.locator('body').innerText()) && await page.locator('figure img[alt^="Image"]').count() >= 1);
    await shoot(page, engine, 'image-review');

    // backup round trip keeps imports and the Inbox image
    await go(page, '/settings/storage');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Back up everything/ }).click();
    const file = await (await dl).path();
    await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles(file);
    await page.getByRole('button', { name: 'Replace everything' }).click();
    await page.waitForTimeout(600);
    const restored = (await appState(page)).sources.find(x => x.id === src.id);
    const blob = await page.evaluate(k => new Promise(res => { const r = indexedDB.open('capsa-web'); r.onsuccess = () => { const g = r.result.transaction('blobs').objectStore('blobs').get(k); g.onsuccess = () => res(!!g.result); }; }), src.image.key);
    check(engine, 'Backup: the image source and its file round-trip', !!restored?.image && restored.candidates?.length === 1 && blob);
    await ctx.close();
  }

  /* ---------- 5. Screens at 1440 and 390, light and dark: layout and axe ---------- */
  if (only === 'all' || only === 'shots') {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const { ctx, page } = await newPage(browser, engine, { width, theme });
      const tag = `${theme}-${width}`;
      await go(page, '/settings/import');
      await page.locator('input[data-pick="bookmarks"]').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(SMALL) });
      await waitDone(page, 'bookmarks.html');
      await noHScroll(page, engine, `/settings/import ${tag}`); await axe(page, engine, `/settings/import ${tag}`); await shoot(page, engine, `settings-import-${tag}`);
      await page.locator('input[data-pick="prompts"]').setInputFiles({ name: 'prompts.csv', mimeType: 'text/csv', buffer: Buffer.from(PROMPTS_CSV) });
      await page.waitForSelector('dialog[open] [aria-label="Preview"]');
      await shoot(page, engine, `import-mapping-${tag}`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /Review 2/ }).click();
      await page.waitForSelector('[aria-label="Imported links"]');
      await noHScroll(page, engine, `triage ${tag}`); await shoot(page, engine, `import-triage-${tag}`);
      await page.keyboard.press('Escape');
      await go(page, '/settings/capture');
      await noHScroll(page, engine, `/settings/capture ${tag}`); await axe(page, engine, `/settings/capture ${tag}`); await shoot(page, engine, `settings-capture-${tag}`);
      await go(page, '/capture?url=' + encodeURIComponent('https://save-address.example/a-long-article-title-that-goes-on') + '&title=' + encodeURIComponent('A long article title that goes on for a while'));
      await noHScroll(page, engine, `/capture ${tag}`); await axe(page, engine, `/capture ${tag}`); await shoot(page, engine, `capture-page-${tag}`);
      await page.getByRole('button', { name: 'Keep' }).click();
      await page.waitForSelector('#cap-done');
      await shoot(page, engine, `capture-page-done-${tag}`);
      await go(page, '/inbox');
      await openCapture(page);
      await page.locator('input[data-doc-input]').setInputFiles({ name: 'handbook.pdf', mimeType: 'application/pdf', buffer: PDF });
      await page.waitForSelector('[aria-label="File: handbook.pdf"]');
      await axe(page, engine, `capture file ${tag}`); await shoot(page, engine, `capture-file-${tag}`);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await openCapture(page);
      await pasteInto(page, '#cap-value', 'https://bulk-paste.example/one\nhttps://demo-essays.example/calm\nnot a link');
      await page.waitForSelector('[aria-label="Links to keep"]');
      await axe(page, engine, `capture bulk ${tag}`); await shoot(page, engine, `capture-bulk-${tag}`);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await openCapture(page);
      await page.locator('#cap-value').fill('https://demo-essays.example/calm');
      await page.waitForSelector('[data-dupe]');
      await shoot(page, engine, `capture-duplicate-${tag}`);
      await ctx.close();
    }
  }
  await browser.close();
}

const passed = results.checks.filter(c => c.ok).length;
console.log(`\n${passed}/${results.checks.length} checks passed · ${results.errors.length} console errors`);
for (const e of results.errors.slice(0, 12)) console.log('  console:', e.engine, e.url, e.text);
fs.writeFileSync(OUT + 'results.json', JSON.stringify(results, null, 2));
process.exit(passed === results.checks.length && !results.errors.length ? 0 : 1);
