'use client';
/* Prompt fill: one field per [placeholder], a live preview, and copy of the filled text. The saved text is never changed. */
import { Check, Copy, RotateCcw } from '@/components/ui/icons';
import { useId, useState } from 'react';
import { useCopy } from '@/components/ui';
import { modelParams, negativePrompt } from '@/lib/capture/extract';
import { fillParts, plural } from './lib';
import d from './detail.module.css';

/** XEV-06 (Track C): model parameters ("--ar 16:9", "--no text") and a negative prompt, read from the text and kept as
 * written: never blanks, never changed by a fill. Null when there are none. */
export function ModelParams({ text }: { text: string }) {
  const uid = useId();
  const ps = modelParams(text), neg = negativePrompt(text);
  if (!ps.length && !neg) return null;
  return (
    <section className={d.block} aria-labelledby={`${uid}-p`}>
      <div className={d.sectionHead}><h2 id={`${uid}-p`} className={d.h2}>Model parameters</h2></div>
      <ul className={d.params}>
        {ps.map((p, i) => <li key={i}><code>{p.text}</code></li>)}
        {neg && <li><span className={d.meta}>Negative</span> <code>{neg}</code></li>}
      </ul>
    </section>
  );
}

export default function PromptFill({ text, names, onCopied }: { text: string; names: string[]; onCopied?: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const copy = useCopy();
  const uid = useId();
  const parts = fillParts(text, values);
  const left = names.filter(n => !values[n]?.trim()).length;
  const result = parts.map(p => p.text).join('');
  const any = Object.values(values).some(v => v.trim());

  const run = async () => {
    const ok = await copy(result, left ? `Copied with ${plural(left, 'blank')} still open` : 'Copied the filled prompt');
    if (ok) { onCopied?.(); setCopied(true); setTimeout(() => setCopied(false), 1200); }
  };

  return (
    <section className={d.block} aria-labelledby={`${uid}-h`}>
      <div className={d.sectionHead}>
        <h2 id={`${uid}-h`} className={d.h2}>Fill the blanks</h2>
        <span className={d.meta}>{left ? `${left} of ${plural(names.length, 'blank')} open` : 'All blanks filled'}</span>
      </div>
      <div className={d.fill}>
        <div className={d.fillFields}>
          {names.map((n, i) => (
            <div className="field" key={n}>
              <label htmlFor={`${uid}-${i}`}>{n}</label>
              <input id={`${uid}-${i}`} className="input" value={values[n] ?? ''} autoComplete="off"
                onChange={e => setValues(v => ({ ...v, [n]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className={d.fillPreview} data-copied={copied}>
          {/* The preview appears once a blank is filled; before that it would only repeat the text above. */}
          {any && <>
            <p className={d.fillLabel}>Preview</p>
            <p className={d.fillText}>
              {parts.map((p, i) => p.name
                ? <span key={i} className={p.filled ? d.filled : d.blank}>{p.text}</span>
                : <span key={i}>{p.text}</span>)}
            </p>
          </>}
          <div className={d.fillBar}>
            <button type="button" className="btn ghost sm" onClick={() => setValues({})} disabled={!any}><RotateCcw aria-hidden />Reset</button>
            <span className="spacer" />
            <button type="button" className="btn primary sm" onClick={run}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? 'Copied' : 'Copy filled prompt'}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
