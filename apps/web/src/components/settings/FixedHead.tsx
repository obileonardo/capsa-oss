'use client';
/* A settings page's title stays where it is (Elvis, 27 Oct: "instead of having this animate to the left, maybe we can have
 * this stay fixed and then these other texts will go in, but the General text stays fixed"). It replaces the travelling
 * title of #87. The heading is sticky under the top bar and the sections scroll up under it; once anything has gone under,
 * its lower edge shows a hairline and a short fade. Nothing moves: the edge changes colour only.
 *
 * The title stays put only while it's a small share of the window. A window zoomed to 200% (640 × 400) or a phone with very
 * large text gets the ordinary page, where the title scrolls away with the rest, so the sections keep the room. */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** The heading may take up to this share of the window's height and still stay put. */
const MAX_SHARE = 0.24;

/** Whether the page's heading stays put (`fixed`) and whether anything has scrolled under it (`under`). Sets --head-h on
 * the shell, which section jumps (scroll-margin) and the sidebar's "in view" read. */
export function useFixedHead(shell: RefObject<HTMLElement | null>, head: RefObject<HTMLElement | null>, key: string) {
  const [fixed, setFixed] = useState(false);
  const [under, setUnder] = useState(false);

  useLayoutEffect(() => {
    const el = head.current, root = shell.current;
    if (!el || !root) return;
    const measure = () => {
      const h = el.offsetHeight;
      const on = h > 0 && h <= innerHeight * MAX_SHARE;
      setFixed(on);
      root.style.setProperty('--head-h', on ? `${h}px` : '0px');
      // the top bar is 52px, taller when large text wraps its crumbs: the heading sits right under it either way
      root.style.setProperty('--top-h', `${root.querySelector('header')?.offsetHeight ?? 52}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const bar = root.querySelector('header');
    if (bar) ro.observe(bar);
    addEventListener('resize', measure);
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, [shell, head, key]);

  // something is under the heading once the page has scrolled at all: a marker at the very top of the page leaves the
  // scroller. The scroller is the main panel on wide screens and the window on phones (the panel doesn't scroll there).
  useEffect(() => {
    const top = shell.current?.querySelector<HTMLElement>('[data-top-marker]');
    if (!top) return;
    const main = document.getElementById('main');
    const scroller = main && /(auto|scroll)/.test(getComputedStyle(main).overflowY) ? main : null;
    const io = new IntersectionObserver(([e]) => setUnder(!e.isIntersecting), { root: scroller, threshold: 0 });
    io.observe(top);
    return () => io.disconnect();
  }, [shell, key]);

  return { fixed, under: fixed && under };
}
