'use client';
/* An image kept in the Inbox (Track A, CAP-10 part): shown beside what was read from it, so the words can be checked
 * against the picture, and "Read the text", which reads it on this device with the bundled Tesseract.js. */
import { ScanText } from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { readImageText } from '@/lib/capture/ocr';
import { db } from '@/lib/db';
import { attachImageText, getState, imageSourceFromReference, useAppState } from '@/lib/store';
import type { Source } from '@/lib/types';
import s from './review.module.css';

export function SourceImage({ src, caption = 'The image' }: { src: Source; caption?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = '';
    if (src.image) void db.getBlob(src.image.key).then(b => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [src.image]);
  if (!src.image) return null;
  return (
    <figure className={s.srcImage}>
      <figcaption>{caption}{src.image.read ? ` · read on this device, ${src.image.read.confidence}% sure` : ''}</figcaption>
      {url ? <img src={url} alt={src.image.name ? `Image: ${src.image.name}` : 'The captured image'} /> : <div className={s.srcImageEmpty} aria-hidden />}
    </figure>
  );
}

/** "Read the text": progress while it reads, Stop to cancel. The result replaces any earlier reading. */
export function ReadTextButton({ src, primary = true }: { src: Source; primary?: boolean }) {
  const toast = useToast();
  const [p, setP] = useState<number | null>(null);
  const ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);
  const run = async () => {
    if (!src.image || p !== null) return;
    const b = await db.getBlob(src.image.key);
    if (!b) { toast({ message: 'The image file is missing on this device.' }); return; }
    const c = new AbortController(); ac.current = c;
    setP(0);
    try {
      const r = await readImageText(b, { signal: c.signal, onProgress: v => setP(v) });
      if (c.signal.aborted || !getState().sources.some(x => x.id === src.id)) return;
      const n = attachImageText(src.id, r.text, r.confidence);
      toast({ message: n ? `Read the text · ${n} found` : r.text ? 'Read the text · nothing to unpack' : 'No text found in the image', tone: n ? 'ok' : undefined });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ message: 'Couldn’t read the text in this image.' });
    } finally { setP(null); ac.current = null; }
  };
  if (p !== null) {
    return (
      <span className={s.reading} role="status">
        <span>Reading… {Math.round(p * 100)}%</span>
        <button type="button" className="btn ghost" onClick={() => ac.current?.abort()}>Stop</button>
      </span>
    );
  }
  return <button type="button" className={`btn ${primary ? 'primary' : ''}`} onClick={run}><ScanText aria-hidden />Read the text</button>;
}

/** A Library reference saved from a board (an image): "Read the text" copies the image into the Inbox, reads it on this
 * device, and the finds wait there to review. */
export function ReadReferenceText({ refId, className }: { refId: string; className?: string }) {
  const { state } = useAppState();
  const toast = useToast();
  const router = useRouter();
  const [p, setP] = useState<number | null>(null);
  const ref = state.references.find(r => r.id === refId);
  if (!ref?.imageKey || (ref.media && ref.media !== 'image')) return null;
  const run = async () => {
    if (p !== null) return;
    setP(0);
    try {
      const src = await imageSourceFromReference(refId);
      const b = src?.image ? await db.getBlob(src.image.key) : null;
      if (!src || !b) { toast({ message: 'The image file is missing on this device.' }); return; }
      const r = await readImageText(b, { onProgress: v => setP(v) });
      const n = attachImageText(src.id, r.text, r.confidence);
      toast({ message: n ? `Read the text · ${n} found in the Inbox` : r.text ? 'Read the text · nothing to unpack' : 'No text found in the image', tone: n ? 'ok' : undefined,
        action: { label: 'Open', run: () => router.push(`/inbox/${src.id}`) } });
    } catch { toast({ message: 'Couldn’t read the text in this image.' }); }
    finally { setP(null); }
  };
  return (
    <button type="button" className={`${className ?? ''} ${s.linkLike}`} onClick={run} disabled={p !== null} aria-busy={p !== null || undefined}>
      {p !== null ? <span role="status">Reading… {Math.round(p * 100)}%</span> : <>Read the text<ScanText aria-hidden /></>}
    </button>
  );
}
