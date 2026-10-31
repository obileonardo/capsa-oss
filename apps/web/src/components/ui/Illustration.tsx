'use client';
/* Illustrations from the sketch engine (design-references/brand/illustrations, docs/design/illustration-style-bible.md).
 * Each piece has a light SVG (ink and sepia on white, multiplied into the surface) and a dark one (chalk on charcoal).
 * CSS in globals.css ("illustrations") shows the one for the theme, so there's no flash or layout shift. The files in
 * public/art/ and the list in art-names.gen.ts are written by design-references/brand/illustrations/src/pieces.py. */
import { ART, type ArtName } from './art-names.gen';
import { useCrisp } from './useCrisp';

export const hasArt = (name: string): name is ArtName => (ART as readonly string[]).includes(name);

/** At 112 px and below, the redrawn small variant (heavier lines, more open hatching, fewer details) is used. */
export function Illustration({ name, size = 200, className }: { name: ArtName; size?: number; className?: string }) {
  const v = size <= 112 ? '-sm' : '';
  const crisp = useCrisp<HTMLSpanElement>(); // the grain and shading are filters: sharp in Safari too (#60)
  return (
    <span ref={crisp.ref} className={className ? `art ${className}` : 'art'} style={{ width: size, height: size }} data-art={name} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-v="light" src={`/art/${name}${v}.svg`} width={size} height={size} style={crisp.style} alt="" decoding="async" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-v="dark" src={`/art/${name}${v}-dark.svg`} width={size} height={size} style={crisp.style} alt="" decoding="async" draggable={false} />
    </span>
  );
}
