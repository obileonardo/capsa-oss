/* Pure pixel measurements for type hints. No DOM, no AI: given the source pixels and the OCR word boxes,
 * measure glyph heights, stroke thickness, letter gaps and line pitch. All lengths are in raster pixels here;
 * the caller scales them to source pixels.
 *
 * Method (per OCR line):
 *  1. Background colour = median of a ring just outside the line box. Ink coverage of each pixel =
 *     colour distance to the background ÷ the 97th-percentile distance (so any text colour on any background works,
 *     light-on-dark included), clamped to 0..1. Coverage keeps anti-aliasing as sub-pixel information.
 *  2. Each word is split into glyphs at blank columns. When the glyph count equals the OCR character count, every glyph
 *     is matched to its letter, so we know which glyphs are x-height letters (a c e m n o r s u v w x z), capitals,
 *     or ascender letters (b d h k l), and take their sub-pixel ink heights and baselines.
 *  3. Stroke thickness = median width of horizontal ink runs (summed coverage) across the middle of the x-height band.
 *  4. Letter gap = total blank column coverage inside a word ÷ (characters − 1).
 */
import type { Raster } from './prepare';

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface OcrWord { text: string; conf: number; box: Box }
export interface OcrLine { words: OcrWord[]; box: Box; conf: number; pass: number }

export interface LineSample {
  line: OcrLine;
  box: Box;           // union of the measured words
  text: string;
  cap: number[];      // capital-letter heights
  asc: number[];      // ascender-letter heights (b d h k l)
  xh: number[];       // x-height letter heights
  wordH: { capLike: number[]; x: number[] }; // whole-word fallbacks when glyphs can't be matched
  baseline?: number;
  strokes: number[];
  gaps: number[];     // per-word mean blank px between letters (column method)
  inter: number[];    // blank widths between letters across the middle of the x-height band
  counters: number[]; // blank widths inside letters (n, o, u, h…) across the same rows
  upper: number; lower: number; chars: number;
  contrast: number;   // ink distance (0..441)
}

export const CONF_MIN = 60;
const X_SET = new Set('acemnorsuvwxz');
const CAP_SET = new Set('ABCDEFGHIKLMNOPRSTUVWXYZ'); // J and Q descend in many faces
const ASC_SET = new Set('bdhkl');
const DESC_RE = /[gjpqyQJ,;()[\]{}|@$]/;

const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export { median };

function ringBackground(r: Raster, b: Box): [number, number, number] | null {
  const { data, width: W, height: H } = r;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
  };
  const h = b.y1 - b.y0;
  const off = Math.max(2, Math.round(h * 0.08));
  const stepX = Math.max(1, Math.floor((b.x1 - b.x0) / 200));
  for (const d of [off, off + 1]) {
    for (let x = b.x0 - d; x <= b.x1 + d; x += stepX) { push(x, b.y0 - d); push(x, b.y1 + d); }
    for (let y = b.y0 - d; y <= b.y1 + d; y++) { push(b.x0 - d, y); push(b.x1 + d, y); }
  }
  if (rs.length < 12) return null;
  return [median(rs), median(gs), median(bs)];
}

function boxMedianColour(r: Raster, b: Box): [number, number, number] {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const i = (y * r.width + x) * 4; rs.push(r.data[i]); gs.push(r.data[i + 1]); bs.push(r.data[i + 2]); }
  return [median(rs), median(gs), median(bs)];
}

/** Coverage map for a box: 0 = background, 1 = full ink. */
function coverage(r: Raster, b: Box, bg: [number, number, number], inkD: number): Float32Array {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, out = new Float32Array(w * h);
  const floor = inkD * 0.04, span = Math.max(1, inkD - floor);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((b.y0 + y) * r.width + b.x0 + x) * 4;
    const d = Math.hypot(r.data[i] - bg[0], r.data[i + 1] - bg[1], r.data[i + 2] - bg[2]);
    out[y * w + x] = Math.min(1, Math.max(0, (d - floor) / span));
  }
  return out;
}

const clipBox = (b: Box, r: Raster, pad = 0): Box => ({
  x0: Math.max(0, Math.floor(b.x0 - pad)), y0: Math.max(0, Math.floor(b.y0 - pad)),
  x1: Math.min(r.width, Math.ceil(b.x1 + pad)), y1: Math.min(r.height, Math.ceil(b.y1 + pad)),
});
const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)) });

export const isGoodWord = (w: OcrWord) => w.conf >= CONF_MIN && /[A-Za-z0-9]/.test(w.text) && w.box.x1 - w.box.x0 >= 2 && w.box.y1 - w.box.y0 >= 3;

/** Sub-pixel ink extent of rows [top, bottom) from a per-row max profile, thresholded at 0.5. */
function extent(rowMax: Float32Array): { top: number; bottom: number } | null {
  let t = -1, b = -1;
  for (let i = 0; i < rowMax.length; i++) if (rowMax[i] >= 0.5) { if (t < 0) t = i; b = i; }
  if (t < 0) return null;
  const top = t + (1 - rowMax[t]) - (t > 0 ? rowMax[t - 1] : 0);
  const bottom = b + rowMax[b] + (b + 1 < rowMax.length ? rowMax[b + 1] : 0);
  return { top, bottom };
}

export function measureLine(r: Raster, line: OcrLine): LineSample | null {
  const words = line.words.filter(isGoodWord);
  if (!words.length) return null;
  const wboxes = words.map(w => clipBox(w.box, r, 1));
  const box = union(wboxes);
  if (box.x1 - box.x0 < 3 || box.y1 - box.y0 < 4) return null;
  const bg = ringBackground(r, box) ?? boxMedianColour(r, box);

  // Ink distance: 97th percentile of colour distance to the background inside the word boxes.
  const dists: number[] = [];
  for (const b of wboxes) {
    const step = Math.max(1, Math.floor(Math.sqrt(((b.x1 - b.x0) * (b.y1 - b.y0)) / 6000)));
    for (let y = b.y0; y < b.y1; y += step) for (let x = b.x0; x < b.x1; x += step) {
      const i = (y * r.width + x) * 4;
      dists.push(Math.hypot(r.data[i] - bg[0], r.data[i + 1] - bg[1], r.data[i + 2] - bg[2]));
    }
  }
  dists.sort((a, b) => a - b);
  const inkD = dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.97))] ?? 0;
  if (inkD < 28) return null; // too faint to measure honestly

  const s: LineSample = {
    line, box, text: words.map(w => w.text).join(' '), cap: [], asc: [], xh: [], wordH: { capLike: [], x: [] },
    strokes: [], gaps: [], inter: [], counters: [], upper: 0, lower: 0, chars: 0, contrast: inkD,
  };
  const bottoms: number[] = [];
  const wordInfo: { b: Box; cov: Float32Array; w: number; h: number; colMax: Float32Array }[] = [];

  words.forEach((word, wi) => {
    const b = wboxes[wi], w = b.x1 - b.x0, h = b.y1 - b.y0;
    const cov = coverage(r, b, bg, inkD);
    const colMax = new Float32Array(w);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = cov[y * w + x]; if (v > colMax[x]) colMax[x] = v; }
    wordInfo.push({ b, cov, w, h, colMax });
    const chars = [...word.text.replace(/\s+/g, '')];
    s.chars += chars.length;
    for (const c of chars) { if (/[A-Z]/.test(c)) s.upper++; else if (/[a-z]/.test(c)) s.lower++; }

    // column max → glyph segments
    const segs: [number, number][] = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && colMax[x] >= 0.3;
      if (on && start < 0) start = x;
      if (!on && start >= 0) { segs.push([start, x]); start = -1; }
    }
    if (!segs.length) return;

    // letter gap: blank coverage between first and last ink column, per letter pair
    if (chars.length >= 3) {
      let blank = 0;
      for (let x = segs[0][0]; x < segs[segs.length - 1][1]; x++) blank += 1 - colMax[x];
      s.gaps.push(blank / (chars.length - 1));
    }

    const wordExt = (() => { const rm = new Float32Array(h); for (let y = 0; y < h; y++) { let m = 0; for (let x = 0; x < w; x++) m = Math.max(m, cov[y * w + x]); rm[y] = m; } return extent(rm); })();
    if (segs.length === chars.length) {
      segs.forEach(([a, z], k) => {
        const c = chars[k];
        const rm = new Float32Array(h);
        for (let y = 0; y < h; y++) { let m = 0; for (let x = a; x < z; x++) m = Math.max(m, cov[y * w + x]); rm[y] = m; }
        const e = extent(rm);
        if (!e) return;
        const height = e.bottom - e.top;
        if (X_SET.has(c)) { s.xh.push(height); bottoms.push(b.y0 + e.bottom); }
        else if (CAP_SET.has(c)) { s.cap.push(height); bottoms.push(b.y0 + e.bottom); }
        else if (ASC_SET.has(c)) { s.asc.push(height); bottoms.push(b.y0 + e.bottom); }
      });
    } else if (wordExt && !DESC_RE.test(word.text)) {
      const height = wordExt.bottom - wordExt.top;
      if ([...word.text].every(c => X_SET.has(c))) s.wordH.x.push(height);
      else if (/[A-Zbdfhklt0-9]/.test(word.text)) s.wordH.capLike.push(height);
      bottoms.push(b.y0 + wordExt.bottom);
    }
  });

  s.baseline = bottoms.length ? median(bottoms) : undefined;

  // Stroke thickness across the middle of the x-height band (or the cap band for all-caps lines).
  const xH = s.xh.length ? median(s.xh) : NaN;
  const capH = s.cap.length ? median(s.cap) : s.wordH.capLike.length ? median(s.wordH.capLike) : NaN;
  const bandH = Number.isFinite(xH) ? xH : Number.isFinite(capH) ? capH : NaN;
  if (s.baseline !== undefined && Number.isFinite(bandH)) {
    const yA = s.baseline - bandH * 0.72, yB = s.baseline - bandH * 0.28;
    for (const { b, cov, w, colMax } of wordInfo) {
      for (let yy = Math.ceil(yA); yy < yB; yy++) {
        const y = yy - b.y0; if (y < 0 || y >= b.y1 - b.y0) continue;
        const row = cov.subarray(y * w, y * w + w);
        // ink runs (coverage > 0.06): width = summed coverage; core = pixels ≥ 0.5 (or the peak for faint hairlines)
        const runs: { a: number; z: number; sum: number; c0: number; c1: number }[] = [];
        let a = -1, sum = 0, c0 = -1, c1 = -1, pk = -1;
        for (let x = 0; x <= w; x++) {
          const v = x < w ? row[x] : 0;
          if (v > 0.06) {
            if (a < 0) { a = x; sum = 0; c0 = -1; c1 = -1; pk = x; }
            sum += v; if (v >= 0.5) { if (c0 < 0) c0 = x; c1 = x; } if (v > row[pk]) pk = x;
          } else if (a >= 0) {
            runs.push({ a, z: x, sum, c0: c0 < 0 ? pk : c0, c1: c1 < 0 ? pk : c1 }); a = -1;
          }
        }
        for (const r of runs) if (r.sum >= 0.4 && r.sum < bandH * 0.6) s.strokes.push(r.sum);
        for (let i = 1; i < runs.length; i++) {
          const p = runs[i - 1], q = runs[i];
          let blank = 0, between = false;
          for (let x = p.c1 + 1; x < q.c0; x++) { blank += 1 - row[x]; if (colMax[x] < 0.15) between = true; }
          if (blank <= 0) continue;
          (between ? s.inter : s.counters).push(blank);
        }
      }
    }
  }
  return s;
}
