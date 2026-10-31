'use client';
/* The bin (24 Oct): while an Inbox card is being dragged, a bin rises at the bottom centre of the screen. It is the app's
 * trash icon drawn in two parts so its lid can move (Elvis: no illustration in a circle; the delete icon, opening and
 * closing): the lid lifts as the card comes near, opens fully over the bin for a card it will take, and drops shut with a
 * small bounce once the card is in. For a card it won't take (Done) the lid stays shut and the bin gives a short shake.
 * Solid and Line follow the icon style setting. Portaled into <body>, so no scroll box under it starts scrolling.
 * Reduced motion: no lid movement or shake; the bin fades in and out. */
import { forwardRef, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import s from './bin.module.css';

const NEAR = 260; // px from the bin's centre where the lid starts to lift

export const Bin = forwardRef<HTMLDivElement, { over: boolean; refused: string | null; leaving?: boolean }>(function Bin({ over, refused, leaving }, ref) {
  const well = useRef<HTMLSpanElement>(null);
  // the lid follows the pointer's distance to the bin, without re-rendering
  useEffect(() => {
    if (refused || leaving) { well.current?.style.setProperty('--near', '0'); return; }
    const move = (e: PointerEvent) => {
      const el = well.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      el.style.setProperty('--near', Math.max(0, Math.min(1, 1 - (d - r.width / 2) / NEAR)).toFixed(3));
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [refused, leaving]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} className={s.bin} data-bin data-over={over || undefined} data-drop={refused ? 'no' : 'ok'} data-leaving={leaving || undefined}
      aria-hidden /* pointer only: the keyboard deletes with Delete or the ⋯ menu, and the outcome is announced */>
      <span className={s.well} ref={well}>
        <svg className={s.icon} viewBox="0 0 24 24" aria-hidden>
          <g className={s.lid}>
            <path className={s.part} d="M9.2 2.6h5.6a1 1 0 0 1 1 1v1.6H8.2V3.6a1 1 0 0 1 1-1Z" />
            <rect className={s.part} x="3.4" y="5.2" width="17.2" height="2.3" rx="1.15" />
          </g>
          <g className={s.body}>
            <path className={s.part} d="M5.3 8.9h13.4l-1.12 11.3a2 2 0 0 1-2 1.8H8.42a2 2 0 0 1-2-1.8L5.3 8.9Z" />
            <path className={s.slot} d="M10 11.6v6.9M14 11.6v6.9" />
          </g>
        </svg>
      </span>
      <span className={s.label}>{over && refused ? refused : ''}</span>
    </div>,
    document.body,
  );
});
