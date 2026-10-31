/* Turn per-line pixel samples into size levels, scale, weight, case, spacing, line height and alignment,
 * then a brief sentence built only from those measured values. Pure functions; no DOM. */
import { median, type Box, type LineSample } from './measure';
import type { Alignment, CaseStyle, LevelRole, SpacingClass, TypeLevel, WeightClass } from './types';

/* Typical proportions of text faces (em fractions), fitted on rendered ground truth in SF Pro, Helvetica Neue, Arial,
 * Georgia (see verify/typehints): cap height ≈ 0.70–0.74 em, ascender (b d h k l) ≈ 0.70–0.78 em, x-height ≈ 0.49–0.56 em.
 * Measured sub-pixel heights include ≈0.25 px of anti-aliasing spread, removed first. */
export const CAP_EM = 0.715;
export const ASC_EM = 0.73;
export const X_EM = 0.52;
export const HEIGHT_BIAS = 0.25;
/** x-height ÷ cap height, used to normalise stroke and spacing for all-caps lines. */
const X_PER_CAP = 0.73;

/** stroke ÷ x-height boundaries: Light | Regular | Medium | Bold | Black.
 *  Ground truth: 300 → 0.12–0.15, 400 → 0.155–0.20 (SF at 14–16 px sits lowest), 500 → 0.21–0.24, 700 → 0.28–0.33, 900 → 0.34–0.35. */
export const WEIGHT_CUTS = [0.153, 0.205, 0.25, 0.337];
/** mean of (column gap ÷ x-height) and (mid-band letter gap ÷ x-height): tight | normal | loose.
 *  Ground truth (−0.04 em / 0 / +0.1 em letter-spacing over 6 faces, 3 sizes, 2–5 weights): 91% classified as set. */
export const SPACING_CUTS = [0.15, 0.312];

const WEIGHTS: WeightClass[] = ['Light', 'Regular', 'Medium', 'Bold', 'Black'];
export const weightClass = (r: number): WeightClass => WEIGHTS[WEIGHT_CUTS.filter(c => r >= c).length];
export const spacingClass = (r: number): SpacingClass => (r < SPACING_CUTS[0] ? 'tight' : r < SPACING_CUTS[1] ? 'normal' : 'loose');

export interface LineEst {
  s: LineSample;
  size: number;   // estimated font size, raster px
  weight: number; // effective sample weight
  xh?: number; cap?: number;
}

/** Pooled size estimate from glyph-height samples. */
const unbias = (h: number) => Math.max(0.5, h - HEIGHT_BIAS);
export function estimateSize(cap: number[], asc: number[], xh: number[], wcap: number[] = [], wx: number[] = []) {
  const parts: [number, number][] = [];
  if (cap.length) parts.push([unbias(median(cap)) / CAP_EM, cap.length * 1.2]);
  if (asc.length) parts.push([unbias(median(asc)) / ASC_EM, asc.length]);
  if (xh.length) parts.push([unbias(median(xh)) / X_EM, xh.length * 0.3]);
  if (!parts.length && wcap.length) parts.push([unbias(median(wcap)) / ASC_EM, wcap.length]);
  if (!parts.length && wx.length) parts.push([unbias(median(wx)) / X_EM, wx.length]);
  if (!parts.length) return null;
  const tw = parts.reduce((a, p) => a + p[1], 0);
  return { size: parts.reduce((a, p) => a + p[0] * p[1], 0) / tw, n: tw };
}

export function lineEstimate(s: LineSample): LineEst | null {
  const e = estimateSize(s.cap, s.asc, s.xh, s.wordH.capLike, s.wordH.x);
  if (!e || !(e.size > 3)) return null;
  return { s, size: e.size, weight: e.n, xh: s.xh.length ? median(s.xh) : undefined, cap: s.cap.length ? median(s.cap) : undefined };
}

export interface Level {
  lines: LineEst[];
  size: number;
  cap?: number; xh?: number;
  stroke?: number; strokeRatio?: number; weight?: WeightClass;
  gapRatio?: number; spacing?: SpacingClass;
  lineHeight?: number;
  caseStyle: CaseStyle;
  chars: number;
}

function caseOf(upper: number, lower: number): CaseStyle {
  if (lower === 0 && upper >= 2) return 'all caps';
  if (upper === 0 && lower >= 3) return 'lowercase';
  return 'mixed';
}

/** x-height reference for ratios: measured x-height, else cap height × 0.73, else size × X_EM (bias removed). */
const xRefOf = (xh: number | undefined, cap: number | undefined, size: number) =>
  xh !== undefined ? unbias(xh) : cap !== undefined ? unbias(cap) * X_PER_CAP : size * X_EM;

const stacked = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0;

function buildLevel(lines: LineEst[]): Level {
  const cap = lines.flatMap(l => l.s.cap), asc = lines.flatMap(l => l.s.asc), xh = lines.flatMap(l => l.s.xh);
  const e = estimateSize(cap, asc, xh, lines.flatMap(l => l.s.wordH.capLike), lines.flatMap(l => l.s.wordH.x))!;
  const upper = lines.reduce((a, l) => a + l.s.upper, 0), lower = lines.reduce((a, l) => a + l.s.lower, 0);
  const lv: Level = {
    lines, size: e.size, chars: lines.reduce((a, l) => a + l.s.chars, 0), caseStyle: caseOf(upper, lower),
    cap: cap.length ? median(cap) : undefined, xh: xh.length ? median(xh) : undefined,
  };
  const xRef = xRefOf(lv.xh, lv.cap, e.size);
  const strokes = lines.flatMap(l => l.s.strokes);
  if (strokes.length >= 6) { lv.stroke = median(strokes); lv.strokeRatio = lv.stroke / xRef; lv.weight = weightClass(lv.strokeRatio); }
  const gaps = lines.flatMap(l => l.s.gaps), inter = lines.flatMap(l => l.s.inter);
  if (gaps.length || inter.length >= 15) {
    const g = gaps.length ? median(gaps) / xRef : NaN, i = inter.length >= 15 ? median(inter) / xRef : NaN;
    lv.gapRatio = Number.isFinite(g) && Number.isFinite(i) ? (g + i) / 2 : Number.isFinite(i) ? i : g;
    lv.spacing = spacingClass(lv.gapRatio);
  }
  // line pitch between stacked neighbours of this level
  const sorted = [...lines].filter(l => l.s.baseline !== undefined).sort((a, b) => a.s.baseline! - b.s.baseline!);
  const pitches: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    const p = b.s.baseline! - a.s.baseline!;
    if (p > lv.size * 0.8 && p < lv.size * 3 && stacked(a.s.box, b.s.box)) pitches.push(p);
  }
  if (pitches.length) lv.lineHeight = median(pitches) / lv.size;
  return lv;
}

/** Single-linkage clustering of line sizes in log space; a gap of more than 12% starts a new level. */
export function clusterLevels(ests: LineEst[]): Level[] {
  const sorted = [...ests].sort((a, b) => b.size - a.size);
  const groups: LineEst[][] = [];
  for (const e of sorted) {
    const g = groups[groups.length - 1];
    if (g && g[g.length - 1].size / e.size <= 1.12) g.push(e); else groups.push([e]);
  }
  let levels = groups.map(buildLevel);
  // split a size level when its lines clearly differ in weight (≥ 2 classes apart, e.g. Regular vs Bold)
  levels = levels.flatMap(lv => {
    if (lv.lines.length < 2) return [lv];
    const per = lv.lines.map(l => {
      const st = l.s.strokes; if (st.length < 6) return null;
      const xRef = xRefOf(l.xh, l.cap, l.size);
      return WEIGHTS.indexOf(weightClass(median(st) / xRef));
    });
    const known = per.filter((v): v is number => v !== null);
    if (!known.length || Math.max(...known) - Math.min(...known) < 2) return [lv];
    const mid = (Math.max(...known) + Math.min(...known)) / 2;
    const heavy = lv.lines.filter((_, i) => per[i] !== null && per[i]! > mid);
    const light = lv.lines.filter((_, i) => !(per[i] !== null && per[i]! > mid));
    return [buildLevel(heavy), buildLevel(light)];
  });
  return levels.sort((a, b) => b.size - a.size);
}

export function assignRoles(levels: Level[]): LevelRole[] {
  if (!levels.length) return [];
  if (levels.length === 1) return ['body'];
  let bodyIdx = 0;
  levels.forEach((l, i) => { if (l.chars > levels[bodyIdx].chars || (l.chars === levels[bodyIdx].chars && l.size < levels[bodyIdx].size)) bodyIdx = i; });
  const body = levels[bodyIdx].size;
  return levels.map((l, i) => {
    if (i === bodyIdx) return 'body';
    if (l.size < body) return 'small';
    return i === 0 && l.size / body >= 1.25 ? 'heading' : 'subheading';
  });
}

const SCALES: [number, string][] = [[1.618, 'golden ratio'], [1.5, 'perfect fifth'], [1.414, 'augmented fourth'], [1.333, 'perfect fourth'], [1.25, 'major third'], [1.2, 'minor third'], [1.125, 'major second'], [1.067, 'minor second']];

/** The largest common modular scale that puts every level within ±4% of body × ratio^k (k a distinct integer, |k| ≤ 8). */
export function fitModularScale(sizes: number[], body: number) {
  if (sizes.length < 3) return undefined;
  for (const [ratio, name] of SCALES) {
    const ks = new Set<number>(); let ok = true;
    for (const sz of sizes) {
      const k = Math.round(Math.log(sz / body) / Math.log(ratio));
      if (Math.abs(k) > 8 || ks.has(k) || Math.abs(body * ratio ** k - sz) / sz > 0.04) { ok = false; break; }
      ks.add(k);
    }
    if (ok) return { ratio, name };
  }
  return undefined;
}

/** Alignment from blocks of stacked lines: left / centred / right / justified edges within a tolerance. */
export function measureAlignment(ests: LineEst[]): Alignment | undefined {
  const lines = [...ests].sort((a, b) => a.s.box.y0 - b.s.box.y0);
  const blocks: LineEst[][] = [];
  for (const l of lines) {
    const blk = blocks.find(b => {
      const last = b[b.length - 1];
      const gap = l.s.box.y0 - last.s.box.y1;
      return gap < Math.max(last.size, l.size) * 1.6 && gap > -Math.min(last.size, l.size) * 0.5 && stacked(last.s.box, l.s.box);
    });
    if (blk) blk.push(l); else blocks.push([l]);
  }
  const votes: Record<Alignment, number> = { left: 0, centred: 0, right: 0, justified: 0 };
  for (const b of blocks) {
    if (b.length < 2) continue;
    // side bearings grow with size, so the tolerance follows the largest line in the block
    const tol = Math.max(3, 0.08 * Math.max(...b.map(l => l.size)));
    const L = b.map(l => l.s.box.x0), R = b.map(l => l.s.box.x1), C = b.map(l => (l.s.box.x0 + l.s.box.x1) / 2);
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    if (spread(R.map((r, i) => r - L[i])) <= tol * 2) continue; // all lines the same width: alignment can't be told
    const lOk = spread(L) <= tol, rOk = spread(R) <= tol, cOk = spread(C) <= tol;
    const rOkButLast = b.length >= 3 && spread(R.slice(0, -1)) <= tol;
    let a: Alignment | null = null;
    if (lOk && rOkButLast) a = 'justified';
    else if (lOk) a = 'left';
    else if (cOk) a = 'centred';
    else if (rOk) a = 'right';
    if (a) votes[a] += b.length;
  }
  const best = (Object.entries(votes) as [Alignment, number][]).sort((a, b) => b[1] - a[1]);
  if (!best[0][1] || best[0][1] === best[1][1]) return undefined;
  return best[0][0];
}

const fmt = (n: number, step = 0.05) => {
  const v = Math.round(n / step) * step;
  return v.toFixed(step < 0.1 ? 2 : 1).replace(/0$/, '').replace(/\.$/, '');
};
export const fmtRatio = (n: number) => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''));
export const fmtLH = (n: number) => fmt(n);

/** "Headings bold, ≈2.4× body size, tight spacing; body regular, line height ≈1.5; left-aligned." */
export function briefSentence(levels: TypeLevel[], alignment?: Alignment): string {
  const parts: string[] = [];
  const body = levels.find(l => l.role === 'body');
  const desc = (l: TypeLevel, withRatio: boolean) => {
    const bits: string[] = [];
    if (l.weight) bits.push(l.weight.toLowerCase());
    if (l.case === 'all caps') bits.push('all caps');
    if (withRatio && body && l !== body) bits.push(`≈${fmtRatio(l.sizePx / body.sizePx)}× body size`);
    else bits.push(`≈${Math.round(l.sizePx)} px`);
    if (l.spacing) bits.push(`${l.spacing} spacing`);
    if (l.lineHeight) bits.push(`line height ≈${fmtLH(l.lineHeight)}`);
    return bits.join(', ');
  };
  const name: Record<LevelRole, string> = { heading: 'headings', subheading: 'subheadings', body: 'body', small: 'small text' };
  for (const l of levels) {
    if (l.role === 'body' && levels.length === 1) { parts.push(`Text ${desc(l, false)}`); continue; }
    const label = name[l.role];
    parts.push(`${label} ${desc(l, true)}`);
  }
  let out = parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join('; ');
  if (alignment) out += `; ${alignment === 'centred' ? 'centred' : alignment === 'justified' ? 'justified' : `${alignment}-aligned`}`;
  return out + '.';
}
