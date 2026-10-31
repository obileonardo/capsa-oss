'use client';
/* Deleted (24 Oct; built for real amounts on 25 Oct, design review item 5). What was deleted from the Inbox and the Library,
 * newest first, grouped by when: Today, This week, Older. Each row shows the item's type glyph, what it was, where it was
 * (with that place's glyph: Inbox, Library, a board or a collection) and when it was deleted. Restore puts it back exactly
 * where it was (store.restoreFromTrash); Delete forever removes it, with an Undo for this session. Search and a kind filter
 * narrow the list; tick rows (or a whole group) to restore or delete many at once. Past 50 rows the rest come in pages.
 * References: AirOps' trash (search, filter, a floating selection bar), Grok's Today / Earlier history. */
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import PageTop from '@/components/shell/PageTop';
import { PageHead } from '@/components/shell/PageParts';
import { Dialog, TypeIcon, useToast } from '@/components/ui';
import { glyphFor } from '@/components/ui/BrandIcon';
import { EmptyScene } from '@/components/ui/EmptyScene';
import { FolderKanban, Inbox, LibraryBig, RotateCcw, Search, Shapes, Trash2, X, type LucideIcon } from '@/components/ui/icons';
import { KIND_ICON } from '@/components/inbox/model';
import { COLUMNS } from '@/components/inbox/moves';
import { groupIcon } from '@/components/library/groupIcons';
import { MenuPill, type FacetOption } from '@/components/library/parts';
import { TYPE_MANY } from '@/components/library/look';
import { KIND_LABEL, relTime, TYPE_LABEL } from '@/lib/format';
import { emptyTrash, purgeFromTrash, purgeManyFromTrash, restoreFromTrash, restoreManyFromTrash, useAppState } from '@/lib/store';
import type { AppState, TrashEntry } from '@/lib/types';
import p from '@/components/shell/page.module.css';
import lib from '@/components/library/library.module.css';
import s from './deleted.module.css';
import { EaselGlyph, PlaygroundGlyph } from '@/components/ui/glyphs';
import { has } from '@/lib/features';

const keyOf = (t: TrashEntry) => `${t.kind}:${t.item.id}`;
/** "Video" for a source, "Prompt" for a Library item, "Easel" for an easel */
const whatItWas = (t: TrashEntry) => (t.kind === 'source' ? KIND_LABEL[t.item.kind] : t.kind === 'easel' ? 'Easel' : TYPE_LABEL[t.item.type]);
/** the kind filter's value for an entry: a Library type, an Inbox source kind, or easels */
const kindOf = (t: TrashEntry) => (t.kind === 'source' ? `src:${t.item.kind}` : t.kind === 'easel' ? 'easel' : `type:${t.item.type}`);

const InboxGlyph = glyphFor('inbox', Inbox);
const LibraryGlyph = glyphFor('library', LibraryBig);
const BoardGlyph = glyphFor('boards', FolderKanban);

/** Where it was: the Inbox column, the board it came from, the collection it was in, or the Library. Activity shows it too. */
export function placeOf(t: TrashEntry, st: Pick<AppState, 'boards' | 'collections'>): { icon: LucideIcon; label: string; kind: string } {
  if (t.kind === 'source') {
    const col = COLUMNS.find(c => c.key === t.from.column)?.title;
    return { icon: InboxGlyph, label: col ? `Inbox › ${col}` : 'Inbox', kind: 'inbox' };
  }
  if (t.kind === 'easel') return { icon: PlaygroundGlyph, label: 'Playground', kind: 'board' };
  const via = t.from.via;
  if (via?.kind === 'board') return { icon: BoardGlyph, label: st.boards.find(b => b.id === via.id)?.title ?? via.name, kind: 'board' };
  if (via?.kind === 'collection') {
    const c = st.collections.find(x => x.id === via.id);
    return { icon: groupIcon(c?.icon, 'collections'), label: c?.name ?? via.name, kind: 'collection' };
  }
  return { icon: LibraryGlyph, label: 'Library', kind: 'library' };
}

const DAY = 86_400_000;
const WHEN = [{ key: 'today', name: 'Today' }, { key: 'week', name: 'This week' }, { key: 'older', name: 'Older' }] as const;
type WhenKey = (typeof WHEN)[number]['key'];
const PAGE = 50;

export default function DeletedView() {
  const { state, ready } = useAppState();
  const toast = useToast();
  const router = useRouter();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  useEffect(() => { document.title = 'Deleted · Capsa'; }, []);
  useEffect(() => setLimit(PAGE), [q, kind]);
  const listRef = useRef<HTMLDivElement>(null);
  const h1 = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // deleted easels show only where the Playground is (lib/features.ts); they stay in the data either way
  const all = useMemo(() => state.trash.filter(t => t.kind !== 'easel' || has('playground')).sort((a, b) => +new Date(b.deletedAt) - +new Date(a.deletedAt)), [state.trash]);
  const n = all.length;
  // drop ticks for entries that have left Deleted (restored, deleted forever, or emptied)
  useEffect(() => setPicked(cur => {
    if (!cur.size) return cur;
    const live = new Set(all.map(keyOf));
    const next = new Set([...cur].filter(k => live.has(k)));
    return next.size === cur.size ? cur : next;
  }), [all]);

  const kindOptions = useMemo<FacetOption[]>(() => {
    const count = new Map<string, number>();
    for (const t of all) count.set(kindOf(t), (count.get(kindOf(t)) ?? 0) + 1);
    const types = [...new Set(all.flatMap(t => (t.kind === 'artifact' ? [t.item.type] : [])))];
    const kinds = [...new Set(all.flatMap(t => (t.kind === 'source' ? [t.item.kind] : [])))];
    return [
      { value: '', label: 'All kinds', count: n, icon: <Shapes aria-hidden className={lib.menuIcon} /> },
      ...types.map(ty => ({ value: `type:${ty}`, label: TYPE_MANY[ty], count: count.get(`type:${ty}`), icon: <TypeIcon type={ty} tint /> })),
      ...kinds.map(k => { const I = KIND_ICON[k]; return { value: `src:${k}`, label: `${KIND_LABEL[k]} (Inbox)`, count: count.get(`src:${k}`), icon: <I aria-hidden className={lib.menuIcon} /> }; }),
      ...(count.get('easel') ? [{ value: 'easel', label: 'Easels', count: count.get('easel'), icon: <EaselGlyph aria-hidden className={lib.menuIcon} /> }] : []),
    ];
  }, [all, n]);
  const kindLabel = kindOptions.find(o => o.value === kind)?.label ?? 'All kinds';

  const { boards, collections } = state;
  const places = useMemo(() => new Map(all.map(t => [keyOf(t), placeOf(t, { boards, collections })])), [all, boards, collections]);
  const terms = q.trim().toLowerCase();
  const shown = useMemo(() => all.filter(t => (!kind || kindOf(t) === kind)
    && (!terms || `${t.item.title} ${whatItWas(t)} ${places.get(keyOf(t))?.label}`.toLowerCase().includes(terms))), [all, kind, terms, places]);

  // Today, This week (the six days before today), Older; rows past `limit` wait for "Show more"
  const groups = useMemo(() => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const today = midnight.getTime(), week = today - 6 * DAY;
    const whenOf = (t: TrashEntry): WhenKey => { const at = +new Date(t.deletedAt); return at >= today ? 'today' : at >= week ? 'week' : 'older'; };
    let left = limit;
    return WHEN.map(w => {
      const items = shown.filter(t => whenOf(t) === w.key);
      const visible = items.slice(0, Math.max(0, left));
      left -= visible.length;
      return { ...w, items, visible };
    }).filter(g => g.items.length);
  }, [shown, limit]);
  const visibleCount = groups.reduce((k, g) => k + g.visible.length, 0);

  const focusHead = () => h1.current?.querySelector<HTMLElement>('h1 > [tabindex]')?.focus();
  /** after a row leaves, keep the keyboard user's place: the same button on the next row, else the page heading */
  const refocus = (key: string, act: 'restore' | 'purge') => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('li[data-key]') ?? [])];
    const i = rows.findIndex(r => r.dataset.key === key);
    const next = rows[i + 1] ?? rows[i - 1];
    requestAnimationFrame(() => {
      const btn = next?.querySelector<HTMLButtonElement>(`button[data-act="${act}"]`);
      if (btn) btn.focus(); else focusHead();
    });
  };
  const restore = useCallback((t: TrashEntry) => {
    refocus(keyOf(t), 'restore');
    if (!restoreFromTrash(t.kind, t.item.id)) return;
    const href = t.kind === 'source' ? `/inbox/${t.item.id}` : t.kind === 'easel' ? `/easels/${t.item.id}` : `/library/${t.item.id}`;
    toast({ message: `Restored to ${t.kind === 'source' ? 'Inbox' : t.kind === 'easel' ? 'Playground' : 'Library'}`, tone: 'ok', action: { label: 'Open', run: () => router.push(href) } });
  }, [router, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const purge = useCallback((t: TrashEntry) => {
    refocus(keyOf(t), 'purge');
    const undo = purgeFromTrash(t.kind, t.item.id);
    toast({ message: `Deleted “${t.item.title}” forever`, action: { label: 'Undo', run: undo } });
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const tick = useCallback((keys: string[], on: boolean) => setPicked(cur => {
    const next = new Set(cur);
    for (const k of keys) { if (on) next.add(k); else next.delete(k); }
    return next;
  }), []);

  const pickedNow = shown.filter(t => picked.has(keyOf(t)));
  const restoreMany = () => {
    const done = restoreManyFromTrash(pickedNow.map(keyOf));
    setPicked(new Set());
    requestAnimationFrame(focusHead);
    toast({ message: `Restored ${done === 1 ? '1 item' : `${done} items`}`, tone: 'ok' });
  };
  const purgeMany = () => {
    const k = pickedNow.length;
    const undo = purgeManyFromTrash(pickedNow.map(keyOf));
    setPicked(new Set());
    requestAnimationFrame(focusHead);
    toast({ message: `Deleted ${k === 1 ? '1 item' : `${k} items`} forever`, action: { label: 'Undo', run: undo } });
  };
  // Esc clears the selection (when no dialog or menu is open)
  useEffect(() => {
    if (!picked.size) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open], [role="menu"]')) return;
      if (e.target instanceof HTMLInputElement && e.target.type === 'search' && e.target.value) return;
      setPicked(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked.size]);

  return (
    <div className={p.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: 'Deleted', icon: Trash2 }]} />
      <div className={`${p.body} ${s.body}`} data-picking={pickedNow.length > 0 || undefined}>
        <div ref={h1} className={s.head}>
          <PageHead title={<span tabIndex={-1}>Deleted</span>} actions={n > 0
            ? <button type="button" className="btn danger" onClick={() => setConfirmEmpty(true)}><Trash2 aria-hidden />Empty Deleted</button> : undefined} />
        </div>
        {!ready ? null : n === 0 ? (
          <EmptyScene id="deleted-empty-title" drawing="deleted" title="Nothing in Deleted" />
        ) : (
          <>
            <div className={s.tools}>
              <div className={s.search}>
                <Search aria-hidden />
                <label htmlFor="del-q" className="sr-only">Search Deleted</label>
                <input id="del-q" ref={searchRef} type="search" value={q} placeholder="Search Deleted" autoComplete="off" spellCheck={false}
                  onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && q) { e.preventDefault(); setQ(''); } }} />
                {q && <button type="button" className={s.clear} aria-label="Clear search" onClick={() => { setQ(''); searchRef.current?.focus(); }}><X aria-hidden /></button>}
              </div>
              <MenuPill label="Kind" ariaLabel={`Kind: ${kindLabel}`} text={kindLabel} set={!!kind}
                lead={<Shapes aria-hidden className={lib.pillLead} />} options={kindOptions} value={kind} onChange={setKind} />
              <p className={s.count} role="status">{shown.length === n ? (n === 1 ? '1 item' : `${n} items`) : `${shown.length} of ${n}`}</p>
            </div>
            {shown.length === 0 ? (
              <EmptyScene drawing="search" compact title={terms ? `Nothing for “${q.trim()}”` : 'Nothing of this kind'}
                actions={<button type="button" className="btn" onClick={() => { setQ(''); setKind(''); }}><X aria-hidden />{terms && kind ? 'Clear search and filter' : terms ? 'Clear search' : 'Clear filter'}</button>} />
            ) : (
              <div className={s.groups} ref={listRef}>
                {groups.map(g => {
                  const keys = g.items.map(keyOf);
                  const on = keys.filter(k => picked.has(k)).length;
                  return (
                    <section key={g.key} className={s.group} aria-labelledby={`del-${g.key}`}>
                      <h2 className={`${p.ghead} ${s.ghead}`}>
                        <Check checked={on > 0 && on === keys.length} mixed={on > 0 && on < keys.length} label={`Select all ${g.items.length} in ${g.name}`}
                          onChange={v => tick(keys, v)} />
                        <span id={`del-${g.key}`}>{g.name}</span> <span className={p.n}>{g.items.length}</span>
                      </h2>
                      {g.visible.length > 0 && (
                        <ul className={s.rows}>
                          {g.visible.map(t => (
                            <Row key={keyOf(t)} t={t} place={places.get(keyOf(t))!} picked={picked.has(keyOf(t))} onTick={tick} onRestore={restore} onPurge={purge} />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
                {shown.length > visibleCount && (
                  <div className={s.more}>
                    <button type="button" className="btn" onClick={() => setLimit(l => l + PAGE)}>
                      Show {Math.min(PAGE, shown.length - visibleCount)} more
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {pickedNow.length > 0 && (
        <div className={s.bar} role="region" aria-label="Selected items">
          <span className={s.barCount} role="status">{pickedNow.length} selected</span>
          {pickedNow.length < shown.length && (
            <button type="button" className={s.barLink} onClick={() => tick(shown.map(keyOf), true)}>Select all {shown.length}</button>
          )}
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={restoreMany}><RotateCcw aria-hidden /><span className={s.lbl}>Restore</span></button>
          <button type="button" className="btn sm danger" onClick={purgeMany}><Trash2 aria-hidden /><span className={s.lbl}>Delete forever</span></button>
          <button type="button" className="btn ghost sm icon" onClick={() => setPicked(new Set())} aria-label="Clear selection" title="Clear selection (Esc)"><X aria-hidden /></button>
        </div>
      )}
      <Dialog open={confirmEmpty} onClose={() => setConfirmEmpty(false)} title="Empty Deleted?" size="sm"
        footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={() => setConfirmEmpty(false)}>Cancel</button>
          <button type="button" className="btn danger" onClick={() => { setConfirmEmpty(false); emptyTrash(); toast({ message: 'Deleted is empty' }); requestAnimationFrame(focusHead); }}>Empty Deleted</button></>}>
        <p style={{ margin: 0 }}>{n === 1 ? 'The item here is' : `The ${n} items here are`} deleted forever. This can’t be undone.</p>
      </Dialog>
    </div>
  );
}

/** A native checkbox (so keyboards and screen readers get the real thing), with the mixed state for a part-ticked group. */
export function Check({ checked, mixed, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" className={s.check} checked={checked} aria-label={label} onChange={e => onChange(e.target.checked)} />;
}

export const Row = memo(function Row({ t, place, picked, onTick, onRestore, onPurge }: {
  t: TrashEntry; place: { icon: LucideIcon; label: string; kind: string }; picked: boolean;
  onTick: (keys: string[], on: boolean) => void; onRestore: (t: TrashEntry) => void; onPurge: (t: TrashEntry) => void;
}) {
  const Kind = t.kind === 'source' ? KIND_ICON[t.item.kind] : null;
  const Place = place.icon;
  const icon: ReactNode = Kind ? <Kind aria-hidden /> : t.kind === 'artifact' ? <TypeIcon type={t.item.type} /> : <EaselGlyph aria-hidden />;
  return (
    <li className={s.row} data-key={keyOf(t)} data-picked={picked || undefined}>
      <Check checked={picked} label={`Select “${t.item.title}”`} onChange={v => onTick([keyOf(t)], v)} />
      <span className={s.icon}>{icon}</span>
      <span className={s.text}>
        <span className={s.title}>{t.item.title}</span>
        <span className={s.meta}>
          <span className={s.what}>{whatItWas(t)}</span>
          <span className={s.from} data-place={place.kind}><Place aria-hidden /><span className="sr-only">from </span><span className={s.fromText}>{place.label}</span></span>
          <time className={s.when} dateTime={t.deletedAt} title={new Date(t.deletedAt).toLocaleString('en-GB')}>Deleted {relTime(t.deletedAt)}</time>
        </span>
      </span>
      <span className={s.acts}>
        <button type="button" className="btn sm" data-act="restore" onClick={() => onRestore(t)} aria-label={`Restore “${t.item.title}”`}>
          <RotateCcw aria-hidden /><span className={s.lbl}>Restore</span>
        </button>
        <button type="button" className="btn ghost sm" data-act="purge" onClick={() => onPurge(t)} aria-label={`Delete forever “${t.item.title}”`}>
          <X aria-hidden /><span className={s.lbl}>Delete forever</span>
        </button>
      </span>
    </li>
  );
});
