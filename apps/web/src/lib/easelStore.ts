'use client';
/* Easels (sidebar plan item 7, 25 Oct): a brainstorming whiteboard kept in the open library's saved state. Its actions write
 * through the store's mutate, like organiseStore. The canvas keeps its own Undo history (in memory) and writes each change
 * here; deleting an easel goes to Deleted (store.trashEasel); its images are blobs ("eimg:…") swept on load once unused. */
import { db } from './db';
import { EASEL_IMG, getState, itemImageOf, mutate, nowISO, uid } from './store';
import type { AppState, Easel, EaselItem } from './types';

export const easelsOf = (s: AppState): Easel[] => s.easels ?? [];
export const easelById = (s: AppState, id: string) => easelsOf(s).find(e => e.id === id);

export function createEasel(title = 'Untitled easel'): Easel {
  const e: Easel = { id: uid('e-'), title, items: [], createdAt: nowISO(), updatedAt: nowISO() };
  mutate(s => ({ ...s, easels: [e, ...easelsOf(s)] }));
  return e;
}

/** Playground (27 Oct, #82): a copy of an easel with all its items. Image files are shared: the image sweep keeps a file
 * while any easel (or Deleted) still uses it, so deleting either copy leaves the other whole. */
export function duplicateEasel(id: string, title: string): Easel | null {
  const src = easelById(getState(), id);
  if (!src) return null;
  const at = nowISO();
  const e: Easel = { ...src, id: uid('e-'), title, demo: undefined, createdAt: at, updatedAt: at };
  mutate(s => ({ ...s, easels: [e, ...easelsOf(s)] }));
  return e;
}

const patchEasel =(id: string, fn: (e: Easel) => Easel) => mutate(s => ({ ...s, easels: easelsOf(s).map(e => (e.id === id ? fn(e) : e)) }));

export function renameEasel(id: string, title: string) {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 120);
  const cur = easelById(getState(), id);
  if (!cur || cur.title === t) return;
  patchEasel(id, e => ({ ...e, title: t, updatedAt: nowISO() }));
}

/** The canvas writes its items here after every change (and Undo or Redo). `touch` false keeps the edited time (a card's
 * height measured as it's drawn is not an edit). */
export function setEaselItems(id: string, items: EaselItem[], touch = true) {
  patchEasel(id, e => (e.items === items ? e : { ...e, items, ...(touch ? { updatedAt: nowISO() } : {}) }));
}

/** Where the canvas was left (pan and zoom). Not an edit, so the easel's edited time stays. */
export function setEaselView(id: string, view: { x: number; y: number; z: number }) {
  const cur = easelById(getState(), id)?.view;
  if (cur && cur.x === view.x && cur.y === view.y && cur.z === view.z) return;
  patchEasel(id, e => ({ ...e, view }));
}

/** Keeps an image file for an easel. Returns its key; the item that uses it is added by the canvas. */
export async function putEaselImage(blob: Blob): Promise<string> {
  const key = EASEL_IMG + uid();
  await db.putBlob(key, blob);
  return key;
}

/** A Library item's image as the easel's own copy of the file (deleting either leaves the other whole). */
export async function copyLibraryImage(artifactId: string): Promise<{ key: string; mime: string; width: number; height: number; title: string } | null> {
  const s = getState();
  const a = s.artifacts.find(x => x.id === artifactId);
  const img = a ? itemImageOf(s, a) : null;
  if (!a || !img) return null;
  const b = await db.getBlob(img.key);
  if (!b) return null;
  const key = await putEaselImage(new Blob([await b.arrayBuffer()], { type: b.type || img.mime }));
  return { key, mime: img.mime, width: img.width, height: img.height, title: a.title };
}

/** Library items with an image, for Add from Library. */
export function libraryImages(s: AppState) {
  return s.artifacts.flatMap(a => { const img = itemImageOf(s, a); return img ? [{ a, thumbKey: img.thumbKey ?? img.key }] : []; });
}

/** A fresh easel opens with its name selected, ready to type (like a new board). */
let fresh: string | null = null;
export const markFreshEasel = (id: string) => { fresh = id; };
export const takeFreshEasel = (id: string) => { const f = fresh === id; if (f) fresh = null; return f; };
