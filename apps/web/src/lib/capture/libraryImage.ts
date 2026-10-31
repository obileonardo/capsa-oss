/* Library image capture (25 Oct; attach first since 27 Oct, #88): pick, paste or drop an image into the capture bar and it
 * attaches there; Send keeps it in the Library (store.captureImageItems), on this device. Checked first (type, size),
 * then measured (size, thumbnail, palette) and hashed so the same image isn't kept twice by accident. Nothing is uploaded. */
import { storageEstimate } from '@/lib/db';
import { prepareImage } from '@/lib/imaging';
import type { Swatch } from '@/lib/types';

/** Types every current browser can draw. HEIC (iPhone photos) isn't one of them outside Safari. */
export const LIBRARY_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];
export const LIBRARY_IMAGE_ACCEPT = LIBRARY_IMAGE_TYPES.join(',');
export const LIBRARY_IMAGE_MAX = 25 * 1048576;

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const GENERIC = /^(image|blob|pasted|clipboard|untitled|download|screenshot)(\s*\(\d+\))?$/i;

/** A title from the file name ("Screenshot 2026-10-25 at 11.41.07"), or a dated one for pasted images. */
export function imageTitle(name?: string, now = new Date()): string {
  const base = (name ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  if (base && !GENERIC.test(base)) return base;
  return `Image · ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

async function sha256(b: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Why a file can't be kept, or null when it can. */
export function refuseImage(f: Blob & { name?: string }): string | null {
  const name = f.name ?? '';
  if (/image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(name)) return 'HEIC photos can’t be opened in this browser. Export it as JPEG or PNG and add it again.';
  if (!LIBRARY_IMAGE_TYPES.includes(f.type)) return 'That isn’t an image this browser can open. Use PNG, JPEG, WebP or GIF.';
  if (f.size > LIBRARY_IMAGE_MAX) return `That image is ${mb(f.size)}. Images up to ${mb(LIBRARY_IMAGE_MAX)} can be kept.`;
  return null;
}

/* ---------- capture bar attachments (27 Oct, #88): an image is checked, measured and hashed when it's attached, and
 * kept only on Send (store.captureImageItems), with the text typed beside it ---------- */
export interface ImagePrep {
  hash: string;
  /** the file name, when it's a real one (not "image.png" from a paste) */
  name?: string;
  prep: { width: number; height: number; thumb?: Blob; palette?: Swatch[] };
}

/** Checks one file for the bar: refused (with why), or measured, thumbnailed and hashed. Nothing is stored. */
export async function prepareAttachment(file: Blob & { name?: string }): Promise<ImagePrep | { error: string }> {
  const refused = refuseImage(file);
  if (refused) return { error: refused };
  let hash: string, p: Awaited<ReturnType<typeof prepareImage>>;
  try { [hash, p] = await Promise.all([sha256(file), prepareImage(file)]); } catch { return { error: 'That image couldn’t be opened. It may be damaged.' }; }
  const base = (file.name ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  return { hash, name: base && !GENERIC.test(base) ? file.name : undefined, prep: { width: p.width, height: p.height, thumb: p.thumb, palette: p.palette } };
}

/** Room on this device for these files, with the same margin as a single image. */
export async function roomFor(bytes: number): Promise<boolean> {
  const est = await storageEstimate();
  return !(est?.quota && est.quota - est.usage < bytes * 1.5);
}

/** An attached image's title: its real file name, else the first line of the text, else a dated one. Several images
 * sharing a title from the text are numbered ("Calmer hero · 2 of 3"). */
export function attachTitle(name: string | undefined, text: string, i: number, n: number, now = new Date()): string {
  if (name) return imageTitle(name, now);
  const line = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  const cut = line.length > 60 ? `${line.slice(0, 60).replace(/\s+\S*$/, '')}…` : line;
  const base = cut || imageTitle(undefined, now);
  return n > 1 ? `${base} · ${i + 1} of ${n}` : base;
}
