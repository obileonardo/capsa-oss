'use client';
/* App shell, direction "1 + 3" chosen by Elvis on 22 Oct (design-references/mockups/shell-picks.html, round 5):
 * Atelier sidebar on the warm canvas (workspace row with activity bell, search field, items, footer icons), a white
 * inset main panel that scrolls on its own, and a right-hand slot only the Library fills. No full-width window bar.
 * Wide screens: the sidebar is expanded (icons and labels) or an icon rail (24 Oct, references S16/S17); the one toggle
 * is the top bar's, left of the breadcrumb, in both states, and ⌘\ does the same. Narrow screens: document scroll,
 * sidebar as a drawer. */
import {
  ChevronDown, ChevronLeft, CircleHelp, Download, Inbox, LibraryBig, Menu, Plus, Search, Settings, Shapes, SquarePen, Tag, Trash2, X,
} from '@/components/ui/icons';
import { Activity as ActivityGlyph, GraduationCap } from '@/components/ui/icons';
// what the features in this build add to the shell (lib/features.ts), each imported where it always was
import AskLibrary from '@/slots.gen/AskLibrary';
import SetupCard from './SetupCard';
import InviteCard from '@/slots.gen/InviteCard';
import RailPanel from './RailPanel';
import { thingsOrder, type SideView, type ThingId } from '@/lib/sidebar';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DemoTag, Kbd, ToastProvider, useOutsideClose, useToast } from '@/components/ui';
import RegisterServiceWorker from '@/components/pwa/RegisterServiceWorker';
import { backupFileName, makeBackup } from '@/lib/backup';
import { storageEstimate } from '@/lib/db';
import { bytes, STATUS_LABEL } from '@/lib/format';
import { createCollection, createProject, currentLibraryId, getState, hydrate, inboxCount, pinTag, setPrefs, starredArtifacts, switchLibrary, tagCounts, unpinTag, useAppState } from '@/lib/store';
import { TypeIcon } from '@/components/ui';
import { brandGlyph, BrandMark } from '@/components/ui/BrandIcon';
import { bindingOf, displayKey, matches, quickShortcutsFor } from '@/lib/shortcuts';
import { LATEST_CHANGE } from '@/lib/changelog';
import { groupIcon } from '@/components/library/groupIcons';
import { download } from '@/lib/zip';
import CaptureDialog from './CaptureDialog';
import CommandPalette from '@/slots.gen/CommandPalette';
import { OMNI_PLACEHOLDER } from './omni';
import { BACK_KEY, SETTINGS_HOME } from '@/components/settings/sections';
import SettingsNav from '@/components/settings/SettingsNav';
import { HELP_GROUPS } from '@/components/help/sections';
import { AI_PAGES, isAiPage } from '@/components/ai/sections';
import { aiById, type AiDef } from '@/lib/ais';
import { libraries } from '@/lib/libraries';
import { AiLogo, logoIcon } from '@/components/ai/AiLogo';
import ConnectDialog from '@/components/ai/ConnectDialog';
import { aiStatus } from '@/components/ai/YourAi';
import { LibrarySwitcher } from './Libraries';
import { Activity } from './Notifications';
import type { LucideIcon } from '@/components/ui/icons';
import SearchRows from '@/slots.gen/SearchRows';
import SmartRows from '@/slots.gen/SmartRows';
import { has } from '@/lib/features';
import s from './shell.module.css';

/** Sidebar glyphs: the flat brand glyph where one exists, Lucide until then. */
const InboxGlyph = brandGlyph('inbox', Inbox);
const LibraryGlyph = brandGlyph('library', LibraryBig);
const PlaygroundGlyph = brandGlyph('playground', Shapes);
const SearchGlyph = brandGlyph('search', Search);
const SettingsGlyph = brandGlyph('settings', Settings);
const CaptureGlyph = brandGlyph('capture', SquarePen);

interface ShellApi {
  openPalette: () => void;
  openCapture: (prefill?: string) => void;
  /** Expand the sidebar or collapse it to the icon rail (a drawer on narrow screens). Every page's top bar carries this toggle. */
  toggleSidebar: () => void;
  /** The right-hand panel slot (the Library portals its selected-item panel here). Null until mounted. */
  asideSlot: HTMLElement | null;
  /** The sidebar's search slot (the Library portals its own filtering field here, replacing the default). */
  searchSlot: HTMLElement | null;
  /** + Add AI: the connect stepper, starting at the picker of supported AIs. */
  openAddAi: () => void;
  /** Connect your AI (27 Oct): the step-by-step modal, on one AI's steps when given its id, else at the picker. */
  openConnect: (ai?: string) => void;
  /** Settings › Sidebar: the view now, and setting it (Icons only is the rail; Compact is tighter rows). */
  sidebarView: SideView;
  setSidebarView: (v: SideView) => void;
}
const ShellCtx = createContext<ShellApi>({ openPalette: () => {}, openCapture: () => {}, toggleSidebar: () => {}, asideSlot: null, searchSlot: null, openAddAi: () => {}, openConnect: () => {}, sidebarView: 'full', setSidebarView: () => {} });
export const useShell = () => useContext(ShellCtx);

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};
const NARROW = '(max-width: 860px)';
/** Wide screens: 'full' (icons and labels) or 'rail' (icons only). <html data-side> is set before paint by the root layout
 * script from capsa-side, so CSS keys off it; React mirrors it for the parts that need it (tooltips, titles). */
const sideNow = () => typeof document !== 'undefined' && document.documentElement.dataset.side === 'rail';

/** Whether the rail is showing. Native titles would double up with the rail's own tooltip, so rail items drop them. */
const RailCtx = createContext(false);

export default function AppShell({ children }: { children: ReactNode }) {
  const { state, ready, saveError } = useAppState();
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const [capture, setCapture] = useState<{ open: boolean; prefill?: string }>({ open: false });
  const [navOpen, setNavOpen] = useState(false);       // narrow screens: sidebar as a drawer
  const [rail, setRail] = useState(false);             // wide screens: sidebar collapsed to the icon rail
  const [asideSlot, setAsideSlot] = useState<HTMLElement | null>(null);
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);
  const [connect, setConnect] = useState<{ open: boolean; ai?: string }>({ open: false });
  const openConnect = useCallback((ai?: string) => setConnect({ open: true, ai }), []);
  /** While switching libraries, the page waits for the new library and its address (so nothing from the old one shows). */
  const [swap, setSwap] = useState<{ to: string; ready: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => { hydrate(); }, []);
  useEffect(() => setNavOpen(false), [pathname]);
  const inSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  const inHelp = pathname === '/help' || pathname.startsWith('/help/');
  const inAi = pathname === '/ai' || pathname.startsWith('/ai/');
  // remember the last page outside Settings, Help and Your AI, for their "Back to app"
  useEffect(() => { if (!inSettings && !inHelp && !inAi) try { sessionStorage.setItem(BACK_KEY, pathname + location.search); } catch { /* private mode */ } }, [pathname, inSettings, inHelp, inAi]);
  useEffect(() => { if (swap?.ready && pathname === swap.to) setSwap(null); }, [swap, pathname]);

  /** Switch libraries, staying on the same kind of page (an item's page goes to the Library, a board or an easel to Playground...). */
  const goToLibrary = useCallback(async (id: string) => {
    if (id === currentLibraryId()) return;
    const from = location.pathname;
    setSwap({ to: from, ready: false });
    const ok = await switchLibrary(id);
    if (!ok) { setSwap(null); return; }
    const to = samePageKind(from, getState().prefs.ais?.map(x => x.id) ?? []);
    setSwap({ to, ready: true });
    if (to !== from) router.push(to);
  }, [router]);
  useEffect(() => { setRail(sideNow()); }, []);

  // theme: system / light / dark (stored in prefs; the root layout script prevents a flash on load)
  useEffect(() => {
    if (!ready) return;
    const apply = () => {
      const t = state.prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.prefs.theme;
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem('capsa-theme', state.prefs.theme); } catch { /* private mode */ }
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [ready, state.prefs.theme]);

  // icon style: solid / line (stored in prefs and mirrored to capsa-icons, which the root layout script applies before paint)
  useEffect(() => {
    if (!ready) return;
    const v = state.prefs.icons === 'line' ? 'line' : 'solid';
    document.documentElement.dataset.icons = v;
    try { localStorage.setItem('capsa-icons', v); } catch { /* private mode */ }
  }, [ready, state.prefs.icons]);

  // style: Classic / Paper (stored in prefs and mirrored to capsa-look, which the root layout script applies before paint)
  useEffect(() => {
    if (!ready) return;
    const v = state.prefs.look === 'paper' ? 'paper' : 'classic';
    document.documentElement.dataset.look = v;
    try { localStorage.setItem('capsa-look', v); } catch { /* private mode */ }
  }, [ready, state.prefs.look]);

  const openPalette = useCallback(() => setPalette(true), []);
  const openCapture = useCallback((prefill?: string) => setCapture({ open: true, prefill }), []);
  const toggleSidebar = useCallback(() => {
    if (matchMedia(NARROW).matches) { setNavOpen(o => !o); return; }
    const next = !sideNow();
    document.documentElement.dataset.side = next ? 'rail' : 'full';
    try { localStorage.setItem('capsa-side', next ? 'rail' : 'full'); } catch { /* private mode */ }
    setRail(next);
  }, []);
  const setRailTo = useCallback((on: boolean) => {
    document.documentElement.dataset.side = on ? 'rail' : 'full';
    try { localStorage.setItem('capsa-side', on ? 'rail' : 'full'); } catch { /* private mode */ }
    setRail(on);
  }, []);
  const compact = state.prefs.sidebar?.view === 'compact';
  const sidebarView: SideView = rail ? 'rail' : compact ? 'compact' : 'full';
  const setSidebarView = useCallback((v: SideView) => {
    setRailTo(v === 'rail');
    if (v !== 'rail') setPrefs({ sidebar: { ...state.prefs.sidebar, view: v } });
  }, [setRailTo, state.prefs.sidebar]);

  // THM-07 (Track C): the bindings come from lib/shortcuts.ts, with the person's changes (prefs.keys)
  const keyMap = state.prefs.keys;
  useEffect(() => {
    const palKey = bindingOf('palette', keyMap), sideKey = bindingOf('sidebar', keyMap), capKey = bindingOf('capture', keyMap);
    // a binding without ⌘ or ⌥ is a plain key: it waits while you type, like C always did
    const plain = (b: string) => !/^(Mod|Alt)\+/.test(b) && !/\+(Mod|Alt)\+/.test(b);
    const onKey = (e: KeyboardEvent) => {
      if (document.documentElement.dataset.recordingKeys) return; // Settings is recording a new shortcut
      const typing = isTyping(e);
      if (matches(e, palKey) && !(plain(palKey) && typing) && has('search')) { e.preventDefault(); setPalette(p => !p); return; }
      if (matches(e, sideKey) && !(plain(sideKey) && typing) && !document.querySelector('dialog[open]')) { e.preventDefault(); toggleSidebar(); return; }
      if (matches(e, capKey) && !(plain(capKey) && typing) && !document.querySelector('dialog[open]')) { e.preventDefault(); openCapture(); return; }
      // Cmd+1 to Cmd+9: the libraries, in the switcher's order
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key) && !document.querySelector('dialog[open]')) {
        const lib = libraries()[Number(e.key) - 1];
        if (lib) { e.preventDefault(); void goToLibrary(lib.id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCapture, toggleSidebar, keyMap, goToLibrary]);

  return (
    <ToastProvider>
      <RegisterServiceWorker />
      <ShellCtx.Provider value={{ openPalette, openCapture, toggleSidebar, asideSlot, searchSlot, openAddAi: () => openConnect(), openConnect, sidebarView, setSidebarView }}>
        <div className={s.app}>
          <RailCtx.Provider value={rail}>
            <nav className={s.sidebar} data-open={navOpen} data-density={compact ? 'compact' : undefined} aria-label={inSettings ? 'Settings' : inHelp ? 'Help' : inAi ? 'Your AI' : 'Main'} data-shell-nav>
              {inSettings ? <SettingsNav />
                : inHelp ? <SectionSidebar base="/help" groups={HELP_GROUPS} />
                : inAi ? <SectionSidebar base="/ai" groups={aiGroups(state.prefs.ais, () => openConnect())} />
                : <Sidebar onCapture={() => openCapture()} onSearch={openPalette} setSearchSlot={setSearchSlot} saveError={saveError} onSwitch={goToLibrary} onAddAi={openConnect} />}
            </nav>
          </RailCtx.Provider>
          {rail && <RailTip />}
          {navOpen && <div className={s.scrim} onClick={() => setNavOpen(false)} />}
          <main className={s.main} id="main">
            {ready && !swap ? <Fragment key={currentLibraryId()}>{children}</Fragment> : <div className="empty" aria-busy="true"><BrandMark size={32} className="capsa-loading" /><p>Loading your library…</p></div>}
          </main>
          <div className={s.aside} ref={setAsideSlot} />
          <button type="button" className={s.menuBtn} aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu aria-hidden /></button>
        </div>
        {CommandPalette && <CommandPalette open={palette} onClose={() => setPalette(false)} onCapture={() => { setPalette(false); openCapture(); }} />}
        <CaptureDialog open={capture.open} prefill={capture.prefill} onClose={() => setCapture({ open: false })} />
        <ConnectDialog open={connect.open} start={connect.ai} onClose={() => setConnect(c => ({ ...c, open: false }))} />
        {ready && !swap && AskLibrary && <AskLibrary key={currentLibraryId()} aside={asideSlot} />}
      </ShellCtx.Provider>
    </ToastProvider>
  );
}

/* ---------- Settings and Help sidebar (Linear-style): "Back to app", then the area's sections; it replaces the app's
   navigation on settings and help pages, and collapses to the same icon rail ---------- */
type SectionGroup = { label: string; sections: readonly { id: string; label: string; icon: LucideIcon }[]; after?: ReactNode };
function SectionSidebar({ base, groups }: { base: string; groups: readonly SectionGroup[] }) {
  const pathname = usePathname();
  const [back, setBack] = useState('/library');
  useEffect(() => { try { setBack(sessionStorage.getItem(BACK_KEY) || '/library'); } catch { /* private mode */ } }, []);
  return (
    <>
      <Link href={back} className={`${s.row} ${s.backRow}`} data-tip="Back to app"><ChevronLeft aria-hidden /><span className={s.lbl}>Back to app</span></Link>
      <div className={s.gap} />
      {groups.map(g => {
        const hid = `${base.slice(1)}-group-${g.label.toLowerCase().replace(/\W+/g, '-')}`;
        return (
          // a quiet heading over each group (a label, not a link); the icon rail hides it and draws a hairline instead
          <div key={g.label} className={s.sec} role="group" aria-labelledby={hid}>
            <div className={`${s.sh} ${s.shStatic}`}><span className={s.shLabel} id={hid}>{g.label}</span></div>
            {g.sections.map(({ id, label, icon: Icon }) => (
              <Link key={id} href={`${base}/${id}`} className={s.row} aria-current={pathname === `${base}/${id}` ? 'page' : undefined} data-tip={label}>
                <Icon aria-hidden /><span className={s.lbl}>{label}</span>
              </Link>
            ))}
            {'after' in g && g.after}
          </div>
        );
      })}
    </>
  );
}

/* ---------- Atelier sidebar ---------- */
export function Sidebar({ onCapture, onSearch, setSearchSlot, saveError, onSwitch, onAddAi }: {
  onCapture: () => void; onSearch: () => void; setSearchSlot: (el: HTMLElement | null) => void; saveError: string | null;
  onSwitch: (id: string) => void; onAddAi: (ai?: string) => void;
}) {
  const { state } = useAppState();
  const pathname = usePathname();
  const toast = useToast();
  const rail = useContext(RailCtx);
  const tip = (t: string) => (rail ? undefined : t); // the rail shows its own tooltip (data-tip) instead
  const [usage, setUsage] = useState<number | null>(null);
  const hasDemo = state.sources.some(x => x.demo) || state.boards.some(x => x.demo);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => storageEstimate().then(e => { if (live) setUsage(e ? e.usage : null); }), 400);
    return () => { live = false; clearTimeout(t); };
  }, [state]);

  const backup = async () => {
    try {
      const blob = await makeBackup();
      download(blob, backupFileName());
      toast({ message: `Backup downloaded (${bytes(blob.size)})`, tone: 'ok' });
    } catch (e) { toast({ message: `Backup failed: ${(e as Error).message}` }); }
  };

  // The mockup shows a count on Inbox only; Library's count stays for screen readers ("Library, 7 items"). In the rail the
  // label is visually hidden (still the link's name), the tooltip shows it, and Inbox's count becomes a corner badge.
  const nav = (href: string, label: string, Icon: typeof Inbox, count?: number, quietCount = false, also: string[] = []) => {
    const active = pathname === href || pathname.startsWith(href + '/') || also.some(a => pathname.startsWith(a));
    return (
      <Link href={href} className={s.row} aria-current={active ? 'page' : undefined} data-tip={label}>
        <Icon aria-hidden /> <span className={s.lbl}>{label}</span>
        {!!count && (quietCount ? <span className="sr-only">, {count} items</span> : <span className={`${s.cnt} ${s.badge}`}>{count}</span>)}
      </Link>
    );
  };
  const memberCount = (field: 'collections' | 'projects', id: string) => state.artifacts.filter(a => (a[field] ?? []).includes(id)).length;
  const starred = starredArtifacts(state);
  const tags = tagCounts(state);
  const pins = state.prefs.pinnedTags ?? [];
  const size = usage === null ? null : bytes(usage);
  // the rail's Library panel: where it opens (the rail's right edge, the icon's top) and the icon to return focus to
  const [panel, setPanel] = useState<{ at: DOMRect; opener: HTMLElement } | null>(null);

  // "your things", in the person's order (Settings › Sidebar), each one hideable
  const hidden = new Set(state.prefs.sidebar?.hidden ?? []);
  const yours: Record<ThingId, ReactNode> = {
    bookmarks: (
starred.length > 0 && <Section title="Bookmarks" href="/library?starred=1" railHidden>
        {starred.slice(0, 8).map(a => {
          return (
            <Link key={a.id} href={`/library/${a.id}`} className={`${s.row} ${s.bmRow}`} aria-current={pathname === `/library/${a.id}` ? 'page' : undefined}>
              <TypeIcon type={a.type} />
              <span className={s.rowText}>{a.title}</span>
            </Link>
          );
        })}
        {starred.length > 8 && <Link href="/library?starred=1" className={`${s.row} ${s.rowMore}`}>All {starred.length} bookmarks</Link>}
      </Section>
    ),
    collections: (
<Section title="Collections" href="/collections" onCreate={name => { const c = createCollection(name); toast({ message: `Created “${c.name}”`, tone: 'ok' }); }}>
        {state.collections.map(c => (
          <DropRow key={c.id} field="collections" id={c.id} name={c.name} href={`/collections/${encodeURIComponent(c.id)}`} current={pathname === `/collections/${c.id}`}>
            {(() => { const GI = groupIcon(c.icon, 'collections'); return <GI className={s.ic3} />; })()}
            <span className={s.rowText}>{c.name}</span>
            <span className={s.cnt}>{memberCount('collections', c.id) || ''}</span>
          </DropRow>
        ))}
        {SmartRows && <SmartRows pathname={pathname} />}
      </Section>
    ),
    projects: (
<Section title="Projects" href="/projects" onCreate={name => { const p = createProject(name); toast({ message: `Created “${p.name}”`, tone: 'ok' }); }}>
        {state.projects.map(p => (
          <DropRow key={p.id} field="projects" id={p.id} name={p.name} href={`/projects/${encodeURIComponent(p.id)}`} current={pathname === `/projects/${p.id}`}>
            {(() => { const GI = groupIcon(p.icon, 'projects'); return <GI className={s.ic3} />; })()}
            <span className={s.rowText}>{p.name}</span>
            <span className={s.cnt}>{(memberCount('projects', p.id) + state.boards.filter(b => b.projectId === p.id).length) || ''}</span>
          </DropRow>
        ))}
      </Section>
    ),
    tags: (
(pins.length > 0 || tags.length > 0) && <Section title="Tags" railHidden createLabel="Pin a tag" suggestions={tags.map(t => t.tag).filter(t => !pins.some(p => p.toLowerCase() === t.toLowerCase()))}
        onCreate={name => { const t = pinTag(name); if (t) toast({ message: `Pinned “${t}” to the sidebar`, tone: 'ok' }); }}>
        {pins.map(t => {
          const n = tags.find(x => x.tag.toLowerCase() === t.toLowerCase())?.count ?? 0;
          const href = `/library?tag=${encodeURIComponent(t)}`;
          return (
            <div key={t} className={s.pinRow}>
              <Link href={href} className={s.row}>
                <Tag className={s.ic3} />
                <span className={s.rowText}>{t}</span>
                <span className={s.cnt}>{n || ''}</span>
              </Link>
              <button type="button" className={s.unpin} aria-label={`Unpin tag ${t}`} title="Unpin"
                onClick={() => { const undo = unpinTag(t); toast({ message: `Unpinned “${t}”`, action: { label: 'Undo', run: undo } }); }}><X aria-hidden /></button>
            </div>
          );
        })}
      </Section>
    ),
    searches: (
SearchRows && (state.organise?.searches ?? []).some(x => x.pinned) && <Section title="Searches" railHidden><SearchRows /></Section>
    ),
  };

  return (
    <>
      <div className={s.ws}>
        <LibrarySwitcher onSwitch={onSwitch} />
        <span className="spacer" />
        <Activity rail={rail} />
      </div>
      <div className={s.searchBox}>
        <div className={s.searchSlot} ref={setSearchSlot} />
        {has('search') && <button type="button" className={`omni ${s.searchDefault}`} onClick={onSearch} data-tip="Search" data-kbd={displayKey(bindingOf('palette', state.prefs.keys))}>
          <SearchGlyph aria-hidden /><span className={s.omniText}>{OMNI_PLACEHOLDER}</span><Kbd>{displayKey(bindingOf('palette', state.prefs.keys))}</Kbd>
        </button>}
      </div>
      <button type="button" className={s.row} onClick={onCapture} title={tip(`Capture (${displayKey(bindingOf('capture', state.prefs.keys))})`)} data-tip="Capture" data-kbd={displayKey(bindingOf('capture', state.prefs.keys))}><CaptureGlyph aria-hidden /><span className={s.lbl}>Capture</span></button>
      <div className={s.gap} />
      {nav('/inbox', 'Inbox', InboxGlyph, inboxCount(state))}
      {rail
        ? <button type="button" className={s.row} aria-haspopup="dialog" aria-expanded={!!panel} data-tip="Library"
            aria-current={pathname === '/library' || pathname.startsWith('/library/') ? 'page' : undefined}
            onClick={e => {
              const el = e.currentTarget; const r = el.getBoundingClientRect(); const side = el.closest('nav')?.getBoundingClientRect();
              setPanel(p => (p ? null : { at: new DOMRect(r.x, r.y, (side?.right ?? r.right) - r.x, r.height), opener: el }));
            }}>
            <LibraryGlyph aria-hidden /> <span className={s.lbl}>Library</span><span className="sr-only">, {state.artifacts.length} items</span>
          </button>
        : nav('/library', 'Library', LibraryGlyph, state.artifacts.length, true)}
      {rail && panel && <RailPanel at={panel.at} opener={panel.opener} onClose={() => setPanel(null)} />}
      {has('playground') && nav('/playground', 'Playground', PlaygroundGlyph, undefined, false, ['/boards/', '/easels/'])}

      {thingsOrder(state.prefs).map(id => (hidden.has(id) ? null : <Fragment key={id}>{yours[id]}</Fragment>))}

      <div className={s.grow} />
      {!hidden.has('ai') && <Section title="Your AI" href="/ai/overview" railHidden>
        {(state.prefs.ais ?? []).map(x => aiById(x.id)).filter((a): a is AiDef => !!a).map(a => (
          <button key={a.id} type="button" className={s.row} onClick={() => onAddAi(a.id)} aria-haspopup="dialog" data-ai-row={a.id}>
            <AiLogo ai={a} size={16} /><span className={s.rowText}>{a.name}</span><span className={s.cntMuted}>{aiStatus(state, a)}</span>
          </button>
        ))}
        <button type="button" className={`${s.row} ${s.addRow}`} onClick={() => onAddAi()} aria-haspopup="dialog"><Plus aria-hidden className={s.ic3} />Add AI</button>
      </Section>}
      {((has('activity') && !hidden.has('activity')) || (has('learn') && !hidden.has('learn'))) && <div className={s.gap} />}
      {has('activity') && !hidden.has('activity') && nav('/activity', 'Activity', ActivityGlyph)}
      {has('learn') && !hidden.has('learn') && nav('/learn', 'Learn', GraduationCap)}
      <Link href="/deleted" className={`${s.row} ${s.deletedRow}`} aria-current={pathname === '/deleted' || pathname.startsWith('/deleted/') ? 'page' : undefined} data-tip="Deleted">
        <Trash2 aria-hidden /><span className={s.lbl}>Deleted</span>
      </Link>
      <SetupCard rail={rail} />
      {InviteCard && <InviteCard rail={rail} />}
      <div className={s.foot}>
        <button type="button" className={s.fi} onClick={backup} aria-label="Back up now" title={tip('Back up now (downloads a .zip)')} data-tip="Back up now"><Download aria-hidden /></button>
        <Link href={SETTINGS_HOME} className={s.fi} aria-label="Settings" title={tip('Settings')} data-tip="Settings"><SettingsGlyph aria-hidden /></Link>
        <Help />
        <span className="spacer" />
        {hasDemo && <span className={s.demoRow}><DemoTag /></span>}
        {saveError
          ? (rail ? <span className={s.saveDot} role="img" tabIndex={0} aria-label={saveError} data-tip={saveError} /> : <small className={s.saveErr}>{saveError}</small>)
          : <small className={s.size} title="Saved on this device only">{size ?? ''}</small>}
      </div>
    </>
  );
}

/** Help: the keyboard shortcuts that exist today. */
export function Help() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const rail = useContext(RailCtx);
  const { state } = useAppState();
  const keys = quickShortcutsFor(state.prefs.keys).map(k => [k.keys, k.what] as const); // the shared list (lib/shortcuts.ts), with changed keys
  const unseen = (state.prefs.whatsNewSeen ?? '') < LATEST_CHANGE; // HLP-09 (Track C)
  return (
    <div className={s.wsWrap} ref={wrap}>
      <button type="button" className={s.fi} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)} aria-label={unseen ? 'Help, something new' : 'Help'} title={rail ? undefined : 'Help'} data-tip="Help">
        <CircleHelp aria-hidden />{unseen && <span className={s.newDot} aria-hidden />}
      </button>
      {open && (
        <div className={`menu ${s.popUp}`} role="group" aria-label="Keyboard shortcuts" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
          <p className={s.popHead}>Keyboard shortcuts</p>
          {keys.map(([k, what]) => <div key={k} className={s.keyRow}><span>{what}</span><Kbd>{k}</Kbd></div>)}
          <div className="sep" />
          <Link href="/help/whats-new" onClick={close}>What’s new{unseen && <><span className="sr-only"> (new)</span><span className={s.newDot} aria-hidden /></>}</Link>
          <Link href="/help/shortcuts" onClick={close}>All help: shortcuts, your data, backing up</Link>
        </div>
      )}
    </div>
  );
}

/** A collection or project in the sidebar; drop a Library item on it to file it there (Undo in the toast). The drag is
 * components/ui/useCardDrag.ts; this row is a target it finds by data-item-drop. */
export function DropRow({ field, id, name, href, current, children }: { field: 'collections' | 'projects'; id: string; name: string; href: string; current: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={s.row} aria-current={current ? 'page' : undefined} data-item-drop={`${field}:${id}`} data-tip={name}>
      {children}
    </Link>
  );
}

/** Sidebar section: header shows + (create) and a collapse chevron on hover or focus. */
export function Section({ title, href, onCreate, createLabel, suggestions, railHidden, children }: {
  title: string; href?: string; onCreate?: (name: string) => void; createLabel?: string; suggestions?: string[];
  /** Left out of the icon rail (bookmarks, tags and Your AI would be rows of near-identical icons there). */
  railHidden?: boolean; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (creating) input.current?.focus(); }, [creating]);
  const one = title.replace(/s$/, '').toLowerCase();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v || !onCreate) return;
    onCreate(v); setName(''); setCreating(false);
  };
  return (
    <div className={s.sec} data-rail={railHidden ? 'hide' : undefined}>
      <div className={s.sh}>
        {href ? <Link href={href} className={s.shLabel}>{title}</Link> : <><span className={s.shLabel}>{title}</span><span className="spacer" /></>}
        {onCreate && <button type="button" className={s.shBtn} onClick={() => { setCollapsed(false); setCreating(true); }} aria-label={createLabel ?? `Add ${one}`} title={createLabel ?? `Add ${one}`}><Plus aria-hidden /></button>}
        <button type="button" className={s.shBtn} data-collapsed={collapsed} onClick={() => setCollapsed(c => !c)} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Show' : 'Hide'} ${title}`}><ChevronDown aria-hidden /></button>
      </div>
      {creating && (
        <form className={s.newRow} onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setCreating(false); setName(''); } }}>
          <label className="sr-only" htmlFor={`new-${one}`}>{createLabel ? `${createLabel}: tag name` : `New ${one} name`}</label>
          <input id={`new-${one}`} ref={input} className="input" value={name} onChange={e => setName(e.target.value)} placeholder={createLabel ? 'Tag to pin' : `New ${one} name`} maxLength={60}
            list={suggestions ? `new-${one}-list` : undefined} autoComplete="off"
            onBlur={() => { if (!name.trim()) setCreating(false); }} />
          {suggestions && <datalist id={`new-${one}-list`}>{suggestions.map(t => <option key={t} value={t} />)}</datalist>}
        </form>
      )}
      {!collapsed && children}
    </div>
  );
}

/** The rail's tooltip: an item's label (data-tip) and shortcut (data-kbd) beside it, on hover and on keyboard focus. One
 * fixed element for the whole rail, because the sidebar scrolls and would clip a tooltip drawn inside it. It repeats the
 * item's accessible name, so it's hidden from screen readers. */
function RailTip() {
  const [tipState, setTip] = useState<{ text: string; kbd?: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[data-shell-nav]'); // the app's sidebar or, in Settings, the settings one
    if (!nav) return;
    const show = (el: HTMLElement | null) => {
      if (!el || matchMedia(NARROW).matches || el.getAttribute('aria-expanded') === 'true') { setTip(null); return; }
      const r = el.getBoundingClientRect();
      setTip({ text: el.dataset.tip ?? '', kbd: el.dataset.kbd, x: Math.round(nav.getBoundingClientRect().right + 6), y: Math.round(r.top + r.height / 2) });
    };
    const target = (e: Event) => (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]') ?? null;
    const over = (e: PointerEvent) => { if (e.pointerType !== 'touch') show(target(e)); };
    const out = (e: PointerEvent) => { const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-tip]'); if (!to || !nav.contains(to)) setTip(null); };
    const focus = (e: FocusEvent) => { const el = target(e); if (el && el.matches(':focus-visible')) show(el); };
    const hide = () => setTip(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    nav.addEventListener('pointerover', over); nav.addEventListener('pointerout', out);
    nav.addEventListener('focusin', focus); nav.addEventListener('focusout', hide);
    nav.addEventListener('pointerdown', hide); nav.addEventListener('scroll', hide); nav.addEventListener('keydown', esc);
    return () => {
      nav.removeEventListener('pointerover', over); nav.removeEventListener('pointerout', out);
      nav.removeEventListener('focusin', focus); nav.removeEventListener('focusout', hide);
      nav.removeEventListener('pointerdown', hide); nav.removeEventListener('scroll', hide); nav.removeEventListener('keydown', esc);
    };
  }, []);
  if (!tipState?.text) return null;
  return (
    <div className={s.tip} style={{ left: tipState.x, top: tipState.y }} aria-hidden data-rail-tip>
      {tipState.text}{tipState.kbd && <Kbd>{tipState.kbd}</Kbd>}
    </div>
  );
}

/** Where switching libraries lands: the same kind of page, never a record that belongs to the other library. */
function samePageKind(path: string, ais: string[]): string {
  const [, seg = '', sub = ''] = path.split('/');
  if (seg === 'settings' || seg === 'help') return path;
  if (seg === 'ai') return isAiPage(sub) || ais.includes(sub) ? path : '/ai/overview';
  if (seg === 'smart') return '/collections';
  if (has('playground') && ['boards', 'easels', 'playground'].includes(seg)) return '/playground';
  if (['inbox', 'collections', 'projects', 'deleted', 'capture'].includes(seg)) return `/${seg}`;
  return '/library';
}

/** The Your AI area's sidebar: Overview, the AIs added to this library and + Add AI; then the two ways in. */
function aiGroups(ais: { id: string }[] | undefined, onAdd: () => void): SectionGroup[] {
  const added = (ais ?? []).map(x => aiById(x.id)).filter((a): a is AiDef => !!a);
  return [
    { label: 'Your AI', sections: [AI_PAGES[0], ...added.map(a => ({ id: a.id, label: a.name, icon: logoIcon(a) }))],
      after: <button type="button" className={`${s.row} ${s.addRow}`} onClick={onAdd} data-tip="Add AI"><Plus aria-hidden /><span className={s.lbl}>Add AI</span></button> },
    { label: 'Connect', sections: [AI_PAGES[1], AI_PAGES[2]] },
  ];
}
