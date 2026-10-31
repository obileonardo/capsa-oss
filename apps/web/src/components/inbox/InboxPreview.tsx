'use client';
/* The selected Inbox source, reviewed in the right panel (Stage 3, mockup inbox.html): meta line, serif title, status
 * badges, the candidates with keep checkboxes, Elicit's "Evidence n of N" card with the exact words highlighted in the
 * stored text, where kept items go, and Save / Open full review / Delete. Other states say plainly what's waiting. */
import { Check, ChevronLeft, ChevronRight, ExternalLink, Folder, Trash2 } from '@/components/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DemoTag, EvidenceTag, Kbd, TypeTag, useToast } from '@/components/ui';
import { KIND_LABEL, relTime, STATUS_LABEL } from '@/lib/format';
import { fileCandidates, isSnoozed, pendingCandidates, useAppState } from '@/lib/store';
import { untilLabel } from './snooze';
import type { Candidate, Source } from '@/lib/types';
import { BADGE_TONE, byline, groupOf, isAwaitingService, KIND_ICON, NOTHING_REASON, plural, reasonLine, reviewCounts } from './model';
import p from '@/components/shell/page.module.css';
import s from './inbox.module.css';
import { keptByDefault, setKeep, useKeep } from './keep';
import { refuseDelete } from './moves';
import { useDeleteSource } from './useDeleteSource';


/** A window of the stored text around the quote, with the quote marked; null when the quote isn't in the stored text. */
function excerpt(src: Source, c?: Candidate): { label: string; before: string; hit: string; after: string } | null {
  const q = c?.evidence?.quote;
  if (!q) return null;
  const segs = ((src.segments ?? []) as { id?: string; label?: string; text?: string }[]).filter(x => typeof x?.text === 'string');
  const all = [...segs, ...(src.description ? [{ label: 'Description', text: src.description }] : [])];
  for (const g of all) {
    const i = g.text!.indexOf(q);
    if (i < 0) continue;
    const a = Math.max(0, i - 160), b = Math.min(g.text!.length, i + q.length + 160);
    return { label: g.label ?? 'Stored text', before: (a > 0 ? '…' : '') + g.text!.slice(a, i), hit: q, after: g.text!.slice(i + q.length, b) + (b < g.text!.length ? '…' : '') };
  }
  return null;
}

export default function InboxPreview({ src }: { src: Source }) {
  const { state } = useAppState();
  const toast = useToast();
  const router = useRouter();
  const Icon = KIND_ICON[src.kind];
  const group = groupOf(src);
  const pending = pendingCandidates(src);
  const keep = useKeep(src.id); // shared with the board's drag and drop: Done files what is ticked here
  const [idx, setIdx] = useState(0);
  const isKept = (c: Candidate) => keep[c.id] ?? keptByDefault(c);
  const withEvidence = useMemo(() => pending.filter(c => c.evidence), [pending]);
  const active = withEvidence[Math.min(idx, Math.max(0, withEvidence.length - 1))];
  const ex = excerpt(src, active);
  const keptN = pending.filter(isKept).length;
  const kept = state.artifacts.filter(a => a.sourceId === src.id);
  const dest = [
    ...(src.target?.collections ?? []).map(id => state.collections.find(c => c.id === id)?.name),
    ...(src.target?.projects ?? []).map(id => state.projects.find(x => x.id === id)?.name),
  ].filter(Boolean) as string[];

  const save = () => {
    const ids = pending.filter(isKept).map(c => c.id);
    if (!ids.length) return;
    const undo = fileCandidates(src.id, ids);
    if (!undo) return;
    toast({ message: `Saved ${ids.length} to Library${pending.length - ids.length ? ` · ${pending.length - ids.length} skipped` : ''}`, tone: 'ok', action: { label: 'Undo', run: undo }, duration: 10000 });
  };
  // Done items can't be deleted (no button); Processing asks first (it stops)
  const { request: requestDelete, dialog: deleteDialog } = useDeleteSource();
  const remove = () => { requestDelete(src); };
  const delBtn = refuseDelete(src) ? null
    : <button type="button" className="btn icon" onClick={remove} aria-label="Delete source" title="Delete source (Undo in the toast)"><Trash2 aria-hidden /></button>;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ']' && withEvidence.length) { e.preventDefault(); setIdx(i => Math.min(withEvidence.length - 1, i + 1)); }
    if (e.key === '[' && withEvidence.length) { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
  };

  return (
    <div className={p.pin} onKeyDown={onKey}>
      <p className={p.pm}>
        <Icon aria-hidden />{KIND_LABEL[src.kind]}{byline(src) ? ` · ${byline(src)}` : ''} · saved {relTime(src.savedAt)}
        {src.demo && <DemoTag />}
      </p>
      <h2 className={p.pt}>{src.title}</h2>
      <div className={p.badges} style={{ marginTop: 0 }}>
        <span className={p.badge} data-tone={BADGE_TONE[src.status]}>{STATUS_LABEL[src.status]}</span>
        {isSnoozed(src) && <span className={p.badge} data-tone="faint">Snoozed until {untilLabel(src.snoozedUntil!)}</span>}
        {src.extraction === 'on_device' && group === 'review' && <span className={p.badge} data-tone="ok">Found on this device, not AI</span>}
        {pending.some(c => c.evidence?.method === 'ai_located') && group === 'review' && (
          <span className={p.badge} data-tone="ai">{pending.filter(c => c.evidence?.method === 'ai_located').length} found by AI</span>
        )}
        {src.url && (
          <a href={src.url} target="_blank" rel="noopener noreferrer" className={s.pvLink}>
            {src.displayUrl ?? src.url}<ExternalLink aria-hidden /><span className="sr-only"> (opens the original in a new tab)</span>
          </a>
        )}
      </div>

      {group === 'review' ? (
        <>
          <div className={s.cands}>
            <div className={s.sechead}>
              <h3 className={p.eyebrow}>{pending.length} found</h3>
              <span className="spacer" />
              <button type="button" className="btn ghost sm" data-press="keep" onClick={() => pending.forEach(c => setKeep(src.id, c.id, true))}>Keep all</button>
              <button type="button" className="btn ghost sm" data-press="skip" onClick={() => pending.forEach(c => setKeep(src.id, c.id, false))}>Skip all</button>
            </div>
            <ul className={s.candList}>
              {pending.map(c => (
                <li key={c.id} className={s.cand} data-on={c.id === active?.id}>
                  <label className={s.candCheck}>
                    <input type="checkbox" checked={isKept(c)} onChange={e => setKeep(src.id, c.id, e.target.checked)} aria-label={`Keep “${c.title}”`} />
                  </label>
                  <TypeTag type={c.type} />
                  <button type="button" className={s.candTitle} onClick={() => { const i = withEvidence.indexOf(c); if (i >= 0) setIdx(i); }}
                    aria-label={`${c.title}: show its evidence`}>{c.title}</button>
                  {c.evidence?.locator && <span className={s.candWhere}>{c.evidence.locator.replace(/^from what you pasted,? ?/, '') || 'pasted'}</span>}
                </li>
              ))}
            </ul>
          </div>

          {active && (
            <section className={s.evc} aria-label="Where it came from">
              <div className={s.evtop}>
                <span className={s.evof} aria-live="polite">Where it came from · <b>{withEvidence.indexOf(active) + 1}</b> of {withEvidence.length}</span>
                <span className="spacer" />
                <button type="button" className="btn sm" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={withEvidence.indexOf(active) === 0} aria-keyshortcuts="[">
                  <ChevronLeft aria-hidden />Previous <kbd className="kbd" aria-hidden>[</kbd>
                </button>
                <button type="button" className="btn sm" onClick={() => setIdx(i => Math.min(withEvidence.length - 1, i + 1))} disabled={withEvidence.indexOf(active) >= withEvidence.length - 1} aria-keyshortcuts="]">
                  Next <kbd className="kbd" aria-hidden>]</kbd><ChevronRight aria-hidden />
                </button>
              </div>
              <p className={s.evfor}><TypeTag type={active.type} /><span>{active.title}</span></p>
              <p className={s.evhow}><EvidenceTag evidence={active.evidence} /></p>
              {ex ? (
                <pre className={s.srctext}><span className={p.eyebrow}>{ex.label}</span>{ex.before}<mark>{ex.hit}</mark>{ex.after}</pre>
              ) : active.evidence?.quote ? (
                <blockquote className={`quote ${s.evquote}`}>{active.evidence.quote}</blockquote>
              ) : null}
            </section>
          )}
          {dest.length > 0 && <p className={s.dest} title="Chosen in the capture box"><Folder aria-hidden /><span className="sr-only">Kept items go to </span><span><b>Library</b>, <b>{dest.join(', ')}</b></span></p>}
          <div className={p.acts}>
            <button type="button" className="btn primary" onClick={save} disabled={!keptN}>{keptN ? `Save ${keptN} to Library` : 'Nothing marked to keep'}</button>
            <button type="button" className="btn" onClick={() => router.push(`/inbox/${src.id}`)}>Open full review <span aria-hidden><Kbd>↵</Kbd></span></button>
            {delBtn}
          </div>
        </>
      ) : (
        <>
          <div className={p.box}>
            <h3>{reasonLine(src)}</h3>
            {src.status === 'nothing' && <p>{NOTHING_REASON[src.nothingReason ?? '']?.body ?? 'No prompts, tools or steps were found to keep.'}</p>}
            {src.status === 'failed' && <p>Your link is saved.</p>}
            {src.status === 'needs_thread' && <p>Capsa read this post only.</p>}
            {isAwaitingService(src) && src.kind === 'github' && <p>Nothing has been sent to GitHub. Reading is off in Settings.</p>}
            {isAwaitingService(src) && src.kind !== 'github' && <p>The extraction service isn’t connected in this version.</p>}
            {(src.status === 'queued' || src.status === 'processing') && src.demo && <p>The extraction service isn’t connected in this version.</p>}
            {/* the heading already says what was kept ("1 resource kept", "Link only, nothing kept"); add only what it can't */}
            {group === 'done' && !kept.length && reviewCounts(src).kept > 0 && <p>In an earlier review.</p>}
          </div>
          {src.minimalQuote && (
            <figure className={s.pvQuote}><figcaption className={p.eyebrow}>{src.kind === 'manual' ? 'Your text' : 'Stored quote'}</figcaption><blockquote className="quote">{src.minimalQuote}</blockquote></figure>
          )}
          {!src.demo && src.description && (
            <figure className={s.pvQuote}><figcaption className={p.eyebrow}>Your note</figcaption><blockquote className="quote">{src.description}</blockquote></figure>
          )}
          {group === 'done' && kept.length > 0 && (
            <ul className={s.pvKept} aria-label="Kept from this source">
              {kept.map(a => <li key={a.id}><Link href={`/library/${a.id}`}><TypeTag type={a.type} /><span>{a.title}</span><Check aria-hidden /></Link></li>)}
            </ul>
          )}
          <div className={p.acts}>
            <button type="button" className="btn primary" onClick={() => router.push(`/inbox/${src.id}`)}>
              {src.status === 'needs_thread' || src.status === 'failed' ? 'Open and paste the text' : group === 'done' ? 'Open summary' : 'Open'} <span aria-hidden><Kbd>↵</Kbd></span>
            </button>
            {delBtn}
          </div>
        </>
      )}
      {deleteDialog}
    </div>
  );
}
