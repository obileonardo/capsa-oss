'use client';
/* The Settings sidebar (26 Oct): Back to app, the search field, then the groups. The open group lists its sections under
 * it, the one in view marked. Typing in the search swaps the groups for the matches; ↑ ↓ move, ↵ opens, Esc clears.
 * "/" focuses the search anywhere in Settings (lib/shortcuts.ts). In the icon rail the groups keep their icons and the
 * search becomes an icon that opens the sidebar and the field. */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, X } from '@/components/ui/icons';
import { Kbd } from '@/components/ui';
import { useShell } from '@/components/shell/AppShell';
import sh from '@/components/shell/shell.module.css';
import { BACK_KEY, SETTINGS_GROUPS } from './sections';
import { searchSettings } from './search';
import n from './settingsNav.module.css';

const NARROW = '(max-width: 860px)';
export const JUMP_EVENT = 'capsa-settings-jump';
/** The page's own search button (narrow screens) asks the sidebar to open its search. */
export const SEARCH_EVENT = 'capsa-settings-search';

/** Go to a group, at an anchor: on the same page the hash changes and the page scrolls there; otherwise it navigates. */
export function useSettingsGo() {
  const router = useRouter();
  const { toggleSidebar } = useShell();
  return useCallback((group: string, anchor?: string) => {
    const path = `/settings/${group}`;
    const url = anchor ? `${path}#${anchor}` : path;
    const nav = document.querySelector<HTMLElement>('nav[data-shell-nav]');
    if (matchMedia(NARROW).matches && nav?.dataset.open === 'true') toggleSidebar(); // close the drawer
    if (location.pathname === path) {
      history.replaceState(history.state, '', url);
      window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { anchor: anchor ?? '', focus: true } }));
    } else {
      if (anchor) try { sessionStorage.setItem('capsa-settings-focus', anchor); } catch { /* private mode */ }
      router.push(url, { scroll: false });
    }
  }, [router, toggleSidebar]);
}

export default function SettingsNav() {
  const pathname = usePathname();
  const go = useSettingsGo();
  const { toggleSidebar } = useShell();
  const [back, setBack] = useState('/library');
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/:/g, '');
  const hits = useMemo(() => searchSettings(q), [q]);
  const current = pathname.split('/')[2] ?? '';
  useEffect(() => { try { setBack(sessionStorage.getItem(BACK_KEY) || '/library'); } catch { /* private mode */ } }, []);
  useEffect(() => setActive(0), [q]);

  // "/" focuses the search (not while typing, recording a shortcut or with a dialog open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.documentElement.dataset.recordingKeys || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      openSearch();
    };
    const onAsk = () => openSearch();
    window.addEventListener('keydown', onKey); window.addEventListener(SEARCH_EVENT, onAsk);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(SEARCH_EVENT, onAsk); };
  }); // eslint-disable-line react-hooks/exhaustive-deps -- reads the latest openSearch

  // which section is in view, for the open group's list. The group's page can mount a moment after this sidebar (a direct
  // load, or a move to another group), so it waits a few frames for the sections to exist before watching them.
  useEffect(() => {
    let io: IntersectionObserver | undefined, raf = 0, tries = 0;
    const watch = () => {
      const secs = [...document.querySelectorAll<HTMLElement>('main section[data-sub]')];
      if (!secs.length) { if (tries++ < 120) raf = requestAnimationFrame(watch); else setInView(''); return; }
      io = new IntersectionObserver(() => {
        // the first section still showing below the page's title (which stays put under the top bar), or 120px down
        const edge = (document.querySelector('[data-settings-head][data-fixed]')?.getBoundingClientRect().bottom ?? 80) + 40;
        const top = secs.find(s => s.getBoundingClientRect().bottom > edge) ?? secs[secs.length - 1];
        setInView(top.id);
      }, { threshold: [0, 0.25, 0.5, 1], rootMargin: '-80px 0px -40% 0px' });
      secs.forEach(s => io!.observe(s));
    };
    watch();
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [pathname]);
  useEffect(() => {
    const onJump = (e: Event) => { const a = (e as CustomEvent).detail?.anchor; const sec = SETTINGS_GROUPS.flatMap(g => g.sections).find(s => s.id === a || s.settings.some(x => x.id === a)); if (sec) setInView(sec.id); };
    window.addEventListener(JUMP_EVENT, onJump);
    return () => window.removeEventListener(JUMP_EVENT, onJump);
  }, []);

  function openSearch() {
    const side = document.documentElement.dataset.side === 'rail' && !matchMedia(NARROW).matches;
    const nav = document.querySelector<HTMLElement>('nav[data-shell-nav]');
    const closedDrawer = matchMedia(NARROW).matches && nav?.dataset.open !== 'true';
    if (side || closedDrawer) { toggleSidebar(); setTimeout(() => input.current?.focus(), 260); return; }
    input.current?.focus(); input.current?.select();
  }
  const pick = (i: number) => {
    const h = hits[i];
    if (!h) return;
    setQ('');
    go(h.group, h.anchor || undefined);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); setActive(a => (a + 1) % hits.length); }
    else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); setActive(a => (a - 1 + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { if (q) { e.preventDefault(); e.stopPropagation(); setQ(''); } else input.current?.blur(); }
  };
  const searching = q.trim().length > 0;
  const listId = `${uid}-results`;

  return (
    <>
      <Link href={back} className={`${sh.row} ${sh.backRow}`} data-tip="Back to app"><ChevronLeft aria-hidden /><span className={sh.lbl}>Back to app</span></Link>
      <div className={n.searchBox} role="search">
        <label className={`omni ${n.field}`}>
          <Search aria-hidden />
          <span className="sr-only">Search settings</span>
          <input ref={input} type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Search settings"
            role="combobox" aria-expanded={searching} aria-controls={listId} aria-autocomplete="list" aria-keyshortcuts="/"
            aria-activedescendant={searching && hits[active] ? `${uid}-${hits[active].key}` : undefined} autoComplete="off" spellCheck={false} />
          {q ? <button type="button" className={n.clear} aria-label="Clear the search" onClick={() => { setQ(''); input.current?.focus(); }}><X aria-hidden /></button> : <Kbd>/</Kbd>}
        </label>
        <button type="button" className={`${sh.row} ${n.railSearch}`} onClick={openSearch} data-tip="Search settings" data-kbd="/" aria-label="Search settings"><Search aria-hidden /></button>
      </div>

      <div className={n.results} hidden={!searching}>
        <p className="sr-only" role="status" aria-live="polite">{searching ? (hits.length ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}` : 'No matches') : ''}</p>
        <ul id={listId} role="listbox" aria-label="Settings that match" className={n.list}>
          {hits.map((h, i) => (
            <li key={h.key} id={`${uid}-${h.key}`} role="option" aria-selected={i === active} className={n.hit} data-kind={h.kind}
              onPointerDown={e => e.preventDefault()} onClick={() => pick(i)} onPointerMove={() => setActive(i)}>
              <b>{h.label}</b><span>{h.path}</span>
            </li>
          ))}
        </ul>
        {searching && !hits.length && <div className={n.empty}><b>No settings match “{q.trim()}”</b></div>}
      </div>

      <div className={n.groups} hidden={searching}>
        <div className={sh.gap} />
        {SETTINGS_GROUPS.map(g => {
          const open = current === g.id;
          return (
            <div key={g.id} className={n.group}>
              <Link href={`/settings/${g.id}`} className={sh.row} aria-current={open ? 'page' : undefined} data-tip={g.label}>
                <g.icon aria-hidden /><span className={sh.lbl}>{g.label}</span>
              </Link>
              {open && g.sections.length > 1 && (
                <ul className={n.subs} aria-label={`${g.label} sections`}>
                  {g.sections.map(sec => (
                    <li key={sec.id}>
                      <a href={`/settings/${g.id}#${sec.id}`} className={n.sub} aria-current={inView === sec.id ? 'location' : undefined}
                        onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(g.id, sec.id); }}>{sec.label}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
