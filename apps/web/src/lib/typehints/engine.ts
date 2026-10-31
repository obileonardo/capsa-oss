'use client';
/* Tesseract.js lifecycle for type hints. The OCR runs in its own Web Worker, loaded from this app's own
 * /typehints/ folder (worker, WASM core and English traineddata are self-hosted), so no request leaves the device.
 * One worker is kept warm between runs; Cancel terminates it immediately and the next run starts a fresh one. */
import type { Worker as TessWorker, Page } from 'tesseract.js';

export const ENGINE = 'tesseract.js 7.0.0 (LSTM, eng 4.0.0_best_int)';

export interface EngineProgress { stage: 'load' | 'read'; progress: number }

let workerP: Promise<TessWorker> | null = null;
let listener: ((p: EngineProgress) => void) | null = null;

function assetBase() {
  return new URL('/typehints/', window.location.origin).href;
}

function getWorker(): Promise<TessWorker> {
  if (workerP) return workerP;
  const p = (async () => {
    const T = await import('tesseract.js');
    const base = assetBase();
    return T.createWorker('eng', T.OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}core`,          // the worker picks the lstm / simd-lstm / relaxedsimd-lstm build itself
      langPath: `${base}lang`,          // eng.traineddata.gz
      workerBlobURL: false,             // plain same-origin worker, no blob indirection
      cacheMethod: 'none',              // don't copy the traineddata into IndexedDB; the HTTP cache is enough
      gzip: true,
      logger: m => {
        if (!listener) return;
        const read = m.status === 'recognizing text';
        listener({ stage: read ? 'read' : 'load', progress: typeof m.progress === 'number' ? m.progress : 0 });
      },
      errorHandler: () => { /* surfaced through the rejected promise */ },
    });
  })();
  workerP = p;
  p.catch(() => { if (workerP === p) workerP = null; });
  return p;
}

/** Stop any running recognition now. The next call to `recognize` loads a fresh worker. */
export async function terminateEngine() {
  const p = workerP;
  workerP = null;
  if (!p) return;
  try { await (await p).terminate(); } catch { /* already gone */ }
}

const abortError = () => new DOMException('Cancelled', 'AbortError');

/** Recognise text in a PNG/canvas blob. Rejects with AbortError when `signal` fires (the worker is terminated). */
export async function recognize(image: Blob, opts: { signal?: AbortSignal; onProgress?: (p: EngineProgress) => void; sparse?: boolean } = {}): Promise<Page> {
  const { signal, onProgress } = opts;
  if (signal?.aborted) throw abortError();
  listener = onProgress ?? null;
  return new Promise<Page>((resolve, reject) => {
    const onAbort = () => { void terminateEngine(); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    (async () => {
      const w = await getWorker();
      if (signal?.aborted) throw abortError();
      // PSM 11 (sparse text) suits UI screenshots with scattered labels; PSM 3 (auto) keeps paragraphs together.
      await w.setParameters({ tessedit_pageseg_mode: (opts.sparse ? '11' : '3') as never, user_defined_dpi: '96', preserve_interword_spaces: '1' });
      const r = await w.recognize(image, {}, { blocks: true, text: false });
      return r.data;
    })().then(resolve, reject).finally(() => {
      signal?.removeEventListener('abort', onAbort);
      if (listener === onProgress) listener = null;
    });
  });
}
