'use client';
/* Capture › File (CAP-06): read a chosen file on this device and hand back a capture for it. Markdown, text and
 * transcripts are read as text; a PDF page by page with pdf.js (loaded only when a PDF is chosen). */
import { captureDocument } from '@/lib/store';
import type { Source } from '@/lib/types';
import { docKind, MAX_PDF_BYTES, MAX_TEXT_BYTES, piecesFromPages, piecesFromTextFile } from './documents';

export const DOC_ACCEPT = '.md,.markdown,.txt,.pdf,.srt,.vtt,text/markdown,text/plain,application/pdf,text/vtt';
const mb = (n: number) => `${Math.round(n / 1048576)} MB`;

export async function readDocument(file: File, opts: { signal?: AbortSignal; onProgress?: (label: string) => void } = {}): Promise<{ capture: (target?: Source['target']) => Source }> {
  const kind = docKind(file.name, file.type);
  if (!kind) throw new Error('This file type can’t be read. Choose a Markdown, text, transcript (SRT or VTT) or PDF file.');
  if (kind === 'pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error(`This PDF is ${mb(file.size)}. Files of up to ${mb(MAX_PDF_BYTES)} can be read.`);
    const { readPdf } = await import('./pdf');
    const { pages, total } = await readPdf(await file.arrayBuffer(), { signal: opts.signal, onPage: (n, t) => opts.onProgress?.(`Page ${n} of ${t}`) });
    const r = piecesFromPages(file.name, pages);
    return { capture: target => captureDocument({ name: file.name, kind, size: file.size, pages: total, textless: r.textless, pieces: r.pieces, segments: r.segments }, target) };
  }
  if (file.size > MAX_TEXT_BYTES) throw new Error(`This file is ${mb(file.size)}. Text files of up to ${mb(MAX_TEXT_BYTES)} can be read.`);
  const text = await file.text();
  if (/\u0000/.test(text.slice(0, 4096))) throw new Error('This file isn’t text. Choose a Markdown, text, transcript or PDF file.');
  const r = piecesFromTextFile(file.name, text);
  return { capture: target => captureDocument({ name: file.name, kind: r.transcript ? 'transcript' : kind, size: file.size, pieces: r.pieces, segments: r.segments }, target) };
}
