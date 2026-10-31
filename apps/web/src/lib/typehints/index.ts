'use client';
/* Type hints, Layer 1: find text on the device (Tesseract.js in a worker) and measure type facts from pixels.
 * No AI and no network. If nothing readable is found the result says so and carries no values. */
import type { Page } from 'tesseract.js';
import { ENGINE, recognize, terminateEngine } from './engine';
import { CONF_MIN, isGoodWord, measureLine, type Box, type OcrLine } from './measure';
import { clampRegion, invertedBlob, ocrBlob, prepare, toImage } from './prepare';
import { assignRoles, briefSentence, clusterLevels, fitModularScale, lineEstimate, measureAlignment } from './summarise';
import { TYPEHINTS_VERSION, type NormRegion, type TypeHintsResult, type TypeLevel, type TypeHintsWord } from './types';

export * from './types';
export { terminateEngine } from './engine';

export interface MeasureProgress { phase: 'loading' | 'reading' | 'measuring'; progress: number; pass: number }

/** Below this mean word confidence the opposite polarity is tried too. */
const RETRY_BELOW = 78;

function linesFromPage(page: Page, scale: number, pass: number): OcrLine[] {
  const out: OcrLine[] = [];
  const sb = (b: { x0: number; y0: number; x1: number; y1: number }): Box => ({ x0: b.x0 / scale, y0: b.y0 / scale, x1: b.x1 / scale, y1: b.y1 / scale });
  for (const bl of page.blocks ?? []) for (const p of bl.paragraphs) for (const l of p.lines) {
    const words = l.words.filter(w => w.text.trim()).map(w => ({ text: w.text.trim(), conf: w.confidence, box: sb(w.bbox) }));
    if (words.length) out.push({ words, box: sb(l.bbox), conf: l.confidence, pass });
  }
  return out;
}

const goodStats = (lines: OcrLine[]) => {
  const ws = lines.flatMap(l => l.words);
  const good = ws.filter(isGoodWord);
  const alnum = good.reduce((a, w) => a + (w.text.match(/[A-Za-z0-9]/g)?.length ?? 0), 0);
  const mean = ws.length ? ws.reduce((a, w) => a + w.conf, 0) / ws.length : 0;
  return { good: good.length, alnum, mean };
};

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const overlapFrac = (a: Box, b: Box) => {
  const i = area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
  return i / Math.max(1, Math.min(area(a), area(b)));
};
const lineScore = (l: OcrLine) => l.words.filter(isGoodWord).reduce((a, w) => a + w.conf * w.text.length, 0);

/** Merge two passes: keep every line, and where lines overlap keep the better-read one. */
function mergePasses(a: OcrLine[], b: OcrLine[]): OcrLine[] {
  const out = [...a];
  for (const l of b) {
    const hit = out.findIndex(o => overlapFrac(o.box, l.box) > 0.4);
    if (hit < 0) out.push(l);
    else if (lineScore(l) > lineScore(out[hit])) out[hit] = l;
  }
  return out;
}

export async function measureType(
  image: HTMLImageElement | Blob,
  opts: { region?: NormRegion | null; signal?: AbortSignal; onProgress?: (p: MeasureProgress) => void } = {},
): Promise<TypeHintsResult> {
  const t0 = performance.now();
  const region = clampRegion(opts.region);
  const img = await toImage(image);
  const prep = prepare(img, region);
  const report = (phase: MeasureProgress['phase'], progress: number, pass: number) => opts.onProgress?.({ phase, progress, pass });
  const onEngine = (pass: number) => (p: { stage: 'load' | 'read'; progress: number }) => report(p.stage === 'load' ? 'loading' : 'reading', p.progress, pass);

  report('loading', 0, 1);
  const pageA = await recognize(await ocrBlob(prep.ocrCanvas), { signal: opts.signal, onProgress: onEngine(1) });
  let lines = linesFromPage(pageA, prep.ocrScale, 1);
  let passes: 1 | 2 = 1;
  const a = goodStats(lines);
  if (a.mean < RETRY_BELOW || a.good < 2) {
    const pageB = await recognize(await invertedBlob(prep.ocrCanvas), { signal: opts.signal, onProgress: onEngine(2) });
    const linesB = linesFromPage(pageB, prep.ocrScale, 2);
    passes = 2;
    lines = mergePasses(lines, linesB);
  }
  if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  report('measuring', 0, passes);
  await new Promise(r => setTimeout(r, 0)); // let the progress paint before the pixel pass

  const base: Omit<TypeHintsResult, 'status' | 'measured'> = {
    version: TYPEHINTS_VERSION, measuredAt: new Date().toISOString(), layer: 1, method: 'measured from pixels', engine: ENGINE,
    source: { width: img.naturalWidth, height: img.naturalHeight, ...(region ? { region } : {}) },
    run: { passes, darkBackground: prep.darkBackground, ms: 0, confidenceThreshold: CONF_MIN },
  };
  const done = (r: TypeHintsResult) => { r.run.ms = Math.round(performance.now() - t0); report('measuring', 1, passes); return r; };

  const stats = goodStats(lines);
  if (stats.good === 0 || stats.alnum < 3) return done({ ...base, status: 'no-text' });

  const samples = lines.map(l => measureLine(prep.raster, l));
  const ests = samples.map(s => (s ? lineEstimate(s) : null));
  const valid = ests.filter((e): e is NonNullable<typeof e> => !!e);
  if (!valid.length) return done({ ...base, status: 'no-text' });

  const levels = clusterLevels(valid);
  const roles = assignRoles(levels);
  const k = prep.toSource; // raster px → source px
  const srcW = prep.sourceWidth;
  const typeLevels: TypeLevel[] = levels.map((lv, i) => ({
    role: roles[i],
    sizePx: lv.size * k,
    sizeRel: (lv.size * k) / srcW,
    ...(lv.cap ? { capHeightPx: lv.cap * k } : {}),
    ...(lv.xh ? { xHeightPx: lv.xh * k } : {}),
    ...(lv.strokeRatio !== undefined ? { strokeRatio: lv.strokeRatio, weight: lv.weight } : {}),
    case: lv.caseStyle,
    ...(lv.gapRatio !== undefined ? { spacingRatio: lv.gapRatio, spacing: lv.spacing } : {}),
    ...(lv.lineHeight ? { lineHeight: lv.lineHeight } : {}),
    lines: lv.lines.length,
    chars: lv.chars,
    sample: [...lv.lines].sort((p, q) => p.s.box.y0 - q.s.box.y0)[0].s.text.slice(0, 60),
  }));
  const levelOf = new Map<OcrLine, number>();
  levels.forEach((lv, i) => lv.lines.forEach(l => levelOf.set(l.s.line, i)));

  const ordered = [...lines].sort((p, q) => p.box.y0 - q.box.y0 || p.box.x0 - q.box.x0);
  const allWords = ordered.flatMap(l => l.words.map(w => ({ w, level: levelOf.get(l) ?? -1 })));
  const words: TypeHintsWord[] = allWords.filter(x => isGoodWord(x.w)).map(x => ({ text: x.w.text, confidence: Math.round(x.w.conf), level: x.level }));
  const body = typeLevels.find(l => l.role === 'body');
  const heading = typeLevels.find(l => l.role === 'heading') ?? (typeLevels[0] !== body ? typeLevels[0] : undefined);
  const alignment = measureAlignment(valid);
  const sizes = typeLevels.map(l => l.sizePx);
  const measured = {
    levels: typeLevels,
    stepRatios: sizes.slice(1).map((s, i) => sizes[i] / s),
    ...(heading && body ? { headingToBody: heading.sizePx / body.sizePx } : {}),
    ...(body ? (() => { const m = fitModularScale(sizes, body.sizePx); return m ? { modularScale: m } : {}; })() : {}),
    ...(alignment ? { alignment } : {}),
    words,
    hiddenWords: allWords.length - words.length,
    meanConfidence: Math.round(words.reduce((a, w) => a + w.confidence, 0) / Math.max(1, words.length)),
    brief: briefSentence(typeLevels, alignment),
  };
  return done({ ...base, status: 'ok', measured });
}

/** For tests and the lab page: raw per-line samples, to calibrate the constants against ground truth. */
export async function debugSamples(image: HTMLImageElement | Blob, region?: NormRegion) {
  const img = await toImage(image);
  const prep = prepare(img, clampRegion(region));
  const page = await recognize(await ocrBlob(prep.ocrCanvas));
  const lines = linesFromPage(page, prep.ocrScale, 1);
  return lines.map(l => {
    const s = measureLine(prep.raster, l);
    if (!s) return { text: l.words.map(w => w.text).join(' '), conf: l.conf, skipped: true };
    const med = (a: number[]) => (a.length ? [...a].sort((p, q) => p - q)[a.length >> 1] * prep.toSource : null);
    return {
      text: s.text, conf: Math.round(l.conf), cap: med(s.cap), asc: med(s.asc), xh: med(s.xh), nCap: s.cap.length, nAsc: s.asc.length, nX: s.xh.length,
      wCap: med(s.wordH.capLike), wX: med(s.wordH.x), stroke: med(s.strokes), nStroke: s.strokes.length, gap: med(s.gaps), inter: med(s.inter), counter: med(s.counters), nInter: s.inter.length, nCounter: s.counters.length,
      baseline: s.baseline !== undefined ? s.baseline * prep.toSource : null, box: s.box, upper: s.upper, lower: s.lower,
    };
  });
}

export const cancelMeasure = terminateEngine;
