'use client';
/* Source review: header, view switch (List / Bench / Focus, Auto by width) and either the review board or an honest outcome.
 * Staging (what to keep) lives here so it survives view switches and an Undo after saving. */
import { glyphFor } from '@/components/ui/BrandIcon';
import { Columns2, ExternalLink, Inbox, Rows3, SquareStack, Wand2, type LucideIcon } from '@/components/ui/icons';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Empty, useToast } from '@/components/ui';
import { DemoNote, PageHead } from '@/components/shell/PageParts';
import { BADGE_TONE, byline, KIND_ICON, markSeen, plural } from '@/components/inbox/model';
import PageTop from '@/components/shell/PageTop';
import pk from '@/components/shell/page.module.css';
import { useMedia } from '@/components/inbox/useMedia';
import { KIND_LABEL, relTime, STATUS_LABEL } from '@/lib/format';
import { fileCandidates, pendingCandidates, saveLinkOnly, setPrefs, sourceById, useAppState } from '@/lib/store';
import type { Prefs, Source } from '@/lib/types';
import Outcome from './Outcome';
import ReviewBoard from './ReviewBoard';
import s from './review.module.css';

export type View = 'list' | 'bench' | 'focus';
export interface Staging { keep: Record<string, boolean>; decided: Record<string, boolean> }
export interface LastAction { kind: 'file' | 'link'; kept: number; skipped: number; undo: () => void }

export default function SourceReview({ sourceId }: { sourceId: string }) {
  const { state } = useAppState();
  const src = sourceById(state, sourceId);
  const toast = useToast();
  const [staging, setStaging] = useState<Staging>({ keep: {}, decided: {} });
  const [last, setLast] = useState<LastAction | null>(null);
  const [announce, setAnnounce] = useState('');
  const [focusIntent, setFocusIntent] = useState<'outcome' | 'board' | null>(null); // AUD-11: every action names its focus target
  const pref = state.prefs.reviewView;
  const view = useResolvedView(pref);

  useEffect(() => { if (src) markSeen(src.id); }, [src]);
  useEffect(() => { if (src) document.title = `${src.title} · Capsa`; }, [src]);

  const say = useCallback((m: string) => { setAnnounce(''); requestAnimationFrame(() => setAnnounce(m)); }, []);

  const runUndo = useCallback((a: LastAction) => {
    let used = false;
    return () => {
      if (used) return;
      used = true;
      a.undo();
      setLast(null);
      setFocusIntent('board');
      toast({ message: a.kind === 'file' ? 'Undone. What was found is back in review.' : 'Undone. Back in review.' });
    };
  }, [toast]);

  const commit = useCallback((ids: string[], total: number) => {
    if (!src) return false;
    const undo = fileCandidates(src.id, ids); // idempotent: returns null on re-entry (AUD-01)
    if (!undo) return false;
    const a: LastAction = { kind: 'file', kept: ids.length, skipped: total - ids.length, undo };
    const once = runUndo(a);
    setLast({ ...a, undo: once });
    setFocusIntent('outcome');
    toast({
      message: `Saved ${ids.length} to Library${a.skipped ? ` · ${a.skipped} skipped` : ''}`,
      tone: 'ok', action: { label: 'Undo', run: once }, duration: 10000,
    });
    return true;
  }, [src, runUndo, toast]);

  const linkOnly = useCallback(() => {
    if (!src) return;
    const n = pendingCandidates(src).length;
    const undo = saveLinkOnly(src.id);
    const a: LastAction = { kind: 'link', kept: 0, skipped: n, undo };
    const once = runUndo(a);
    setLast({ ...a, undo: once });
    setFocusIntent('outcome');
    toast({
      message: n ? `Kept as a link · ${n} skipped, restorable` : 'Kept as a link',
      tone: 'ok', action: { label: 'Undo', run: once }, duration: 10000,
    });
  }, [src, runUndo, toast]);

  if (!src) {
    return (
      <div className={pk.page}>
        <PageTop crumbs={[{ label: 'Inbox', href: '/inbox', icon: glyphFor('inbox', Inbox) }, { label: 'Not found' }]} />
        <div className={pk.body}>
          <Empty icon={Inbox} title="This source isn’t here" action={<Link href="/inbox" className="btn">Back to Inbox</Link>}>
            It may have been deleted, or the link is out of date.
          </Empty>
        </div>
      </div>
    );
  }

  const pending = pendingCandidates(src);
  const reviewing = src.status === 'review' && pending.length > 0;
  const focused = () => setFocusIntent(null);

  return (
    <div className={`${pk.page} ${s.root}`} data-own-nav-toggle>
      <PageTop crumbs={[{ label: 'Inbox', href: '/inbox', icon: glyphFor('inbox', Inbox) }, { label: src.title }]} actions={src.demo ? <DemoNote /> : undefined} />
      <SourceHead src={src} actions={reviewing ? <ViewSwitch pref={pref} view={view} /> : undefined} />
      {reviewing ? (
        <ReviewBoard src={src} pending={pending} view={view} staging={staging} setStaging={setStaging}
          onCommit={commit} onLinkOnly={linkOnly} say={say} focusOnMount={focusIntent === 'board'} onFocused={focused} />
      ) : (
        <Outcome src={src} last={last} focusOnMount={focusIntent === 'outcome'} onFocused={focused} say={say} onLinkOnly={linkOnly} onRestored={() => setFocusIntent('board')} />
      )}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}

function SourceHead({ src, actions }: { src: Source; actions?: ReactNode }) {
  const Icon = KIND_ICON[src.kind];
  const by = byline(src);
  const ai = pendingCandidates(src).filter(c => c.evidence?.method === 'ai_located').length;
  return (
    <header className={s.head}>
      <PageHead title={src.title} actions={actions}
        subtitle={<>
          <span className={s.meta}>
            <Icon aria-hidden /><span>{KIND_LABEL[src.kind]}</span>
            {by && <><span aria-hidden>·</span><span>{by}</span></>}
            {src.duration && <><span aria-hidden>·</span><span className="mono">{src.duration}</span></>}
            <span aria-hidden>·</span>
            <time dateTime={src.savedAt} title={new Date(src.savedAt).toLocaleString('en-GB')}>Saved {relTime(src.savedAt)}</time>
            {src.url ? (
              <><span aria-hidden>·</span><a href={src.url} target="_blank" rel="noopener noreferrer" className={s.origin}>
                <span>{src.displayUrl ?? src.url}</span><ExternalLink aria-hidden /><span className="sr-only"> (opens the original in a new tab)</span>
              </a></>
            ) : src.displayUrl ? <><span aria-hidden>·</span><span className={s.originPlain}>{src.displayUrl}</span></> : null}
          </span>
          <span className={`${pk.badges} ${s.headBadges}`}>
            <span className={pk.badge} data-tone={BADGE_TONE[src.status]}>{STATUS_LABEL[src.status]}</span>
            {src.extraction === 'on_device' && src.status === 'review' && <span className={pk.badge} data-tone="ok">Found on this device, not AI</span>}
            {src.extraction !== 'on_device' && src.status === 'review' && <span className={pk.badge} data-tone="ai" title="Titles and summaries are written by AI. Quotes are the source’s own words, labelled by how they were found.">AI-written titles</span>}
            {ai > 0 && src.status === 'review' && <span className={pk.badge} data-tone="ai">{ai} found by AI</span>}
          </span>
        </>} />
    </header>
  );
}

const VIEWS: { key: View; label: string; Icon: LucideIcon; hint: string }[] = [
  { key: 'list', label: 'List', Icon: Rows3, hint: 'Compact rows with checkboxes' },
  { key: 'bench', label: 'Bench', Icon: Columns2, hint: 'Candidates beside the source and its evidence' },
  { key: 'focus', label: 'Focus', Icon: SquareStack, hint: 'One card at a time: K keep, S skip' },
];

function ViewSwitch({ pref, view }: { pref: Prefs['reviewView']; view: View }) {
  return (
    <div className={`seg ${s.viewSeg}`} role="group" aria-label={`Review view: ${pref === 'auto' ? `Auto (${view})` : view}`}>
      <button type="button" aria-pressed={pref === 'auto'} onClick={() => setPrefs({ reviewView: 'auto' })}
        title="Auto: Bench on wide screens, List in between, Focus on phones">
        <Wand2 aria-hidden /><span className={s.viewLabel}>Auto</span>
      </button>
      {VIEWS.map(v => (
        <button key={v.key} type="button" aria-pressed={pref === v.key} data-auto-pick={pref === 'auto' && view === v.key ? 'true' : undefined}
          onClick={() => setPrefs({ reviewView: v.key })} title={v.hint}>
          <v.Icon aria-hidden /><span className={s.viewLabel}>{v.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Auto: Bench at ≥ 1100 px, Focus below 720 px, List in between. */
function useResolvedView(pref: Prefs['reviewView']): View {
  const wide = useMedia('(min-width: 1100px)');
  const narrow = useMedia('(max-width: 719.98px)');
  if (pref !== 'auto') return pref;
  return wide ? 'bench' : narrow ? 'focus' : 'list';
}
