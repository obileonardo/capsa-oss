'use client';
/* Library images (25 Oct): an image kept in the Library (its own file) or saved from a board shows as the image itself:
 * on the card, in the panel and on the item page, with Copy image, Download and Read the text. Everything stays on
 * this device. */
import { Check, Copy, Download, ScanText } from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Thumb } from '@/components/ui/Thumb';
import { useToast } from '@/components/ui';
import { readImageText } from '@/lib/capture/ocr';
import { db } from '@/lib/db';
import { attachImageText, imageSourceFromArtifact, itemImageOf, recordUse, useAppState } from '@/lib/store';
import type { Artifact } from '@/lib/types';
import s from './library.module.css';

export function useItemImage(a: Artifact) {
  const { state } = useAppState();
  return itemImageOf(state, a);
}

/** The card preview of an image item: the thumbnail, cropped to the card. */
export function CardImage({ a }: { a: Artifact }) {
  const img = useItemImage(a);
  if (!img) return null;
  return <div className={s.pvImage} aria-hidden><Thumb k={img.thumbKey ?? img.key} /></div>;
}

/** The panel's image: the whole picture, fitted, on the item's sky. */
export function PanelImage({ k }: { k: string }) {
  return <Thumb k={k} fit="contain" className={s.skyImage} />;
}

/** The clipboard takes PNG everywhere; other types are redrawn as PNG first. */
async function pngOf(b: Blob): Promise<Blob> {
  if (b.type === 'image/png') return b;
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob(x => (x ? res(x) : rej(new Error('encode'))), 'image/png'));
}

export async function copyImage(key: string): Promise<boolean> {
  const b = await db.getBlob(key);
  if (!b || typeof ClipboardItem === 'undefined') return false;
  try {
    // Safari wants the item made inside the click, with the data as a promise
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngOf(b) })]);
    return true;
  } catch { return false; }
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp' };
export async function downloadImage(key: string, title: string, name?: string): Promise<boolean> {
  const b = await db.getBlob(key);
  if (!b) return false;
  const url = URL.createObjectURL(b);
  const el = document.createElement('a');
  el.href = url; el.download = name || `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'image'}.${EXT[b.type] ?? 'png'}`;
  document.body.append(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/** The item page's image, with its actions. */
export function ImageFigure({ a }: { a: Artifact }) {
  const img = useItemImage(a);
  const toast = useToast();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [reading, setReading] = useState<number | null>(null);
  if (!img) return null;
  const copy = async () => {
    if (await copyImage(img.key)) { recordUse([a.id], 'copy'); setCopied(true); setTimeout(() => setCopied(false), 1100); toast({ message: `Copied image · ${a.title}`, tone: 'ok' }); }
    else toast({ message: 'This browser wouldn’t copy the image. Use Download instead.' });
  };
  const download = async () => { if (!(await downloadImage(img.key, a.title, a.image?.name))) toast({ message: 'The image file is missing on this device.' }); };
  const read = async () => {
    if (reading !== null) return;
    setReading(0);
    try {
      const src = await imageSourceFromArtifact(a.id);
      const b = src?.image ? await db.getBlob(src.image.key) : null;
      if (!src || !b) { toast({ message: 'The image file is missing on this device.' }); return; }
      const r = await readImageText(b, { onProgress: v => setReading(v) });
      const n = attachImageText(src.id, r.text, r.confidence);
      toast({ message: n ? `Read the text · ${n} found in the Inbox` : r.text ? 'Read the text · nothing to unpack' : 'No text found in the image', tone: n ? 'ok' : undefined,
        action: { label: 'Open', run: () => router.push(`/inbox/${src.id}`) } });
    } catch { toast({ message: 'Couldn’t read the text in this image.' }); }
    finally { setReading(null); }
  };
  return (
    <figure className={s.figure} aria-labelledby="art-title">
      <div className={s.figureFrame} style={{ aspectRatio: `${img.width} / ${img.height}` }}>
        <Thumb k={img.key} alt={a.title} fit="contain" />
      </div>
      <figcaption className={s.figureBar}>
        <span className={s.figureMeta}>{img.width} × {img.height}{a.image?.name ? ` · ${a.image.name}` : ''}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" onClick={read} disabled={reading !== null} aria-busy={reading !== null || undefined}>
          <ScanText aria-hidden />{reading !== null ? <span role="status">Reading… {Math.round(reading * 100)}%</span> : 'Read the text'}
        </button>
        <button type="button" className="btn ghost sm" onClick={download}><Download aria-hidden />Download</button>
        <button type="button" className="btn sm" onClick={copy}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? 'Copied' : 'Copy image'}</button>
      </figcaption>
    </figure>
  );
}
