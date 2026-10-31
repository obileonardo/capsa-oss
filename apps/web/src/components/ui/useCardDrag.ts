'use client';
/* Physical card drag, shared by the Inbox board and the Library (Elvis, 23 Oct). Pointer events, not HTML5 drag and drop,
 * so it behaves the same in Safari and Chrome and works with touch (a short press picks a card up; a swipe still scrolls).
 * - Pickup: the card lifts (scale 1.03, a deeper shadow) and tilts with the pointer's horizontal speed, easing back to 0.
 * - It follows the pointer 1:1. The target under it is marked with data-drag-over (and reported, for a board's gap).
 * - Drop: a spring with a tiny overshoot into its new place (or into the target it was filed in); a cancel (Esc) or a
 *   refused drop springs it home. Cards that make room animate with FLIP.
 * - Over a target that swallows cards (the Inbox's bin), the card can shrink towards the pointer and fade a little, so the
 *   target shows around it (overScale). Reduced motion: the size changes at once, with no tween.
 * - Only transform and opacity animate. Reduced motion: no tilt, no scale, no spring, a short fade.
 * The lifted card is a clone in <body>, so a scroll box never clips it. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react';

export interface DragState<T extends string> { id: string; from: T; over: T | null; h: number }
/** Where the lifted card goes when it's let go: a card's new place, or a target it's absorbed into (a sidebar row). */
export interface Landing { el: HTMLElement; absorb?: boolean }
interface Flight { ghost: HTMLDivElement; base: DOMRect; x: number; y: number; rot: number; scale: number; vx: number; vy: number }

interface Gesture<T extends string> {
  id: string; from: T; pointerId: number; touch: boolean; el: HTMLElement;
  sx: number; sy: number; x: number; y: number; lt: number; vx: number; vy: number;
  lifted: boolean; timer: number; raf: number; over: T | null; overEl: HTMLElement | null; hitEl?: HTMLElement | null; box?: HTMLElement | null; pagesX?: boolean;
  ghost?: HTMLDivElement; base?: DOMRect; rot: number; scale: number; t: number; pageAt: number;
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const TILT_PER_SPEED = 3.5; // degrees per px/ms of horizontal speed
const MAX_TILT = 6;
const LIFT_SCALE = 1.03;
const PRESS_MS = 240;       // touch: hold this long to pick a card up
const SLOP = 4;             // mouse: move this far before a press becomes a drag (a click stays a click)

/** While a drag is on: the grabbing cursor everywhere and no text selection (injected once, so no stylesheet owns it). */
function ensureDragStyle() {
  if (document.getElementById('card-drag-style')) return;
  const st = document.createElement('style');
  st.id = 'card-drag-style';
  st.textContent = 'html[data-card-drag], html[data-card-drag] * { cursor: grabbing !important; user-select: none !important; -webkit-user-select: none !important; }';
  document.head.append(st);
}
const markOver = (el: HTMLElement, on: boolean) => { if (on) el.setAttribute('data-drag-over', ''); else el.removeAttribute('data-drag-over'); };

export function useCardDrag<T extends string>(o: {
  /** cards that make room are li[data-id] inside this element (FLIP); the phone board pages sideways in it */
  root: RefObject<HTMLElement | null>;
  /** extra class for the lifted clone (it is styled inline: fixed, over everything, a deeper soft shadow) */
  ghostClass?: string;
  /** px of surface around a lifted card that has no background of its own; it grows outwards, so the content stays put */
  pad?: number;
  /** how a target shows it's under the card (default: data-drag-over) */
  mark?: (el: HTMLElement, on: boolean) => void;
  /** where a card can be dragged from (its column, or 'library'), or null when it can't be dragged */
  sourceOf: (id: string) => T | null;
  /** the drop target under the pointer */
  targetAt: (hit: HTMLElement | null) => { key: T; el: HTMLElement } | null;
  /** make the move; true when something changed */
  drop: (id: string, to: T) => boolean;
  /** where the card settles after the drop (default: back where it came from) */
  landOn: (id: string, to: T | null, moved: boolean) => Landing | null;
  flip?: boolean;
  /** false: touch and pen presses don't pick cards up (where no target would be in reach) */
  touch?: boolean;
  onLift?: (id: string) => void;
  onEnd?: () => void;
  /** the scale the lifted card shrinks to over this target (e.g. 0.4 over a bin), or null to keep its lift */
  overScale?: (over: T | null) => number | null;
}) {
  const [drag, setDrag] = useState<DragState<T> | null>(null);
  const [landing, setLanding] = useState<string | null>(null);
  const g = useRef<Gesture<T> | null>(null);
  const flying = useRef<{ ghost: HTMLDivElement; raf: number; done: () => void } | null>(null);
  const flight = useRef<(Flight & { id: string; to: T | null; moved: boolean }) | null>(null);
  const snap = useRef<Map<string, DOMRect> | null>(null);
  const opts = useRef(o);
  opts.current = o;

  /* ---------- FLIP: measure the cards before a layout change, animate each from where it was ---------- */
  const snapshot = useCallback(() => {
    if (!opts.current.flip) return;
    const m = new Map<string, DOMRect>();
    opts.current.root.current?.querySelectorAll<HTMLElement>('li[data-id]').forEach(li => m.set(li.dataset.id!, li.getBoundingClientRect()));
    snap.current = m;
  }, []);
  useLayoutEffect(() => {
    const before = snap.current; if (!before) return;
    snap.current = null;
    if (reducedMotion()) return;
    opts.current.root.current?.querySelectorAll<HTMLElement>('li[data-id]').forEach(li => {
      const id = li.dataset.id!; const was = before.get(id);
      if (!was || id === landing) return;
      li.getAnimations().forEach(a => a.cancel());
      const now = li.getBoundingClientRect();
      if (!now.width) return;
      const dx = was.left - now.left, dy = was.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    });
  });

  const finishFlight = useCallback(() => {
    const f = flying.current; if (!f) return;
    cancelAnimationFrame(f.raf); flying.current = null; f.done();
  }, []);

  /* ---------- the gesture ---------- */
  const paint = (x: Gesture<T>) => {
    if (x.ghost) x.ghost.style.transform = `translate3d(${x.x - x.sx}px, ${x.y - x.sy}px, 0) rotate(${x.rot}deg) scale(${x.scale})`;
  };
  const setOver = (x: Gesture<T>, t: { key: T; el: HTMLElement } | null) => {
    const mark = opts.current.mark ?? markOver;
    if (t?.el !== x.overEl) { if (x.overEl) mark(x.overEl, false); if (t) mark(t.el, true); x.overEl = t?.el ?? null; }
    const over = t?.key ?? null;
    if (over !== x.over) { x.over = over; snapshot(); setDrag(d => (d ? { ...d, over } : d)); }
  };

  const frame = (now: number) => {
    const x = g.current; if (!x?.lifted) return;
    const dt = Math.min(48, now - (x.t || now)); x.t = now;
    const small = opts.current.overScale?.(x.over) ?? null;
    if (x.ghost) { const op = small == null ? '' : '0.85'; if (x.ghost.style.opacity !== op) x.ghost.style.opacity = op; }
    if (!reducedMotion()) {
      if (now - x.lt > 32) { const k = Math.exp(-dt / 70); x.vx *= k; x.vy *= k; } // no recent movement: the tilt settles
      x.scale += ((small ?? LIFT_SCALE) - x.scale) * (1 - Math.exp(-dt / (small == null ? 45 : 70)));
      x.rot += (clamp(x.vx * TILT_PER_SPEED, -MAX_TILT, MAX_TILT) - x.rot) * (1 - Math.exp(-dt / 60));
    } else x.scale = small ?? 1; // reduced motion: the size changes at once, never as a tween
    paint(x);
    const hit = document.elementFromPoint(x.x, x.y) as HTMLElement | null; // the ghost ignores the pointer
    setOver(x, opts.current.targetAt(hit));
    // near the top or bottom edge of the scroll box under the pointer, scroll it (found once per element under the pointer)
    if (hit !== x.hitEl) {
      x.hitEl = hit;
      let box = hit;
      while (box && box !== document.body && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      x.box = box && box !== document.body ? box : null;
    }
    const box = x.box;
    if (box) {
      const r = box.getBoundingClientRect(), edge = 48;
      const v = x.y < r.top + edge ? -(r.top + edge - x.y) : x.y > r.bottom - edge ? x.y - (r.bottom - edge) : 0;
      if (v) box.scrollTop += (v / edge) * 14 * (dt / 16);
    }
    // phones: the Inbox board is a strip of columns; at its edge, page to the next column
    const b = opts.current.root.current;
    if (b && now - x.pageAt > 700 && b.scrollWidth > b.clientWidth + 1 && (x.pagesX ??= /(auto|scroll)/.test(getComputedStyle(b).overflowX))) {
      const r = b.getBoundingClientRect(), edge = 28;
      const dir = x.x < r.left + edge ? -1 : x.x > r.right - edge ? 1 : 0;
      const col = b.firstElementChild as HTMLElement | null;
      if (dir && col) { x.pageAt = now; b.scrollBy({ left: dir * (col.offsetWidth + 12), behavior: reducedMotion() ? 'auto' : 'smooth' }); }
    }
    x.raf = requestAnimationFrame(frame);
  };

  const lift = () => {
    const x = g.current; if (!x || x.lifted) return;
    finishFlight();
    const li = x.el.closest('li') ?? x.el;
    const base = x.el.getBoundingClientRect();
    snapshot();
    ensureDragStyle();
    window.getSelection()?.removeAllRanges(); // a press on a title may have started selecting text
    const ghost = document.createElement('div');
    if (opts.current.ghostClass) ghost.className = opts.current.ghostClass;
    // the deeper soft shadow is its own layer, so lifting only fades its opacity
    const shadow = document.createElement('div');
    const dark = document.documentElement.dataset.theme === 'dark';
    Object.assign(shadow.style, {
      position: 'absolute', inset: '0', zIndex: '-1', borderRadius: 'inherit', opacity: '0', transition: 'opacity 200ms cubic-bezier(.2, .8, .2, 1)',
      boxShadow: dark ? '0 18px 40px rgb(0 0 0 / .55), 0 4px 12px rgb(0 0 0 / .35)' : '0 18px 40px rgb(17 17 19 / .16), 0 4px 12px rgb(17 17 19 / .08)',
    });
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-drag-ghost', '');
    const clone = x.el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id'); clone.removeAttribute('aria-current');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll<HTMLElement>('a, button, input, [tabindex]').forEach(n => { n.tabIndex = -1; });
    Object.assign(clone.style, { width: '100%', height: '100%', margin: '0', boxSizing: 'border-box' });
    // container queries: the clone sits in <body>, so it answers to a stand-in as wide as the card's own container
    let box = x.el.parentElement;
    while (box && getComputedStyle(box).containerType === 'normal') box = box.parentElement;
    let body: HTMLElement = clone;
    if (box) {
      const cs = getComputedStyle(box);
      const stand = document.createElement('div');
      Object.assign(stand.style, {
        containerType: cs.containerType, height: '100%',
        width: `${box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`,
      });
      clone.style.width = `${base.width}px`;
      stand.append(clone);
      body = stand;
    }
    ghost.append(shadow, body);
    // a padded ghost keeps its corners concentric with the card's (the shadow layer inherits the radius and carries the surface)
    const pad = opts.current.pad ?? 0;
    const radius = parseFloat(getComputedStyle(x.el).borderTopLeftRadius) || 0;
    Object.assign(ghost.style, {
      position: 'fixed', zIndex: '1000', pointerEvents: 'none', willChange: 'transform', isolation: 'isolate', margin: '0', listStyle: 'none',
      borderRadius: `${radius + pad}px`, padding: `${pad}px`, boxSizing: 'border-box',
      left: `${base.left - pad}px`, top: `${base.top - pad}px`, width: `${base.width + 2 * pad}px`, height: `${base.height + 2 * pad}px`,
      transformOrigin: `${x.sx - base.left + pad}px ${x.sy - base.top + pad}px`,
    });
    document.body.append(ghost);
    Object.assign(x, { lifted: true, ghost, base, t: 0 });
    paint(x);
    requestAnimationFrame(() => { ghost.setAttribute('data-up', ''); shadow.style.opacity = '1'; });
    document.documentElement.setAttribute('data-card-drag', '');
    opts.current.onLift?.(x.id);
    setDrag({ id: x.id, from: x.from, over: x.from, h: li.getBoundingClientRect().height });
    x.over = x.from;
    x.raf = requestAnimationFrame(frame);
  };

  const listeners = useRef<(() => void) | null>(null);
  const unlisten = () => { listeners.current?.(); listeners.current = null; };

  const end = (commit: boolean) => {
    const x = g.current; if (!x) return;
    g.current = null;
    clearTimeout(x.timer); cancelAnimationFrame(x.raf); unlisten();
    document.documentElement.removeAttribute('data-card-drag');
    if (x.overEl) (opts.current.mark ?? markOver)(x.overEl, false);
    if (!x.lifted) return;
    // the click that follows this pointerup must not open or select anything
    const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 400);
    snapshot();
    const to = commit ? x.over : null;
    let moved = false;
    if (to && to !== x.from) moved = opts.current.drop(x.id, to);
    opts.current.onEnd?.();
    flight.current = { ghost: x.ghost!, base: x.base!, x: x.x - x.sx, y: x.y - x.sy, rot: x.rot, scale: x.scale, vx: x.vx * 1000, vy: x.vy * 1000, id: x.id, to, moved };
    setDrag(null);
    setLanding(x.id);
  };

  /* ---------- the settle: spring (or fade) the ghost into place, then show the real card ---------- */
  useLayoutEffect(() => {
    if (!landing) return;
    const f = flight.current; flight.current = null;
    if (!f) { setLanding(null); return; }
    const land = opts.current.landOn(f.id, f.to, f.moved);
    const to = land?.el.getBoundingClientRect();
    const done = () => { f.ghost.remove(); setLanding(l => (l === f.id ? null : l)); };
    f.ghost.removeAttribute('data-up');
    (f.ghost.firstElementChild as HTMLElement).style.opacity = '0'; // the lift shadow fades as it lands
    const op0 = parseFloat(f.ghost.style.opacity || '1'); // faded over a target that swallows cards (overScale)
    if (!land || !to || !to.width || reducedMotion()) {
      const fade = f.ghost.animate([{ opacity: op0 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' });
      if (land && !land.absorb) land.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
      flying.current = { ghost: f.ghost, raf: 0, done };
      fade.onfinish = () => { if (flying.current?.ghost === f.ghost) { flying.current = null; done(); } };
      return;
    }
    // absorbed: shrink into the target's middle; otherwise: land exactly on the card's new place
    const tx = land.absorb ? to.left + to.width / 2 - (f.base.left + f.base.width / 2) : to.left - f.base.left;
    const ty = land.absorb ? to.top + to.height / 2 - (f.base.top + f.base.height / 2) : to.top - f.base.top;
    // absorbed: down to a fifth, or to a quarter of where it is when it was already shrunk over its target (overScale)
    const ts = land.absorb ? Math.min(0.2, f.scale * 0.25) : 1;
    const gone = Math.min(0.3, ts * 1.5);
    if (land.absorb) f.ghost.animate([{ opacity: op0, offset: 0 }, { opacity: op0, offset: 0.4 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
    else if (op0 < 1) f.ghost.animate([{ opacity: op0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    // a spring with damping ratio ≈ 0.78: a tiny overshoot, settled in about 400 ms
    const K = 420, C = 32;
    // a little of the throw carries into the landing; all of it would overshoot by far more than "tiny"
    const st = { x: f.x, y: f.y, vx: clamp(f.vx * 0.25, -600, 600), vy: clamp(f.vy * 0.25, -600, 600), r: f.rot, vr: 0, s: f.scale, vs: 0 };
    let last = 0;
    const step = (now: number) => {
      let dt = Math.min(0.048, last ? (now - last) / 1000 : 1 / 60); last = now;
      while (dt > 0) {
        const h = Math.min(dt, 0.004); dt -= h;
        st.vx += (-K * (st.x - tx) - C * st.vx) * h; st.x += st.vx * h;
        st.vy += (-K * (st.y - ty) - C * st.vy) * h; st.y += st.vy * h;
        st.vr += (-K * st.r - 40 * st.vr) * h; st.r += st.vr * h;
        st.vs += (-K * (st.s - ts) - 40 * st.vs) * h; st.s += st.vs * h;
      }
      f.ghost.style.transform = `translate3d(${st.x}px, ${st.y}px, 0) rotate(${st.r}deg) scale(${st.s})`;
      const rest = Math.abs(st.x - tx) < 0.3 && Math.abs(st.y - ty) < 0.3 && Math.abs(st.vx) + Math.abs(st.vy) < 12 && Math.abs(st.r) < 0.05 && Math.abs(st.s - ts) < 0.002;
      if (rest || (land.absorb && st.s < gone)) { flying.current = null; done(); return; }
      if (flying.current) flying.current.raf = requestAnimationFrame(step);
    };
    flying.current = { ghost: f.ghost, raf: requestAnimationFrame(step), done };
  }, [landing]);

  const onPointerDown = useCallback((id: string) => (e: RPointerEvent<HTMLElement>) => {
    if (g.current || (e.pointerType === 'mouse' && e.button !== 0) || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // controls inside a card (⋯, copy, bookmark, checkboxes) keep their own press
    if ((e.target as HTMLElement).closest('button, input, select, textarea, [role="menu"]')) return;
    const from = opts.current.sourceOf(id);
    if (!from) return;
    const el = e.currentTarget;
    const touch = e.pointerType !== 'mouse';
    if (touch && opts.current.touch === false) return;
    if (touch && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); // events follow the finger
    const x: Gesture<T> = {
      id, from, pointerId: e.pointerId, touch, el, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, lt: performance.now(),
      vx: 0, vy: 0, lifted: false, timer: 0, raf: 0, over: from, overEl: null, rot: 0, scale: 1, t: 0, pageAt: 0,
    };
    g.current = x;
    if (touch) x.timer = window.setTimeout(lift, PRESS_MS);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== x.pointerId) return;
      const now = performance.now(), dt = Math.max(1, now - x.lt);
      const ivx = (ev.clientX - x.x) / dt, ivy = (ev.clientY - x.y) / dt;
      x.vx = x.vx * 0.6 + ivx * 0.4; x.vy = x.vy * 0.6 + ivy * 0.4; x.lt = now;
      x.x = ev.clientX; x.y = ev.clientY;
      if (!x.lifted) {
        const d = Math.hypot(x.x - x.sx, x.y - x.sy);
        if (touch) { if (d > 10) end(false); } // moved before the press: it's a scroll
        else if (d > SLOP) lift();
      }
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId === x.pointerId) end(true); };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === x.pointerId) end(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && x.lifted) { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    const touchmove = (ev: TouchEvent) => { if (x.lifted) ev.preventDefault(); };
    const ctx = (ev: Event) => { if (touch) ev.preventDefault(); };
    const nodrag = (ev: Event) => ev.preventDefault();
    const blur = () => end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('contextmenu', ctx, true);
    window.addEventListener('dragstart', nodrag, true);
    window.addEventListener('blur', blur);
    document.addEventListener('touchmove', touchmove, { passive: false });
    listeners.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('contextmenu', ctx, true);
      window.removeEventListener('dragstart', nodrag, true);
      window.removeEventListener('blur', blur);
      document.removeEventListener('touchmove', touchmove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    const x = g.current; if (x) { clearTimeout(x.timer); cancelAnimationFrame(x.raf); x.ghost?.remove(); if (x.overEl) (opts.current.mark ?? markOver)(x.overEl, false); }
    unlisten(); finishFlight();
    document.documentElement.removeAttribute('data-card-drag');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { drag, landing, onPointerDown };
}
