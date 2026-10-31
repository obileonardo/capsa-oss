'use client';
/* Type hints, Layer 1 (measured). Press "Measure type" to find the text on this device (Tesseract.js in a worker,
 * self-hosted, no network) and measure sizes, scale, weight, case, spacing, line height and alignment from pixels.
 * Self-contained: the host passes the image, an optional normalised region, the saved result, and stores what
 * `onResult` returns. Nothing here is AI; typeface naming is Layer 2 and is shown as not built yet. */
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronRight, CircleAlert, Copy, RotateCcw, ScanText, X,
} from '@/components/ui/icons';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useCopy } from '@/components/ui';
import { fmtLH, fmtRatio } from '@/lib/typehints/summarise';
import { TYPEHINTS_VERSION, type Alignment, type NormRegion, type TypeHintsResult, type TypeLevel } from '@/lib/typehints/types';
import s from './typehints.module.css';

export type { TypeHintsResult } from '@/lib/typehints/types';

export interface TypeHintsBlockProps {
  image: HTMLImageElement | Blob | null | undefined;
  region?: NormRegion | null;
  value?: TypeHintsResult | null;
  onResult: (r: TypeHintsResult) => void;
  /** Wording only: "region" or "image". Defaults from `region`. */
  subject?: string;
}

type Run =
  | { state: 'idle' }
  | { state: 'running'; label: string; pct: number }
  | { state: 'error'; message: string };

const ROLE: Record<TypeLevel['role'], string> = { heading: 'Heading', subheading: 'Subheading', body: 'Body', small: 'Small' };
const ALIGN_ICON: Record<Alignment, typeof AlignLeft> = { left: AlignLeft, centred: AlignCenter, right: AlignRight, justified: AlignJustify };
const ALIGN_TEXT: Record<Alignment, string> = { left: 'Left-aligned', centred: 'Centred', right: 'Right-aligned', justified: 'Justified' };

const px = (n: number) => `${Math.round(n)} px`;
const pctW = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const dateLabel = (iso: string) => {
  try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};

export function TypeHintsBlock({ image, region, value, onResult, subject }: TypeHintsBlockProps) {
  const [run, setRun] = useState<Run>({ state: 'idle' });
  const [unit, setUnit] = useState<'px' | 'rel'>('px');
  const [announce, setAnnounce] = useState('');
  const ctrl = useRef<AbortController | null>(null);
  const best = useRef(0);
  const copy = useCopy();
  const uid = useId();
  const what = subject ?? (region ? 'region' : 'image');

  useEffect(() => () => ctrl.current?.abort(), []);
  // a different image or region cancels a run in progress
  const regionKey = region ? `${region.x},${region.y},${region.w},${region.h}` : '';
  useEffect(() => { ctrl.current?.abort(); }, [image, regionKey]);

  const start = useCallback(async () => {
    if (!image) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    best.current = 0;
    setRun({ state: 'running', label: 'Starting the on-device text reader…', pct: 0 });
    setAnnounce(`Measuring type in this ${what}…`);
    try {
      const { measureType } = await import('@/lib/typehints');
      const r = await measureType(image, {
        region, signal: c.signal,
        onProgress: p => {
          let pct: number, label: string;
          if (p.phase === 'loading') { pct = 0.25 * p.progress; label = 'Loading the text reader (stays on this device)…'; }
          else if (p.phase === 'reading' && p.pass === 1) { pct = 0.25 + 0.6 * p.progress; label = 'Finding text…'; }
          else if (p.phase === 'reading') { pct = 0.85 + 0.1 * p.progress; label = 'Low confidence. Trying again with colours inverted…'; }
          else { pct = 0.96; label = 'Measuring from pixels…'; }
          best.current = Math.max(best.current, pct);
          if (!c.signal.aborted) setRun({ state: 'running', label, pct: best.current });
        },
      });
      if (c.signal.aborted) return;
      setRun({ state: 'idle' });
      onResult(r);
      setAnnounce(r.status === 'ok' ? `Type measured. ${r.measured!.brief}` : 'No readable text found.');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError' || c.signal.aborted) { setRun({ state: 'idle' }); setAnnounce('Measuring cancelled.'); return; }
      const message = e instanceof Error ? e.message : String(e);
      setRun({ state: 'error', message });
      setAnnounce('Measuring type failed.');
    } finally {
      if (ctrl.current === c) ctrl.current = null;
    }
  }, [image, region, onResult, what]);

  const cancel = () => { ctrl.current?.abort(); };

  const valid = value && value.version === TYPEHINTS_VERSION ? value : null;
  const live = <p className="sr-only" role="status" aria-live="polite">{announce}</p>;

  if (run.state === 'running') {
    const pct = Math.round(run.pct * 100);
    return (
      <div className={s.root}>
        {live}
        <div className={s.running}>
          <div className={s.runHead}>
            <ScanText aria-hidden className={s.runIcon} />
            <span id={`${uid}-lbl`} className={s.runLabel}>{run.label}</span>
            <span className={s.runPct} aria-hidden>{pct}%</span>
          </div>
          <div className={s.track} role="progressbar" aria-labelledby={`${uid}-lbl`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${run.label} ${pct}%`}>
            <div className={s.fill} style={{ transform: `scaleX(${Math.max(0.02, run.pct)})` }} />
          </div>
          <div className={s.runFoot}>
            <span className={s.note}>Runs in the background on this device. Nothing is uploaded.</span>
            <button type="button" className="btn sm" onClick={cancel}><X aria-hidden />Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if (run.state === 'error') {
    return (
      <div className={s.root}>
        {live}
        <div className={s.message} role="alert">
          <CircleAlert aria-hidden />
          <div>
            <b>Couldn’t run the text reader</b>
            <span>{run.message || 'Unknown error'}. Nothing was measured.</span>
          </div>
        </div>
        <div><button type="button" className="btn sm" onClick={start} disabled={!image}><RotateCcw aria-hidden />Try again</button></div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className={s.root}>
        {live}
        <div className={s.intro}>
          <p>Finds the text in this {what} and measures size, scale, weight, case, letter spacing, line height and alignment from its pixels. Runs on this device; no AI, nothing sent.</p>
          {value && value.version !== TYPEHINTS_VERSION && <p className={s.note}>The saved measurement is from an older version. Measure again to update it.</p>}
          <div className={s.actions}>
            <button type="button" className="btn sm primary" onClick={start} disabled={!image}><ScanText aria-hidden />Measure type</button>
            <Layer2Tag />
          </div>
        </div>
      </div>
    );
  }

  if (valid.status !== 'ok' || !valid.measured) {
    return (
      <div className={s.root}>
        {live}
        <div className={s.message}>
          <ScanText aria-hidden />
          <div>
            <b>No readable text found</b>
            <span>Nothing was measured. If there is text here, mark a tighter region around it and try again.</span>
          </div>
        </div>
        <div className={s.actions}>
          <button type="button" className="btn sm" onClick={start} disabled={!image}><RotateCcw aria-hidden />Measure again</button>
        </div>
      </div>
    );
  }

  const m = valid.measured;
  const max = Math.max(...m.levels.map(l => l.sizePx));
  const size = (l: TypeLevel) => (unit === 'px' ? px(l.sizePx) : pctW(l.sizeRel));
  const AlignIcon = m.alignment ? ALIGN_ICON[m.alignment] : null;
  const shown = m.words.slice(0, 120);

  return (
    <div className={s.root}>
      {live}
      <div className={s.head}>
        <span className="tag ok">measured from pixels</span>
        <span className={s.meta}>{dateLabel(valid.measuredAt)}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" onClick={start} disabled={!image} aria-label={`Measure type again in this ${what}`}><RotateCcw aria-hidden />Again</button>
      </div>

      <figure className={s.brief}>
        <blockquote className="quote" id={`${uid}-brief`}>{m.brief}</blockquote>
        <figcaption className={s.briefCap}>
          <span>Brief line, built only from the measurements below</span>
          <button type="button" className="btn ghost sm" onClick={() => copy(m.brief, 'Type brief copied')} aria-describedby={`${uid}-brief`}><Copy aria-hidden />Copy</button>
        </figcaption>
      </figure>

      <div className={s.scaleRow}>
        <div className={s.scaleText}>
          <b>{m.levels.length === 1 ? '1 size' : `${m.levels.length} sizes`}: {m.levels.map(l => (unit === 'px' ? Math.round(l.sizePx) : pctW(l.sizeRel))).join(' / ')}{unit === 'px' ? ' px' : ' of width'}</b>
          <span>
            {m.headingToBody ? `heading ${fmtRatio(m.headingToBody)}× body` : m.levels.length > 1 ? `steps ${m.stepRatios.map(fmtRatio).join(' · ')}×` : 'one size level'}
            {m.modularScale ? ` · fits a ${m.modularScale.ratio} scale (${m.modularScale.name})` : m.levels.length >= 3 ? ' · no single modular scale' : ''}
          </span>
        </div>
        <div className="seg" role="group" aria-label="Size unit">
          <button type="button" aria-pressed={unit === 'px'} onClick={() => setUnit('px')}>px</button>
          <button type="button" aria-pressed={unit === 'rel'} onClick={() => setUnit('rel')}>% width</button>
        </div>
      </div>

      <ul className={s.levels} aria-label="Size levels, largest first">
        {m.levels.map((l, i) => (
          <li key={i} className={s.level}>
            <div className={s.levelTop}>
              <span className={s.role}>{ROLE[l.role]}</span>
              <span className={s.size}>{size(l)}</span>
              <span className={s.bar} aria-hidden><span style={{ width: `${Math.max(4, (l.sizePx / max) * 100)}%` }} /></span>
            </div>
            <div className={s.tags}>
              {l.weight && <span className="tag neutral" title={`Stroke ≈ ${Math.round((l.strokeRatio ?? 0) * 100)}% of x-height`}>{l.weight}</span>}
              <span className="tag neutral">{l.case === 'all caps' ? 'All caps' : l.case === 'lowercase' ? 'Lowercase' : 'Mixed case'}</span>
              {l.spacing && <span className="tag neutral">{l.spacing === 'normal' ? 'Normal spacing' : l.spacing === 'tight' ? 'Tight spacing' : 'Loose spacing'}</span>}
              {l.lineHeight && <span className="tag neutral">Line height {fmtLH(l.lineHeight)}</span>}
            </div>
            <dl className={s.facts}>
              {l.capHeightPx !== undefined && <div><dt>Cap height</dt><dd>{px(l.capHeightPx)}</dd></div>}
              {l.xHeightPx !== undefined && <div><dt>x-height</dt><dd>{px(l.xHeightPx)}</dd></div>}
              {l.strokeRatio !== undefined && <div><dt>Stroke</dt><dd>{Math.round(l.strokeRatio * 100)}% of x-height</dd></div>}
              {l.spacingRatio !== undefined && <div><dt>Letter gap</dt><dd>{Math.round(l.spacingRatio * 100)}% of x-height</dd></div>}
              <div><dt>Lines</dt><dd>{l.lines}</dd></div>
            </dl>
            <p className={s.sample}><span className="sr-only">Text read: </span>“{l.sample}”</p>
          </li>
        ))}
      </ul>

      {m.alignment && AlignIcon && (
        <p className={s.align}><AlignIcon aria-hidden />{ALIGN_TEXT[m.alignment]} <span className={s.note}>from the line edges</span></p>
      )}

      <details className={s.words}>
        <summary><ChevronRight aria-hidden className={s.chev} />Words read <span className={s.count}>{m.words.length}</span><span className={s.note}>confidence ≥ {valid.run.confidenceThreshold}%</span></summary>
        <p className={s.wordList}>
          {shown.map((w, i) => <span key={i} title={`${w.confidence}% confidence`}>{w.text}</span>)}
          {m.words.length > shown.length && <span className={s.note}>+{m.words.length - shown.length} more</span>}
        </p>
        {m.hiddenWords > 0 && <p className={s.note}>{m.hiddenWords} low-confidence {m.hiddenWords === 1 ? 'word' : 'words'} left out.</p>}
      </details>

      <div className={s.foot}>
        <p className={s.note}>Every number is measured from pixels on this device. Font sizes are estimated from cap and x-height using typical proportions (about ±10%).</p>
        <Layer2Tag />
      </div>
    </div>
  );
}

function Layer2Tag() {
  return <span className="tag neutral" title="Naming the typeface and telling serif from sans is Layer 2, which isn't built yet. Nothing is guessed.">Typeface · serif/sans: Layer 2, not built yet</span>;
}

export default TypeHintsBlock;
