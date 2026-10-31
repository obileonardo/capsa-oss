'use client';
/* SVG images drawn at screen resolution, filters included (#60; the design system's fix was #59).
 * WebKit (Safari, and every browser on an iPhone) draws the filters inside an SVG <img> (the illustrations' grain and
 * shading, the hero icons' glass) at one pixel per CSS pixel and then stretches them, so on a 3x phone they come out a
 * third as sharp as the lines around them. Laid out k times larger and zoomed back by 1/k, the same image is drawn at k
 * pixels per CSS pixel and takes the same box. Chrome already draws filters at screen resolution; there it looks the same.
 * The box is measured, not taken from the size prop: a stylesheet can resize it (the invite art on phones). */
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

const ratio = () => Math.min(4, Math.ceil((window.devicePixelRatio || 1) - 0.05));
function subscribe(on: () => void) {
  const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); // fires when the window moves to another screen or the page zooms
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}

/** For a box of SVG images: a ref for the box, and the style its images need to be drawn sharp (none at 1x, or before
 * the box is measured; the server and the first paint render plain images at the same size). */
export function useCrisp<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const k = useSyncExternalStore(subscribe, ratio, () => 1);
  const [box, setBox] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || k < 2) return;
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      setBox(b => (b && b[0] === w && b[1] === h ? b : [w, h]));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [k]);
  const style: CSSProperties | undefined = k > 1 && box && box[0] > 0 && box[1] > 0
    ? { width: box[0] * k, height: box[1] * k, zoom: 1 / k }
    : undefined;
  return { ref, style };
}
