'use client';
/* One candidate under review: type, title, AI summary, the exact text (verbatim), evidence (method first), moment, cautions,
 * Keep checkbox and an inline edit form for title and purpose. */
import { Check, Pencil, Play, ShieldAlert, TriangleAlert } from '@/components/ui/icons';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { EvidenceTag, TypeTag } from '@/components/ui';
import type { ArtifactType, Candidate } from '@/lib/types';
import s from './review.module.css';

export const MONO_TYPES = new Set<ArtifactType>(['prompt', 'command', 'command_config', 'skill', 'template']);
export const TITLE_MAX = 200;
export const PURPOSE_MAX = 600;

export interface EditApi { submit: () => boolean }

export function cautionLabel(kind: string) {
  if (kind === 'injection') return { label: 'Instructions aimed at AI', Icon: ShieldAlert };
  if (kind === 'remote-script') return { label: 'Runs code from the internet', Icon: TriangleAlert };
  // Track C caution rules (XEV-03, XEV-16) and secrets or personal data (XEV-15)
  if (kind === 'destructive') return { label: 'Deletes or overwrites', Icon: TriangleAlert };
  if (kind === 'privilege') return { label: 'Runs as administrator', Icon: TriangleAlert };
  if (kind === 'permissions') return { label: 'Opens permissions', Icon: TriangleAlert };
  if (kind === 'bypass') return { label: 'Skips a safety check', Icon: TriangleAlert };
  if (kind === 'secret') return { label: 'Looks like a secret', Icon: ShieldAlert };
  if (kind === 'personal') return { label: 'Personal data', Icon: ShieldAlert };
  return { label: 'Caution', Icon: TriangleAlert };
}

export const momentRange = (c: Candidate) => c.evidence?.t ? `${c.evidence.t}${c.evidence.tEnd ? `–${c.evidence.tEnd}` : ''}` : '';

export default function CandidateCard({
  c, kept, active, edited, editing, variant, onKeep, onShowEvidence, onConfirm, onEdit, onEditDone, registerEdit, tools, afterBody,
}: {
  c: Candidate; kept: boolean; active?: boolean; edited?: boolean; editing: boolean; variant: 'bench' | 'focus' | 'inline';
  onKeep: (v: boolean) => void; onShowEvidence?: () => void; onConfirm: () => void;
  onEdit: () => void; onEditDone: (change: { title: string; purpose: string } | null) => void;
  registerEdit: (api: EditApi | null) => void;
  /** Track C: the find's ⋯ menu (merge, split) beside Edit, and what follows the body (skip reasons) */
  tools?: ReactNode; afterBody?: ReactNode;
}) {
  const uid = useId();
  const titleId = `${uid}-t`;
  const ev = c.evidence;
  const ai = ev?.method === 'ai_located';
  const quoteIsExact = !!c.exact && !!ev?.quote && ev.quote.trim() === c.exact.trim();
  const mono = MONO_TYPES.has(c.type);

  return (
    <article className={s.card} data-kept={kept} data-active={active || undefined} data-variant={variant}
      aria-labelledby={variant === 'inline' ? undefined : titleId} aria-label={variant === 'inline' ? `Details: ${c.title}` : undefined}>
      {variant === 'inline' ? (
        !editing && (
          <div className={s.inlineTools}>
            {edited && <span className="tag neutral">Edited by you</span>}
            <button type="button" className="btn ghost sm" onClick={onEdit} aria-label={`Edit title and summary of “${c.title}”`}><Pencil aria-hidden />Edit</button>
            {tools}
          </div>
        )
      ) : (
      <div className={s.cardHead}>
        <label className={s.check}>
          <input type="checkbox" checked={kept} onChange={e => onKeep(e.target.checked)} aria-label={`Keep “${c.title}”`} />
        </label>
        <div className={s.cardTitleRow}>
          <TypeTag type={c.type} />
          <h3 className={s.cardTitle} id={titleId}>{c.title}</h3>
          {edited && <span className="tag neutral">Edited by you</span>}
          {!kept && <span className={`tag neutral ${s.skipTag}`}>Will skip</span>}
        </div>
        {!editing && (
          <button type="button" className="btn ghost icon sm" onClick={onEdit} aria-label={`Edit title and summary of “${c.title}”`} title="Edit title and summary">
            <Pencil aria-hidden />
          </button>
        )}
        {!editing && tools}
      </div>
      )}

      <div className={s.cardBody}>
        {editing ? (
          <EditForm c={c} onDone={onEditDone} registerEdit={registerEdit} />
        ) : (
          c.purpose && <p className={s.purpose}>{c.purpose}</p>
        )}

        {c.exact && (
          <figure className={s.exact}>
            <figcaption className="sr-only">Exact text, verbatim from the source</figcaption>
            {mono ? <pre className={s.exactMono}>{c.exact}</pre> : <blockquote className={`quote ${s.exactQuote}`}>{c.exact}</blockquote>}
          </figure>
        )}
        {ev?.quote && !quoteIsExact && (
          <figure className={s.evQuote} data-method={ev.method}>
            <figcaption className="sr-only">{ai ? 'AI wording, not checked against the audio' : ev.method === 'creator_metadata' ? 'Creator’s words' : ev.method === 'user_supplied' ? 'Your words' : 'Source words'}</figcaption>
            <blockquote>{ev.quote}</blockquote>
          </figure>
        )}

        <div className={s.evLine}>
          <EvidenceTag evidence={ev} />
          {onShowEvidence && ev && !ev.t && (
            <button type="button" className={s.linkBtn} onClick={onShowEvidence}>Show in source</button>
          )}
        </div>

        {ev?.t && (
          <div className={s.moment}>
            {onShowEvidence ? (
              <button type="button" className={s.momentChip} data-method={ev.method} data-confirmed={ev.confirmed || undefined} onClick={onShowEvidence} title={ev.locator || undefined}
                aria-label={`Moment ${momentRange(c)}: show in chapters`}>
                <Play aria-hidden /><span>{momentRange(c)}</span>
              </button>
            ) : (
              <span className={s.momentChip} data-method={ev.method} data-confirmed={ev.confirmed || undefined}><Play aria-hidden /><span>{momentRange(c)}</span></span>
            )}
            {ai && !ev.confirmed && <button type="button" className="btn sm" onClick={onConfirm} title="AI picked this moment"><Check aria-hidden />Confirm moment</button>}
          </div>
        )}

        {c.cautions?.map((k, i) => {
          const { label, Icon } = cautionLabel(k.kind);
          return (
            <div key={i} className={s.caution} role="note">
              <span className="tag warn"><Icon aria-hidden />{label}</span>
              <p>{k.text}</p>
            </div>
          );
        })}
        {c.note && <p className={s.note}>{c.note}</p>}
        {afterBody}
      </div>
    </article>
  );
}

/* Inline edit: title (required, ≤ 200) and summary (≤ 600). Unchanged values record nothing (AUD-04). */
function EditForm({ c, onDone, registerEdit }: {
  c: Candidate; onDone: (change: { title: string; purpose: string } | null) => void; registerEdit: (api: EditApi | null) => void;
}) {
  const uid = useId();
  const [title, setTitle] = useState(c.title);
  const [purpose, setPurpose] = useState(c.purpose ?? '');
  const [errors, setErrors] = useState<{ title?: string; purpose?: string }>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const purposeRef = useRef<HTMLTextAreaElement>(null);
  const latest = useRef({ title, purpose });
  latest.current = { title, purpose };

  const validate = () => {
    const t = latest.current.title.trim(), p = latest.current.purpose.trim();
    const e: typeof errors = {};
    if (!t) e.title = 'Give it a title.';
    else if (t.length > TITLE_MAX) e.title = `Keep the title under ${TITLE_MAX} characters (now ${t.length}).`;
    if (p.length > PURPOSE_MAX) e.purpose = `Keep the summary under ${PURPOSE_MAX} characters (now ${p.length}).`;
    setErrors(e);
    if (e.title) titleRef.current?.focus(); else if (e.purpose) purposeRef.current?.focus();
    return !e.title && !e.purpose ? { title: t, purpose: p } : null;
  };
  const submit = () => {
    const v = validate();
    if (!v) return false;
    onDone(v);
    return true;
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
    registerEdit({ submit: () => submitRef.current() });
    return () => registerEdit(null);
  }, [registerEdit]);

  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit(); };
  return (
    <form className={s.edit} onSubmit={onSubmit} noValidate onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onDone(null); } }}>
      <div className="field">
        <label htmlFor={`${uid}-title`}>Title</label>
        <input id={`${uid}-title`} ref={titleRef} className="input" value={title} maxLength={TITLE_MAX + 50}
          onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(x => ({ ...x, title: undefined })); }}
          aria-invalid={!!errors.title} aria-describedby={errors.title ? `${uid}-terr` : undefined} />
        {errors.title && <span id={`${uid}-terr`} className="error-text" role="alert">{errors.title}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${uid}-purpose`}>Summary <span className="muted">(optional)</span></label>
        <textarea id={`${uid}-purpose`} ref={purposeRef} className="textarea" rows={2} value={purpose}
          onChange={e => { setPurpose(e.target.value); if (errors.purpose) setErrors(x => ({ ...x, purpose: undefined })); }}
          aria-invalid={!!errors.purpose} aria-describedby={errors.purpose ? `${uid}-perr` : `${uid}-pcount`} />
        {errors.purpose
          ? <span id={`${uid}-perr`} className="error-text" role="alert">{errors.purpose}</span>
          : <span id={`${uid}-pcount`} className="hint">{purpose.trim().length} / {PURPOSE_MAX}</span>}
      </div>
      <div className={s.editActions}>
        <button type="submit" className="btn primary sm">Save edit</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(null)}>Cancel</button>
        <span className="hint">Esc cancels</span>
      </div>
    </form>
  );
}
