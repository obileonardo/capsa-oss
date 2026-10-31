'use client';
/* Capsa brand icons (design-references/brand/icons/STYLE.md) and the Capsa mark (design-references/brand/identity).
 * Three tiers, one component:
 *   glyph  flat, currentColor, 16/20 px: sidebar, rows, labels (small UI always stays flat)
 *   tint   the glyph with its one gradient: glass in light UI, rose gold in dark UI; menus only
 *   hero   the dimensional icon, 48 px and up only: empty states and other large moments
 * The art comes from brand-icons.gen.ts and public/icons/brand/, both written by scripts/sync-brand-icons.mjs. A name
 * without art yet falls back to its Lucide icon (or, for a hero, the given drawing), so icons light up as files land.
 * Light/dark swaps happen in CSS (globals.css, "brand icons"), so there's no layout shift and nothing to hydrate. */
import { isValidElement, useId, type CSSProperties, type ReactNode } from 'react';
import type { ArtifactType } from '@/lib/types';
import { GLYPHS, HEROES, TINT_FX, TINTS } from './brand-icons.gen';
import { useCrisp } from './useCrisp';
import type { LucideIcon } from './icons';
import { GlyphSvg } from './Glyph';

/** The one map from app concepts to brand icon names (design-references/brand/icons/manifest.json). Collections,
 * projects and help aren't being drawn, so they stay Lucide. Every value must be a drawn name (note is 'sticky-note'). */
export const BRAND_NAME = {
  prompt: 'prompt', skill: 'skill', mcp_server: 'mcp', tool: 'app-tool', app_tool: 'app-tool', technique: 'technique', command: 'command',
  command_config: 'config', template: 'template', reference: 'reference', workflow: 'workflow',
  inbox: 'inbox', library: 'library', boards: 'board', playground: 'shapes', search: 'search', settings: 'settings', capture: 'capture',
  sync: 'sync', tag: 'tag', done: 'done', link: 'link', image: 'image', video: 'video', note: 'sticky-note', file: 'file-text',
} as const satisfies Record<ArtifactType, string> & Record<string, string>;
export type BrandConcept = keyof typeof BRAND_NAME;

export const hasBrandGlyph = (c: BrandConcept) => !!GLYPHS[BRAND_NAME[c]];
export const hasBrandHero = (c: BrandConcept) => !!HEROES[BRAND_NAME[c]];

const snap = (n: number) => (n <= 14 ? 14 : n <= 17 ? 16 : 20);
const HERO_MIN = 48;

type Props = {
  name: BrandConcept;
  tier?: 'glyph' | 'tint' | 'hero';
  /** px. Glyphs snap to the 14/16/20 system (CSS --pi decides when omitted); heroes default to 112 and never go below 48. */
  size?: number;
  /** Lucide icon (glyph, tint) or drawing (hero) to show while the brand art doesn't exist yet. */
  fallback?: LucideIcon | ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** The dimensional icon: glass in light UI, rose gold in dark. Its glass is a filter, so it is drawn sharp in Safari too (#60). */
function Hero({ name, px, className, style }: { name: string; px: number; className?: string; style?: CSSProperties }) {
  const crisp = useCrisp<HTMLSpanElement>();
  return (
    <span ref={crisp.ref} className={className ? `bi-hero ${className}` : 'bi-hero'} style={{ ...style, width: px, height: px }} data-bi={name} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-v="glass" src={`/icons/brand/hero/glass/${name}.svg`} width={px} height={px} style={crisp.style} alt="" decoding="async" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-v="rose" src={`/icons/brand/hero/rose/${name}.svg`} width={px} height={px} style={crisp.style} alt="" decoding="async" draggable={false} />
    </span>
  );
}

export function BrandIcon({ name, tier = 'glyph', size, fallback, className, style }: Props) {
  const key = BRAND_NAME[name];
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  if (tier === 'hero' && (size ?? 112) >= HERO_MIN && HEROES[key]) {
    return <Hero name={key} px={size ?? 112} className={className} style={style} />;
  }
  const d = GLYPHS[key];
  if (!d || tier === 'hero') {
    if (tier === 'hero' && isValidElement(fallback)) return fallback;
    if (fallback && !isValidElement(fallback)) { const F = fallback as LucideIcon; return <F aria-hidden size={size} className={className} style={style} />; }
    return null;
  }
  const t = tier === 'tint' ? TINTS[key] : undefined;
  const css = { ...style, ...(size ? { '--pi': `${snap(size)}px` } : {}),
    ...(t ? { '--bi-g0': t.glass?.[0], '--bi-g1': t.glass?.[1], '--bi-r0': (t.rose ?? t.glass)?.[0], '--bi-r1': (t.rose ?? t.glass)?.[1] } : {}) } as CSSProperties;
  const gid = `bi-${uid}`;
  return (
    <GlyphSvg name={key} className={`pi bi${t ? ' bi-tint' : ''}${className ? ` ${className}` : ''}`} data-ic={`brand-${key}`} style={css} aria-hidden
      fill={t ? `url(#${gid})` : 'currentColor'} glassFx={t ? TINT_FX.glass : undefined}
      defs={t && <linearGradient id={gid} x1="0" y1="2" x2="0" y2="18" gradientUnits="userSpaceOnUse"><stop offset="0" className="bi-s0" /><stop offset="1" className="bi-s1" /></linearGradient>} />
  );
}

/** A brand glyph as a drop-in for a Lucide icon (nav rows, crumbs, ⌘K): flat, currentColor, Lucide until drawn. */
export function brandGlyph(name: BrandConcept, fallback: LucideIcon): LucideIcon {
  const G = ({ className, style, size }: { className?: string; style?: CSSProperties; size?: number | string }) =>
    <BrandIcon name={name} fallback={fallback} className={className} style={style} size={size === undefined ? undefined : Number(size)} />;
  G.displayName = `BrandGlyph(${name})`;
  return G as unknown as LucideIcon;
}
const cache = new Map<string, LucideIcon>();
/** Memoised brandGlyph, so module-level lookups don't create a component per render. */
export const glyphFor = (name: BrandConcept, fallback: LucideIcon) => {
  const k = `${name}:${fallback.displayName}`;
  if (!cache.has(k)) cache.set(k, brandGlyph(name, fallback));
  return cache.get(k)!;
};

/** The Capsa mark (concept B, "Flat, looped cord"; design-references/brand/identity/src/build_capsa.py): a flat scroll
 * case, a ring on the lid, two cord strands and a red tag. The case, cord and ring take the text colour, the tag the
 * mark's red. The ground-coloured parts (the band, the halos, the tag's outline and hole) are masks, so it sits on any
 * surface. The master's geometry on a tight square (its ink is 71 of 74 units tall). */
export function BrandMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const back = 'M62.2 24.8 C66 29 71 34.5 74.4 41.4', front = 'M62 24.8 C63.2 31.5 66.4 39 69.6 46.2';
  const tag = <rect x="64" y="41" width="16" height="22" rx="3" />;
  const knocks = (from: 0 | 1 | 2) => (
    <>
      {from === 0 && <rect x="21" y="56" width="38" height="3.6" />}
      {from === 0 && <path d={back} fill="none" stroke="#000" strokeWidth="4.2" strokeLinecap="round" />}
      {from <= 1 && <g transform="rotate(-22 72 52)"><rect x="64" y="41" width="16" height="22" rx="3" fill="none" stroke="#000" strokeWidth="2" /><circle cx="72" cy="46.4" r="2.5" /></g>}
      {from <= 1 && <path d={front} fill="none" stroke="#000" strokeWidth="4.2" strokeLinecap="round" />}
      <circle cx="61.4" cy="22.2" r="2.3" fill="none" stroke="#000" strokeWidth="3.8" />
    </>
  );
  const mask = (n: 0 | 1 | 2) => (
    <mask id={`${id}-${n}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect x="0" y="0" width="100" height="100" fill="#fff" />{knocks(n)}
    </mask>
  );
  return (
    <svg viewBox="13.77 12.5 74 74" width={size} height={size} className={className ? `capsa-mark ${className}` : 'capsa-mark'} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>{mask(0)}{mask(1)}{mask(2)}</defs>
      <g mask={`url(#${id}-0)`} fill="currentColor"><rect x="18" y="14" width="44" height="16" rx="5" /><rect x="21" y="33" width="38" height="52" rx="8" /></g>
      <g mask={`url(#${id}-1)`}>
        <path d={back} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <g className="capsa-mark-tag" transform="rotate(-22 72 52)">{tag}</g>
      </g>
      <path mask={`url(#${id}-2)`} d={front} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="61.4" cy="22.2" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
