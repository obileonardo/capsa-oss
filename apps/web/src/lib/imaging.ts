'use client';
/* Image helpers for Taste boards. Everything runs in the browser; nothing is uploaded.
 * The palette is measured from pixels (deterministic, no AI), the same method as the reference board demo. */
import type { Region, Swatch } from './types';

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // the decoded image stays usable for drawing after the URL is revoked
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Dominant colours of the whole image or a region: 4-bit buckets, merged within distance 34, top 6 with share >= 1%. */
export function measurePalette(img: HTMLImageElement, r?: Pick<Region, 'x' | 'y' | 'w' | 'h'>): Swatch[] {
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = r ? r.x * W : 0, sy = r ? r.y * H : 0, sw = r ? r.w * W : W, sh = r ? r.h * H : H;
  const scale = Math.min(1, 160 / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map<number, [number, number, number, number]>();
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const b = buckets.get(k) ?? [0, 0, 0, 0];
    b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
    buckets.set(k, b); total++;
  }
  const cols = [...buckets.values()].map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3], b[3]]).sort((a, b) => b[3] - a[3]);
  const out: number[][] = [];
  for (const c2 of cols) {
    const near = out.find(o => Math.hypot(o[0] - c2[0], o[1] - c2[1], o[2] - c2[2]) < 34);
    if (near) { const t = near[3] + c2[3]; for (let j = 0; j < 3; j++) near[j] = (near[j] * near[3] + c2[j] * c2[3]) / t; near[3] = t; }
    else if (out.length < 12) out.push([...c2]);
  }
  return out.sort((a, b) => b[3] - a[3]).slice(0, 6)
    .map(o => ({ hex: hex(o[0], o[1], o[2]), share: o[3] / total }))
    .filter(o => o.share >= 0.01);
}

export function canvasBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not encode image'))), type, quality));
}

export async function makeThumb(img: HTMLImageElement, max = 720): Promise<Blob> {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return canvasBlob(c, 'image/jpeg', 0.86);
}

export async function cropRegion(img: HTMLImageElement, r: Pick<Region, 'x' | 'y' | 'w' | 'h'>, max = 1600): Promise<Blob> {
  const sw = r.w * img.naturalWidth, sh = r.h * img.naturalHeight;
  const s = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
  c.getContext('2d')!.drawImage(img, r.x * img.naturalWidth, r.y * img.naturalHeight, sw, sh, 0, 0, c.width, c.height);
  return canvasBlob(c, 'image/png');
}

/* ---------- PNG text metadata (credit travels with crops) ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u: Uint8Array, start = 0, end = u.length) { let c = 0xffffffff; for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** Insert UTF-8 iTXt chunks (e.g. Author, Source, Copyright, Description) after IHDR. */
export async function addPngText(png: Blob, entries: Record<string, string>): Promise<Blob> {
  const src = new Uint8Array(await png.arrayBuffer());
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const [key, value] of Object.entries(entries)) {
    if (!value) continue;
    const body = new Uint8Array([...enc.encode(key.slice(0, 79)), 0, 0, 0, 0, 0, ...enc.encode(value)]);
    const chunk = new Uint8Array(12 + body.length);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, body.length);
    chunk.set(enc.encode('iTXt'), 4);
    chunk.set(body, 8);
    dv.setUint32(8 + body.length, crc32(chunk, 4, 8 + body.length));
    chunks.push(chunk);
  }
  const ihdrEnd = 8 + 12 + 13; // signature + IHDR chunk
  return new Blob([src.slice(0, ihdrEnd), ...chunks, src.slice(ihdrEnd)] as BlobPart[], { type: 'image/png' });
}

/** Read creator, copyright and a "no data mining" flag from embedded XMP, if present. Labelled "embedded" in the UI. */
export async function readEmbeddedMetadata(blob: Blob): Promise<{ creator?: string; copyright?: string; noDataMining?: boolean } | undefined> {
  const buf = new Uint8Array(await blob.slice(0, 4 * 1024 * 1024).arrayBuffer());
  const text = new TextDecoder('latin1').decode(buf);
  const start = text.indexOf('<x:xmpmeta');
  if (start < 0) return undefined;
  const end = text.indexOf('</x:xmpmeta>', start);
  const xmp = new TextDecoder('utf-8').decode(buf.slice(start, end > 0 ? end + 12 : start + 65536));
  const li = (tag: string) => xmp.match(new RegExp(`<${tag}>[\\s\\S]*?<rdf:li[^>]*>([^<]+)</rdf:li>`))?.[1]?.trim();
  const attrOrEl = (tag: string) => xmp.match(new RegExp(`${tag}="([^"]+)"`))?.[1] ?? xmp.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1];
  const creator = li('dc:creator');
  const copyright = li('dc:rights');
  const dm = attrOrEl('plus:DataMining') ?? '';
  const out = { creator, copyright, noDataMining: /PROHIBITED/i.test(dm) || undefined };
  return creator || copyright || out.noDataMining ? out : undefined;
}

/** Image dimensions + thumbnail + palette for a newly added file. */
export async function prepareImage(blob: Blob) {
  const img = await loadImage(blob);
  const [thumb, embedded] = await Promise.all([makeThumb(img), readEmbeddedMetadata(blob).catch(() => undefined)]);
  return { width: img.naturalWidth, height: img.naturalHeight, thumb, palette: measurePalette(img), embedded };
}

/* ---------- generated sample images (clearly labelled "Sample · generated") ---------- */
export async function makeSampleImage(variant: number): Promise<Blob> {
  const W = 1440, H = 960;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const themes = [
    { bg: '#f6f6f4', panel: '#ffffff', ink: '#111113', accent: '#4353e6', soft: '#e9ebfd' },
    { bg: '#0e0e10', panel: '#18181b', ink: '#f2f2f3', accent: '#ff6b3d', soft: '#3a2219' },
    { bg: '#f3efe8', panel: '#fffdf9', ink: '#2a2420', accent: '#1f8a5b', soft: '#dcefe5' },
  ];
  const t = themes[variant % themes.length];
  g.fillStyle = t.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = t.panel; g.fillRect(0, 0, 260, H);
  g.fillStyle = t.ink; g.globalAlpha = 0.9; g.font = '600 30px system-ui, sans-serif'; g.fillText('Sample', 36, 64);
  g.globalAlpha = 0.35; for (let i = 0; i < 7; i++) g.fillRect(36, 120 + i * 44, 150 - (i % 3) * 30, 14);
  g.globalAlpha = 1; g.fillStyle = t.accent; g.fillRect(36, 120, 6, 14);
  g.fillStyle = t.ink; g.font = '700 54px system-ui, sans-serif'; g.fillText(['Quiet dashboard', 'Night mode console', 'Editorial cards'][variant % 3], 320, 120);
  g.globalAlpha = 0.5; g.font = '400 24px system-ui, sans-serif'; g.fillText('Generated sample image · not a real design', 320, 164); g.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const x = 320 + (i % 3) * 370, y = 220 + Math.floor(i / 3) * 340;
    g.fillStyle = t.panel; g.fillRect(x, y, 340, 300);
    g.fillStyle = i === 1 ? t.accent : t.soft; g.fillRect(x + 24, y + 24, 292, 150);
    g.fillStyle = t.ink; g.globalAlpha = 0.8; g.fillRect(x + 24, y + 200, 200, 18);
    g.globalAlpha = 0.35; g.fillRect(x + 24, y + 234, 260, 12); g.fillRect(x + 24, y + 256, 180, 12); g.globalAlpha = 1;
  }
  return canvasBlob(c, 'image/png');
}
