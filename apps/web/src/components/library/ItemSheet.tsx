'use client';
/* Phones (issue #80; Elvis: "kind of like the way modals pop up on iPhones from the bottom... that you can close"):
 * a card's ⋯ opens this bottom sheet instead of the desktop popover. Same actions as the card menu (CardMenu passes the
 * same handlers and FileList; nothing here changes an item by itself), laid out as an iOS action sheet: a grab handle,
 * the item's title and type, then grouped 50px rows (Notion, Obsidian, Spotify; taste board).
 * - A real modal <dialog> (showModal): the page behind is inert, so focus stays in the sheet; Tab can't reach the cards.
 *   Opened from the keyboard, focus lands on the first row; opened by touch, on the sheet itself (screen readers start
 *   at its title, and no focus ring flashes on a row nobody chose). It goes back to the ⋯ button when the sheet closes.
 *   The page doesn't scroll behind it.
 * - Closes on the scrim, Escape, the close button, or a swipe down on the handle or header (a flick is enough: velocity
 *   over 0.11 px/ms, or past a third of its height). Dragging up past the top meets rubber-band resistance.
 * - Slides up on the iOS sheet curve (--ease-drawer) and leaves faster than it came; with reduced motion it only fades. */
import { X } from '@/components/ui/icons';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TypeIcon } from '@/components/ui';
import { TYPE_LABEL } from '@/lib/format';
import type { Artifact } from '@/lib/types';
import sh from './itemSheet.module.css';

/** Phones: touch first and narrow (or a phone on its side). One query for the CSS and the ⋯ button's choice. */
export const PHONE_QUERY = '(hover: none) and (pointer: coarse) and (max-width: 720px), (hover: none) and (pointer: coarse) and (max-height: 480px)';

const CLOSE_MS = 280;
const rubber = (over: number, dim: number, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

/** `children` gets `close`, which plays the sheet out before it unmounts (for actions that finish with it). */
export default function ItemSheet({ a, onClose, keyboard, children }: { a: Artifact; onClose: () => void; keyboard?: boolean; children: (close: () => void) => ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const titleId = useId();
  const closing = useRef(false);

  const finish = () => { const d = dlg.current; if (d?.open) d.close(); onClose(); };
  const requestClose = () => {
    if (closing.current) return;
    closing.current = true;
    setState('closing');
    const p = panel.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!p || reduce) { finish(); return; }
    let done = false;
    const end = () => { if (done) return; done = true; p.removeEventListener('transitionend', onEnd); finish(); };
    const onEnd = (e: TransitionEvent) => { if (e.target === p && e.propertyName === 'transform') end(); };
    p.addEventListener('transitionend', onEnd);
    setTimeout(end, CLOSE_MS + 80);
  };

  useEffect(() => {
    const d = dlg.current; if (!d) return;
    if (!d.open) d.showModal();
    (keyboard ? d.querySelector<HTMLElement>(`.${sh.body} button`) : panel.current)?.focus({ preventScroll: true });
    panel.current?.getBoundingClientRect(); // lay out the closed position first, so the slide has somewhere to start
    const r = requestAnimationFrame(() => setState('open'));
    return () => cancelAnimationFrame(r);
  }, []);

  // swipe down to dismiss, from the handle and header
  const drag = useRef<{ id: number; y0: number; pts: { y: number; t: number }[] } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current || closing.current || (e.target as HTMLElement).closest('button')) return; // one finger; the close button stays a button
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, y0: e.clientY, pts: [{ y: e.clientY, t: e.timeStamp }] };
    panel.current?.setAttribute('data-dragging', '');
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current, p = panel.current; if (!g || g.id !== e.pointerId || !p) return;
    const dy = e.clientY - g.y0;
    g.pts.push({ y: e.clientY, t: e.timeStamp }); if (g.pts.length > 6) g.pts.shift();
    p.style.transform = `translateY(${dy >= 0 ? dy : -rubber(-dy, p.offsetHeight)}px)`;
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current, p = panel.current; if (!g || g.id !== e.pointerId || !p) return;
    drag.current = null;
    const dy = e.clientY - g.y0;
    // px per ms over the last 100ms before release: a finger that stopped before letting go has no flick left
    const recent = g.pts.filter(q => e.timeStamp - q.t <= 100);
    const first = recent[0], last = recent[recent.length - 1];
    const v = recent.length > 1 && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
    p.removeAttribute('data-dragging');
    p.style.transform = ''; // the transition carries on from where the finger let go
    if (dy > p.offsetHeight / 3 || (dy > 12 && v > 0.11)) requestClose();
  };

  // arrow keys move through the rows, as in the desktop menu
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(`.${sh.body} button:not(:disabled)`)]; // the rows; Close is a Tab away
    const i = items.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return createPortal(
    <dialog ref={dlg} className={sh.sheet} data-state={state} aria-modal="true" aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); requestClose(); }} onClose={() => { if (!closing.current) onClose(); }}
      onPointerDown={e => e.stopPropagation()}>
      <div className={sh.scrim} onClick={requestClose} aria-hidden />
      <div ref={panel} className={sh.panel} onKeyDown={onKey} tabIndex={-1}>
        <div className={sh.head} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className={sh.grab} aria-hidden />
          <span className={sh.glyph} aria-hidden><TypeIcon type={a.type} /></span>
          <div className={sh.titles}>
            <h2 id={titleId} className={sh.title}>{a.title}</h2>
            <p className={sh.type}>{TYPE_LABEL[a.type]}</p>
          </div>
          <button type="button" className={sh.close} onClick={requestClose} aria-label="Close"><X aria-hidden /></button>
        </div>
        <div className={sh.body}>{children(requestClose)}</div>
      </div>
    </dialog>,
    document.body,
  );
}

/** How long an action's confirmation (Copy's tick) shows before the sheet closes itself. */
export const CONFIRM_MS = 650;
