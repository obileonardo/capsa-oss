'use client';
/* Adding references: files from paste, drop or the picker, and links the user pastes. The user's own action only:
 * no crawling, no URL fetching, no site-specific scraping (Legal roadmap Stage 0). Clips (MP4, MOV, WebM) are stored
 * byte for byte; GIFs are images that play. */
import { storageEstimate } from '@/lib/db';
import { makeSampleImage, prepareImage } from '@/lib/imaging';
import {
  addLinkReference, addMotionReferences, addReferences, createBoard, deleteBoard, updateBoard, updateReference, type NewMotionReference, type NewReference,
} from '@/lib/store';
import type { Reference } from '@/lib/types';
import { parseLink } from './links';
import { fmtMB, isVideoFile, MAX_BYTES, probeVideo, videoMime, WARN_BYTES } from './motion';

export const URL_ONLY_MESSAGE = 'That site doesn’t let images be dragged out. Right-click the image → Copy Image, then paste here.';

export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return [...(list ?? [])].filter(f => f.type.startsWith('image/'));
}

/** Images and clips (MP4, MOV, WebM; GIFs are images). */
export function mediaFiles(list: FileList | File[] | null | undefined): File[] {
  return [...(list ?? [])].filter(f => f.type.startsWith('image/') || isVideoFile(f));
}
export const ACCEPT = 'image/*,video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm';

export function filesFromTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const fromFiles = mediaFiles(dt.files);
  if (fromFiles.length) return fromFiles;
  const out: File[] = [];
  for (const it of [...(dt.items ?? [])]) if (it.kind === 'file') { const f = it.getAsFile(); if (f && mediaFiles([f]).length) out.push(f); }
  return out;
}

/** True when a drag carries files (used to show the drop tint only for real file drags). */
export const dragHasFiles = (dt: DataTransfer | null) => !!dt && [...dt.types].includes('Files');

/** A drop that carried only a link or HTML (typical when a site blocks image dragging). */
export function isUrlOnly(dt: DataTransfer | null): boolean {
  if (!dt || filesFromTransfer(dt).length) return false;
  const types = [...dt.types];
  return types.includes('text/uri-list') || types.includes('text/html') || /^https?:\/\//i.test(dt.getData('text/plain') ?? '');
}

const GENERIC = /^(image|blob|pasted|clipboard|untitled|download)(\s*\(\d+\))?$/i;
function titleFromName(name: string) {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  return GENERIC.test(base) ? '' : base;
}

export interface AddResult { refs: Reference[]; failed: number; refused: string[]; warnings: string[] }

/** Saving image files can fail when the device is out of space or storage is blocked. */
export const STORE_FAILED = 'This browser wouldn’t keep the image files. The device may be out of space, or site storage is blocked.';
async function store(boardId: string, sectionId: string | null, items: NewReference[]) {
  try { return await addReferences(boardId, sectionId, items); }
  catch { throw new Error(STORE_FAILED); }
}

/** Refuse what the browser can't keep; warn (but keep) large clips. */
async function sizeCheck(f: File, planned: number): Promise<{ refuse?: string; warn?: string }> {
  const name = f.name || 'That file';
  if (f.size > MAX_BYTES) return { refuse: `${name} is ${fmtMB(f.size)}. Clips over ${fmtMB(MAX_BYTES)} can’t be kept reliably in a browser. Trim it to the moment you’re studying (QuickTime: Edit › Trim) and add it again.` };
  const est = await storageEstimate();
  if (est && est.quota && est.quota - est.usage < planned + f.size * 1.1) return { refuse: `Not enough space on this device for ${name} (${fmtMB(f.size)} needed, ${fmtMB(Math.max(0, est.quota - est.usage - planned))} free). Remove some references or trim the clip.` };
  if (f.size > WARN_BYTES) return { warn: `${name} is ${fmtMB(f.size)}. It’s saved, but large clips fill this browser’s storage quickly and make backups slow. A trimmed clip of the moment works just as well.` };
  return {};
}

/** `notify` hears size warnings as soon as they're known (reading a big clip takes a moment). */
export async function addFiles(boardId: string, sectionId: string | null, files: File[], notify?: (warning: string) => void): Promise<AddResult> {
  const items: NewMotionReference[] = [];
  const refused: string[] = [], warnings: string[] = [];
  let failed = 0, planned = 0;
  for (const f of files) {
    const check = await sizeCheck(f, planned);
    if (check.refuse) { refused.push(check.refuse); continue; }
    if (check.warn) { warnings.push(check.warn); notify?.(check.warn); }
    try {
      const vm = videoMime(f);
      if (vm) {
        const blob = f.type === vm ? f : new Blob([f], { type: vm }); // same bytes; the type only helps playback later
        const p = await probeVideo(blob);
        items.push({
          blob, mime: vm, width: p.width, height: p.height, thumb: p.thumb, palette: p.palette, title: titleFromName(f.name),
          media: 'video', durationS: +p.durationS.toFixed(3), fps: p.fps, fpsMeasured: p.fpsMeasured, posterT: p.posterT,
        });
      } else {
        const p = await prepareImage(f);
        items.push({ blob: f, mime: f.type || 'image/png', width: p.width, height: p.height, thumb: p.thumb, palette: p.palette, embedded: p.embedded, title: titleFromName(f.name) });
      }
      planned += f.size;
    } catch { failed++; }
  }
  let refs: Reference[] = [];
  if (items.length) {
    try { refs = await addMotionReferences(boardId, sectionId, items); }
    catch { throw new Error(STORE_FAILED); }
  }
  return { refs, failed, refused, warnings };
}

/** A pasted or dropped link: an official embed (YouTube, Vimeo, Behance) or an "Open original" card. */
export function addLink(boardId: string, sectionId: string | null, raw: string): Reference | null {
  const p = parseLink(raw);
  if (!p) return null;
  return addLinkReference(boardId, sectionId, { url: p.url, media: p.media, embedUrl: p.embedUrl, provider: p.provider, startS: p.startS });
}
export { parseLink };

/** First run: a demo board made from generated sample images, labelled as such. */
export async function createSampleBoard(): Promise<{ boardId: string; refs: Reference[] }> {
  const items: NewReference[] = [];
  for (let i = 0; i < 3; i++) {
    const blob = await makeSampleImage(i);
    const p = await prepareImage(blob);
    items.push({
      blob, mime: 'image/png', width: p.width, height: p.height, thumb: p.thumb, palette: p.palette, embedded: p.embedded,
      title: 'Sample · generated', creator: 'Capsa sample (generated)', demo: true,
    });
  }
  const board = createBoard('Sample board');
  updateBoard(board.id, { demo: true, note: 'A demo board made from generated sample images. Delete it whenever you like.' });
  let refs: Reference[];
  try { refs = await store(board.id, null, items); }
  catch (e) { await deleteBoard(board.id).catch(() => {}); throw e; } // don't leave an empty demo board behind
  refs.forEach(r => updateReference(r.id, { rights: 'own' }));
  return { boardId: board.id, refs };
}

/* Save confirmation handed from Boards home to the board view after navigation (Pinterest-style toast). */
let pending: { boardId: string; refIds: string[]; where: string } | null = null;
export const setPendingSave = (p: typeof pending) => { pending = p; };
export const takePendingSave = (boardId: string) => {
  const p = pending && pending.boardId === boardId ? pending : null;
  if (p) pending = null;
  return p;
};

/* A board just made with "New board": the board view focuses its title once. */
let fresh: string | null = null;
export const markFreshBoard = (id: string) => { fresh = id; };
export const takeFreshBoard = (id: string) => { const f = fresh === id; if (f) fresh = null; return f; };
