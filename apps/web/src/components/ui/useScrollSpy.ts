'use client';
/* The section being read, for every in-page nav (Learn's section bar, a guide's contents, the reading layout). One rule:
 * the last section whose top has passed the reading line, and the last section once the page can't scroll further.
 * The page scrolls inside the shell's panel on wide screens and in the window on phones, so this listens for scrolls
 * anywhere (capture) and checks once a frame. While a jump is gliding, the section it is going to stays marked, so the
 * mark doesn't flicker through the sections in between. */
import { useCallback, useEffect, useRef, useState } from 'react';

/** The element that scrolls `el`: the shell's panel on wide screens, the page on phones. */
export function scrollerOf(el: Element | null): HTMLElement {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement as HTMLElement;
}

/** `line`: how far below the top of the scroll area a heading counts as being read (px), worked out at check time.
 * `endMarksLast`: at the very end of the page the last section is marked even if its heading can't reach the line
 * (short last sections, like Learn's Videos); a long article leaves it off so its own headings decide. */
export function useScrollSpy(ids: readonly string[], line: () => number = () => innerHeight * 0.25, endMarksLast = true) {
  const [at, setAt] = useState(ids[0] ?? '');
  const held = useRef<string | null>(null);
  const lineRef = useRef(line); lineRef.current = line;
  const key = ids.join('|');
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      if (held.current) return;
      const els = ids.map(id => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
      if (!els.length) return;
      const sc = scrollerOf(els[0]);
      const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
      const atEnd = sc.scrollTop > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
      if (atEnd && endMarksLast) { setAt(els[els.length - 1].id); return; }
      let cur = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top - top <= lineRef.current()) cur = el.id;
      setAt(cur);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check); };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('resize', onScroll);
    check();
    return () => { document.removeEventListener('scroll', onScroll, { capture: true }); removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  /** Mark `id` now and keep it marked until the scroll it starts has settled. */
  const hold = useCallback((id: string) => {
    held.current = id; setAt(id);
    let last = -1, still = 0, n = 0;
    const el = document.getElementById(id);
    const sc = scrollerOf(el);
    const watch = () => {
      const y = sc.scrollTop;
      still = y === last ? still + 1 : 0; last = y;
      if (still >= 6 || ++n > 120) { held.current = null; return; } // about 100 ms without movement, or 2 s at most
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }, []);
  return [at, hold] as const;
}
