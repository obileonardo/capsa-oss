/* One brand glyph as inline SVG: the 20-grid mask from design-references/brand/icons/glyph/{solid,line}/<name>.svg over a
 * rect in currentColor (or a gradient for the tinted tier). Shared by the icon shim (icons.tsx) and BrandIcon.tsx.
 * Icon style (Settings > Appearance): a flat glyph carries both drawings, <g data-set="solid"> and <g data-set="line">, and
 * CSS shows one from <html data-icons> (globals.css, "icon style"). So the switch needs no re-render, never shifts layout
 * (both sit on the same 20 grid) and the server HTML is already right. `set` pins one drawing (tints, previews). */
import { forwardRef, useId, type ReactNode, type SVGProps } from 'react';
import { GLYPHS, GLYPHS_LINE, TINT_FX } from './brand-icons.gen';

export const hasGlyph = (name: string) => !!GLYPHS[name];

type Fx = (typeof TINT_FX)[string];
export type GlyphSet = 'solid' | 'line';
type Props = Omit<SVGProps<SVGSVGElement>, 'name' | 'fill'> & { name: string; fill?: string; defs?: ReactNode; glassFx?: Fx; set?: GlyphSet };
type Layer = (typeof GLYPHS)[string][number];

/** The glyph's layers as mask content; invert swaps add and knock-out (used to subtract a shifted copy). */
const layers = (d: Layer[], invert = false) => d.map(([op, p, sw, cap, join], i) => {
  const c = (op === '-') !== invert ? '#000' : '#fff';
  return sw ? <path key={i} d={p} fill="none" stroke={c} strokeWidth={sw} strokeLinecap={cap as 'round'} strokeLinejoin={join as 'round'} />
    : <path key={i} d={p} fill={c} fillRule="evenodd" />;
});
const BOX = { maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 20, height: 20 } as const;

export const GlyphSvg = forwardRef<SVGSVGElement, Props>(({ name, fill = 'currentColor', defs, glassFx: fx, set, ...rest }, ref) => {
  const mid = `gm-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const line = GLYPHS_LINE[name];
  const d = (set === 'line' && line ? line : GLYPHS[name]) ?? [];
  const both = !set && !fx && !!line; // a flat glyph follows the icon style; a pinned or tinted one doesn't
  const shape = (f: string, m = mid) => <rect width="20" height="20" fill={f} mask={`url(#${m})`} />;
  // Clear-glass tint (the same vector recipe as glyph/<name>-glass.svg): a darker edge (the shape minus itself shifted
  // d each way) and an inner top-left highlight. Class bi-fx, so dark mode (rose gold) hides it in CSS.
  const shifted = (id: string, dx: number, dy: number, invert: boolean) => (
    <mask key={id} id={`${mid}-${id}`} {...BOX}>{invert && <rect width="20" height="20" fill="#fff" />}<g transform={`translate(${dx} ${dy})`}>{layers(d, invert)}</g></mask>);
  const sides = fx?.edge ? [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([x, y]) => [x * fx.edge![2], y * fx.edge![2]]) : [];
  const hi = fx?.hi;
  return (
    <svg ref={ref} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" focusable="false" data-glyph={name}
      data-glyph-set={both ? undefined : set ?? (fx ? 'tint' : 'solid')} {...rest}>
      <defs>
        {defs}
        <mask id={mid} {...BOX}>{layers(d)}</mask>
        {both && <mask id={`${mid}-l`} {...BOX}>{layers(line)}</mask>}
        {sides.map(([dx, dy], i) => shifted(`e${i}`, dx, dy, true))}
        {hi && [shifted('h0', hi[2], hi[2], false), shifted('h1', hi[2] + hi[3], hi[2] + hi[3], true)]}
      </defs>
      {both ? <><g className="gs-solid" data-set="solid">{shape(fill)}</g><g className="gs-line" data-set="line">{shape(fill, `${mid}-l`)}</g></> : shape(fill)}
      {fx?.edge && <g className="bi-fx" opacity={fx.edge[1]}>{sides.map((_, i) => <g key={i} mask={`url(#${mid}-e${i})`}>{shape(fx.edge![0])}</g>)}</g>}
      {hi && <g className="bi-fx" opacity={hi[1]} mask={`url(#${mid}-h1)`}><g mask={`url(#${mid}-h0)`}>{shape(hi[0])}</g></g>}
    </svg>
  );
});
GlyphSvg.displayName = 'GlyphSvg';
