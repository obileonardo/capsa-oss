'use client';
/* The review board: one staging state, three views (List, Bench, Focus), one commit bar.
 * Stage, then commit (Google Photos): Keep/Skip only change the staging; nothing is filed until Save. */
import { ChevronDown, Info, TriangleAlert } from '@/components/ui/icons';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '@/components/shell/AppShell';
import { useMedia } from '@/components/inbox/useMedia';
import pk from '@/components/shell/page.module.css';
import { EvidenceTag, TypeTag, useToast } from '@/components/ui';
import { plural } from '@/components/inbox/model';
import { dialogOpen, isTypingTarget, prefersReducedMotion } from '@/components/inbox/useMedia';
import { confirmMoment, getState, updateCandidate } from '@/lib/store';
import type { Candidate, Source } from '@/lib/types';
import CandidateCard, { momentRange, type EditApi } from './CandidateCard';
import SourcePane from './SourcePane';
import { FindMenu, SensitiveRow, SkipReasons, WhyPanel } from './FindTools';
import { matches } from '@/lib/shortcuts';
import { useBinding } from '@/lib/useBinding';
import type { Staging, View } from './SourceReview';
import s from './review.module.css';

interface Props {
  src: Source; pending: Candidate[]; view: View; staging: Staging; setStaging: Dispatch<SetStateAction<Staging>>;
  onCommit: (ids: string[], total: number) => boolean; onLinkOnly: () => void; say: (m: string) => void;
  focusOnMount: boolean; onFocused: () => void;
}

export default function ReviewBoard({ src, pending, view, staging, setStaging, onCommit, onLinkOnly, say, focusOnMount, onFocused }: Props) {
  const toast = useToast();
  const { asideSlot } = useShell();
  const docked = useMedia('(min-width: 1100px)') && !!asideSlot; // the evidence lives in the shell's right panel
  // AI-located candidates start unselected until their moment is confirmed (DESIGN_DECISIONS §3); checkable ones start selected.
  const isKept = useCallback((c: Candidate) => staging.keep[c.id] ?? (c.defaultSelected !== false && (c.evidence?.method !== 'ai_located' || !!c.evidence.confirmed)), [staging.keep]);
  const keptIds = pending.filter(isKept).map(c => c.id);
  const decidedCount = pending.filter(c => staging.decided[c.id]).length;
  const evidenceList = useMemo(() => pending.filter(c => c.evidence), [pending]);

  const [activeId, setActiveId] = useState<string | undefined>(evidenceList[0]?.id);
  const activeIdx = Math.max(0, evidenceList.findIndex(c => c.id === activeId));
  const active = evidenceList[activeIdx];
  const [idx, setIdx] = useState(() => { const k = pending.findIndex(c => !staging.decided[c.id]); return k < 0 ? 0 : k; });
  const cur = Math.min(idx, pending.length);
  const [editing, setEditing] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, true>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const editApi = useRef<EditApi | null>(null);
  const committing = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const kept = keptIds.length, skip = pending.length - kept;
  const keepKey = useBinding('reviewKeep'), skipKey = useBinding('reviewSkip');

  useEffect(() => { if (focusOnMount) { heading.current?.focus(); onFocused(); } }, [focusOnMount, onFocused]);

  const setKeep = useCallback((c: Candidate, v: boolean) => {
    setStaging(st => ({ keep: { ...st.keep, [c.id]: v }, decided: { ...st.decided, [c.id]: true } }));
  }, [setStaging]);
  const setAll = (v: boolean) => setStaging(st => ({
    keep: { ...st.keep, ...Object.fromEntries(pending.map(c => [c.id, v])) },
    decided: { ...st.decided, ...Object.fromEntries(pending.map(c => [c.id, true])) },
  }));

  const activate = useCallback((cid: string) => {
    setActiveId(cid);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${CSS.escape(cid)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
  }, []);
  const step = useCallback((d: number) => {
    const j = Math.max(0, Math.min(evidenceList.length - 1, activeIdx + d));
    if (j === activeIdx || !evidenceList[j]) return;
    activate(evidenceList[j].id);
    say(`Evidence ${j + 1} of ${evidenceList.length}: ${evidenceList[j].title}`);
  }, [activeIdx, evidenceList, activate, say]);

  const commit = useCallback(() => {
    if (committing.current) return;                          // a double-click files once (AUD-01, plus the store guard)
    if (editApi.current && !editApi.current.submit()) return; // ⌘↵ during an edit saves the edit first (AUD-09)
    const fresh = getState().sources.find(x => x.id === src.id);
    if (!fresh || fresh.status !== 'review') return;
    const ids = pending.filter(isKept).map(c => c.id);
    if (!ids.length) { say('Nothing is marked to keep.'); return; }
    committing.current = true;
    if (!onCommit(ids, pending.length)) committing.current = false;
  }, [pending, isKept, onCommit, src.id, say]);

  const confirm = useCallback((c: Candidate) => {
    const prev = c.evidence;
    confirmMoment(src.id, c.id);
    setStaging(st => ({ ...st, keep: { ...st.keep, [c.id]: true } }));
    toast({
      message: `Moment ${c.evidence?.t ?? ''} confirmed. The wording is still unchecked.`, tone: 'ok',
      action: { label: 'Undo', run: () => updateCandidate(src.id, c.id, { evidence: prev }) },
    });
  }, [src.id, toast, setStaging]);

  const editDone = useCallback((c: Candidate, change: { title: string; purpose: string } | null) => {
    setEditing(null);
    editApi.current = null;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${CSS.escape(c.id)}"] [aria-label^="Edit title"]`)?.focus());
    if (!change) return;
    const prev = { title: c.title, purpose: c.purpose ?? '' };
    const next = { title: change.title, purpose: change.purpose };
    if (!updateCandidate(src.id, c.id, next)) return; // nothing changed: nothing recorded (AUD-04)
    setEdited(e => ({ ...e, [c.id]: true }));
    toast({ message: 'Edit saved', tone: 'ok', action: { label: 'Undo', run: () => { updateCandidate(src.id, c.id, prev); setEdited(e => { const n = { ...e }; delete n[c.id]; return n; }); } } });
  }, [src.id, toast]);
  const registerEdit = useCallback((api: EditApi | null) => { editApi.current = api; }, []);

  // Focus view decisions
  const decide = useCallback((v: boolean) => {
    const c = pending[cur];
    if (!c) return;
    setKeep(c, v);
    const left = pending.filter(x => x.id !== c.id && !staging.decided[x.id]).length;
    say(`${v ? 'Keep' : 'Skip'}: ${c.title}. ${decidedCount + (staging.decided[c.id] ? 0 : 1)} of ${pending.length} decided${left ? '' : '. All decided, press Save when ready'}.`);
    setIdx(cur + 1);
  }, [pending, cur, setKeep, staging.decided, decidedCount, say]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); return; }
      if (e.defaultPrevented || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (view === 'bench' && (e.key === '[' || e.key === ']')) { e.preventDefault(); step(e.key === ']' ? 1 : -1); return; }
      if (view !== 'focus' || editing) return;
      if (matches(e, keepKey.binding)) { e.preventDefault(); decide(true); } // THM-07: changeable in Settings
      else if (matches(e, skipKey.binding)) { e.preventDefault(); decide(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIdx(Math.min(pending.length, cur + 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx(Math.max(0, cur - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, commit, step, decide, editing, pending.length, cur, keepKey.binding, skipKey.binding]);

  const card = (c: Candidate, variant: 'bench' | 'focus' | 'inline') => (
    <CandidateCard c={c} kept={isKept(c)} active={variant === 'bench' && c.id === active?.id} edited={!!edited[c.id]}
      editing={editing === c.id} variant={variant}
      onKeep={v => setKeep(c, v)} onShowEvidence={variant === 'bench' ? () => setActiveId(c.id) : undefined}
      onConfirm={() => confirm(c)} onEdit={() => setEditing(c.id)} onEditDone={ch => editDone(c, ch)} registerEdit={registerEdit}
      tools={<FindMenu src={src} c={c} next={pending[pending.findIndex(x => x.id === c.id) + 1]} say={say} />}
      afterBody={!isKept(c) ? <SkipReasons src={src} c={c} /> : undefined} />
  );

  const alreadyKept = src.keptIds?.length ?? 0;
  const intro = (
    <div className={s.intro}>
      <div className={pk.secHead}>
        <h2 ref={heading} tabIndex={-1}>{pending.length} found to review</h2>
        {view !== 'focus' && (
          <span className={pk.secActions}>
            <button type="button" className="btn ghost sm" data-press="keep" onClick={() => setAll(true)}>Keep all</button>
            <button type="button" className="btn ghost sm" data-press="skip" onClick={() => setAll(false)}>Skip all</button>
          </span>
        )}
      </div>
      <SensitiveRow src={src} />
      <WhyPanel src={src} pending={pending} />
      {alreadyKept > 0 && <p className={s.teach}>{plural(alreadyKept, 'resource')} from this source {alreadyKept === 1 ? 'is' : 'are'} already in your <Link href="/library" className={s.inlineLink}>Library</Link>.</p>}
    </div>
  );

  const bar = <CommitBar kept={kept} skip={skip} total={pending.length} onSave={commit} onLinkOnly={onLinkOnly} view={view} />;

  const pane = (cls: string) => (
    <aside className={cls} ref={paneRef} aria-label="Source and where it came from">
      <SourcePane src={src} cands={evidenceList} activeId={active?.id} onActivate={activate} scrollRef={paneRef}
        stepper={evidenceList.length ? { index: activeIdx, total: evidenceList.length, prev: () => step(-1), next: () => step(1) } : undefined} />
    </aside>
  );

  if (view === 'bench') {
    return (
      <div className={s.bench} data-docked={docked}>
        <div className={s.benchMain}>
          {intro}
          <ol className={s.cards}>{pending.map(c => <li key={c.id} data-card={c.id}>{card(c, 'bench')}</li>)}</ol>
          {bar}
        </div>
        {docked ? createPortal(pane(`${pk.panel} ${s.dockPane}`), asideSlot!) : pane(s.benchPane)}
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div className={s.listWrap}>
        {intro}
        <ul className={s.rows}>
          {pending.map(c => {
            const open = expanded === c.id;
            const k = isKept(c);
            return (
              <li key={c.id} data-card={c.id} className={s.rowItem} data-kept={k} data-open={open}>
                <div className={s.lrow}>
                  <label className={s.check}><input type="checkbox" checked={k} onChange={e => setKeep(c, e.target.checked)} aria-label={`Keep “${c.title}”`} /></label>
                  <button type="button" className={s.lrowMain} aria-expanded={open} aria-controls={`lr-${c.id}`} onClick={() => setExpanded(open ? null : c.id)}>
                    <span className={s.lrowTop}>
                      <TypeTag type={c.type} />
                      <span className={s.lrowTitle}>{c.title}</span>
                      {c.cautions?.length ? <span className="tag warn"><TriangleAlert aria-hidden />Caution</span> : null}
                      {!k && <span className={`tag neutral ${s.skipTag}`}>Will skip</span>}
                    </span>
                    <span className={s.lrowQuote}>{c.exact ?? c.evidence?.quote ?? c.purpose}</span>
                    <span className={s.lrowEv}><EvidenceTag evidence={c.evidence} />{c.evidence?.t && <span className="mono">{momentRange(c)}</span>}</span>
                  </button>
                  <ChevronDown aria-hidden className={s.lrowChev} data-open={open} />
                </div>
                {open && <div id={`lr-${c.id}`} className={s.lrowDetail}>{card(c, 'inline')}</div>}
              </li>
            );
          })}
        </ul>
        {bar}
      </div>
    );
  }

  // Focus: one card at a time
  const c = pending[cur];
  return (
    <div className={s.focus}>
      {intro}
      <div className={s.progress}>
        <div className={s.progressTop}>
          <span><b>{decidedCount}</b> of {pending.length} decided</span>
          <span className={s.progressCur}>{c ? `Card ${cur + 1} of ${pending.length}` : 'Summary'}</span>
        </div>
        <div className={s.meter} role="progressbar" aria-label="Candidates decided" aria-valuemin={0} aria-valuemax={pending.length} aria-valuenow={decidedCount}
          aria-valuetext={`${decidedCount} of ${pending.length} decided`}>
          <span style={{ width: `${(decidedCount / Math.max(1, pending.length)) * 100}%` }} />
        </div>
        <div className={s.dots} role="group" aria-label="Go to a find">
          {pending.map((x, i) => {
            const st = staging.decided[x.id] ? (isKept(x) ? 'keep' : 'skip') : 'open';
            return (
              <button key={x.id} type="button" className={s.dot} data-state={st} aria-current={i === cur ? 'step' : undefined} onClick={() => setIdx(i)}
                aria-label={`${i + 1} of ${pending.length}: ${x.title}, ${st === 'keep' ? 'keep' : st === 'skip' ? 'skip' : 'not decided'}`}><span /></button>
            );
          })}
          <button type="button" className={s.dot} data-state="end" aria-current={cur === pending.length ? 'step' : undefined} onClick={() => setIdx(pending.length)} aria-label="Summary"><span /></button>
        </div>
      </div>

      {c ? (
        <>
          <div className={s.focusCard} key={c.id}>{card(c, 'focus')}</div>
          <div className={s.focusActions}>
            <button type="button" className="btn ghost" onClick={() => setIdx(Math.max(0, cur - 1))} disabled={cur === 0} aria-label="Previous find" aria-keyshortcuts="ArrowLeft">
              <span aria-hidden>←</span><span className={s.hideSm}> Previous</span>
            </button>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => decide(false)} aria-keyshortcuts={skipKey.aria}>Skip <kbd className="kbd" aria-hidden>{skipKey.label}</kbd></button>
            <button type="button" className="btn primary" onClick={() => decide(true)} aria-keyshortcuts={keepKey.aria}>Keep <kbd className="kbd" aria-hidden>{keepKey.label}</kbd></button>
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={() => setIdx(Math.min(pending.length, cur + 1))} aria-label="Next find" aria-keyshortcuts="ArrowRight">
              <span className={s.hideSm}>Next </span><span aria-hidden>→</span>
            </button>
          </div>
          <details className={s.where}>
            <summary>Where it came from</summary>
            <SourcePane src={src} cands={evidenceList} activeId={c.id} onActivate={() => {}} />
          </details>
        </>
      ) : (
        <div className={s.summary}>
          <h3>All {pending.length} seen</h3>
          <p>{kept} to keep · {skip} to skip</p>
          <button type="button" className="btn" onClick={() => setIdx(0)}>Go through again</button>
        </div>
      )}
      {bar}
    </div>
  );
}

function CommitBar({ kept, skip, total, onSave, onLinkOnly, view }: { kept: number; skip: number; total: number; onSave: () => void; onLinkOnly: () => void; view: View }) {
  return (
    <div className={s.bar} data-view={view} role="region" aria-label="Save" data-ask-above>
      <p className={s.barCount}>
        <span className={s.roll} aria-hidden><span key={kept}>{kept}</span></span>
        <span className="sr-only">{kept}</span> to keep<span className={s.barSkip}> · {skip} to skip</span>
      </p>
      <span className="spacer" />
      <button type="button" className="btn ghost" onClick={onLinkOnly} aria-label={`Save link only and skip all ${total}`}>
        <span className={s.hideSm}>Save link only</span><span className={s.showSm} aria-hidden>Link only</span>
      </button>
      <button type="button" className="btn primary" onClick={onSave} disabled={kept === 0} aria-keyshortcuts="Meta+Enter Control+Enter"
        aria-label={kept ? `Save ${kept} to Library` : 'Nothing marked to keep'}>
        {kept ? <>Save {kept}<span className={s.hideSm}>to Library</span></> : 'Nothing to save'}
        <span className={s.hideSm} aria-hidden><kbd className="kbd">⌘</kbd><kbd className="kbd">↵</kbd></span>
      </button>
    </div>
  );
}
