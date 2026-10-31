'use client';
/* Library (/library), built to the approved mockup design-references/mockups/library.html:
 * top bar (breadcrumb, search pill, black "New ▾"), heading, grey filter pills with live counts, sort and view switch,
 * card grid with tinted previews or a grouped list with a details pane, multi-select with a floating bar, export. */
import { glyphFor } from '@/components/ui/BrandIcon';
import {
  BadgeCheck, Briefcase, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleDashed, CircleOff, FlaskConical, Globe,
  Inbox, LayoutGrid, LibraryBig, List, MapPin, PanelLeft, Plus, Search, SearchX, Shapes, SlidersHorizontal, SquareStack, BookmarkFilled, Tag, X, Sparkles,
  type LucideIcon,
} from '@/components/ui/icons';
import { Image as GalleryIcon, Link as SourceIcon } from '@/components/ui/icons';
// the gallery view, the tabs and Save search are Organise's (lib/features.ts)
import GalleryCard from '@/slots.gen/GalleryCard';
import GalleryList from '@/slots.gen/GalleryList';
import LibraryTabs from '@/slots.gen/LibraryTabs';
import { Segmented } from '@/components/ui/Segmented';
import SaveSearchButton from '@/slots.gen/SaveSearchButton';
import { cardFields, pluralOf, sourceKeyLabel, sourcesFor, TRIED_LABEL, TRIED_ORDER } from '@/lib/organise';
import type { ArtifactType } from '@/lib/types';
import { has } from '@/lib/features';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '@/components/shell/AppShell';
import { OMNI_PLACEHOLDER } from '@/components/shell/omni';
import { Empty, Kbd, TypeIcon, useOutsideClose, useToast } from '@/components/ui';
import { METHOD_LABEL, TYPE_LABEL } from '@/lib/format';
import { createCollection, currentLibraryId, getState, loadSampleData, pinTag, tagCounts, unpinTag, useAppState } from '@/lib/store';
import { DEFAULT_LIBRARY, libraryById } from '@/lib/libraries';
import { ariaKeys, bindingOf, displayKey, matches } from '@/lib/shortcuts';
import type { Artifact } from '@/lib/types';
import type { ReactNode } from 'react';
import FilterSheet, { type SheetFacet } from './FilterSheet';
import {
  activeFacetCount, applyFilters, EMPTY_FILTERS, type Facet, facetCounts, filtersFromParams, filtersToQuery,
  type LibFilters, METHOD_ORDER, plural, readCollapsed, termsOf, TREE_CAP, writeCollapsed,
} from './lib';
import { collectionColour, DISPLAY_ORDER, EV_ICON, groupName, LIST_GROUPS, projectColour, SORT_ICON, TYPE_MANY } from './look';
import { groupIcon } from './groupIcons';
import { FacetPill, type FacetOption, MenuPill } from './parts';
import CaptureBox from './CaptureBox';
import Panel from './Panel';
import { EmptyScene } from '@/components/ui/EmptyScene';
import { dropTarget, dropTargetAt, fileDroppedItem, type ItemDrop } from './dnd';
import { useCardDrag } from '@/components/ui/useCardDrag';
import { ArtifactCard, ArtifactRow, type Group } from './Results';
import s from './library.module.css';

/** The tree's remembered groups, per library (the first library keeps the key it had before libraries). */
const treeLibrary = () => (currentLibraryId() === DEFAULT_LIBRARY ? undefined : currentLibraryId());

/** Each facet's glyph leads its pill, its "+ Filter" row and its "All …" row (design review, 25 Oct: icons in every menu). */
const FACET_META: Record<Facet, { label: string; all: string; pill: string; icon: LucideIcon }> = {
  type: { label: 'Type', all: 'All types', pill: 'All types', icon: Shapes },
  method: { label: 'Where from', all: 'From anywhere', pill: 'Where from', icon: MapPin },
  domain: { label: 'Domain', all: 'Any domain', pill: 'Domain', icon: Globe },
  collection: { label: 'Collection', all: 'Any collection', pill: 'Collections', icon: SquareStack },
  project: { label: 'Project', all: 'Any project', pill: 'Project', icon: Briefcase },
  tag: { label: 'Tag', all: 'Any tag', pill: 'Tag', icon: Tag },
  tried: { label: 'Tried', all: 'Tried or not', pill: 'Tried', icon: FlaskConical },
};
const MAIN_FACETS: Facet[] = ['type', 'method', 'collection'];
const EXTRA_FACETS: Facet[] = ['domain', 'project', 'tag', 'tried'];
const ALL_FACETS: Facet[] = ['type', 'method', 'domain', 'collection', 'project', 'tag', 'tried'];
const SORT_LABEL: Record<LibFilters['sort'], string> = { recent: 'Last saved', used: 'Recently used', az: 'Title A–Z' };
const TRIED_ICON: Record<string, LucideIcon> = { untried: CircleDashed, tried: FlaskConical, worked: BadgeCheck, didnt: CircleOff };
const menuIcon = (I: LucideIcon, colour?: string) => <I aria-hidden className={s.menuIcon} style={colour ? { color: colour } : undefined} />;

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** The selected-item panel docks in the shell's right slot on wide screens; narrower, it opens as a sheet. */
function useMedia(query: string) {
  return useSyncExternalStore(
    cb => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => matchMedia(query).matches,
    () => true,
  );
}
const useDocked = () => useMedia('(min-width: 1100px)');

const LibraryGlyph = glyphFor('library', LibraryBig);

export default function LibraryView() {
  const { state } = useAppState();
  const { openCapture, openPalette, asideSlot, searchSlot, toggleSidebar } = useShell();
  const toast = useToast();
  const params = useSearchParams();
  const pathname = usePathname();
  // THM-04: the view each type opens with (Settings › Cards and views); 'all' when no type is picked
  const typeView = state.prefs.typeView;
  const defaultView = useCallback((t: ArtifactType | '') => typeView?.[t || 'all'] ?? typeView?.all ?? 'cards', [typeView]);
  const [f, setF] = useState<LibFilters>(() => filtersFromParams(new URLSearchParams(params.toString()), defaultView));
  const [sheet, setSheet] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [topSearch, setTopSearch] = useState<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState<Facet[]>([]);
  const [opening, setOpening] = useState<Facet | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const docked = useDocked();
  const withSidebar = useMedia('(min-width: 861px)'); // narrower, the sidebar is a drawer, so search sits in the top bar

  const everything = state.artifacts;
  // CUR-11: ?src= narrows to the items from one site, creator or source (from Library › Sources)
  const all = useMemo(() => {
    if (!f.src) return everything;
    const ids = sourcesFor(state, f.src);
    return everything.filter(a => ids.has(a.sourceId ?? ''));
  }, [everything, f.src, state]);
  const results = useMemo(() => applyFilters(all, f), [all, f]);
  const fields = cardFields(state).join(',');
  // XEV-19: your own type names, by type id (cards and gallery show them in place of the built-in name)
  const ownTypes = state.organise?.types;
  const typeNames = useMemo(() => new Map((ownTypes ?? []).map(t => [t.id, t.name])), [ownTypes]);
  const thumbs = useMemo(() => new Map(state.references.map(r => [r.id, r.thumbKey ?? (r.imageKey || undefined)])), [state.references]);
  const terms = useMemo(() => termsOf(f.q), [f.q]);
  const srcById = useMemo(() => new Map(state.sources.map(x => [x.id, x])), [state.sources]);
  const active = activeFacetCount(f);

  const colById = useMemo(() => new Map<string, Group>(state.collections.map((c, i) => [c.id, { id: c.id, name: c.name, colour: collectionColour(i), icon: c.icon }])), [state.collections]);
  const projById = useMemo(() => new Map<string, Group>(state.projects.map((p, i) => [p.id, { id: p.id, name: p.name, colour: projectColour(i) }])), [state.projects]);
  const colsOf = useCallback((a: Artifact) => (a.collections ?? []).map(id => colById.get(id)).filter((g): g is Group => !!g), [colById]);
  // Stable per-item props, so a memoised card re-renders only when its own item changes (Stage 10: 1,000 items).
  const colsMap = useMemo(() => new Map(everything.map(a => [a.id, colsOf(a)])), [everything, colsOf]);
  const NO_COLS = useMemo<Group[]>(() => [], []);
  // Render results in pages; more appear as you scroll (or with the button). Counts, filters and Select all use all results.
  const PAGE = 150;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [f.q, f.type, f.method, f.domain, f.collection, f.project, f.tag, f.starred, f.tried, f.src, f.sort, f.view]);
  const projsOf = useCallback((a: Artifact) => (a.projects ?? []).map(id => projById.get(id)).filter((g): g is Group => !!g), [projById]);

  // List view (design review, 25 Oct): a tree. Each type group can collapse (remembered per library on this device) and
  // shows its first TREE_CAP items until "Show all". The flattened order of what's on screen drives keyboard movement, so
  // J/K skip collapsed groups and hidden items.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(typeof window === 'undefined' ? [] : readCollapsed(treeLibrary())));
  const [full, setFull] = useState<Set<string>>(() => new Set());
  const setGroupOpen = useCallback((key: string, open: boolean) => setCollapsed(c => {
    if (c.has(key) === !open) return c;
    const n = new Set(c);
    if (open) n.delete(key); else n.add(key);
    writeCollapsed([...n], treeLibrary());
    return n;
  }), []);
  const groups = useMemo(() => LIST_GROUPS.map(g => {
    const all = results.filter(a => g.types.includes(a.type));
    const shown = g.types.filter(t => all.some(a => a.type === t));
    const open = !collapsed.has(g.key);
    const items = open ? (full.has(g.key) ? all : all.slice(0, TREE_CAP)) : [];
    return { key: g.key, types: shown, total: all.length, items, open, name: groupName(g, shown) };
  }).filter(g => g.total), [results, collapsed, full]);
  const listOrder = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const anyOpen = groups.some(g => g.open);
  const setAllOpen = (open: boolean) => {
    const n = open ? new Set<string>() : new Set(LIST_GROUPS.map(g => g.key));
    writeCollapsed([...n], treeLibrary());
    setCollapsed(n);
  };
  const listKeys = f.view === 'list' && docked;
  const activeItem = everything.find(a => a.id === activeId);
  const sheetItem = docked ? undefined : everything.find(a => a.id === sheetId);
  const openItem = useCallback((id: string) => { if (docked) return false; setSheetId(id); return true; }, [docked]);

  // The queries this view wrote to the URL itself and hasn't seen come back yet: Next reports each replaceState back
  // through useSearchParams a moment later, and an older one arriving after a newer change (type, then clear at once)
  // must not be taken for a link and undo that change (the search came back after it was cleared).
  const ownWrites = useRef<string[]>([]);

  // Links into the Library from elsewhere (sidebar collections, Projects) change the URL without a remount.
  useEffect(() => {
    const q = params.toString();
    const own = ownWrites.current.indexOf(q ? `?${q}` : '');
    if (own >= 0) { ownWrites.current.splice(0, own + 1); return; }
    setF(cur => (filtersToQuery(cur, defaultView) === (q ? `?${q}` : '') ? cur : filtersFromParams(new URLSearchParams(q), defaultView)));
  }, [params, defaultView]);

  // Keep filters in the URL so Back from an artifact returns to the same view.
  useEffect(() => {
    const query = filtersToQuery(f, defaultView);
    const next = pathname + query;
    if (next !== location.pathname + location.search) {
      ownWrites.current = [...ownWrites.current, query].slice(-10);
      window.history.replaceState(null, '', next);
    }
  }, [f, pathname, defaultView]);

  // "Open in panel" from a card's ⋯ menu, and dropping a card on the panel (wide screens only)
  const toPanel = useCallback((id: string) => setActiveId(id), []);

  /* Drag a card onto a sidebar collection or project (files it), or onto the right panel (opens it there). Pointer events,
     so it works in Safari; touch keeps scrolling (phones use the ⋯ menu). */
  const dragRoot = useRef<HTMLElement>(null);
  const { drag: itemDrag, landing: itemLanding, onPointerDown: pressItem } = useCardDrag<ItemDrop | 'library'>({
    root: dragRoot, touch: false, ghostClass: `${s.lib} ${s.lift}`, pad: state.prefs.look === 'paper' ? 0 : 10, // a Paper card has its own sheet: lift exactly the card
    sourceOf: () => (withSidebar || docked ? 'library' : null),
    targetAt: dropTargetAt,
    drop: (id, to) => {
      if (to === 'panel') { if (!docked) return false; toPanel(id); return true; }
      return to === 'library' ? false : fileDroppedItem(id, to, toast);
    },
    landOn: (id, to, moved) => {
      if (moved && to && to !== 'library') {
        const el = dropTarget(to);
        const box = el && (el.getBoundingClientRect().width ? el : (el.firstElementChild as HTMLElement | null));
        if (box) return { el: box, absorb: true };
      }
      const home = document.querySelector<HTMLElement>(`main [aria-label="Items"] li[data-id="${CSS.escape(id)}"]`);
      return home ? { el: home } : null;
    },
    // the sidebar rows and the panel already style these attributes
    mark: (el, on) => {
      if (el.dataset.itemDrop === 'panel') el.toggleAttribute('data-over', on);
      else if (on) el.dataset.drop = 'true'; else delete el.dataset.drop;
    },
    onLift: () => { document.documentElement.dataset.dragItem = '1'; },
    onEnd: () => { delete document.documentElement.dataset.dragItem; },
  });
  const liftedId = itemDrag?.id ?? itemLanding;

  // Focus moves in the same keystroke when the target is already on the page, so the next key starts from it (keys
  // pressed faster than a frame, or a held key on a busy page, used to start from the old place and skip); a frame later
  // only when it is about to appear.
  const focusNow = useCallback((sel: string) => {
    const q = () => document.querySelector<HTMLElement>(sel);
    const el = q();
    if (el) el.focus(); else requestAnimationFrame(() => q()?.focus());
  }, []);
  const focusHead = useCallback((key: string) => focusNow(`[data-group-toggle="${CSS.escape(key)}"]`), [focusNow]);
  useEffect(() => {
    const focusRow = (id: string) => focusNow(`[data-id="${CSS.escape(id)}"] a`);
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = isTyping(e.target);
      if (matches(e, bindingOf('librarySearch', getState().prefs.keys)) && !typing) { e.preventDefault(); searchRef.current?.focus(); return; } // THM-07: changeable
      if (f.view !== 'list' || typing || document.querySelector('[role="menu"]')) return;
      // Where the keyboard is: on a row (its link), on a group heading, or elsewhere (then the active row counts).
      const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const rowId = el?.closest<HTMLElement>('main [aria-label="Items"] li[data-id]')?.dataset.id;
      const headKey = el?.closest<HTMLElement>('[data-group-toggle]')?.dataset.groupToggle;
      // ← on a row folds its group and moves to the heading, as in a tree (headings handle ← and → themselves)
      if (e.key === 'ArrowLeft' && rowId && !e.shiftKey) {
        const g = groups.find(x => x.items.some(a => a.id === rowId));
        if (g) { e.preventDefault(); setGroupOpen(g.key, false); focusHead(g.key); }
        return;
      }
      // Wide screens: j/k or arrows move through the rows; ⇧J / ⇧K jump to the next or previous group's heading.
      if (!listKeys || !groups.length) return;
      const gi = headKey ? groups.findIndex(g => g.key === headKey)
        : groups.findIndex(g => g.items.some(a => a.id === (rowId ?? activeItem?.id)));
      if (e.shiftKey && (e.key === 'J' || e.key === 'K')) {
        e.preventDefault();
        focusHead(groups[Math.max(0, Math.min(groups.length - 1, gi < 0 ? 0 : gi + (e.key === 'J' ? 1 : -1)))].key);
        return;
      }
      if (e.shiftKey || !listOrder.length) return;
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const down = e.key === 'ArrowDown' || e.key === 'j';
        // on a heading, the position is just before its group's first row
        let i: number;
        if (rowId) i = listOrder.findIndex(a => a.id === rowId);
        else if (headKey && gi >= 0) i = groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0) - 0.5;
        else i = activeItem ? listOrder.indexOf(activeItem) : -1;
        const next = listOrder[Math.max(0, Math.min(listOrder.length - 1, down ? Math.floor(i) + 1 : Math.ceil(i) - 1))];
        setActiveId(next.id);
        focusRow(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listKeys, listOrder, activeItem, groups, f.view, setGroupOpen, focusHead, focusNow]);

  // Picking a type opens it in the view chosen for that type, when one is set (THM-04)
  const set = useCallback(<K extends keyof LibFilters>(k: K, v: LibFilters[K]) => setF(x => {
    const own = k === 'type' ? typeView?.[(v as ArtifactType | '') || 'all'] : undefined;
    return { ...x, [k]: v, ...(own ? { view: own } : {}) };
  }), [typeView]);
  const clearFacets = () => setF(x => ({ ...x, type: '', method: '', domain: '', collection: '', project: '', tag: '', starred: false, tried: '', src: '' }));
  const clearAll = () => setF(x => ({ ...EMPTY_FILTERS, sort: x.sort, view: x.view }));

  const options = useMemo(() => {
    const counts = (k: Facet) => facetCounts(all, f, k);
    const typeC = counts('type'), methodC = counts('method'), domainC = counts('domain'), colC = counts('collection'), projC = counts('project'), tagC = counts('tag'), triedC = counts('tried');
    const present = new Set(all.map(a => a.type));
    const domains = [...new Set(all.flatMap(a => a.domains ?? []))].sort();
    const out: Record<Facet, { options: FacetOption[]; total: number }> = {
      type: { total: typeC.get('') ?? 0, options: [
        ...DISPLAY_ORDER.filter(t => present.has(t)).map(t => ({ value: t, label: TYPE_LABEL[t], long: TYPE_MANY[t], count: typeC.get(t) ?? 0, icon: <TypeIcon type={t} tint /> })),
        // XEV-19: your own types, after the built-in ones
        ...(ownTypes ?? []).map(t => ({ value: `custom:${t.id}`, label: t.name, long: pluralOf(t), count: typeC.get(`custom:${t.id}`) ?? 0, icon: <TypeIcon type={t.base} tint /> })),
      ] },
      method: { total: methodC.get('') ?? 0, options: METHOD_ORDER.map(m => ({ value: m, label: METHOD_LABEL[m], count: methodC.get(m) ?? 0, icon: menuIcon(EV_ICON[m]) })) },
      domain: { total: domainC.get('') ?? 0, options: domains.map(d => ({ value: d, label: d, count: domainC.get(d) ?? 0, icon: menuIcon(Globe) })) },
      // collections and projects wear the icon chosen for them (Stage 6), in their colour
      collection: { total: colC.get('') ?? 0, options: state.collections.map((c, i) => ({ value: c.id, label: c.name, count: colC.get(c.id) ?? 0, icon: menuIcon(groupIcon(c.icon, 'collections'), collectionColour(i)) })) },
      project: { total: projC.get('') ?? 0, options: state.projects.map((p, i) => ({ value: p.id, label: p.name, count: projC.get(p.id) ?? 0, icon: menuIcon(groupIcon(p.icon, 'projects'), projectColour(i)) })) },
      tag: { total: tagC.get('') ?? 0, options: tagCounts(state).map(t => ({ value: t.tag, label: t.tag, count: tagC.get(t.tag.toLowerCase()) ?? 0, icon: menuIcon(Tag) })) },
      tried: { total: triedC.get('') ?? 0, options: TRIED_ORDER.map(v => ({ value: v, label: TRIED_LABEL[v], count: triedC.get(v) ?? 0, icon: menuIcon(TRIED_ICON[v]) })) },
    };
    return out;
  }, [all, f, state]);

  const sheetFacets: SheetFacet[] = ALL_FACETS.map(k => ({
    key: k, label: FACET_META[k].label, allLabel: FACET_META[k].all, allIcon: menuIcon(FACET_META[k].icon), options: options[k].options, total: options[k].total,
    value: f[k], onChange: (v: string) => set(k, v as never),
  }));


  const narrowed = results.length !== all.length || !!f.q.trim() || active > 0;
  const countText = !everything.length ? 'Nothing kept yet'
    : results.length === all.length ? plural(all.length, 'item')
    : `${results.length} of ${plural(all.length, 'item')}`;

  const shownFacets = [...MAIN_FACETS, ...EXTRA_FACETS.filter(k => f[k] || revealed.includes(k))];
  const hiddenExtras = EXTRA_FACETS.filter(k => !shownFacets.includes(k));
  const onFacetOpenChange = (k: Facet) => (open: boolean) => {
    if (open) return;
    if (opening === k) setOpening(null);
    // A filter added with "+ Filter" and then left unset goes away again.
    if (EXTRA_FACETS.includes(k) && !f[k]) setRevealed(r => r.filter(y => y !== k));
  };

  let body;
  if (!everything.length) {
    body = (
      <EmptyScene drawing="library" scatter title={libraryById(currentLibraryId())?.name ?? 'Your library'} actions={<>
        <button type="button" className="btn primary" onClick={() => openCapture()} aria-keyshortcuts={ariaKeys(bindingOf('capture', getState().prefs.keys))}><Plus aria-hidden />Capture<Kbd>{displayKey(bindingOf('capture', getState().prefs.keys))}</Kbd></button>
        <button type="button" className="btn ghost" onClick={async () => { await loadSampleData(); toast({ message: 'Sample data added · marked Demo data', tone: 'ok' }); }}><Sparkles aria-hidden />Try with sample data</button>
      </>} />
    );
  } else if (!results.length) {
    body = (
      <EmptyScene drawing="search" scatter title={f.q.trim() ? `Nothing for “${f.q.trim()}”` : 'Nothing matches these filters'}
        actions={<button type="button" className="btn" onClick={clearAll}><X aria-hidden />{f.q.trim() && !active ? 'Clear search' : 'Clear search and filters'}</button>} />
    );
  } else if (f.view === 'list') {
    body = (
      <section className={s.groups} aria-label="Items">
        {groups.map(g => (
          <div key={g.key} className={s.group} data-open={g.open}>
            <h2 className={s.ghead}>
              <button type="button" className={s.gtoggle} data-group-toggle={g.key} aria-expanded={g.open} aria-controls={g.open ? `lib-grp-${g.key}` : undefined}
                onClick={() => setGroupOpen(g.key, !g.open)}
                onKeyDown={e => {
                  if (e.key === 'ArrowLeft' && g.open) { e.preventDefault(); setGroupOpen(g.key, false); }
                  else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (!g.open) setGroupOpen(g.key, true);
                    else if (g.items[0]) document.querySelector<HTMLAnchorElement>(`[data-id="${CSS.escape(g.items[0].id)}"] a`)?.focus();
                  }
                }}>
                <ChevronRight aria-hidden className={s.gchev} />
                {g.types.map(t => <TypeIcon key={t} type={t} />)}
                <span className={s.gname}>{g.name}</span>
                <span className={s.gcount}>{g.total}<span className="sr-only">{g.total === 1 ? ' item' : ' items'}</span></span>
              </button>
              <button type="button" className={s.gadd} onClick={() => openCapture()} aria-label="Capture" title={`Capture (${displayKey(bindingOf('capture', getState().prefs.keys))})`}><Plus aria-hidden /></button>
            </h2>
            {g.open && (
              <ul className={`${s.rows} ${s.tree}`} id={`lib-grp-${g.key}`}>
                {g.items.map(a => (
                  <ArtifactRow key={a.id} a={a} src={srcById.get(a.sourceId ?? '')} terms={terms} cols={colsMap.get(a.id) ?? NO_COLS}
                    onPanel={docked ? toPanel : undefined} plain
                    active={a.id === activeItem?.id} onPress={pressItem} lifted={liftedId === a.id} onOpen={openItem} />
                ))}
              </ul>
            )}
            {g.open && g.total > TREE_CAP && (
              <button type="button" className={s.gmore} aria-controls={`lib-grp-${g.key}`}
                onClick={() => setFull(x => { const n = new Set(x); if (full.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
                {full.has(g.key) ? `Show the first ${TREE_CAP}` : `Show all ${g.total}`}
              </button>
            )}
          </div>
        ))}
      </section>
    );
  } else if (f.view === 'gallery' && GalleryCard && GalleryList) {
    const Card = GalleryCard; // narrowed here, for the callback below (absent in a build without Organise)
    body = (
      <>
        <GalleryList>
          {results.slice(0, limit).map(a => (
            <Card key={a.id} a={a} terms={terms} thumb={a.refId ? thumbs.get(a.refId) : undefined} typeName={a.customType ? typeNames.get(a.customType) : undefined}
              onPanel={docked ? toPanel : undefined}
              active={a.id === activeItem?.id} onPress={pressItem} lifted={liftedId === a.id} onOpen={openItem} />
          ))}
        </GalleryList>
        {results.length > limit && <MoreSentinel left={results.length - limit} page={PAGE} onMore={() => setLimit(l => l + PAGE)} />}
      </>
    );
  } else {
    body = (
      <>
        <ul className={s.grid} aria-label="Items">
          {results.slice(0, limit).map(a => (
            <ArtifactCard key={a.id} a={a} src={srcById.get(a.sourceId ?? '')} terms={terms} cols={colsMap.get(a.id) ?? NO_COLS}
              onPanel={docked ? toPanel : undefined} fields={fields} typeName={a.customType ? typeNames.get(a.customType) : undefined}
              active={a.id === activeItem?.id} onPress={pressItem} lifted={liftedId === a.id} onOpen={openItem} />
          ))}
        </ul>
        {results.length > limit && <MoreSentinel left={results.length - limit} page={PAGE} onMore={() => setLimit(l => l + PAGE)} />}
      </>
    );
  }

  const chipLabel = (k: Facet) => { const o = options[k].options.find(x => x.value === f[k]); return o ? (o.long ?? o.label) : f[k]; };

  return (
    <div className={`page ${s.lib}`} data-docked={docked} data-own-nav-toggle>
      <header className={s.top}>
        <button type="button" className={s.tgl} onClick={toggleSidebar} aria-label="Show or hide the sidebar" title="Sidebar"><PanelLeft aria-hidden /></button>
        <span className={s.csep} aria-hidden />
        <div className={s.crumb}><LibraryGlyph aria-hidden /><b>Library</b></div>
        <span className="spacer" />
        {!withSidebar && everything.length > 0 && <div className={s.topSearch} ref={setTopSearch} />}
        <NewButton onCapture={() => openCapture()} quiet={!everything.length} />
      </header>
      {/* The sidebar's search field filters the Library in place while you're here (⌘K still opens the palette). */}
      {(withSidebar ? searchSlot : topSearch) && createPortal(
        <div className="omni">
          <Search aria-hidden />
          <label htmlFor="lib-q" className="sr-only">{OMNI_PLACEHOLDER}</label>
          <input id="lib-q" ref={searchRef} type="search" value={f.q} placeholder={OMNI_PLACEHOLDER}
            autoComplete="off" spellCheck={false}
            onChange={e => set('q', e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && f.q) { e.preventDefault(); set('q', ''); } }} />
          {f.q ? (
            <button type="button" className={s.searchClear} aria-label="Clear search" onClick={() => { set('q', ''); searchRef.current?.focus(); }}><X aria-hidden /></button>
          ) : has('search') && <button type="button" className={s.omniKey} onClick={openPalette} aria-label="Search everything (⌘K)" title="Search everything (⌘K). Press / to search here"><Kbd>⌘K</Kbd></button>}
        </div>,
        (withSidebar ? searchSlot : topSearch)!,
      )}

      <div className={s.body}>
        <div className={s.head}>
          <h1>Library</h1>
        </div>
        {LibraryTabs && <LibraryTabs at="items" />}

        {everything.length > 0 && (
          <div className={s.filters}>
            <div className={s.facets}>
              {shownFacets.map(k => (
                <FacetPill key={k} label={FACET_META[k].label} allLabel={FACET_META[k].all} pillText={FACET_META[k].pill} allIcon={menuIcon(FACET_META[k].icon)}
                  lead={k === 'type' ? <Shapes aria-hidden className={s.pillLead} /> : undefined}
                  options={options[k].options} total={options[k].total} value={f[k]} onChange={v => set(k, v as never)}
                  autoOpen={opening === k} onOpenChange={onFacetOpenChange(k)} />
              ))}
              {hiddenExtras.length > 0 && (
                <AddFilter facets={hiddenExtras} onPick={k => { setRevealed(r => [...r, k]); setOpening(k); }} />
              )}
              {f.src && (
                <div className={s.facet}>
                  <span className={s.pill} data-set="true"><SourceIcon aria-hidden className={s.pillLead} /><span className={s.pillText}>{sourceKeyLabel(state, f.src)}</span></span>
                  <button type="button" className={s.pillClear} aria-label="Clear source filter" title="Clear the source filter" onClick={() => set('src', '')}><X aria-hidden /></button>
                </div>
              )}
              {f.starred && (
                <div className={s.facet}>
                  <span className={s.pill} data-set="true"><BookmarkFilled aria-hidden className={s.pillLead} /><span className={s.pillText}>Bookmarked</span></span>
                  <button type="button" className={s.pillClear} aria-label="Clear Bookmarked filter" title="Clear the bookmarked filter" onClick={() => set('starred', false)}><X aria-hidden /></button>
                </div>
              )}
              {active > 1 && <button type="button" className={s.clearFacets} onClick={clearFacets}>Clear filters</button>}
            </div>
            <button type="button" className={`${s.pill} ${s.filtersBtn}`} data-set={active > 0} onClick={() => setSheet(true)} aria-haspopup="dialog">
              <SlidersHorizontal aria-hidden className={s.pillLead} />Filters{active > 0 && <span className={s.badge}>{active}</span>}
            </button>
            {/* sort and view stay together at the end of the line (27 Oct: the view switch used to drop to a line of its own) */}
            <div className={s.viewTools}>
            <div className={s.sortPill}>
              <MenuPill label="Sort" ariaLabel={`Sort: ${SORT_LABEL[f.sort]}`} text={SORT_LABEL[f.sort]}
                options={(['recent', 'used', 'az'] as const).map(v => ({ value: v, label: SORT_LABEL[v], icon: menuIcon(SORT_ICON[v]) }))} value={f.sort}
                onChange={v => set('sort', v as LibFilters['sort'])} align="right" />
            </div>
            <div className={s.viewSet}>
              <Segmented label="View" className={s.viewSeg} value={f.view} onChange={v => set('view', v)} options={[
                { value: 'cards', ariaLabel: 'Cards', title: 'Cards', icon: <LayoutGrid aria-hidden /> },
                { value: 'list', ariaLabel: 'List', title: 'List', icon: <List aria-hidden /> },
                ...(has('organise') ? [{ value: 'gallery' as const, ariaLabel: 'Gallery', title: 'Gallery', icon: <GalleryIcon aria-hidden /> }] : []),
              ]} />
              {f.view === 'list' && results.length > 0 && (
                <button type="button" className={`${s.pill} ${s.treeAll}`} onClick={() => setAllOpen(!anyOpen)}
                  aria-label={anyOpen ? 'Collapse all' : 'Expand all'} title={anyOpen ? 'Collapse all groups' : 'Expand all groups'}>
                  {anyOpen ? <ChevronsDownUp aria-hidden className={s.pillLead} /> : <ChevronsUpDown aria-hidden className={s.pillLead} />}
                </button>
              )}
            </div>
            </div>
          </div>
        )}

        {everything.length > 0 && (
          <div className={s.resultLine} data-quiet={!narrowed}>
            <p role="status" className={s.count}>
              {countText}{f.q.trim() && results.length > 0 ? <> matching <b>“{f.q.trim()}”</b></> : null}
            </p>
            {f.tag && <PinTagButton tag={f.tag} pinned={(state.prefs.pinnedTags ?? []).some(t => t.toLowerCase() === f.tag.toLowerCase())} />}
            {SaveSearchButton && (f.q.trim() || active > (f.tag ? 1 : 0)) && <SaveSearchButton f={f} query={filtersToQuery({ ...f, view: 'cards', sort: 'recent' })} chip={chipLabel} />}
            {active > 0 && (
              <div className={s.mChips}>
                {f.starred && (
                  <button type="button" className={s.mChip} onClick={() => set('starred', false)} aria-label="Remove Bookmarked filter">Bookmarked<X aria-hidden /></button>
                )}
                {f.src && (
                  <button type="button" className={s.mChip} onClick={() => set('src', '')} aria-label={`Remove source filter: ${sourceKeyLabel(state, f.src)}`}>{sourceKeyLabel(state, f.src)}<X aria-hidden /></button>
                )}
                {ALL_FACETS.filter(k => f[k]).map(k => (
                  <button key={k} type="button" className={s.mChip} onClick={() => set(k, '' as never)} aria-label={`Remove ${FACET_META[k].label} filter: ${chipLabel(k)}`}>
                    {chipLabel(k)}<X aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {body}
      </div>
      {/* While items are selected, the selection bar takes the capture box's place at the bottom. */}
      <CaptureBox />

      {docked && asideSlot && everything.length > 0 && createPortal(
        <PanelDrop>
          <Panel a={activeItem} src={srcById.get(activeItem?.sourceId ?? '')} cols={activeItem ? colsOf(activeItem) : []} onShow={toPanel} />
        </PanelDrop>,
        asideSlot,
      )}
      <PanelSheet item={sheetItem} onClose={() => setSheetId(null)}>
        {sheetItem && <Panel a={sheetItem} src={srcById.get(sheetItem.sourceId ?? '')} cols={colsOf(sheetItem)} onClose={() => setSheetId(null)} />}
      </PanelSheet>
      <FilterSheet open={sheet} onClose={() => setSheet(false)} facets={sheetFacets} sort={f.sort} onSort={v => set('sort', v)}
        results={results.length} active={active} onClearAll={clearFacets} />
    </div>
  );
}

/** While filtering by a tag: pin it to the sidebar's Tags section (or unpin, with Undo). */
function PinTagButton({ tag, pinned }: { tag: string; pinned: boolean }) {
  const toast = useToast();
  return (
    <button type="button" className={s.pinTag} aria-pressed={pinned}
      onClick={() => {
        if (pinned) { const undo = unpinTag(tag); toast({ message: `Unpinned “${tag}”`, action: { label: 'Undo', run: undo } }); }
        else { const t = pinTag(tag); toast({ message: `Pinned “${t}” to the sidebar`, tone: 'ok' }); }
      }}>
      <Tag aria-hidden />{pinned ? 'Pinned to sidebar' : 'Pin to sidebar'}
    </button>
  );
}

/** Large libraries render in pages: the next page loads as this comes into view, or with the button (Stage 10). */
function MoreSentinel({ left, page, onMore }: { left: number; page: number; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const more = useRef(onMore);
  more.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more.current(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [left]);
  return (
    <div ref={ref} className={s.more}>
      <button type="button" className="btn" onClick={onMore}>Show {Math.min(page, left)} more <span className="muted">({left} not shown yet)</span></button>
    </div>
  );
}

/** "+ Filter": adds one of the less-used facets as a pill and opens it. */
export function AddFilter({ facets, onPick }: { facets: Facet[]; onPick: (k: Facet) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) list.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div className={s.facet} ref={wrap}>
      <button ref={btn} type="button" className={`${s.pill} ${s.pillAdd}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Plus aria-hidden className={s.pillLead} />Filter
      </button>
      {open && (
        <div className={s.menu} data-align="right" role="menu" aria-label="Add a filter" ref={list} onKeyDown={onKey}>
          <div className={s.menuHead} aria-hidden>Add a filter</div>
          {facets.map(k => (
            <button key={k} type="button" role="menuitem" tabIndex={-1} className={s.menuItem} onClick={() => { setOpen(false); onPick(k); }}>
              {menuIcon(FACET_META[k].icon)}<span className={s.menuLabel}>{FACET_META[k].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Black split button: "New" captures a link or text; the arrow offers a new collection too. */
/** `quiet`: the empty state carries the screen's one primary Capture, so this one drops to a secondary look. */
export function NewButton({ onCapture, quiet }: { onCapture: () => void; quiet?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const close = useCallback(() => { setOpen(false); setCreating(false); setName(''); }, []);
  const wrap = useOutsideClose(open, close);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('button, input')?.focus(); }, [open]);
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    const c = createCollection(v);
    close();
    trigger.current?.focus();
    toast({ message: `Created “${c.name}”`, tone: 'ok' });
  };
  return (
    <div className={s.newWrap} ref={wrap} data-quiet={quiet || undefined}>
      <button type="button" className={s.newMain} onClick={onCapture} title={`Capture (${displayKey(bindingOf('capture', getState().prefs.keys))})`}>
        <Plus aria-hidden /><span className={s.newText}>Capture</span>
      </button>
      <button ref={trigger} type="button" className={s.newMore} aria-label="More ways to add" aria-haspopup="true" aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}>
        <ChevronDown aria-hidden />
      </button>
      {open && (
        <div className={s.newMenu} ref={menu} role="group" aria-label="Add"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); trigger.current?.focus(); } }}>
          <button type="button" className={s.menuItem} onClick={() => { close(); onCapture(); }}>
            <Plus aria-hidden className={s.menuIcon} /><span className={s.menuLabel}>Capture</span><Kbd>{displayKey(bindingOf('capture', getState().prefs.keys))}</Kbd>
          </button>
          {creating ? (
            <form className={s.newForm} onSubmit={create}>
              <label className="sr-only" htmlFor="lib-new-col">New collection name</label>
              <input id="lib-new-col" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Collection name" maxLength={60} autoFocus />
              <button type="submit" className="btn primary sm" disabled={!name.trim()}>Create</button>
            </form>
          ) : (
            <button type="button" className={s.menuItem} onClick={() => setCreating(true)}>
              <LayoutGrid aria-hidden className={s.menuIcon} /><span className={s.menuLabel}>New collection…</span>
            </button>
          )}
          <Link href="/inbox" className={s.menuItem} onClick={close}>
            <Inbox aria-hidden className={s.menuIcon} /><span className={s.menuLabel}>Review your Inbox</span>
          </Link>
        </div>
      )}
    </div>
  );
}

/** The docked panel takes a dropped Library item and shows it (a target the card drag finds by data-item-drop). */
function PanelDrop({ children }: { children: ReactNode }) {
  return <div className={s.panelDrop} data-item-drop="panel">{children}</div>;
}

/** Narrow screens: the selected-item panel as a modal sheet from the right. */
export function PanelSheet({ item, onClose, children }: { item?: Artifact; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);
  return (
    <dialog ref={ref} className={s.panelSheet} aria-label={item ? item.title : 'Selected item'}
      onClose={() => { if (!ref.current?.open) onClose(); }} onCancel={e => { e.preventDefault(); onClose(); }} onMouseDown={e => { if (e.target === ref.current) onClose(); }}>
      {children}
    </dialog>
  );
}
