/* Easel geometry: boxes, arrow paths that follow their items, bounds and hit tests. Pure, in canvas units. */
import type { EaselArrow, EaselArrowHeads, EaselArrowShape, EaselEnd, EaselItem } from '../types';

export interface Box { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
export type BoxItem = Exclude<EaselItem, EaselArrow>;

export const isBox = (i: EaselItem): i is BoxItem => i.kind !== 'arrow';
export const boxOf = (i: BoxItem): Box => ({ x: i.x, y: i.y, w: i.w, h: i.h });
const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Where the line from the box's centre towards `p` leaves the box, `gap` units outside it. */
export function edgePoint(b: Box, p: Pt, gap = 6): Pt {
  const c = centre(b);
  const dx = p.x - c.x, dy = p.y - c.y;
  if (!dx && !dy) return c;
  const hw = b.w / 2 + gap, hh = b.h / 2 + gap;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The item an end is tied to, if it still exists. */
export const endItem = (end: EaselEnd, byId: Map<string, BoxItem>) => ('item' in end ? byId.get(end.item) : undefined);

/** An arrowhead at `tip`, pointing along (ux, uy). */
const headAt = (tip: Pt, ux: number, uy: number, s = 9, w = 5) =>
  `M${tip.x - ux * s + uy * w} ${tip.y - uy * s - ux * w}L${tip.x} ${tip.y}L${tip.x - ux * s - uy * w} ${tip.y - uy * s + ux * w}`;
const unit = (from: Pt, to: Pt) => { const dx = to.x - from.x, dy = to.y - from.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] as const; };

/** An elbow's corner points: out of the side of each item that faces the other, along the longer axis, turning halfway. */
function elbowPoints(A: Box | Pt, B: Box | Pt, gap = 6): Pt[] {
  const ca = 'w' in A ? centre(A) : A, cb = 'w' in B ? centre(B) : B;
  if (Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y)) {
    const s = Math.sign(cb.x - ca.x) || 1;
    const p1 = 'w' in A ? { x: s > 0 ? A.x + A.w + gap : A.x - gap, y: ca.y } : A;
    const p2 = 'w' in B ? { x: s > 0 ? B.x - gap : B.x + B.w + gap, y: cb.y } : B;
    const mx = (p1.x + p2.x) / 2;
    return Math.abs(p1.y - p2.y) < 0.5 ? [p1, p2] : [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
  }
  const s = Math.sign(cb.y - ca.y) || 1;
  const p1 = 'w' in A ? { x: ca.x, y: s > 0 ? A.y + A.h + gap : A.y - gap } : A;
  const p2 = 'w' in B ? { x: cb.x, y: s > 0 ? B.y - gap : B.y + B.h + gap } : B;
  const my = (p1.y + p2.y) / 2;
  return Math.abs(p1.x - p2.x) < 0.5 ? [p1, p2] : [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
}
/** A polyline with its corners rounded (radius up to r, never more than half of either side). */
function roundedPath(pts: Pt[], r = 10): string {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1], b = pts[k], c = pts[k + 1];
    const rr = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const [ux, uy] = unit(b, a), [vx, vy] = unit(b, c);
    d += `L${b.x + ux * rr} ${b.y + uy * rr}Q${b.x} ${b.y} ${b.x + vx * rr} ${b.y + vy * rr}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${z.x} ${z.y}`;
}

/** An arrow's drawn path between its ends (each on its item's edge) and its heads. Curved (a soft bow, the default and
 * every arrow made before 27 Oct), straight, or elbow (right angles, rounded corners). Heads: one at the end (default),
 * none, or both. Null when an end's item has gone. */
export function arrowGeometry(a: Pick<EaselArrow, 'from' | 'to'> & { shape?: EaselArrowShape; heads?: EaselArrowHeads }, byId: Map<string, BoxItem>, moved?: (b: BoxItem) => Box): { d: string; head: string; p1: Pt; p2: Pt; mid: Pt } | null {
  const box = (end: EaselEnd): Box | Pt | null => {
    if (!('item' in end)) return end;
    const it = byId.get(end.item);
    return it ? (moved ? moved(it) : boxOf(it)) : null;
  };
  const A = box(a.from), B = box(a.to);
  if (!A || !B) return null;
  const ca = 'w' in A ? centre(A) : A, cb = 'w' in B ? centre(B) : B;
  let d: string, p1: Pt, p2: Pt, mid: Pt, endFrom: Pt, startTo: Pt;
  if (a.shape === 'elbow') {
    const pts = elbowPoints(A, B);
    p1 = pts[0]; p2 = pts[pts.length - 1];
    d = roundedPath(pts);
    endFrom = pts[pts.length - 2]; startTo = pts[1];
    const m = pts.length === 4 ? [pts[1], pts[2]] : [p1, p2];
    mid = { x: (m[0].x + m[1].x) / 2, y: (m[0].y + m[1].y) / 2 };
  } else {
    p1 = 'w' in A ? edgePoint(A, cb) : A;
    p2 = 'w' in B ? edgePoint(B, ca) : B;
    if (a.shape === 'straight') {
      d = `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`;
      endFrom = p1; startTo = p2;
      mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    } else {
      const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
      // a gentle bow, always to the same side, so threads read as drawn by hand rather than ruled
      const bow = Math.min(36, len * 0.12);
      const c = { x: (p1.x + p2.x) / 2 - (dy / len) * bow, y: (p1.y + p2.y) / 2 + (dx / len) * bow };
      d = `M${p1.x} ${p1.y}Q${c.x} ${c.y} ${p2.x} ${p2.y}`;
      endFrom = c; startTo = c;
      mid = { x: 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y };
    }
  }
  const heads = a.heads ?? 'end';
  const [ux, uy] = unit(endFrom, p2), [sx, sy] = unit(startTo, p1);
  const head = heads === 'none' ? '' : headAt(p2, ux, uy) + (heads === 'both' ? headAt(p1, sx, sy) : '');
  return { d, head, p1, p2, mid };
}

/** Bounds of everything on the easel (arrow ends included), or null when it's empty. */
export function boundsOf(items: EaselItem[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const i of items) {
    if (isBox(i)) { add(i.x, i.y); add(i.x + i.w, i.y + i.h); }
    else for (const e of [i.from, i.to]) if (!('item' in e)) add(e.x, e.y);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const contains = (b: Box, p: Pt) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** The topmost box item under a point (painted last wins), ignoring `except`. */
export function itemAt(items: EaselItem[], p: Pt, except?: string): BoxItem | undefined {
  for (let k = items.length - 1; k >= 0; k--) { const i = items[k]; if (isBox(i) && i.id !== except && contains(boxOf(i), p)) return i; }
  return undefined;
}

/** A freehand stroke as a smooth path (midpoint quadratic curves). Points are x,y pairs. */
export function strokePath(pts: number[]): string {
  if (pts.length < 2) return '';
  if (pts.length < 6) return `M${pts[0]} ${pts[1]}L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
  let d = `M${pts[0]} ${pts[1]}`;
  for (let k = 2; k < pts.length - 2; k += 2) {
    const mx = (pts[k] + pts[k + 2]) / 2, my = (pts[k + 1] + pts[k + 3]) / 2;
    d += `Q${pts[k]} ${pts[k + 1]} ${mx} ${my}`;
  }
  return d + `L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
}

/** The text an item is announced and searched by. */
export function itemName(i: EaselItem, byId?: Map<string, BoxItem>): string {
  switch (i.kind) {
    case 'card': return [i.title.trim(), i.text.trim()].filter(Boolean).join('. ') || 'Empty card';
    case 'text': return i.text.trim() || 'Empty text';
    case 'image': return i.name?.trim() || 'Image';
    case 'draw': return i.pen === 'highlighter' ? 'Highlight' : i.pen ? `${i.pen[0].toUpperCase()}${i.pen.slice(1)} drawing` : 'Drawing';
    case 'arrow': {
      const n = (e: EaselEnd) => { const it = byId && 'item' in e ? byId.get(e.item) : undefined; return it ? short(itemName(it)) : 'a point'; };
      return `Arrow from ${n(i.from)} to ${n(i.to)}`;
    }
  }
}
const short = (t: string) => (t.length > 40 ? t.slice(0, 39).replace(/\s+\S*$/, '') + '…' : t);
