'use client';
/* Inbox as a pipeline (Elvis, 22 Oct): four full-height columns in the order a source travels (Ready to review →
 * Processing → Nothing to unpack → Done), each one fifth of the width, and the selected source reviewed in the fifth fifth.
 * Cards move by a physical drag (components/ui/useCardDrag.ts) or by "Move to…" in their ⋯ menu; every move is real (files what's ticked, keeps the link,
 * marks it nothing, reopens it) and has an Undo. Moves that would mean nothing are refused, with the reason.
 * Keys: ↑/↓ within a column, ←/→ across columns, Enter opens. Click selects on wide screens; double-click opens.
 * Narrow screens: the columns become a horizontal, swipeable strip and a card opens its full review.
 * Deleting (24 Oct): a card's ⋯ menu, Delete/Backspace on a card, or a drag onto the bin that rises at the bottom centre.
 * Deleted items go to Deleted (/deleted) with an Undo; Processing asks first (it stops); Done items are never deleted. */
import { glyphFor } from '@/components/ui/BrandIcon';
import { Inbox, LibraryBig, MoreHorizontal, Plus, Trash2 } from '@/components/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { useShell } from '@/components/shell/AppShell';
import PageTop from '@/components/shell/PageTop';
import CaptureBox from '@/components/library/CaptureBox';
import { Kbd, useOutsideClose, useToast } from '@/components/ui';
import { relTime, STATUS_LABEL } from '@/lib/format';
import { getState, isSnoozed, snoozeSource, useAppState, wakeSource } from '@/lib/store';
import { ariaKeys, bindingOf, displayKey } from '@/lib/shortcuts';
import { SNOOZE_OPTIONS, untilLabel } from './snooze';
import type { Source } from '@/lib/types';
import InboxPreview from './InboxPreview';
import { BADGE_TONE, KIND_ICON, readSeen, reasonLine } from './model';
import { EmptyScene } from '@/components/ui/EmptyScene';
import { reducedMotion, useCardDrag } from '@/components/ui/useCardDrag';
import ColumnEmpty from './ColumnEmpty';
import { askToStop, COLUMNS, columnOf, moveSource, needsYou, refuseDelete, refuseDrop, refuseMove, type ColumnKey } from './moves';
import { Bin } from './Bin';
import { useDeleteSource } from './useDeleteSource';
import { dialogOpen, isTypingTarget, useMedia } from './useMedia';
import p from '@/components/shell/page.module.css';
import s from './inbox.module.css';

const UNREAD_STATUSES = new Set(['review', 'needs_thread', 'failed']);
/** Where a card lands in a column: the columns are sorted (newest first; in Ready to review, "needs you" last). */
const byColumnOrder = (a: Source, b: Source) => b.savedAt.localeCompare(a.savedAt);
/** where a dragged card can go: a column, or the bin */
type DropKey = ColumnKey | 'bin';

export default function InboxScreen() {
  const { state } = useAppState();
  const { openCapture } = useShell();
  const router = useRouter();
  const toast = useToast();
  const wide = useMedia('(min-width: 1100px)');
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [selId, setSelId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [announce, setAnnounce] = useState('');
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());
  const binRef = useRef<HTMLDivElement>(null);
  const [binLanding, setBinLanding] = useState(false);
  const { request: requestDelete, dialog: deleteDialog } = useDeleteSource({ say: setAnnounce });

  useEffect(() => { setSeen(readSeen()); }, []);
  // REV-08: re-render when the next snooze ends, so the card comes back on time
  const [wakeTick, setWakeTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const next = Math.min(...state.sources.map(x => (x.snoozedUntil ? +new Date(x.snoozedUntil) : Infinity)).filter(t => t > now));
    if (!Number.isFinite(next)) return;
    const t = window.setTimeout(() => setWakeTick(k => k + 1), Math.min(next - now + 50, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [state.sources, wakeTick]);
  const snooze = useCallback((src: Source, until: Date | null) => {
    const undo = until ? snoozeSource(src.id, until) : wakeSource(src.id);
    if (!undo) return;
    const msg = until ? `Snoozed until ${untilLabel(until.toISOString())}` : 'Back in Ready to review';
    setAnnounce(`${src.title}: ${msg}`);
    toast({ message: msg, tone: 'ok', action: { label: 'Undo', run: undo }, duration: 10000 });
  }, [toast]);

  const columns = useMemo(() => {
    // imported links saved as links only stay off the board (Settings › Import holds them), so an import never floods it
    const sorted = state.sources.filter(x => !(x.importId && x.status === 'bookmark')).sort(byColumnOrder);
    return COLUMNS.map(c => ({
      ...c,
      // in Ready to review, sources waiting on a review come before those that need the user's help
      // Track C (REV-08): snoozed sources wait at the bottom of Ready to review, under "Snoozed", until their time
      items: sorted.filter(x => columnOf(x) === c.key).sort((a, b) => Number(needsYou(a)) - Number(needsYou(b)))
        .sort((a, b) => Number(c.key === 'review' && isSnoozed(a)) - Number(c.key === 'review' && isSnoozed(b))),
    }));
  }, [state.sources, wakeTick]); // eslint-disable-line react-hooks/exhaustive-deps -- wakeTick re-sorts when a snooze ends
  const all = useMemo(() => columns.flatMap(c => c.items), [columns]);
  const selected = all.find(x => x.id === selId) ?? columns.find(c => c.items.length)?.items[0];

  const focusCard = useCallback((id: string) => {
    setSelId(id);
    const el = cardRefs.current.get(id);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  const move = useCallback((src: Source, to: ColumnKey, dragged = false) => {
    const why = refuseMove(src, to);
    const title = COLUMNS.find(c => c.key === to)!.title;
    if (why) {
      setAnnounce(`Can’t move to ${title}: ${why}`);
      if (dragged) toast({ message: `Can’t move to ${title} · ${why}`, tone: 'plain' });
      return false;
    }
    const r = moveSource(src, to);
    if (!r) return false;
    setAnnounce(`${src.title}: moved to ${title}. ${r.message}`);
    toast({ message: r.message, tone: 'ok', action: { label: 'Undo', run: () => { r.undo(); setAnnounce(`Undone: ${src.title} is back`); } }, duration: 10000 });
    return true;
  }, [toast]);

  /* ---------- keyboard: ↑/↓ within a column, ←/→ across, Enter opens ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target) || dialogOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!selected) return;
      if ((e.target as HTMLElement)?.closest?.('[data-inbox-panel], [role="menu"]')) return; // the panel and menus have their own keys
      const ci = columns.findIndex(c => c.items.some(x => x.id === selected.id));
      const col = columns[ci]; const i = col.items.findIndex(x => x.id === selected.id);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const down = e.key === 'ArrowDown' || e.key === 'j';
        focusCard(col.items[down ? Math.min(col.items.length - 1, i + 1) : Math.max(0, i - 1)].id);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        for (let j = ci + dir; j >= 0 && j < columns.length; j += dir) {
          if (columns[j].items.length) { focusCard(columns[j].items[Math.min(i, columns[j].items.length - 1)].id); break; }
        }
      } else if (e.key === 'Home' || e.key === 'End') {
        if ((e.target as HTMLElement)?.closest?.('[data-inbox-list]')) { e.preventDefault(); focusCard(col.items[e.key === 'Home' ? 0 : col.items.length - 1].id); }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && (e.target as HTMLElement)?.closest?.('[data-inbox-list] li[data-id] > a')) {
        e.preventDefault();
        // focus goes to the next card in the column (or the one before), so the keyboard user keeps their place
        const next = col.items[i + 1] ?? col.items[i - 1] ?? columns.find((c, j) => j !== ci && c.items.length)?.items[0];
        if (requestDelete(selected) === 'deleted' && next) requestAnimationFrame(() => focusCard(next.id));
      } else if (e.key === 'Enter' && (e.target === document.body || e.target === document.documentElement)) {
        e.preventDefault(); router.push(`/inbox/${selected.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [columns, selected, focusCard, router, requestDelete]);

  const onCardClick = useCallback((e: MouseEvent, id: string) => {
    // Keyboard activation (detail 0) and modified clicks keep the native link behaviour.
    if (!wide || e.detail === 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setSelId(id);
  }, [wide]);

  // stable per-card callbacks, so a memoised card re-renders only when its own props change (a drag crossing columns)
  const cardRef = useCallback((id: string, el: HTMLAnchorElement | null) => { if (el) cardRefs.current.set(id, el); else cardRefs.current.delete(id); }, []);
  const openCard = useCallback((id: string) => router.push(`/inbox/${id}`), [router]);
  const moveCard = useCallback((src: Source, to: ColumnKey) => { move(src, to); }, [move]);
  const deleteCard = useCallback((src: Source) => { requestDelete(src); }, [requestDelete]);

  /* ---------- physical drag: free between Ready, Processing and Nothing; into Done; onto the bin. Done cards lift, but
   * every target refuses them (the bin shows it won't take them) and they spring home ---------- */
  const { drag, landing, onPointerDown } = useCardDrag<DropKey>({
    root: boardRef, flip: true,
    sourceOf: id => { const src = all.find(x => x.id === id); return src ? columnOf(src) : null; },
    targetAt: hit => {
      const bin = hit?.closest<HTMLElement>('[data-bin]');
      if (bin) return { key: 'bin', el: bin };
      const el = hit?.closest<HTMLElement>('section[data-col]'); return el && boardRef.current?.contains(el) ? { key: el.dataset.col as ColumnKey, el } : null;
    },
    drop: (id, to) => {
      const src = all.find(x => x.id === id);
      if (!src) return false;
      if (to === 'bin') { const done = requestDelete(src) === 'deleted'; setBinLanding(done); return done; }
      const why = refuseDrop(src, to);
      if (why) {
        const title = COLUMNS.find(c => c.key === to)!.title;
        setAnnounce(`Can’t move to ${title}: ${why}`); toast({ message: `Can’t move to ${title} · ${why}`, tone: 'plain' });
        return false;
      }
      return move(src, to, true);
    },
    // a deleted card is absorbed into the bin; every other drop lands on the card's (new or old) place
    landOn: (id, to, moved) => {
      if (to === 'bin' && moved && binRef.current) return { el: binRef.current.firstElementChild as HTMLElement ?? binRef.current, absorb: true };
      const el = cardRefs.current.get(id); return el ? { el } : null;
    },
    onLift: id => setSelId(id),
    // over the bin the card shrinks towards the pointer, so the bin (and, for a Done card, its refusal) shows around it
    overScale: over => (over === 'bin' ? 0.3 : null),
  });
  // after a card lands in the bin, keep the bin long enough for its lid to drop shut and the bin to fade (bin.module.css)
  useEffect(() => {
    if (landing) return;
    const t = window.setTimeout(() => setBinLanding(false), reducedMotion() ? 0 : 640);
    return () => window.clearTimeout(t);
  }, [landing]);
  const dragSrc = drag ? all.find(x => x.id === drag.id) ?? null : null;
  // over the bin, a card that will go straight to Deleted leaves its column; a Processing card keeps its place (it asks first)
  const dropOk = !!(drag && dragSrc && drag.over && drag.over !== drag.from && !refuseDrop(dragSrc, drag.over) && !(drag.over === 'bin' && askToStop(dragSrc)));
  /** the index the dragged card will take in the column it's over (only when the drop is allowed) */
  const gapAt = (key: ColumnKey, items: Source[]) => {
    if (!dropOk || !dragSrc || drag?.over !== key) return -1;
    // a card moved into Ready to review is reopened for review, so it goes before the "needs you" cards
    const k = items.findIndex(x => (key === 'review' && needsYou(x)) || byColumnOrder(dragSrc, x) < 0);
    return k === -1 ? items.length : k;
  };

  const empty = state.sources.length === 0;
  return (
    <div className={`${p.page} ${s.root}`} data-own-nav-toggle data-board={!empty || undefined} data-dragging={drag || binLanding ? true : undefined}>
      <PageTop crumbs={[{ label: 'Inbox', icon: glyphFor('inbox', Inbox) }]} actions={<>
        <Link href="/deleted" className="btn ghost sm icon" aria-label="Deleted" title="Deleted"><Trash2 aria-hidden /></Link>
        {/* one primary per screen: the empty state's Capture or the open preview's action takes it, so this one stays quiet then */}
        <button type="button" className={empty || selected ? 'btn sm' : 'btn primary sm'} onClick={() => openCapture()}><Plus aria-hidden /> Capture <span aria-hidden><Kbd>{displayKey(bindingOf('capture', state.prefs.keys))}</Kbd></span></button>
      </>} />

      <div className={`${p.body} ${empty ? s.bodyEmpty : s.bodyBoard}`} data-cap="true">
        <div className={p.head}><h1>Inbox</h1></div>

        {empty ? <InboxEmpty onCapture={() => openCapture()} /> : (
          <div className={s.board} ref={boardRef} data-inbox-list data-dragging={drag ? true : undefined}>
            {columns.map(c => {
              const refused = dragSrc ? refuseDrop(dragSrc, c.key) : null;
              const isHome = drag?.from === c.key;
              const gap = gapAt(c.key, c.items);
              const gapLi = <li key="gap" className={s.gap} style={{ height: drag?.h }} aria-hidden />;
              const shown = c.items.length + (gap >= 0 ? 1 : 0); // a dragged card's slot stays (as its drop-back frame), so it counts
              return (
                <section key={c.key} className={s.col} aria-labelledby={`col-${c.key}`} data-col={c.key}
                  data-drop={drag && !isHome ? (refused ? 'no' : 'ok') : undefined} data-over={drag?.over === c.key || undefined}
                  title={drag && !isHome && refused ? refused : undefined}>
                  <h2 className={s.colHead} id={`col-${c.key}`}>
                    <span>{c.title}</span><span className={s.colCount}>{c.items.length}</span>
                  </h2>
                  {c.items.length === 0 && <ColumnEmpty col={c.key} hidden={shown > 0} />}
                  <ul className={s.cards} aria-labelledby={`col-${c.key}`}>
                    {c.items.map((src, k) => [
                      k === gap ? gapLi : null,
                      c.key === 'review' && isSnoozed(src) && !(k > 0 && isSnoozed(c.items[k - 1]))
                        ? <li key="snoozed" className={s.snoozeHead} aria-hidden><span>Snoozed</span><span>{c.items.filter(x => isSnoozed(x)).length}</span></li> : null,
                      <Card key={src.id} src={src} column={c.key}
                        unread={UNREAD_STATUSES.has(src.status) && !seen.has(src.id)}
                        selected={wide && selected?.id === src.id}
                        // one tab stop per column: the selected card, or the column's first card
                        tabbable={selected?.id === src.id || (k === 0 && !c.items.some(x => x.id === selected?.id))}
                        lift={drag?.id === src.id ? (dropOk ? 'gone' : 'held') : landing === src.id ? 'landing' : undefined}
                        refFn={cardRef} onClick={onCardClick} onFocus={setSelId} onOpen={openCard}
                        onPress={onPointerDown}
                        onMove={moveCard} onDelete={deleteCard}
                        snoozedUntil={c.key === 'review' && isSnoozed(src) ? src.snoozedUntil : undefined} onSnooze={c.key === 'review' ? snooze : undefined} />,
                    ])}
                    {gap === c.items.length && gapLi}
                  </ul>
                </section>
              );
            })}
            {wide && (
              <aside className={`${p.panel} ${s.preview}`} aria-label="Preview" data-inbox-panel>
                {selected ? <InboxPreview key={selected.id} src={selected} /> : null}
              </aside>
            )}
          </div>
        )}
      </div>
      {(drag || binLanding) && (
        <Bin ref={binRef} over={drag?.over === 'bin' || binLanding} refused={dragSrc ? refuseDrop(dragSrc, 'bin') : null} leaving={!drag} />
      )}
      {deleteDialog}
      <p className="sr-only" id="inbox-announce" role="status" aria-live="polite">{announce}</p>
      <CaptureBox />
    </div>
  );
}

export const Card = memo(function Card({ src, column, unread, selected, tabbable, lift, refFn, onClick, onFocus, onOpen, onPress, onMove, onDelete, snoozedUntil, onSnooze }: {
  src: Source; column: ColumnKey; unread: boolean; selected: boolean; tabbable: boolean;
  /** Track C (REV-08): when it's snoozed until, and the snooze action (Ready to review only) */
  snoozedUntil?: string; onSnooze?: (src: Source, until: Date | null) => void;
  /** held: lifted, its slot shown as a drop-back frame · gone: lifted and over another column, the frame stays · landing: the drop is settling */
  lift?: 'held' | 'gone' | 'landing';
  refFn: (id: string, el: HTMLAnchorElement | null) => void; onClick: (e: MouseEvent, id: string) => void; onFocus: (id: string) => void; onOpen: (id: string) => void;
  onPress?: (id: string) => (e: RPointerEvent<HTMLElement>) => void; onMove: (src: Source, to: ColumnKey) => void; onDelete: (src: Source) => void;
}) {
  const Icon = KIND_ICON[src.kind];
  const [menu, setMenu] = useState(false);
  const ref = useOutsideClose(menu, () => setMenu(false));
  const flag = needsYou(src);
  const deletable = !refuseDelete(src);
  return (
    <li className={s.cardItem} data-id={src.id} data-lift={lift}>
      <Link href={`/inbox/${src.id}`} ref={el => refFn(src.id, el)} className={s.card} data-done={column === 'done' || undefined} data-unread={unread} data-snoozed={snoozedUntil ? true : undefined}
        data-draggable={onPress ? true : undefined}
        aria-current={selected ? 'true' : undefined} tabIndex={tabbable ? 0 : -1} draggable={false}
        onClick={e => onClick(e, src.id)} onFocus={() => onFocus(src.id)} onDoubleClick={() => onOpen(src.id)} onPointerDown={onPress?.(src.id)} onDragStart={e => e.preventDefault()}>
        <span className={s.cardTop}>
          <Icon aria-hidden className={s.kind} />
          {unread && <span className={s.dot}><span className="sr-only">Unread: </span></span>}
          <time className={s.time} dateTime={src.savedAt} title={new Date(src.savedAt).toLocaleString('en-GB')}>{relTime(src.savedAt)}</time>
        </span>
        <span className={s.title}>{src.title}</span>
        <span className={s.reason} data-tone={flag && !snoozedUntil ? 'warn' : undefined}>{snoozedUntil ? `Snoozed until ${untilLabel(snoozedUntil)}` : reasonLine(src)}</span>
        {flag && <span className={p.badge} data-tone={BADGE_TONE[src.status]}>{STATUS_LABEL[src.status]}</span>}
      </Link>
      <div className={s.cardMenu} ref={ref}>
        <button type="button" className="btn ghost sm icon" aria-label={`More for “${src.title}”`} aria-haspopup="menu" aria-expanded={menu}
          tabIndex={tabbable ? 0 : -1} onClick={() => setMenu(m => !m)}><MoreHorizontal aria-hidden /></button>
        {menu && (
          <div className={`menu ${s.moveMenu}`} role="menu" aria-label={deletable ? 'Move or delete' : 'Move to'}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')];
                const k = items.indexOf(document.activeElement as HTMLButtonElement);
                items[(k + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
              }
            }}>
            <p className={s.moveHead}>Move to</p>
            {COLUMNS.filter(c => c.key !== column).map((c, k) => {
              const why = refuseMove(src, c.key);
              return (
                <button key={c.key} type="button" role="menuitem" disabled={!!why} title={why ?? undefined} autoFocus={k === 0 && !why}
                  onClick={() => { setMenu(false); onMove(src, c.key); }}>
                  {c.title}{why && <span className="sr-only">: {why}</span>}
                </button>
              );
            })}
            {onSnooze && <>
              <div className="sep" role="separator" />
              <p className={s.moveHead}>Review later</p>
              {snoozedUntil
                ? <button type="button" role="menuitem" onClick={() => { setMenu(false); onSnooze(src, null); }}>Back now</button>
                : SNOOZE_OPTIONS.map(o => <button key={o.key} type="button" role="menuitem" onClick={() => { setMenu(false); onSnooze(src, o.at(new Date())); }}>{o.label}</button>)}
            </>}
            {/* Done items can't be deleted, so they aren't offered it */}
            {deletable && <>
              <div className="sep" role="separator" />
              <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); onDelete(src); }}>
                <Trash2 aria-hidden />{askToStop(src) ? 'Delete…' : 'Delete'}
              </button>
            </>}
          </div>
        )}
      </div>
    </li>
  );
});


function InboxEmpty({ onCapture }: { onCapture: () => void }) {
  return (
    <EmptyScene id="inbox-empty-title" drawing="inbox" title="Inbox Zero" actions={<>
      <button type="button" className="btn primary" onClick={onCapture} aria-keyshortcuts={ariaKeys(bindingOf('capture', getState().prefs.keys))}><Plus aria-hidden />Capture<Kbd>{displayKey(bindingOf('capture', getState().prefs.keys))}</Kbd></button>
      <Link href="/library" className="btn ghost"><LibraryBig aria-hidden />Open Library</Link>
    </>} />
  );
}
