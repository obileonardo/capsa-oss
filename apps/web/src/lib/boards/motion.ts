'use client';
/* Motion references (B12): clips the user adds themselves (MP4, MOV, WebM), studied frame by frame on this device.
 * - probeVideo: size, duration, frame rate and a poster frame (the first frame with content) for a new clip.
 * - frameImage: a decoded still of any moment, for region palettes, palette dots and ZIP crops.
 * - measureMotion: when movement starts and ends, from frame-to-frame pixel change. Labelled "measured from frames";
 *   when the signal is weak or runs past the range, it says so instead of guessing.
 * Nothing is uploaded. Seeking uses requestVideoFrameCallback where available, so each sample carries the real
 * presentation time of the frame that was decoded (not just the time we asked for). */
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { canvasBlob, loadImage, measurePalette } from '@/lib/imaging';
import type { MotionSegment, MotionTiming, Reference } from '@/lib/types';

/* ---------- files ---------- */
const VIDEO_EXT: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
/** The clip's type, from the file type or (when the system gives none, common for .mov) its extension. */
export function videoMime(f: File): string | null {
  if (/^video\/(mp4|quicktime|webm|x-m4v)$/.test(f.type)) return f.type === 'video/x-m4v' ? 'video/mp4' : f.type;
  const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return !f.type || f.type === 'application/octet-stream' ? VIDEO_EXT[ext] ?? null : null;
}
export const isVideoFile = (f: File) => !!videoMime(f);
export const isGif = (r: Pick<Reference, 'mime' | 'media'>) => (!r.media || r.media === 'image') && r.mime === 'image/gif';
export const isClip = (r: Pick<Reference, 'media'>) => r.media === 'video';
export const hasFile = (r: Pick<Reference, 'media'>) => !r.media || r.media === 'image' || r.media === 'video';

export const MB = 1024 * 1024;
/** Above this a clip is saved with a warning about space and backups. */
export const WARN_BYTES = 200 * MB;
/** Above this the browser can't store a clip reliably (it is read into memory whole), so it is refused. */
export const MAX_BYTES = 500 * MB;
export const fmtMB = (b: number) => `${Math.round(b / MB)} MB`;

/* ---------- time formatting ---------- */
/** 1.2 → "0:01.20" (minutes, seconds, hundredths). */
export function fmtTime(t: number, digits = 2): string {
  const v = Math.max(0, t);
  const m = Math.floor(v / 60);
  const sec = v - m * 60;
  const s = sec.toFixed(digits);
  return `${m}:${(sec < 10 ? '0' : '') + s}`;
}
/** Card badge: "0:03", or "0:03.2" under ten seconds so short loops don't all read "0:01". */
export const fmtLength = (t?: number) => (t == null || !isFinite(t) ? '' : t < 10 ? fmtTime(t, 1) : fmtTime(Math.round(t), 0));
export const fmtMs = (s: number) => `${Math.round(s * 1000)} ms`;
export const fmtFps = (f: number) => (Math.abs(f - Math.round(f)) < 0.005 ? String(Math.round(f)) : f.toFixed(2));

/* ---------- clip URLs ---------- */
const urls = new Map<string, Promise<string | null>>();
/** Object URL for a stored clip. Restored backups can lose the blob type, so it is put back from the reference. */
export function clipUrl(key: string, mime: string): Promise<string | null> {
  let p = urls.get(key);
  if (!p) {
    p = db.getBlob(key).then(b => (b ? URL.createObjectURL(b.type ? b : new Blob([b], { type: mime })) : null)).catch(() => null);
    urls.set(key, p);
    p.then(u => { if (!u) urls.delete(key); });
  }
  return p;
}
export function useClipUrl(ref?: Pick<Reference, 'imageKey' | 'mime'> | null, enabled = true): { url: string | null; missing: boolean } {
  const key = ref?.imageKey, mime = ref?.mime ?? '';
  const [st, setSt] = useState<{ key?: string; url: string | null; missing: boolean }>({ url: null, missing: false });
  useEffect(() => {
    if (!key || !enabled) return;
    let live = true;
    clipUrl(key, mime).then(u => { if (live) setSt({ key, url: u, missing: !u }); });
    return () => { live = false; };
  }, [key, mime, enabled]);
  return st.key === key ? { url: st.url, missing: st.missing } : { url: null, missing: false };
}

/* ---------- a hidden video for reading frames ---------- */
let host: HTMLDivElement | null = null;
function hiddenHost() {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // in the document and very faintly painted (engines may skip presenting frames for detached or fully transparent
  // videos), 2 px and inert, so nobody can see it
  host.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:2147483647';
  document.body.append(host);
  return host;
}

const once = (el: EventTarget, ev: string, ms: number) => new Promise<boolean>(res => {
  const t = setTimeout(() => { el.removeEventListener(ev, h); res(false); }, ms);
  const h = () => { clearTimeout(t); res(true); };
  el.addEventListener(ev, h, { once: true });
});

/** Load a clip into a muted, hidden video. MediaRecorder WebM files report an infinite duration until the end is
 * found, so seek far once to make the browser read it. */
export async function openVideo(src: string): Promise<HTMLVideoElement> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  hiddenHost().append(v);
  const ready = new Promise<void>((res, rej) => {
    v.addEventListener('loadeddata', () => res(), { once: true });
    v.addEventListener('error', () => rej(new Error('This browser can’t play that clip (codec not supported).')), { once: true });
    setTimeout(() => rej(new Error('The clip took too long to open.')), 15000);
  });
  v.src = src;
  try { await ready; } catch (e) { v.remove(); throw e; }
  if (!isFinite(v.duration) || v.duration <= 0) {
    v.currentTime = 1e9;
    await Promise.race([once(v, 'durationchange', 4000), once(v, 'seeked', 4000)]);
    if (!isFinite(v.duration)) await once(v, 'seeked', 2000);
  }
  return v;
}
export const closeVideo = (v: HTMLVideoElement) => { v.removeAttribute('src'); v.load(); v.remove(); };

type RvfcVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, m: { mediaTime: number }) => void) => number };
const rvfcWorks = new WeakMap<HTMLVideoElement, boolean>();

/** Seek and wait until the frame is ready to draw. Returns the presented frame's media time when the engine reports
 * it (requestVideoFrameCallback), otherwise null. Each seek has a token, so a late callback from an earlier seek is
 * never taken for this one; frame reporting counts as unsupported only after repeated misses with no success. */
const seekTok = new WeakMap<HTMLVideoElement, number>();

/** A frame callback is only believed if it fits the seek: the frame shown for time t starts at or just before t.
 * Engines can deliver a late callback from an earlier seek, or none at all after a paused seek (WebKit). */
const fits = (m: number, target: number) => m <= target + 0.003 && m > target - 0.25;

/* Frame identity. Reported frame times can sit a few ms off the currentTime timeline, so stored times are always
 * currentTime positions (seeking back to one shows the same frame), and frames are told apart by their pictures:
 * a 12×8 brightness signature. */
export function frameSig(v: HTMLVideoElement): string | null {
  try {
    const c = document.createElement('canvas'); c.width = 12; c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(v, 0, 0, 12, 8);
    const d = g.getImageData(0, 0, 12, 8).data;
    let out = '';
    for (let i = 0; i < d.length; i += 4) out += Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]).toString(16).padStart(2, '0');
    return out;
  } catch { return null; }
}
/** Same picture (allowing for compression noise)? */
export function sameSig(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let s = 0;
  for (let i = 0; i < a.length; i += 2) s += Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16));
  return s / (a.length / 2) < 1.5;
}

const misses = new WeakMap<HTMLVideoElement, number>();
export async function seekFrame(v: HTMLVideoElement, t: number): Promise<number | null> {
  const target = Math.min(Math.max(0, t), Math.max(0, (isFinite(v.duration) ? v.duration : t) - 0.001));
  const rv = v as RvfcVideo;
  const can = typeof rv.requestVideoFrameCallback === 'function' && rvfcWorks.get(v) !== false;
  const tok = (seekTok.get(v) ?? 0) + 1; seekTok.set(v, tok);
  let mediaTime: number | null = null;
  let resolveFrame: (ok: boolean) => void = () => {};
  const framed = new Promise<boolean>(r => { resolveFrame = r; });
  if (can) {
    rv.requestVideoFrameCallback!((_, m) => {
      rvfcWorks.set(v, true); misses.set(v, 0);
      if (seekTok.get(v) !== tok || !fits(m.mediaTime, target)) return; // late callback from another seek
      mediaTime = m.mediaTime; resolveFrame(true);
    });
  }
  const seeked = once(v, 'seeked', 4000);
  if (Math.abs(v.currentTime - target) < 1e-6) v.currentTime = target + 1e-4; else v.currentTime = target;
  await seeked;
  let got = false;
  if (can) {
    got = await Promise.race([framed, new Promise<boolean>(r => setTimeout(() => r(false), rvfcWorks.get(v) ? 150 : 350))]);
    if (!got && !rvfcWorks.get(v)) { const n = (misses.get(v) ?? 0) + 1; misses.set(v, n); if (n >= 4) rvfcWorks.set(v, false); }
  }
  if (got) return mediaTime;
  await new Promise(r => requestAnimationFrame(() => r(null)));
  return null; // unknown: callers fall back to comparing pixels or to the requested time
}

/** Draw the current frame, at most `maxW` wide. */
export function grab(v: HTMLVideoElement, maxW = Infinity): HTMLCanvasElement {
  const s = Math.min(1, maxW / Math.max(1, v.videoWidth));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(v.videoWidth * s)); c.height = Math.max(1, Math.round(v.videoHeight * s));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

/** Spread of brightness on a tiny copy: near 0 for a black or blank frame. */
function contentScore(v: HTMLVideoElement): number {
  const c = document.createElement('canvas'); c.width = 32; c.height = 18;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(v, 0, 0, 32, 18);
  const d = g.getImageData(0, 0, 32, 18).data;
  let sum = 0, sq = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += y; sq += y * y; }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean));
}

const STD_FPS = [12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120];
/** Frame rate from the clip's own frame timestamps: seek in 1/240 s steps across a short window, collect the distinct
 * presented frames and average their spacing (averaging also copes with recorders that write uneven timestamps).
 * Playing the clip to count frames is not used: a hidden or busy page drops frames and reads too low. */
async function measureFps(v: HTMLVideoElement): Promise<number | null> {
  if (typeof (v as RvfcVideo).requestVideoFrameCallback !== 'function' || !isFinite(v.duration)) return null;
  const d = v.duration, start = Math.min(0.2, d * 0.25), win = Math.min(0.5, d - start - 0.02);
  if (win < 0.08) return null;
  const pts: number[] = [];
  for (let t = start; t < start + win; t += 1 / 200) {
    const m = await seekFrame(v, t);
    if (m == null) continue; // a seek that stayed on the same frame reports nothing
    if (!pts.length || Math.abs(m - pts[pts.length - 1]) > 1e-4) pts.push(m);
  }
  if (pts.length < 4) return null;
  // Median frame-to-frame gap, not frames ÷ span: a busy browser can miss some frame reports, which only adds a few
  // double-length gaps (and would make frames ÷ span read low, e.g. 21 instead of 30 fps).
  const gaps = pts.slice(1).map((m, i) => m - pts[i]).filter(g => g > 1e-4).sort((x, y) => x - y);
  if (gaps.length < 3) return null;
  const f = 1 / gaps[Math.floor((gaps.length - 1) / 2)];
  if (!isFinite(f) || f < 1 || f > 240) return null;
  const snap = STD_FPS.find(x => Math.abs(x - f) / x < 0.04);
  return snap ?? +f.toFixed(2);
}

/** The next (d = 1) or previous (d = -1) frame from the one shown at currentTime `at`, judged by the picture changing
 * (frame callbacks can be late or missing, and their times can sit off the currentTime timeline); a reported change of
 * frame also counts, for neighbours that look identical. Returns a position showing that frame, within a quarter frame
 * of its start. A still stretch with no frame reports falls back to the frame grid. */
export async function stepFrame(v: HTMLVideoElement, at: number, d: 1 | -1, fps: number): Promise<number> {
  const max = isFinite(v.duration) ? v.duration - 0.001 : Infinity;
  const q = 0.25 / fps;
  const m0 = await seekFrame(v, at);
  const sig0 = frameSig(v) ?? '';
  let probe = at;
  for (let i = 0; i < 24; i++) {
    probe += d * q;
    if (probe < 0 || probe > max) break;
    const mt = await seekFrame(v, probe);
    const sig = frameSig(v) ?? '';
    const byTime = mt != null && m0 != null && fits(mt, probe) && (d > 0 ? mt > m0 + 1e-4 : mt < m0 - 1e-4);
    if (!sameSig(sig, sig0) || byTime) {
      if (d > 0) return probe;
      // stepping back lands near the end of the previous frame: walk on to its start
      let first = probe;
      for (let j = 0; j < 16; j++) {
        const p2 = first - q;
        if (p2 < 0) { first = 0; break; }
        const m2 = await seekFrame(v, p2);
        if (!sameSig(frameSig(v) ?? '', sig) || (m2 != null && mt != null && fits(m2, p2) && m2 < mt - 1e-4)) break;
        first = p2;
      }
      return first;
    }
    if (i >= 7 && (m0 == null || mt == null)) break; // identical pictures and no frame reports
  }
  // Fallback (no picture or frame reports, e.g. WebKit doesn't render a hidden reader): step on the frame grid and land in
  // the middle of the frame. Landing right next to a boundary lets Safari show the neighbouring frame instead.
  const k = Math.floor(at * fps + 1e-6);
  return Math.min(max, Math.max(0, (k + d + 0.5) / fps));
}

export interface ProbedClip {
  width: number; height: number; durationS: number; posterT: number; fps?: number; fpsMeasured: boolean;
  thumb: Blob; palette: ReturnType<typeof measurePalette>;
}

/** Everything a new clip needs: size, length, frame rate and a poster frame (the first moment with content). */
export async function probeVideo(blob: Blob): Promise<ProbedClip> {
  const url = URL.createObjectURL(blob);
  let v: HTMLVideoElement | null = null;
  try {
    v = await openVideo(url);
    const durationS = isFinite(v.duration) ? v.duration : 0;
    if (!v.videoWidth || !v.videoHeight) throw new Error('That file has no picture this browser can show.');
    const fps = await measureFps(v).catch(() => null);
    // first meaningful frame: skip black or blank openings
    const cands = [0, 0.1, 0.25, 0.5, 1, 2, 4].filter(t => t < Math.max(0.05, durationS - 0.02));
    let posterT = 0, best = -1;
    for (const t of cands) {
      await seekFrame(v, t);
      const sc = contentScore(v);
      if (sc > best) { best = sc; posterT = t; }
      if (sc > 6) break;
    }
    await seekFrame(v, posterT);
    const full = grab(v, 1600);
    const img = await loadImage(await canvasBlob(full, 'image/png'));
    const thumbC = grab(v, 720);
    const thumb = await canvasBlob(thumbC, 'image/jpeg', 0.86);
    return { width: v.videoWidth, height: v.videoHeight, durationS, posterT, fps: fps ?? undefined, fpsMeasured: !!fps, thumb, palette: measurePalette(img) };
  } finally {
    if (v) closeVideo(v);
    URL.revokeObjectURL(url);
  }
}

/* ---------- stills of any moment (region palettes, dots, ZIP crops) ---------- */
interface Reader { v: Promise<HTMLVideoElement>; queue: Promise<unknown> }
const readers = new Map<string, Reader>();
function reader(ref: Pick<Reference, 'imageKey' | 'mime'>): Reader | null {
  let r = readers.get(ref.imageKey);
  if (!r) {
    const v = clipUrl(ref.imageKey, ref.mime).then(u => { if (!u) throw new Error('Clip file missing'); return openVideo(u); });
    r = { v, queue: Promise.resolve() };
    readers.set(ref.imageKey, r);
    v.catch(() => readers.delete(ref.imageKey));
    // keep at most two clips open
    if (readers.size > 2) {
      const [oldKey, old] = readers.entries().next().value!;
      readers.delete(oldKey);
      old.queue.finally(() => old.v.then(closeVideo, () => {}));
    }
  }
  return r;
}
/** Run `fn` with the clip's hidden reader, one task at a time (seeks must not interleave). */
export function withClip<T>(ref: Pick<Reference, 'imageKey' | 'mime'>, fn: (v: HTMLVideoElement) => Promise<T>): Promise<T> {
  const r = reader(ref)!;
  const run = r.queue.then(() => r.v).then(fn);
  r.queue = run.catch(() => {});
  return run;
}

const stills = new Map<string, Promise<HTMLImageElement | null>>();
/** The frame at `t` as a decoded image (full size, at most 2400 px wide). Cached for the session. */
export function frameImage(ref: Pick<Reference, 'imageKey' | 'mime'>, t: number): Promise<HTMLImageElement | null> {
  const k = `${ref.imageKey}@${t.toFixed(3)}`;
  let p = stills.get(k);
  if (!p) {
    p = withClip(ref, async v => { await seekFrame(v, t); return loadImage(await canvasBlob(grab(v, 2400), 'image/png')); }).catch(() => null);
    stills.set(k, p);
    p.then(i => { if (!i) stills.delete(k); });
    if (stills.size > 24) stills.delete(stills.keys().next().value!);
  }
  return p;
}
/** The next or previous frame, found on the hidden reader (so the visible player never shows the search). */
export const nextFrame = (ref: Pick<Reference, 'imageKey' | 'mime'>, at: number, d: 1 | -1, fps: number) =>
  withClip(ref, v => stepFrame(v, at, d, fps));

/** The frame at `t` as PNG bytes at full size (for the ZIP poster). */
export const framePng = (ref: Pick<Reference, 'imageKey' | 'mime'>, t: number) =>
  withClip(ref, async v => { await seekFrame(v, t); return canvasBlob(grab(v), 'image/png'); });

/* ---------- measured timing ---------- */
export interface MeasureOptions { from: number; to: number; fps: number; fpsMeasured: boolean; onProgress?: (p: number) => void; signal?: { cancelled: boolean } }

const TILES_X = 8, TILES_Y = 6, MAX_SAMPLES = 900, GRAPH_POINTS = 240;

/** Per-tile mean brightness change between two frames; the score is the largest tile, so a small element moving in a
 * big frame still registers. Brightness is 0–255. */
function tileChange(a: Float32Array, b: Float32Array, w: number, h: number): number {
  const tw = w / TILES_X, th = h / TILES_Y;
  const sums = new Float32Array(TILES_X * TILES_Y), counts = new Uint32Array(TILES_X * TILES_Y);
  for (let y = 0; y < h; y++) {
    const ty = Math.min(TILES_Y - 1, Math.floor(y / th));
    for (let x = 0; x < w; x++) {
      const i = y * w + x, k = ty * TILES_X + Math.min(TILES_X - 1, Math.floor(x / tw));
      sums[k] += Math.abs(a[i] - b[i]); counts[k]++;
    }
  }
  let best = 0;
  for (let k = 0; k < sums.length; k++) if (counts[k]) best = Math.max(best, sums[k] / counts[k]);
  return best;
}
function luma(c: HTMLCanvasElement): Float32Array {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  const out = new Float32Array(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) out[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return out;
}
const pctl = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] ?? 0; };

/** Sample every frame in [from, to], measure change between neighbours and find the movements.
 * Edges are estimated halfway between the last still frame and the first changed one, so each edge is within half a
 * frame and the duration within one frame of the movement that is visible in the pixels. */
export async function measureMotion(ref: Pick<Reference, 'imageKey' | 'mime'>, o: MeasureOptions): Promise<MotionTiming> {
  const from = Math.max(0, o.from), to = Math.max(from, o.to);
  const frame = 1 / o.fps;
  const n = Math.max(1, Math.floor((to - from) / frame + 1e-6));
  const step = n > MAX_SAMPLES ? (to - from) / MAX_SAMPLES : frame;
  const count = Math.min(n, MAX_SAMPLES);
  const frames: { t: number; y: Float32Array }[] = [];
  let w = 0, h = 0;
  await withClip(ref, async v => {
    const W = Math.min(240, v.videoWidth);
    for (let k = 0; k < count; k++) {
      if (o.signal?.cancelled) throw new Error('cancelled');
      const mt = await seekFrame(v, from + (k + 0.5) * step); // the middle of a frame interval lands on that frame
      const t = mt ?? from + k * step;
      if (frames.length && Math.abs(t - frames[frames.length - 1].t) < 1e-4) continue; // same frame twice (fewer frames than assumed)
      const c = grab(v, W); w = c.width; h = c.height;
      frames.push({ t, y: luma(c) });
      o.onProgress?.((k + 1) / count);
    }
  });
  const base = { method: 'measured_from_frames' as const, range: { from, to }, fps: o.fps, fpsMeasured: o.fpsMeasured, step, measuredAt: new Date().toISOString() };
  if (frames.length < 4) return { ...base, status: 'unclear', reason: 'Too few frames in this range to measure. Widen the range.', segments: [], activity: [], threshold: 0 };

  // change between frame i-1 and i, stored at index i (index 0 is 0)
  const diff = frames.map((f, i) => (i ? tileChange(frames[i - 1].y, f.y, w, h) : 0));
  const ds = diff.slice(1);
  const floor = pctl(ds, 0.3);
  const peak = Math.max(...ds);
  const high = Math.max(1.5, floor * 4);      // starts a movement
  const low = Math.max(0.6, floor * 2);       // keeps one going (catches easing tails)
  const graph = (() => {
    const scale = peak || 1;
    if (diff.length <= GRAPH_POINTS) return diff.map(x => +(x / scale).toFixed(3));
    const out: number[] = []; const per = diff.length / GRAPH_POINTS;
    for (let i = 0; i < GRAPH_POINTS; i++) out.push(+(Math.max(...diff.slice(Math.floor(i * per), Math.floor((i + 1) * per))) / scale).toFixed(3));
    return out;
  })();
  const threshold = peak ? +(high / peak).toFixed(3) : 1;

  // nearly every frame changes: no still frames to measure from (the range sits inside a movement, or the clip is noisy)
  const changing = ds.filter(x => x >= 1.5).length / ds.length;
  if (changing > 0.8) return { ...base, status: 'unclear', reason: 'Almost every frame in this range changes, so there are no still frames to measure a start and an end from. Widen the range to include a moment before and after the movement.', segments: [], activity: graph, threshold: peak ? +(1.5 / peak).toFixed(3) : 1 };
  if (peak < high) return { ...base, status: 'none', reason: 'No movement found: every frame is within the clip’s own noise.', segments: [], activity: graph, threshold };

  // runs of changing frames: start above `high`, extend while above `low`, merge gaps of up to 2 still frames
  const runs: [number, number][] = [];
  for (let i = 1; i < diff.length; i++) {
    if (diff[i] < high) continue;
    let a = i, b = i;
    while (a - 1 >= 1 && diff[a - 1] >= low) a--;
    while (b + 1 < diff.length && diff[b + 1] >= low) b++;
    const last = runs[runs.length - 1];
    if (last && a - last[1] <= 3) last[1] = Math.max(last[1], b); else runs.push([a, b]);
    i = b;
  }
  const half = (i: number) => (frames[i].t + frames[i - 1].t) / 2;
  const segments: MotionSegment[] = runs.map(([a, b]) => ({
    start: +half(a).toFixed(4), end: +half(b).toFixed(4), lastStill: +frames[a - 1].t.toFixed(4), firstSettled: +frames[b].t.toFixed(4),
  }));
  const first = runs[0], last = runs[runs.length - 1];
  const graphOut = { activity: graph, threshold, segments };
  if (first[0] === 1 || last[1] === diff.length - 1) {
    const edge = first[0] === 1 && last[1] === diff.length - 1 ? 'start and end' : first[0] === 1 ? 'start' : 'end';
    return { ...base, ...graphOut, status: 'unclear', reason: `Movement is already under way at the ${edge} of the range, so its ${edge === 'start' ? 'start' : edge === 'end' ? 'end' : 'start and end'} can’t be measured. Widen the range.` };
  }
  if (segments.length > 6) return { ...base, ...graphOut, status: 'unclear', reason: `${segments.length} separate bursts of change (flicker or many small moves). Set a loop range around one movement and measure again.` };
  if (peak < high * 1.6) return { ...base, ...graphOut, status: 'unclear', reason: 'The change is faint compared with the clip’s noise, so these edges may be off by more than a frame.' };
  return { ...base, ...graphOut, status: 'ok' };
}

/** "Movement ≈ 320 ms (0:01.20 → 0:01.52)". */
export const segmentText = (g: MotionSegment) => `≈ ${fmtMs(g.end - g.start)} (${fmtTime(g.start)} → ${fmtTime(g.end)})`;
export function timingSummary(m: MotionTiming): string {
  if (m.status === 'none') return 'No movement found';
  if (!m.segments.length) return 'Timing unclear';
  if (m.segments.length === 1) return `Movement ${segmentText(m.segments[0])}`;
  return `${m.segments.length} movements: ${m.segments.map(segmentText).join('; ')}`;
}
