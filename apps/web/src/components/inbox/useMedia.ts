'use client';
import { useCallback, useSyncExternalStore } from 'react';

/** Subscribes to a media query. Returns false on the server and on the first client render before hydration. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const mq = matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  }, [query]);
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);
}

export const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};
export const dialogOpen = () => !!document.querySelector('dialog[open]');
export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
