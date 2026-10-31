'use client';
/* Image access for Taste boards: object URLs and decoded images for blobs kept in IndexedDB.
 * Cached per key for the session; nothing leaves the device. */
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { loadImage, measurePalette } from '@/lib/imaging';
import type { Reference, Region, Swatch } from '@/lib/types';
import { frameImage, hasFile } from './motion';

const urls = new Map<string, Promise<string | null>>();
const imgs = new Map<string, Promise<HTMLImageElement | null>>();

export function blobUrl(key: string): Promise<string | null> {
  let p = urls.get(key);
  if (!p) {
    p = db.getBlob(key).then(b => (b ? URL.createObjectURL(b) : null)).catch(() => null);
    urls.set(key, p);
    // a missing blob may be restored later (Undo), so don't cache the miss
    p.then(u => { if (!u) urls.delete(key); });
  }
  return p;
}

/** Object URL for a stored blob, or null while loading / if missing. `missing` is true once we know it isn't there. */
export function useBlobUrl(key?: string): { url: string | null; missing: boolean } {
  const [st, setSt] = useState<{ key?: string; url: string | null; missing: boolean }>({ url: null, missing: false });
  useEffect(() => {
    if (!key) return;
    let live = true;
    blobUrl(key).then(u => { if (live) setSt({ key, url: u, missing: !u }); });
    return () => { live = false; };
  }, [key]);
  return st.key === key ? { url: st.url, missing: st.missing } : { url: null, missing: false };
}

export function imageEl(key: string): Promise<HTMLImageElement | null> {
  let p = imgs.get(key);
  if (!p) {
    p = db.getBlob(key).then(b => (b ? loadImage(b) : null)).catch(() => null);
    imgs.set(key, p);
    p.then(i => { if (!i) imgs.delete(key); });
  }
  return p;
}

/** The still that pixels are measured from: the image itself, or for a clip the frame at `t` (default: the poster frame).
 * Embeds and links have no pixels on this device. */
export function sourceImage(ref: Pick<Reference, 'imageKey' | 'mime' | 'media' | 'posterT'>, t?: number): Promise<HTMLImageElement | null> {
  if (ref.media === 'video') return frameImage(ref, t ?? ref.posterT ?? 0);
  if (!hasFile(ref) || !ref.imageKey) return Promise.resolve(null);
  return imageEl(ref.imageKey);
}

export async function regionPalette(ref: Pick<Reference, 'imageKey' | 'mime' | 'media' | 'posterT'>, r: Pick<Region, 'x' | 'y' | 'w' | 'h'>, t?: number): Promise<Swatch[] | null> {
  const img = await sourceImage(ref, t);
  if (!img) return null;
  try { return measurePalette(img, r); } catch { return null; }
}

/** Where each measured colour sits on the image (Google Arts & Culture style dots).
 * Splits a downscaled copy into a grid and, for each swatch, picks the cell closest to that colour,
 * preferring cells not already taken. Returns normalised centres. Measured, not guessed. */
export async function locateSwatches(ref: Pick<Reference, 'imageKey' | 'mime' | 'media' | 'posterT'>, palette: Swatch[], t?: number): Promise<{ hex: string; x: number; y: number }[]> {
  const img = await sourceImage(ref, t);
  if (!img || !palette.length) return [];
  const G = 14;
  const c = document.createElement('canvas'); c.width = G * 6; c.height = G * 6;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const cells: { x: number; y: number; rgb: number[]; spread: number }[] = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let r = 0, g = 0, b = 0, n = 0; const px: number[][] = [];
    for (let y = gy * 6; y < gy * 6 + 6; y++) for (let x = gx * 6; x < gx * 6 + 6; x++) {
      const i = (y * c.width + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; px.push([d[i], d[i + 1], d[i + 2]]);
    }
    const avg = [r / n, g / n, b / n];
    const spread = px.reduce((a, p) => a + Math.hypot(p[0] - avg[0], p[1] - avg[1], p[2] - avg[2]), 0) / n;
    cells.push({ x: (gx + 0.5) / G, y: (gy + 0.5) / G, rgb: avg, spread });
  }
  const taken = new Set<number>();
  return palette.map(s => {
    const t = [1, 3, 5].map(i => parseInt(s.hex.slice(i, i + 2), 16));
    let best = -1, bestD = Infinity;
    cells.forEach((cell, i) => {
      const dist = Math.hypot(cell.rgb[0] - t[0], cell.rgb[1] - t[1], cell.rgb[2] - t[2]) + cell.spread * 0.5 + (taken.has(i) ? 1e6 : 0);
      if (dist < bestD) { bestD = dist; best = i; }
    });
    taken.add(best);
    return { hex: s.hex, x: cells[best].x, y: cells[best].y };
  });
}

