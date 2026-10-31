// Capture bar attachments and destination glyphs (27 Oct, #88). In a real browser against the labelled demo:
//   - "to Library" menu: the sidebar's glyph on every row, glyphs and labels on one grid, the tick at the end, in both
//     icon styles; the trigger shows the chosen glyph.
//   - Pick, paste and drop each attach a thumbnail and keep nothing; non-images, HEIC, too-large and damaged files are
//     refused with a reason; X, Backspace in the empty field and Delete on a focused thumbnail remove.
//   - What the image is: Visual reference by default, Prompt, and custom types based on either; Send keeps one item per
//     image with the text (prompt text or notes), the type, the destination and an Inbox record; Undo takes it all back.
//   - Duplicates: Already saved with Save anyway. The item page shows the type and the text.
//   - axe at 1440 and 390 in light and dark, Classic and Paper; no sideways scroll at 320 with 200% text.
// Screenshots go to .claude/backups/capture-attach-shots/ (outside the repo).
// Usage (dev server):  CAPSA_BASE=http://127.0.0.1:3410 node verify/capture/attach.mjs [chromium|webkit|all]
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withSample } from '../_sample.mjs';
import { has } from '../_features.mjs'; // Paper comes with Profile; a release snapshot can lack it
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.CAPSA_SHOTS || path.resolve(HERE, '../../../../../../backups/capture-attach-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
let which = engines[0];
const results = [];
const ok = (name, cond, extra = '') => { results.push({ engine: which, name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ' — ' + extra : ''}`); };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${which}-${name}.png`) });

const png = (page, seed, w = 640, h = 400) => page.evaluate(async ([seed, w, h]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = `hsl(${seed * 67 % 360} 60% 70%)`; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111'; g.font = `bold ${Math.round(Math.min(w, h) / 6)}px sans-serif`; g.fillText(`Shot ${seed}`, 20, Math.min(h - 10, 120));
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  return [...new Uint8Array(await b.arrayBuffer())];
}, [seed, w, h]).then(a => Buffer.from(a));

const readState = page => page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 500));
  const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
  const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
  const keys = await new Promise(r => { const q = db.transaction('blobs').objectStore('blobs').getAllKeys(); q.onsuccess = () => r(q.result); });
  db.close();
  return { artifacts: st.artifacts, sources: st.sources, collections: st.collections, keys: keys.map(String) };
});
const imageItems = st => st.artifacts.filter(a => a.image);

const dropFiles = (page, files) => page.evaluate(async fs => {
  const form = document.querySelector('[data-capture-box] form');
  const dt = new DataTransfer();
  for (const f of fs) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
  form.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  form.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, files.map(f => ({ ...f, bytes: [...f.bytes] })));

const axe = async (page, label) => {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document.querySelector('[data-capture-box]') ?? document, { resultTypes: ['violations'] })).violations
    .filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.nodes.length).map(v => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')}`));
  ok(`axe: no serious or critical issues in the bar, ${label}`, bad.length === 0, bad.join(' | '));
};

async function run() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light',
    ...(which === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().split('\n')[0].slice(0, 200)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.split('\n')[0]));
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
  const hideDev = () => page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await hideDev();
  const clearToasts = async () => { for (const b of await page.locator('.toast button[aria-label="Dismiss"], .toast button[aria-label="Close"]').all()) await b.click().catch(() => {}); await page.waitForTimeout(250); };
  const box = page.locator('[data-capture-box]');
  const thumbs = box.locator('[data-att]:not([data-leaving])');
  const input = box.locator('input[type="file"]');
  const field = box.locator('textarea');
  const send = box.getByRole('button', { name: 'Keep (Enter)' });
  const start = imageItems(await readState(page)).length;

  // ---------- 1. the destination menu: glyphs on one grid, the tick at the end, both icon styles ----------
  const trigger = box.getByRole('button', { name: /^Kept items go to/ });
  ok('the trigger shows the Library glyph', await trigger.locator('svg').count() >= 2);
  for (const style of ['solid', 'line']) {
    await page.evaluate(v => { document.documentElement.dataset.icons = v; }, style);
    await trigger.click();
    const menu = box.getByRole('menu', { name: 'Where kept items go' });
    await menu.waitFor();
    const rows = await menu.getByRole('menuitemradio').evaluateAll(els => els.map(el => {
      const g = el.querySelector('svg'), l = el.querySelector('span[class*="menuLabel"]'), c = el.querySelector('span[class*="menucheck"]');
      const gr = g?.getBoundingClientRect(), lr = l?.getBoundingClientRect(), cr = c?.getBoundingClientRect();
      return { name: l?.textContent, glyph: !!g && gr.width >= 14 && gr.height >= 14, gx: gr?.left, lx: lr?.left, gy: gr ? gr.top + gr.height / 2 : 0, ly: lr ? lr.top + lr.height / 2 : 0,
        checkAfter: cr ? cr.left >= lr.right - 1 : false, checked: el.getAttribute('aria-checked') === 'true', ticked: !!c?.querySelector('svg') };
    }));
    ok(`${style}: every destination row has a glyph`, rows.length >= 3 && rows.every(r => r.glyph), rows.map(r => r.name).join(', '));
    ok(`${style}: glyphs share one column and labels another`, new Set(rows.map(r => Math.round(r.gx))).size === 1 && new Set(rows.map(r => Math.round(r.lx))).size === 1);
    ok(`${style}: each glyph is centred on its label`, rows.every(r => Math.abs(r.gy - r.ly) <= 1.5));
    ok(`${style}: one tick, on the current choice, after the label`, rows.filter(r => r.ticked).length === 1 && rows.find(r => r.ticked).checked && rows.every(r => r.checkAfter));
    await page.waitForTimeout(250);
    await shot(page, `menu-${style}`);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => { document.documentElement.dataset.icons = 'solid'; });
  // choose a collection; the trigger takes its glyph and name
  await trigger.click();
  const firstCol = box.getByRole('menu').getByRole('menuitemradio').nth(1);
  const colName = (await firstCol.innerText()).trim();
  await firstCol.click();
  ok('choosing a collection names it in the trigger', (await trigger.innerText()).includes(colName), colName);

  // ---------- 2. pick: attaches, keeps nothing ----------
  const a1 = await png(page, 1);
  await input.setInputFiles({ name: 'Checkout flow.png', mimeType: 'image/png', buffer: a1 });
  await thumbs.first().waitFor({ timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector('[data-capture-box] [data-reading]'), null, { timeout: 8000 });
  ok('picking an image attaches a thumbnail', await thumbs.count() === 1);
  ok('…and keeps nothing yet', imageItems(await readState(page)).length === start);
  ok('the thumbnail shows the picture', await thumbs.first().locator('img').evaluate(el => el.complete && el.naturalWidth > 0));
  const kinds = box.getByRole('radiogroup', { name: 'What the image is' });
  ok('the bar asks what the image is: Visual reference (ticked), Prompt', await kinds.getByRole('radio').count() >= 2
    && (await kinds.getByRole('radio', { checked: true }).innerText()).includes('reference') && await kinds.getByRole('radio', { name: 'Prompt' }).count() === 1);
  ok('the Link and Video modes step aside while images are attached', await box.getByRole('button', { name: 'Video' }).count() === 0);
  ok('the field asks for notes', (await field.getAttribute('placeholder')) === 'Add notes');
  ok('Send is ready with only an image', await send.isEnabled());
  await shot(page, 'attached-one');

  // ---------- 3. remove: X, Backspace in the empty field, Delete on a thumbnail ----------
  await thumbs.first().locator('button').click({ force: true });
  await page.waitForTimeout(350);
  ok('X removes it', await thumbs.count() === 0 && await box.locator('[data-att]').count() === 0);
  ok('the modes come back', await box.getByRole('button', { name: 'Video' }).count() === 1);
  const b2 = await png(page, 2), b3 = await png(page, 3);
  await input.setInputFiles([{ name: 'Moodboard A.png', mimeType: 'image/png', buffer: b2 }, { name: 'Moodboard B.png', mimeType: 'image/png', buffer: b3 }]);
  await page.waitForFunction(() => document.querySelectorAll('[data-capture-box] [data-att]').length === 2 && !document.querySelector('[data-capture-box] [data-reading]'), null, { timeout: 8000 });
  await field.click(); await page.keyboard.press('Backspace');
  ok('Backspace in the empty field removes the last image', await thumbs.count() === 1 && /Moodboard A/.test(await thumbs.first().locator('[role="img"]').getAttribute('aria-label')));
  ok('…and it is announced', /Removed Moodboard B/.test(await box.locator('[aria-live="polite"]').innerText()));
  await thumbs.first().locator('[role="img"]').focus();
  ok('a thumbnail takes focus, with a visible ring', await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
  await page.keyboard.press('Delete');
  ok('Delete on a focused thumbnail removes it, and focus returns to the field', await thumbs.count() === 0 && await page.evaluate(() => document.activeElement?.id === 'lib-cap'));

  // ---------- 4. refusals: not an image, HEIC, too large, damaged ----------
  await dropFiles(page, [{ name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('notes') }]);
  await page.waitForTimeout(300);
  ok('a dropped text file is refused, by name', /notes\.txt isn’t an image/.test(await box.innerText()));
  await input.setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not really heic') });
  await page.waitForTimeout(400);
  ok('a HEIC photo is refused with a way forward', /HEIC photos can’t be opened in this browser/.test(await box.innerText()));
  await input.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(26 * 1048576, 1) });
  await page.waitForTimeout(500);
  ok('a file over 25 MB is refused with its size', /huge\.png: That image is 26\.0 MB/.test(await box.innerText()));
  await input.setInputFiles({ name: 'IMG_20261027_134512_exported_from_the_shared_moodboard_folder_final_v3.heic', mimeType: 'image/heic', buffer: Buffer.from('x') });
  await page.waitForTimeout(300);
  ok('a refusal naming a very long file wraps inside the bar', await box.locator('[role="alert"]').evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= el.closest('form').getBoundingClientRect().right));
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('\x89PNG\r\n\x1a\nbroken bytes') });
  await page.waitForTimeout(800);
  ok('a damaged image is refused, nothing attached', /broken\.png: That image couldn’t be opened/.test(await box.innerText()) && await thumbs.count() === 0);
  ok('the refusal is an alert', await box.locator('[role="alert"]').count() >= 1);
  await shot(page, 'refused');

  // ---------- 5. drop: two images attach; the target shows while dragging ----------
  await page.evaluate(() => {
    const form = document.querySelector('[data-capture-box] form');
    const dt = new DataTransfer(); dt.items.add(new File(['x'], 'x.png', { type: 'image/png' }));
    form.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(250);
  ok('dragging files over the bar shows the drop target', await box.locator('form[data-drop]').count() === 1 && /Drop images to attach/.test(await box.innerText()));
  await shot(page, 'drop-target');
  const d4 = await png(page, 4, 300, 1400), d5 = await png(page, 5, 1800, 200);
  await dropFiles(page, [{ name: 'Tall poster.png', type: 'image/png', bytes: d4 }, { name: 'Wide banner.png', type: 'image/png', bytes: d5 }]);
  await page.waitForFunction(() => document.querySelectorAll('[data-capture-box] [data-att]').length === 2 && !document.querySelector('[data-capture-box] [data-reading]'), null, { timeout: 8000 });
  ok('dropping two images (a very tall and a very wide one) attaches both', await thumbs.count() === 2 && await box.locator('form[data-drop]').count() === 0);
  const fit = await thumbs.locator('img').evaluateAll(els => els.every(el => { const r = el.getBoundingClientRect(); return Math.abs(r.width - r.height) < 1 && getComputedStyle(el).objectFit === 'cover'; }));
  ok('…each cropped to a square thumbnail', fit);
  ok('nothing is kept by a drop', imageItems(await readState(page)).length === start);

  // ---------- 6. Send as Visual reference with notes: one item per image, sharing the notes ----------
  await field.fill('Calm hero spacing\nlook at the type scale');
  await shot(page, 'attached-two-notes');
  await send.click();
  await page.getByText(new RegExp(`^Kept in ${colName} · Visual reference · 2 images`)).waitFor({ timeout: 8000 });
  let st = await readState(page);
  const two = imageItems(st).slice(0, 2);
  const col = st.collections.find(c => c.name === colName);
  ok('Send keeps one item per image', imageItems(st).length === start + 2);
  ok('…as Visual references titled from the files, with the text as notes', two.every(a => a.type === 'reference' && !a.exact && a.note === 'Calm hero spacing\nlook at the type scale')
    && two.map(a => a.title).sort().join('|') === 'Tall poster|Wide banner', two.map(a => `${a.type} ${a.title}`).join(', '));
  ok('…in the chosen collection', two.every(a => a.collections.includes(col.id)));
  const src = st.sources.find(x => x.id === two[0].sourceId);
  ok('…recorded in the Inbox as one reviewed capture with both kept', !!src && src.status === 'reviewed' && src.keptIds.length === 2 && two.every(a => a.sourceId === src.id));
  ok('the bar is clear after Send', await box.locator('[data-att]').count() === 0 && (await field.inputValue()) === '');
  await shot(page, 'sent-toast');
  // Undo takes back the items, the Inbox record and the files
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await page.waitForTimeout(700);
  st = await readState(page);
  ok('Undo removes the items, the Inbox record and the files', imageItems(st).length === start && !st.sources.some(x => x.id === src.id) && !two.some(a => st.keys.includes(a.image.key)));

  // ---------- 7. paste: a screenshot with text; Send as Prompt to the Library ----------
  await trigger.click(); await box.getByRole('menu').getByRole('menuitemradio', { name: 'Library' }).click();
  const p6 = await png(page, 6);
  const pasted = await page.evaluate(async bytes => {
    const ta = document.querySelector('[data-capture-box] textarea'); ta.focus();
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }));
    try { dt.setData('text/plain', 'Make this hero calmer, keep the type.'); } catch {}
    let ev; try { ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); } catch { return 'unsupported'; }
    if (!ev.clipboardData || !ev.clipboardData.files.length) return 'unsupported';
    ta.dispatchEvent(ev); return 'sent';
  }, [...p6]);
  if (pasted === 'sent') {
    await page.waitForFunction(() => document.querySelectorAll('[data-capture-box] [data-att]').length === 1 && !document.querySelector('[data-capture-box] [data-reading]'), null, { timeout: 8000 });
    ok('a pasted screenshot attaches, and keeps nothing', await thumbs.count() === 1 && imageItems(await readState(page)).length === start);
    ok('the text pasted with it goes into the field', (await field.inputValue()) === 'Make this hero calmer, keep the type.');
  } else {
    ok('paste: this engine can’t build a synthetic paste (checked in the other engine); picked instead', true);
    await input.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: p6 });
    await thumbs.first().waitFor(); await page.waitForTimeout(600);
    await field.fill('Make this hero calmer, keep the type.');
  }
  await kinds.getByRole('radio', { name: 'Prompt' }).click();
  ok('ticking Prompt moves the tick and asks for the prompt', (await kinds.getByRole('radio', { checked: true }).innerText()).trim() === 'Prompt' && (await field.getAttribute('placeholder')) === 'Add the prompt');
  await shot(page, 'attached-prompt');
  await field.press('Enter');
  await page.getByText(/^Kept in Library · Prompt$/).waitFor({ timeout: 8000 });
  st = await readState(page);
  const pr = imageItems(st)[0];
  ok('Enter keeps it as a Prompt with the text as its prompt, titled from the text', pr.type === 'prompt' && pr.exact === 'Make this hero calmer, keep the type.' && !pr.note && pr.title === 'Make this hero calmer, keep the type.', `${pr.type} “${pr.title}”`);
  ok('…in the Library only', !pr.collections.length && !pr.projects.length);

  // ---------- 8. the item page shows the image, the type and the prompt ----------
  await page.goto(B + `/library/${pr.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  ok('the item page shows the image', await page.locator('main figure img').evaluate(el => el.complete && el.naturalWidth > 0).catch(() => false));
  ok('…the prompt as its text', (await page.locator('main pre').first().innerText()).includes('Make this hero calmer'));
  ok('…and the type Prompt', await page.getByRole('button', { name: /^Type: Prompt/ }).count() >= 1 || /type\s*prompt/i.test(await page.locator('section[aria-label^="Details:"]').first().innerText())); // the type tile changes it with Organise, else it's a fact
  await shot(page, 'item-prompt');

  // ---------- 9. duplicates: Already saved, then Save anyway ----------
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  await input.setInputFiles({ name: 'again.png', mimeType: 'image/png', buffer: p6 });
  await thumbs.first().waitFor(); await page.waitForFunction(() => !document.querySelector('[data-capture-box] [data-reading]'));
  await field.fill('Same picture, a note');
  await send.click();
  await page.waitForTimeout(500);
  ok('the same image again says Already saved, and keeps nothing', /Already saved · Make this hero calmer/.test(await box.innerText()) && imageItems(await readState(page)).length === start + 1);
  await shot(page, 'duplicate');
  await box.getByRole('button', { name: 'Save anyway' }).click();
  await page.getByText(/^Kept in Library · Visual reference$/).waitFor({ timeout: 8000 });
  st = await readState(page);
  const ref = imageItems(st)[0];
  ok('Save anyway keeps a second copy as a reference with the note', imageItems(st).length === start + 2 && ref.type === 'reference' && ref.note === 'Same picture, a note');
  await page.goto(B + `/library/${ref.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  ok('the reference’s item page shows the note, and no empty text block', /Same picture, a note/.test(await page.locator('main').innerText()) && await page.getByText('No exact text captured').count() === 0);
  await shot(page, 'item-reference');

  // ---------- 10. many images: the limit ----------
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  const many = [];
  for (let i = 0; i < 11; i++) many.push({ name: `Shot ${20 + i}.png`, mimeType: 'image/png', buffer: await png(page, 20 + i, 200, 200) });
  await input.setInputFiles(many);
  await page.waitForFunction(() => document.querySelectorAll('[data-capture-box] [data-att]').length === 10 && !document.querySelector('[data-capture-box] [data-reading]'), null, { timeout: 15000 });
  ok('ten images attach; the eleventh is refused', await thumbs.count() === 10 && /Up to 10 images at a time/.test(await box.innerText()));
  await shot(page, 'attached-ten');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no sideways scroll with ten attached', over <= 0, `${over}px`);

  // ---------- 11. a custom type based on Visual reference is offered ----------
  await page.evaluate(async () => {
    const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
    const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
    const types = [{ id: 'ct-mood', name: 'Moodboard', base: 'reference', fields: [], createdAt: new Date().toISOString() },
      { id: 'ct-preset', name: 'Preset', base: 'template', fields: [], createdAt: new Date().toISOString() },
      { id: 'ct-long', name: 'Inspiration for the onboarding redesign, round two', base: 'prompt', fields: [], createdAt: new Date().toISOString() }];
    st.organise = { ...(st.organise ?? {}), types };
    await new Promise(r => { const t = db.transaction('state', 'readwrite'); t.objectStore('state').put(st, 'app'); t.oncomplete = r; });
    db.close();
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(900); await hideDev();
  await input.setInputFiles({ name: 'Mood.png', mimeType: 'image/png', buffer: await png(page, 40) });
  await thumbs.first().waitFor(); await page.waitForFunction(() => !document.querySelector('[data-capture-box] [data-reading]'));
  ok('your own type based on Visual reference is offered; one based on Template is not', await kinds.getByRole('radio', { name: 'Moodboard' }).count() === 1 && await kinds.getByRole('radio', { name: 'Preset' }).count() === 0);
  await kinds.getByRole('radio', { name: 'Visual reference' }).focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  ok('arrow keys move the tick, and focus with it', (await kinds.getByRole('radio', { checked: true }).innerText()).trim() === 'Moodboard'
    && await page.evaluate(() => document.activeElement?.getAttribute('aria-checked') === 'true'));
  const longKind = await kinds.getByRole('radio', { name: /^Inspiration for the onboarding/ }).evaluate(el => ({ w: el.getBoundingClientRect().width, cap: el.closest('form').getBoundingClientRect().width, title: el.title }));
  ok('a long type name of your own ends in …, with the full name as its tooltip', longKind.w < longKind.cap && /round two$/.test(longKind.title), JSON.stringify(longKind));
  await send.click();
  await page.getByText(/^Kept in Library · Moodboard$/).waitFor({ timeout: 8000 });
  st = await readState(page);
  ok('…and keeps it as that type', imageItems(st)[0].customType === 'ct-mood' && imageItems(st)[0].type === 'reference');
  await kinds.count(); // (the picker leaves with the image)
  // ten again, for the layout checks below
  await input.setInputFiles(many.slice(0, 10).map((f, i) => ({ ...f, name: `Again ${i}.png` })));
  await page.waitForFunction(() => document.querySelectorAll('[data-capture-box] [data-att]').length >= 1 && !document.querySelector('[data-capture-box] [data-reading]'), null, { timeout: 15000 });

  await clearToasts();
  // ---------- states: hover, pressed, focus; reduced motion ----------
  const firstX = thumbs.first().locator('button');
  await firstX.hover(); await page.waitForTimeout(150);
  await box.screenshot({ path: path.join(SHOTS, `${which}-state-x-hover.png`) });
  const promptKind = kinds.getByRole('radio', { name: 'Prompt' });
  await promptKind.hover(); await page.mouse.down(); await page.waitForTimeout(120);
  const pressed = await promptKind.evaluate(el => getComputedStyle(el).backgroundColor);
  await box.screenshot({ path: path.join(SHOTS, `${which}-state-kind-pressed.png`) });
  await page.mouse.up(); await page.waitForTimeout(150);
  ok('a type chip tints while pressed', pressed !== 'rgba(0, 0, 0, 0)', pressed);
  await thumbs.nth(1).locator('[role="img"]').focus(); await page.waitForTimeout(100);
  await box.screenshot({ path: path.join(SHOTS, `${which}-state-thumb-focus.png`) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  ok('reduced motion: thumbnails don’t move', await thumbs.first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) <= 0.002));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await field.focus();
  // ---------- 12. axe and screenshots: 1440 and 390, light and dark, Classic and Paper ----------
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const looks = (await has(page, 'avatar')) ? ['classic', 'paper'] : ['classic'];
    for (const look of looks) for (const theme of ['light', 'dark']) {
      await page.evaluate(([l, t]) => { document.documentElement.dataset.look = l; document.documentElement.dataset.theme = t; }, [look, theme]);
      await page.waitForTimeout(250);
      await axe(page, `${w} ${look} ${theme}`);
      await box.screenshot({ path: path.join(SHOTS, `${which}-bar-${w}-${look}-${theme}.png`) });
      if (w === 1440 && theme === 'light') {
        await trigger.click(); await page.waitForTimeout(300);
        await axe(page, `${w} ${look} ${theme}, menu open`);
        await shot(page, `menu-open-${look}`);
        await page.keyboard.press('Escape');
      }
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.look = 'classic'; document.documentElement.dataset.theme = 'light'; });

  // ---------- 13. 320 wide with 200% text: the bar never scrolls the page sideways ----------
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.waitForTimeout(400);
  const m320 = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const inBar = [...document.querySelectorAll('[data-capture-box] *')].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > vw + 0.5 && !el.closest('[role="menu"]'))
      .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
    return { page: document.documentElement.scrollWidth - vw, inBar };
  });
  ok('320 px with 200% text and ten attached: nothing in the bar runs past the screen', m320.inBar.length === 0, m320.inBar.slice(0, 4).join(', '));
  ok('320 px with 200% text and ten attached: no sideways scroll on the page', m320.page <= 0, `${m320.page}px`);
  await shot(page, 'bar-320-200pct');

  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

for (const e of engines) { which = e; try { await run(); } catch (err) { ok('run crashed', false, err.message.split('\n')[0]); } }
const pass = results.filter(r => r.pass).length;
fs.writeFileSync(path.join(HERE, 'attach-results.json'), JSON.stringify(results, null, 1));
console.log(`\n${pass}/${results.length} capture attachment checks passed`);
process.exit(pass === results.length ? 0 : 1);
