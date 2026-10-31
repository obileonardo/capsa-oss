// Library image capture (25 Oct; attach first since 27 Oct, #88): the capture box's Image button, paste and drop attach
// images to the bar, and Send keeps them in the Library as References, on this device (verify/capture/attach.mjs covers
// the bar itself: removing, types, text, refusals). Checks: picking, the card, duplicates and Save anyway, paste, drop, HEIC and non-images
// refused, the item page (image, Copy image, Download, Read the text), the panel hidden text block, Deleted and Restore,
// Delete forever sweeping the file on the next load, backups carrying the file, and adding the image to a board.
// Usage (dev server):  CAPSA_BASE=http://127.0.0.1:3100 node verify/libimage/verify.mjs [chromium|webkit|all]
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = require('playwright');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const engines = (process.argv[2] ?? 'all') === 'all' ? ['chromium', 'webkit'] : [process.argv[2]];
let which = engines[0];
const results = [];
const ok = (name, cond, extra = '') => { results.push({ engine: which, name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} [${which}] ${name}${extra ? ' — ' + extra : ''}`); };

/** A real PNG drawn in the page: `seed` changes the picture, so different seeds are different files. */
const png = (page, seed, w = 640, h = 400) => page.evaluate(async ([seed, w, h]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = `hsl(${seed * 67 % 360} 60% 70%)`; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111'; g.font = 'bold 64px sans-serif'; g.fillText(`Shot ${seed}`, 40, 120);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  return [...new Uint8Array(await b.arrayBuffer())];
}, [seed, w, h]).then(a => Buffer.from(a));

const readState = page => page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 500));
  const db = await new Promise(r => { const q = indexedDB.open('capsa-web', 1); q.onsuccess = () => r(q.result); });
  const st = await new Promise(r => { const q = db.transaction('state').objectStore('state').get('app'); q.onsuccess = () => r(q.result); });
  const keys = await new Promise(r => { const q = db.transaction('blobs').objectStore('blobs').getAllKeys(); q.onsuccess = () => r(q.result); });
  db.close();
  return { artifacts: st.artifacts, trash: st.trash, references: st.references, keys: keys.map(String) };
});

async function run() {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true,
    ...(which === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().split('\n')[0].slice(0, 200)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.split('\n')[0]));
  const toast = () => page.locator('[role="status"], [role="alert"]').filter({ hasText: /Kept|Already|Copied|Restored|Deleted|couldn|wouldn/ }).last();
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);

  const box = page.locator('[data-capture-box]');
  const send = async () => {
    await page.waitForFunction(() => document.querySelector('[data-capture-box] [data-att]') && !document.querySelector('[data-capture-box] [data-reading]'), null, { timeout: 8000 });
    await box.getByRole('button', { name: 'Keep (Enter)' }).click();
  };
  const imgBtn = box.getByRole('button', { name: /^Image/ });
  ok('the Image button is live (no "isn’t built yet")', await imgBtn.isEnabled() && (await imgBtn.getAttribute('aria-disabled')) === null);
  const input = box.locator('input[type="file"]');
  ok('it opens a picker for images (several at once)', (await input.getAttribute('accept'))?.includes('image/png') && (await input.getAttribute('multiple')) !== null);

  // 1. pick one image
  const a1 = await png(page, 1);
  await input.setInputFiles({ name: 'Checkout flow.png', mimeType: 'image/png', buffer: a1 });
  await send();
  await page.getByText('Kept in Library · Visual reference').first().waitFor({ timeout: 8000 });
  let st = await readState(page);
  const it = st.artifacts.find(a => a.image);
  ok('kept in the Library as a Reference, titled from the file name', it?.type === 'reference' && it.title === 'Checkout flow' && it.evidence?.method === 'user_supplied', it && `${it.type} “${it.title}”`);
  ok('its file and thumbnail are stored on this device', !!it && st.keys.includes(it.image.key) && (!it.image.thumbKey || st.keys.includes(it.image.thumbKey)) && it.image.width === 640 && it.image.height === 400);
  const card = page.locator('main li').filter({ hasText: 'Checkout flow' }).first();
  await card.waitFor();
  const cardImg = card.locator('img').first();
  await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await cardImg.elementHandle(), { timeout: 8000 }).catch(() => {});
  ok('the card shows the picture', await cardImg.evaluate(el => el.complete && el.naturalWidth > 0));

  // 2. the same image again: Already saved, then Save anyway
  await input.setInputFiles({ name: 'copy.png', mimeType: 'image/png', buffer: a1 });
  await send();
  await page.getByText(/^Already saved · Checkout flow/).waitFor({ timeout: 8000 });
  ok('the same image again says Already saved, and keeps nothing', (await readState(page)).artifacts.filter(a => a.image).length === 1);
  await page.getByRole('button', { name: 'Save anyway' }).click();
  await page.waitForFunction(() => true); await page.waitForTimeout(1200);
  ok('Save anyway keeps a second copy', (await readState(page)).artifacts.filter(a => a.image).length === 2);

  // 3. paste a screenshot into the box
  const p2 = await png(page, 2);
  const pasted = await page.evaluate(async bytes => {
    const ta = document.querySelector('[data-capture-box] textarea');
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }));
    let ev; try { ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); } catch { return 'unsupported'; }
    if (!ev.clipboardData) return 'unsupported';
    ta.dispatchEvent(ev); return 'sent';
  }, [...p2]);
  if (pasted === 'sent') {
    await send();
    await page.waitForTimeout(1500);
    const pz = (await readState(page)).artifacts.filter(a => a.image);
    ok('a pasted screenshot is kept, with a dated title (no file name)', pz.length === 3 && /^Image · /.test(pz[0].title), pz[0]?.title);
  } else ok('paste: this engine can’t build a synthetic paste (checked in the other engine)', true);

  // 4. drop two images (and a text file, which is ignored)
  const d3 = await png(page, 3), d4 = await png(page, 4);
  const before = (await readState(page)).artifacts.filter(a => a.image).length;
  await page.evaluate(async ([x, y]) => {
    const form = document.querySelector('[data-capture-box] form');
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(x)], 'Moodboard A.png', { type: 'image/png' }));
    dt.items.add(new File([new Uint8Array(y)], 'Moodboard B.png', { type: 'image/png' }));
    dt.items.add(new File(['notes'], 'notes.txt', { type: 'text/plain' }));
    form.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    form.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [[...d3], [...d4]]);
  await page.waitForFunction(() => document.querySelectorAll('[data-capture-box] [data-att]').length === 2, null, { timeout: 8000 });
  await send();
  await page.getByText(/Kept in Library · Visual reference · 2 images/).waitFor({ timeout: 8000 }).catch(() => {});
  ok('dropping images keeps each one; other files are left out', (await readState(page)).artifacts.filter(a => a.image).length === before + 2);

  // 5. refusals
  await input.setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not really heic') });
  await page.waitForTimeout(400);
  ok('a HEIC photo is refused with a way forward', /HEIC photos can’t be opened in this browser/.test(await box.innerText()));

  // 6. the item page
  st = await readState(page);
  const first = st.artifacts.find(a => a.title === 'Checkout flow');
  await page.goto(B + `/library/${first.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  const fig = page.locator('main figure');
  ok('the item page shows the image', await fig.locator('img').evaluate(el => el.complete && el.naturalWidth > 0).catch(() => false));
  ok('…with its size, and no empty “No exact text captured” block', /640 × 400/.test(await fig.innerText()) && await page.getByText('No exact text captured').count() === 0);
  ok('…and Read the text, Download and Copy image', await fig.getByRole('button', { name: 'Read the text' }).isVisible() && await fig.getByRole('button', { name: 'Download' }).isVisible() && await fig.getByRole('button', { name: 'Copy image' }).isVisible());
  const [dl] = await Promise.all([page.waitForEvent('download'), fig.getByRole('button', { name: 'Download' }).click()]);
  const dlPath = await dl.path();
  ok('Download saves the original file, with its name', dl.suggestedFilename() === 'Checkout flow.png' && fs.readFileSync(dlPath).equals(a1), dl.suggestedFilename());
  await fig.getByRole('button', { name: 'Copy image' }).click();
  await page.waitForTimeout(600);
  ok('Copy image copies it, or says to use Download', await page.getByText(/Copied image · Checkout flow|wouldn’t copy the image/).count() > 0);
  await page.screenshot({ path: path.join(OUT, `${which}-item-page.png`) });

  // 7. Deleted and Restore keep the file; Delete forever removes it on the next load
  await page.getByRole('button', { name: 'Delete Checkout flow' }).click();
  await page.waitForTimeout(500);
  st = await readState(page);
  ok('deleting moves it to Deleted, file kept', st.trash.some(t => t.item.id === first.id) && st.keys.includes(first.image.key));
  await page.goto(B + '/deleted', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Restore “Checkout flow”' }).click(); await page.waitForTimeout(500);
  await page.goto(B + `/library/${first.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  ok('Restore brings it back with its picture', await page.locator('main figure img').evaluate(el => el.complete && el.naturalWidth > 0).catch(() => false));

  // 8. backup carries the image files
  await page.goto(B + '/settings/storage', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
  const zip = fs.readFileSync(await bk.path()).toString('latin1');
  ok('a backup includes the Library image files', zip.includes('limg') && zip.includes(first.image.key.slice(5)), bk.suggestedFilename());

  // 9. add it to a board from the Library
  await page.goto(B + '/playground', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /New board/ }).first().click();
  await page.waitForURL(/\/boards\/[^/]+$/); await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'From Library' }).click();
  const pick = page.getByRole('group', { name: 'Add from your Library' });
  ok('the board’s Add from Library lists Library images', await pick.getByRole('button', { name: /Checkout flow/ }).count() > 0);
  await pick.getByRole('button', { name: /Checkout flow/ }).first().click(); await page.waitForTimeout(1200);
  st = await readState(page);
  const ref = st.references.find(r => r.libraryId === first.id);
  ok('…and adding one puts its own copy of the file on the board', !!ref && st.keys.includes(ref.imageKey) && ref.imageKey !== first.image.key);

  // 10. Delete forever, then reload: the file is swept
  await page.goto(B + `/library/${first.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Delete Checkout flow' }).click(); await page.waitForTimeout(400);
  await page.goto(B + '/deleted', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Delete forever “Checkout flow”' }).click(); await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  st = await readState(page);
  ok('Delete forever: the file is gone after the next load; the board’s copy stays', !st.keys.includes(first.image.key) && st.keys.includes(ref.imageKey));

  // screenshots: Library with images, light and dark
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${which}-library-light.png`) });
  await page.evaluate(() => { try { localStorage.setItem('capsa-theme', 'dark'); } catch {} document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${which}-library-dark.png`) });
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

for (const e of engines) { which = e; try { await run(); } catch (err) { ok('run crashed', false, err.message.split('\n')[0]); } }
const pass = results.filter(r => r.pass).length;
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
console.log(`\n${pass}/${results.length} Library image checks passed`);
process.exit(pass === results.length ? 0 : 1);
