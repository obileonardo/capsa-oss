'use client';
/* Track C review tools (25 Oct):
 *   - FindMenu: a find's ⋯ menu: Merge with next, Split…, Unmerge (REV-04), each with Undo in the toast
 *   - SplitDialog: pick the line the second part starts on
 *   - SkipReasons: optional reason chips on a find marked to skip (REV-09), kept on this device
 *   - WhyPanel: why each find was picked, and what the rules left out (XEV-12), collapsed by default
 *   - SensitiveRow: secrets or personal data in this source, with Mask (XEV-15) */
import { MoreHorizontal, ShieldAlert } from '@/components/ui/icons';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Dialog, useOutsideClose, useToast } from '@/components/ui';
import { leftOut } from '@/lib/capture/extract';
import { sensitiveSummary } from '@/lib/capture/sensitive';
import { maskSource, mergeCandidates, sensitiveIn, setSkipReason, splitCandidate, unmergeCandidate } from '@/lib/store';
import type { Candidate, Source } from '@/lib/types';
import { plural } from '@/components/inbox/model';
import s from './review.module.css';

/* ---------- ⋯ menu: merge, split, unmerge ---------- */
export function FindMenu({ src, c, next, say }: { src: Source; c: Candidate; next?: Candidate; say: (m: string) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const lines = (c.exact ?? '').split('\n').filter(l => l.trim()).length;

  const merge = () => {
    close();
    if (!next) return;
    const r = mergeCandidates(src.id, c.id, next.id);
    if (typeof r === 'string') { toast({ message: r }); return; }
    say(`Merged “${c.title}” and “${next.title}”`);
    toast({ message: 'Merged 2 finds', tone: 'ok', action: { label: 'Undo', run: r.undo } });
  };
  const unmerge = () => {
    close();
    const undo = unmergeCandidate(src.id, c.id);
    if (!undo) return;
    say(`Unmerged into ${c.mergedFrom?.length ?? 2} finds`);
    toast({ message: `Back to ${plural(c.mergedFrom?.length ?? 2, 'find')}`, tone: 'ok', action: { label: 'Undo', run: undo } });
  };
  return (
    <span className={s.findMenu} ref={wrap}>
      <button ref={btn} type="button" className="btn ghost icon sm" aria-haspopup="menu" aria-expanded={open} aria-label={`More for “${c.title}”`} title="Merge or split"
        onClick={() => setOpen(o => !o)}><MoreHorizontal aria-hidden /></button>
      {open && (
        <div className={`menu ${s.findPop}`} role="menu" aria-label={`More for “${c.title}”`}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus(); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')];
              const k = items.indexOf(document.activeElement as HTMLButtonElement);
              items[(k + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
            }
          }}>
          <button type="button" role="menuitem" onClick={merge} disabled={!next} autoFocus={!!next} title={next ? `With “${next.title}”` : 'This is the last find'}>Merge with next</button>
          <button type="button" role="menuitem" onClick={() => { close(); setSplitting(true); }} disabled={lines < 2} autoFocus={!next && lines >= 2} title={lines < 2 ? 'Only one line' : undefined}>Split…</button>
          {c.mergedFrom?.length ? <button type="button" role="menuitem" onClick={unmerge}>Unmerge</button> : null}
        </div>
      )}
      {splitting && <SplitDialog src={src} c={c} onClose={() => { setSplitting(false); requestAnimationFrame(() => btn.current?.focus()); }} say={say} />}
    </span>
  );
}

/** Line starts in the exact words where a split can go (never before the first line). */
function splitPoints(t: string): { at: number; line: number; text: string; para: boolean }[] {
  const out: { at: number; line: number; text: string; para: boolean }[] = [];
  let pos = 0, n = 0, blank = false, seen = false;
  for (const l of t.split('\n')) {
    n++;
    if (l.trim()) {
      if (seen) out.push({ at: pos, line: n, text: l.trim(), para: blank });
      seen = true; blank = false;
    } else blank = true;
    pos += l.length + 1;
  }
  return out;
}

function SplitDialog({ src, c, onClose, say }: { src: Source; c: Candidate; onClose: () => void; say: (m: string) => void }) {
  const toast = useToast();
  const uid = useId();
  const points = useMemo(() => splitPoints(c.exact ?? ''), [c.exact]);
  const [at, setAt] = useState(() => (points.find(p => p.para) ?? points[0])?.at ?? 0);
  const t = c.exact ?? '';
  const run = () => {
    const r = splitCandidate(src.id, c.id, at);
    onClose();
    if (typeof r === 'string') { toast({ message: r }); return; }
    say(`Split “${c.title}” into 2 finds`);
    toast({ message: 'Split into 2 finds', tone: 'ok', action: { label: 'Undo', run: r.undo } });
  };
  return (
    <Dialog open onClose={onClose} title={`Split “${c.title}”`} size="lg"
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={run}>Split</button></>}>
      <fieldset className={s.splitList}>
        <legend className="sr-only">The second part starts at</legend>
        {points.map(p => (
          <label key={p.at} className={s.splitOpt} data-on={p.at === at || undefined}>
            <input type="radio" name={`${uid}-at`} checked={p.at === at} onChange={() => setAt(p.at)} />
            <span className="mono">{p.line}</span><span className={s.splitText}>{p.text}</span>
          </label>
        ))}
      </fieldset>
      <div className={s.splitPreview} aria-label="Preview">
        <pre>{t.slice(0, at).replace(/\s+$/, '')}</pre>
        <pre>{t.slice(at).trim()}</pre>
      </div>
    </Dialog>
  );
}

/* ---------- skip reasons ---------- */
export const SKIP_REASONS = ['Not useful', 'Already have it', 'Too generic', 'Wrong split', 'Not for me'] as const;
export function SkipReasons({ src, c }: { src: Source; c: Candidate }) {
  const cur = src.skipReasons?.[c.id];
  return (
    <div className={s.reasons} role="group" aria-label={`Why skip “${c.title}”`}>
      <span className={s.reasonsLabel} aria-hidden>Reason</span>
      {SKIP_REASONS.map(r => (
        <button key={r} type="button" className={s.chip} aria-pressed={cur === r} onClick={() => setSkipReason(src.id, c.id, cur === r ? null : r)}>{r}</button>
      ))}
    </div>
  );
}

/* ---------- why these, and what was left out ---------- */
const whyOf = (c: Candidate) => (c.note ?? '').replace(/^Found on this device by simple rules, not AI(?:,? in [^.]+)?\.\s*/, '');
export function WhyPanel({ src, pending }: { src: Source; pending: Candidate[] }) {
  const segs = ((src.segments ?? []) as { id: string; label?: string; text?: string }[]).filter(g => typeof g?.text === 'string');
  const out = useMemo(() => segs.flatMap(g => leftOut(g.text!).parts.map(p => ({ ...p, where: g.label ?? '' }))), [segs]);
  const mentions = useMemo(() => [...new Set(segs.flatMap(g => leftOut(g.text!).mentions))], [segs]);
  if (src.extraction !== 'on_device' || !pending.length) return null;
  const flagged = pending.filter(c => c.cautions?.length).length;
  return (
    <details className={s.why}>
      <summary>Why these{out.length ? ` · ${out.length} left out` : ''}</summary>
      <ul className={s.whyList} aria-label="Why each was found">
        {pending.map(c => <li key={c.id}><b>{c.title}</b><span>{whyOf(c) || 'Picked by you'}</span></li>)}
      </ul>
      {out.length > 0 && (
        <ul className={s.whyList} aria-label="Left out">
          {out.map((p, i) => <li key={i} data-out><b>{p.where && segs.length > 1 ? `${p.where}, ` : ''}{p.locator}</b><span>{p.reason}: “{p.text}”</span></li>)}
        </ul>
      )}
      {mentions.length > 0 && <p className={s.whyLine}>Mentioned only: {mentions.join(', ')}</p>}
      <p className={s.whyLine}>Caution rules: {flagged ? `${plural(flagged, 'find')} flagged` : 'none matched'}</p>
    </details>
  );
}

/* ---------- secrets and personal data ---------- */
export function SensitiveRow({ src }: { src: Source }) {
  const toast = useToast();
  const groups = useMemo(() => sensitiveSummary(sensitiveIn(src)), [src]);
  if (!groups.length) return null;
  const n = groups.reduce((a, g) => a + g.count, 0);
  const mask = () => {
    const r = maskSource(src.id);
    if (!r?.count) return;
    toast({ message: `Masked ${r.count}`, tone: 'ok', action: { label: 'Undo', run: r.undo } });
  };
  return (
    <div className={s.sensitive} role="note">
      <ShieldAlert aria-hidden />
      <span><b>{n === 1 ? 'Looks like 1 secret or piece of personal data' : `Looks like ${n} secrets or pieces of personal data`}</b>{' '}
        <span className={s.sensitiveWhat}>{groups.map(g => `${g.label}${g.count > 1 ? ` ×${g.count}` : ''}`).join(', ')}</span></span>
      <span className="spacer" />
      <button type="button" className="btn sm" onClick={mask}>Mask</button>
    </div>
  );
}
