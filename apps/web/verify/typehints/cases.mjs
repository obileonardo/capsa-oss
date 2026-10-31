// Ground-truth test cards for type hints. Each card is rendered by the browser with exact CSS values, screenshotted
// at devicePixelRatio 1, and the truth travels with it. Fonts are macOS system fonts (no network).
const P3 = ['Every line in this card is set with known CSS values so the', 'measured numbers can be compared with the truth, line by', 'line and level by level.'];
const P3b = ['Small text sits under the heading with a longer first line', 'and a shorter second line', 'so alignment can be read from the edges.'];

/** spacing truth from CSS letter-spacing (em): tight < -0.015, loose > 0.06, else normal */
export const spacingTruth = ls => (ls < -0.015 ? 'tight' : ls > 0.06 ? 'loose' : 'normal');
export const weightTruth = w => (w <= 300 ? 'Light' : w <= 400 ? 'Regular' : w <= 500 ? 'Medium' : w <= 800 ? 'Bold' : 'Black');

export const CASES = [
  { id: 'A-light-sans-left', bg: '#ffffff', fg: '#111113', family: 'system-ui', align: 'left', width: 960,
    blocks: [
      { lines: ['Quiet tools for focused teams'], size: 48, weight: 700, ls: -0.01, lh: 1.15 },
      { lines: ['Plan the week, review the work and ship together', 'without the noise of a busy chat room.'], size: 20, weight: 400, ls: 0, lh: 1.4 },
      { lines: P3, size: 14, weight: 400, ls: 0, lh: 1.5 },
    ] },
  { id: 'B-dark-sans-centred', bg: '#0e0e10', fg: '#f2f2f3', family: 'system-ui', align: 'center', width: 960,
    blocks: [
      { lines: ['Night mode console'], size: 48, weight: 300, ls: 0, lh: 1.15 },
      { lines: ['A calmer way to watch every deploy', 'as it happens.'], size: 20, weight: 400, ls: 0, lh: 1.4 },
      { lines: P3b, size: 14, weight: 400, ls: 0, lh: 1.6 },
    ] },
  { id: 'C-helvetica-right', bg: '#f6f6f4', fg: '#1b1b1f', family: '"Helvetica Neue"', align: 'right', width: 900,
    blocks: [
      { lines: ['Editorial cards'], size: 40, weight: 700, ls: 0, lh: 1.2 },
      { lines: ['Thin body copy reads lighter on the page', 'when the weight drops below regular', 'like this short paragraph.'], size: 16, weight: 300, ls: 0, lh: 1.5 },
    ] },
  { id: 'D-georgia-serif-left', bg: '#fffdf9', fg: '#2a2420', family: 'Georgia', align: 'left', width: 960,
    blocks: [
      { lines: ['The quiet craft of reading'], size: 44, weight: 700, ls: 0, lh: 1.15 },
      { lines: ['Serif body text with generous leading reads', 'slowly and evenly across a wide column', 'of paper coloured background.'], size: 18, weight: 400, ls: 0, lh: 1.6 },
    ] },
  { id: 'E-caps-loose-tight', bg: '#ffffff', fg: '#111113', family: 'system-ui', align: 'left', width: 960,
    blocks: [
      { lines: ['QUARTERLY REVIEW'], size: 32, weight: 700, ls: 0.12, lh: 1.2, caps: true },
      { lines: ['Tightly tracked body text squeezes the letters', 'together a little more than the default spacing', 'that the face was drawn with.'], size: 15, weight: 400, ls: -0.04, lh: 1.4 },
    ] },
  { id: 'F-low-contrast', bg: '#d4d4d4', fg: '#8c8c8c', family: 'Arial', align: 'left', width: 900,
    blocks: [
      { lines: ['Faded label set'], size: 36, weight: 700, ls: 0, lh: 1.2 },
      { lines: ['Grey text on a grey ground has little', 'contrast but should still be readable', 'by the measuring pass.'], size: 16, weight: 400, ls: 0, lh: 1.5 },
    ] },
  { id: 'G-colour-centred', bg: '#4353e6', fg: '#ffffff', family: 'system-ui', align: 'center', width: 900,
    blocks: [
      { lines: ['Start your free trial'], size: 40, weight: 700, ls: 0, lh: 1.2 },
      { lines: ['White text on a saturated indigo panel,', 'centred under the heading.'], size: 16, weight: 400, ls: 0, lh: 1.5 },
    ] },
  { id: 'H-dark-light-vs-bold', bg: '#18181b', fg: '#e8e8ea', family: '"Helvetica Neue"', align: 'left', width: 1000,
    blocks: [
      { lines: ['Light display headline'], size: 64, weight: 300, ls: -0.02, lh: 1.1 },
      { lines: ['Bold small text under a light heading', 'still reads as bold at this size.'], size: 18, weight: 700, ls: 0, lh: 1.45 },
    ] },
  { id: 'L-large-2x', bg: '#ffffff', fg: '#111113', family: 'system-ui', align: 'left', width: 2600,
    blocks: [
      { lines: ['Retina sized screenshot'], size: 96, weight: 700, ls: -0.01, lh: 1.15 },
      { lines: ['Large images are scaled down before the text', 'reader runs and sizes are scaled back after.'], size: 32, weight: 400, ls: 0, lh: 1.5 },
    ] },
];

/** Region test: case A, body paragraph only (normalised region computed from the rendered layout). */
export const REGION_CASE = { base: 'A-light-sans-left', blockIndex: 2 };

export function cardHtml(c) {
  const blocks = c.blocks.map((b, i) => `<div class="b" data-i="${i}" style="font-size:${b.size}px;font-weight:${b.weight};letter-spacing:${b.ls}em;line-height:${b.lh};${b.caps ? 'text-transform:uppercase;' : ''}">${b.lines.map(l => `<span class="l">${l}</span>`).join('<br>')}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:${c.bg}}
    #card{width:${c.width}px;box-sizing:border-box;padding:${Math.round(c.width / 16)}px;background:${c.bg};color:${c.fg};font-family:${c.family};text-align:${c.align};-webkit-font-smoothing:antialiased}
    .b{margin:0 0 ${Math.round(c.width / 40)}px}
    .b:last-child{margin-bottom:0}
  </style></head><body><div id="card">${blocks}</div></body></html>`;
}

export function noTextHtml() {
  return `<!doctype html><html><head><style>html,body{margin:0}
  #card{width:900px;height:560px;background:linear-gradient(135deg,#f3efe8,#dcefe5 60%,#4353e6);position:relative;overflow:hidden}
  .s{position:absolute;border-radius:12px}
  </style></head><body><div id="card">
  <div class="s" style="left:60px;top:60px;width:300px;height:180px;background:#ff6b3d"></div>
  <div class="s" style="left:420px;top:90px;width:380px;height:12px;background:#111113;opacity:.8"></div>
  <div class="s" style="left:420px;top:120px;width:300px;height:12px;background:#111113;opacity:.4"></div>
  <div class="s" style="left:120px;top:300px;width:220px;height:220px;border-radius:50%;background:#1f8a5b"></div>
  <div class="s" style="left:480px;top:320px;width:320px;height:160px;background:#fffdf9;box-shadow:0 8px 24px rgba(0,0,0,.15)"></div>
  </div></body></html>`;
}

/** Render a card in its own page; returns { png: Buffer, width, height, blockRects } */
export async function renderCard(browser, html) {
  const ctx = await browser.newContext({ viewport: { width: 2800, height: 1600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const el = await page.$('#card');
  const png = await el.screenshot({ type: 'png' });
  const info = await page.evaluate(() => {
    const card = document.querySelector('#card').getBoundingClientRect();
    const blocks = [...document.querySelectorAll('.b')].map(b => { const r = b.getBoundingClientRect(); return { x: (r.left - card.left) / card.width, y: (r.top - card.top) / card.height, w: r.width / card.width, h: r.height / card.height }; });
    return { width: Math.round(card.width), height: Math.round(card.height), blocks };
  });
  await ctx.close();
  return { png, ...info };
}
