'use client';
/* Reading a PDF's text on this device with pdf.js (pdfjs-dist 6.4.299, Apache-2.0). The parser runs in its own module
 * worker, bundled by Next (Turbopack) from the package through `new Worker(new URL(…, import.meta.url))`, so no request
 * leaves this app and the worker is cached with the app's other static files. Fonts aren’t rendered, so none are loaded.
 * Scanned pages have no text layer: they're counted, not guessed at. */
import { MAX_PDF_PAGES, pageText, type DocPage, type PdfItem } from './documents';

type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | null = null;

function load(): Promise<PdfJs> {
  if (lib) return lib;
  const p = (async () => {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
    }
    return pdfjs;
  })();
  lib = p;
  p.catch(() => { if (lib === p) lib = null; });
  return p;
}

export class PdfError extends Error { constructor(message: string, readonly kind: 'password' | 'invalid' | 'too_long' | 'cancelled') { super(message); } }

/** Text of every page (up to MAX_PDF_PAGES), with progress per page. */
export async function readPdf(data: ArrayBuffer, opts: { onPage?: (done: number, total: number) => void; signal?: AbortSignal } = {}): Promise<{ pages: DocPage[]; total: number }> {
  const pdfjs = await load();
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false, stopAtErrors: false });
  const stop = () => { void task.destroy(); };
  opts.signal?.addEventListener('abort', stop, { once: true });
  try {
    let doc;
    try { doc = await task.promise; } catch (e) {
      const name = (e as { name?: string }).name;
      if (opts.signal?.aborted) throw new PdfError('Cancelled', 'cancelled');
      if (name === 'PasswordException') throw new PdfError('This PDF is password-protected. Open it, save a copy without the password, then try again.', 'password');
      throw new PdfError('This file couldn’t be read as a PDF.', 'invalid');
    }
    const total = doc.numPages;
    if (total > MAX_PDF_PAGES) throw new PdfError(`This PDF has ${total.toLocaleString('en-GB')} pages. Files of up to ${MAX_PDF_PAGES} pages can be read.`, 'too_long');
    const pages: DocPage[] = [];
    for (let n = 1; n <= total; n++) {
      if (opts.signal?.aborted) throw new PdfError('Cancelled', 'cancelled');
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ n, text: pageText(content.items as PdfItem[]) });
      page.cleanup();
      opts.onPage?.(n, total);
    }
    return { pages, total };
  } finally {
    opts.signal?.removeEventListener('abort', stop);
    void task.destroy();
  }
}
