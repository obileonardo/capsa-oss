'use client';
/* The tab bar: one of the app's two switchers (Elvis, 27 Oct: "too many types of navbars, too many types of tabs. So
 * let's have a uniform way"). The other is the segmented control (Segmented.tsx, the global .seg).
 *
 *   Tab bar      switches what a page shows: its views (Activity's Everything / Library / ...), its sections (Learn) or
 *                sibling pages of one place (the Library's Items / Sources / Health). It sits under the page title, runs
 *                the column's width on a hairline, carries counts when they help, and, as the page's own nav, stays in
 *                view under the top bar. Underlined in both styles: ink in Classic, the red rule in Paper.
 *   Segmented    a small mode toggle inside a row of controls (theme, view, group by, which version). Never page nav.
 *
 * Three kinds, by what a tab does, so keyboards and screen readers get the right thing:
 *   'tabs'      swaps the panel below in place: role=tablist, arrow keys, Home and End (automatic activation).
 *   'links'     goes to another page: a nav of links, the current one aria-current="page".
 *   'sections'  jumps within this page: a nav of #links, the section being read marked as you scroll (scroll-spy); a jump
 *               lands the section just below the bar and glides unless motion is reduced. */
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { scrollerOf, useScrollSpy } from './useScrollSpy';
import t from './tabs.module.css';

export interface TabItem { id: string; label: string; count?: number; icon?: ReactNode; href?: string }

interface Base {
  /** the accessible name of the bar */
  label: string;
  items: readonly TabItem[];
  /** stays in view under the page's top bar (a page's own nav) */
  sticky?: boolean;
  /** quiet things at the end of the bar (a search field, a link out) */
  trailing?: ReactNode;
  className?: string;
}
type Props =
  | (Base & { kind: 'tabs'; value: string; onChange: (id: string) => void; /** the id of the panel the tabs control */ panelId?: string })
  | (Base & { kind: 'links'; value: string })
  | (Base & { kind: 'sections' });

/** A tab's element id, from its bar's label: two bars on a page never share ids. */
export const tabId = (bar: string, id: string) => `tab-${bar.toLowerCase().replace(/\W+/g, '-')}-${id}`;

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The sticky bar's height and the top bar's, as --subnav-h and --top-h on the scroll panel, so sections can land below
 * both (scroll-margin-top) at any text size. */
function useStickyMetrics(ref: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el || typeof ResizeObserver === 'undefined') return;
    const main = el.closest('main') ?? document.documentElement;
    const top = main.querySelector('header');
    const set = () => {
      main.style.setProperty('--top-h', `${top?.offsetHeight ?? 52}px`);
      main.style.setProperty('--subnav-h', `${getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0}px`);
    };
    // measured a frame later: writing the sizes inside the observer's own callback would feed it a loop
    let f = 0; const later = () => { cancelAnimationFrame(f); f = requestAnimationFrame(set); };
    const ro = new ResizeObserver(later);
    ro.observe(el); if (top) ro.observe(top);
    set();
    return () => { ro.disconnect(); cancelAnimationFrame(f); main.style.removeProperty('--top-h'); main.style.removeProperty('--subnav-h'); };
  }, [ref, on]);
}

export function TabBar(props: Props) {
  const { label, items, sticky, trailing, className } = props;
  const bar = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ids = items.filter(i => !i.href).map(i => i.id);
  const [reading, hold] = useScrollSpy(props.kind === 'sections' ? ids : [], () => {
    const m = bar.current?.closest('main');
    const v = (k: string) => parseFloat(m ? getComputedStyle(m).getPropertyValue(k) : '') || 0;
    return v('--top-h') + v('--subnav-h') + 24;
  });
  const value = props.kind === 'sections' ? reading : props.value;
  useStickyMetrics(bar, !!sticky);

  // the ink under the chosen tab: measured, so it can glide from tab to tab (no glide on the first paint)
  useIso(() => {
    const l = list.current;
    const on = l?.querySelector<HTMLElement>('[data-on]');
    if (!l) return;
    if (!on) { l.style.setProperty('--ink-w', '0px'); return; }
    l.style.setProperty('--ink-x', `${on.offsetLeft}px`);
    l.style.setProperty('--ink-w', `${on.offsetWidth}px`);
    if (!l.dataset.ink) requestAnimationFrame(() => { l.dataset.ink = 'ready'; });
    // keep the chosen tab in view when the bar scrolls across (phones), without moving the page
    const r = on.offsetLeft + on.offsetWidth - l.clientWidth;
    if (on.offsetLeft < l.scrollLeft) l.scrollTo({ left: on.offsetLeft - 8 });
    else if (r > l.scrollLeft) l.scrollTo({ left: r + 8 });
  }, [value, items.length]);
  useEffect(() => {
    const l = list.current;
    if (!l || typeof ResizeObserver === 'undefined') return;
    let f = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(f); f = requestAnimationFrame(() => {
      const on = l.querySelector<HTMLElement>('[data-on]');
      if (on) { l.style.setProperty('--ink-x', `${on.offsetLeft}px`); l.style.setProperty('--ink-w', `${on.offsetWidth}px`); }
      l.dataset.overflow = l.scrollWidth > l.clientWidth + 1 ? 'true' : '';
    }); });
    ro.observe(l); [...l.children].forEach(c => ro.observe(c));
    return () => { ro.disconnect(); cancelAnimationFrame(f); };
  }, [items.length]);

  const face = (i: TabItem) => (
    <span className={t.face}>
      {i.icon}
      <span className={t.lbl} data-text={i.label}>{i.label}</span>
      {i.count !== undefined && <span className={t.n}>{i.count}</span>}
    </span>
  );

  /* ---------- sections: in-page jumps ---------- */
  const jump = (e: MouseEvent<HTMLAnchorElement>, id: string, index: number) => {
    const target = document.getElementById(id);
    if (!target || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const sc = scrollerOf(target);
    const win = sc === document.scrollingElement;
    const scTop = win ? 0 : sc.getBoundingClientRect().top;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    // the first section is the top of the page: go there, so the page head comes back rather than scrolling away
    const y = index === 0 ? 0 : Math.max(0, sc.scrollTop + target.getBoundingClientRect().top - scTop - margin);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    hold(id);
    sc.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(history.state, '', `#${id}`);
    const h = target.querySelector<HTMLElement>('h2, h3') ?? target;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  };

  /* ---------- tabs: arrow keys move and choose ---------- */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (props.kind !== 'tabs') return;
    // from the focused tab, not the chosen one (as the editors' own tab lists did before this bar): they differ when a tab
    // gets focus without being chosen, by a screen reader or a script, and moving from the chosen one then jumped elsewhere
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab ?? props.value;
    const k = items.findIndex(i => i.id === from);
    const to = e.key === 'ArrowRight' ? k + 1 : e.key === 'ArrowLeft' ? k - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = items[(to + items.length) % items.length];
    props.onChange(next.id);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus());
  };

  const tabs = props.kind === 'tabs' ? (
    <div ref={list} className={t.list} role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map(i => {
        const on = i.id === value;
        return (
          <button key={i.id} type="button" role="tab" className={t.tab} id={tabId(label, i.id)} data-tab={i.id} data-on={on || undefined}
            aria-selected={on} tabIndex={on ? 0 : -1} aria-controls={props.panelId} onClick={() => props.onChange(i.id)}>
            {face(i)}
          </button>
        );
      })}
      <span className={t.ink} aria-hidden />
    </div>
  ) : (
    <div ref={list} className={t.list}>
      {items.map((i, k) => {
        const on = i.id === value;
        if (props.kind === 'sections' && !i.href) {
          return <a key={i.id} href={`#${i.id}`} className={t.tab} data-tab={i.id} data-on={on || undefined}
            aria-current={on ? 'location' : undefined} onClick={e => jump(e, i.id, k)}>{face(i)}</a>;
        }
        return <Link key={i.id} href={i.href ?? `#${i.id}`} className={t.tab} data-tab={i.id} data-on={(props.kind === 'links' && on) || undefined}
          aria-current={props.kind === 'links' && on ? 'page' : undefined}>{face(i)}</Link>;
      })}
      <span className={t.ink} aria-hidden />
    </div>
  );

  return props.kind === 'tabs' ? (
    <div ref={bar} className={`${t.bar} ${className ?? ''}`} data-sticky={sticky || undefined} data-tabbar>
      {tabs}
      {trailing && <div className={t.trail}>{trailing}</div>}
    </div>
  ) : (
    <nav ref={bar} className={`${t.bar} ${className ?? ''}`} aria-label={label} data-sticky={sticky || undefined} data-tabbar>
      {tabs}
      {trailing && <div className={t.trail}>{trailing}</div>}
    </nav>
  );
}

/** The panel a 'tabs' bar controls. */
export function TabPanel({ id, bar, tab, children, className }: { id: string; bar: string; tab: string; children: ReactNode; className?: string }) {
  return <div id={id} role="tabpanel" aria-labelledby={tabId(bar, tab)} className={className}>{children}</div>;
}
