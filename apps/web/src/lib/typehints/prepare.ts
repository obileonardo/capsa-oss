'use client';
/* Pixel preparation: crop the region, keep a measurement raster near source resolution, and make a
 * grey, contrast-stretched (optionally inverted) copy for OCR, scaled so text is a size Tesseract reads well. */
import { canvasBlob, loadImage } from '@/lib/imaging';
import type { NormRegion } from './types';

export interface Raster { data: Uint8ClampedArray; width: number; height: number }

/** Longest side of the measurement raster. Larger sources are downscaled (sizes are scaled back to source px). */
const MEASURE_MAX = 3200;
/** Target longest side for OCR; small crops are upscaled (≤3×), large images downscaled. */
const OCR_TARGET = 2200;
const OCR_MIN_SCALE = 0.35;
const OCR_MAX_SCALE = 3;

export interface Prepared {
  raster: Raster;
  /** source px per raster px */
  toSource: number;
  sourceWidth: number; sourceHeight: number;
  /** OCR canvas px per raster px */
  ocrScale: number;
  ocrCanvas: HTMLCanvasElement;
  /** true when the dominant background is dark, so the first OCR pass is inverted */
  darkBackground: boolean;
}

export async function toImage(image: HTMLImageElement | Blob): Promise<HTMLImageElement> {
  if (image instanceof Blob) return loadImage(image);
  if (!image.complete || !image.naturalWidth) await image.decode();
  return image;
}

export function clampRegion(r?: NormRegion | null): NormRegion | undefined {
  if (!r) return undefined;
  const x = Math.min(1, Math.max(0, r.x)), y = Math.min(1, Math.max(0, r.y));
  const w = Math.min(1 - x, Math.max(0, r.w)), h = Math.min(1 - y, Math.max(0, r.h));
  if (w <= 0 || h <= 0) return undefined;
  if (x === 0 && y === 0 && w === 1 && h === 1) return undefined;
  return { x, y, w, h };
}

const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

export function prepare(img: HTMLImageElement, region?: NormRegion): Prepared {
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = region ? region.x * W : 0, sy = region ? region.y * H : 0;
  const sw = region ? region.w * W : W, sh = region ? region.h * H : H;
  const m = Math.min(1, MEASURE_MAX / Math.max(sw, sh));
  const rw = Math.max(1, Math.round(sw * m)), rh = Math.max(1, Math.round(sh * m));
  const mc = document.createElement('canvas'); mc.width = rw; mc.height = rh;
  const mctx = mc.getContext('2d', { willReadFrequently: true })!;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(img, sx, sy, sw, sh, 0, 0, rw, rh);
  const raster: Raster = { data: mctx.getImageData(0, 0, rw, rh).data, width: rw, height: rh };

  const o = Math.min(OCR_MAX_SCALE, Math.max(OCR_MIN_SCALE, OCR_TARGET / Math.max(rw, rh)));
  const ow = Math.max(1, Math.round(rw * o)), oh = Math.max(1, Math.round(rh * o));
  const oc = document.createElement('canvas'); oc.width = ow; oc.height = oh;
  const octx = oc.getContext('2d', { willReadFrequently: true })!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(mc, 0, 0, ow, oh);

  // Dominant background luminance (mode of a 32-bin histogram on a sparse sample).
  const d = raster.data, hist = new Uint32Array(32);
  const step = Math.max(1, Math.floor(Math.sqrt((rw * rh) / 250000)));
  for (let y = 0; y < rh; y += step) for (let x = 0; x < rw; x += step) hist[Math.min(31, lum(d, (y * rw + x) * 4) >> 3)]++;
  let mode = 0; for (let i = 1; i < 32; i++) if (hist[i] > hist[mode]) mode = i;
  const darkBackground = mode * 8 + 4 < 110;

  greyStretch(octx, ow, oh, darkBackground);
  return { raster, toSource: 1 / m, sourceWidth: Math.round(sw), sourceHeight: Math.round(sh), ocrScale: o, ocrCanvas: oc, darkBackground };
}

/** Grey + percentile contrast stretch (1st..99th), inverted when asked, in place. */
function greyStretch(ctx: CanvasRenderingContext2D, w: number, h: number, invert: boolean) {
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const v = Math.round(lum(d, i)); d[i] = v; hist[v]++; }
  const n = w * h; let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  if (hi - lo < 8) { lo = Math.max(0, lo - 4); hi = Math.min(255, hi + 4); }
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let v = Math.min(255, Math.max(0, (d[i] - lo) * k));
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}

/** Invert an OCR canvas into a new blob (for the second pass). */
export async function invertedBlob(src: HTMLCanvasElement): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
  ctx.putImageData(im, 0, 0);
  return canvasBlob(c, 'image/png');
}

export const ocrBlob = (c: HTMLCanvasElement) => canvasBlob(c, 'image/png');
