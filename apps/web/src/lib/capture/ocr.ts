'use client';
/* "Read the text" (CAP-10, part; Track A 25 Oct): the text in an image, read on this device with the Tesseract.js that
 * already ships for type hints (self-hosted in /typehints/, English only). Nothing is sent anywhere. The result says how
 * sure the reader was; words it was unsure of stay in, so the person checks them against the image. */
import { recognize } from '@/lib/typehints/engine';

export interface ReadText { text: string; confidence: number; words: number }

/** Small screenshots read better at twice the size. */
async function prepared(image: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(image);
    const scale = Math.max(bmp.width, bmp.height) < 1200 ? 2 : 1;
    if (scale === 1) { bmp.close(); return image; }
    const c = document.createElement('canvas');
    c.width = bmp.width * scale; c.height = bmp.height * scale;
    const g = c.getContext('2d');
    if (!g) { bmp.close(); return image; }
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob>(res => c.toBlob(b => res(b ?? image), 'image/png'));
  } catch { return image; }
}

/** Lines in reading order, a blank line between paragraphs. Confidence is the mean of the words' (0–100). */
export async function readImageText(image: Blob, opts: { signal?: AbortSignal; onProgress?: (p: number) => void } = {}): Promise<ReadText> {
  const page = await recognize(await prepared(image), { signal: opts.signal, onProgress: p => opts.onProgress?.(p.stage === 'read' ? 0.2 + p.progress * 0.8 : p.progress * 0.2) });
  const paras: string[] = [];
  const confs: number[] = [];
  for (const b of page.blocks ?? []) for (const p of b.paragraphs) {
    const lines = p.lines.map(l => l.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const l of p.lines) for (const w of l.words) if (/[\p{L}\p{N}]/u.test(w.text)) confs.push(w.confidence);
    if (lines.length) paras.push(lines.join('\n'));
  }
  const confidence = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0;
  return { text: paras.join('\n\n'), confidence, words: confs.length };
}
