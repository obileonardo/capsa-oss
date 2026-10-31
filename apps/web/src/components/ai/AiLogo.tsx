'use client';
/* An AI's official logo (public/brands/, sources in SOURCES.md), only to name the product. A separate dark-background
 * file is used in dark mode where the brand provides one (CSS in ai.module.css swaps them, no flash). Without an official
 * file the AI keeps a neutral tile with the bot glyph rather than a redrawn logo. */
import { Bot, type LucideIcon } from '@/components/ui/icons';
import type { CSSProperties } from 'react';
import type { AiDef } from '@/lib/ais';
import s from './ai.module.css';

export function AiLogo({ ai, size = 16, className }: { ai: Pick<AiDef, 'logo' | 'logoDark' | 'logoScale'>; size?: number; className?: string }) {
  const st = { width: size, height: size } as CSSProperties;
  if (!ai.logo) return <span className={`${s.logo} ${s.logoNone} ${className ?? ''}`} style={st} aria-hidden><Bot /></span>;
  return (
    <span className={`${s.logo} ${className ?? ''}`} style={{ ...st, ...(ai.logoScale ? { '--logo-scale': ai.logoScale } : {}) } as CSSProperties} data-dark={ai.logoDark || undefined} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-v="light" src={`/brands/${ai.logo}.svg`} width={size} height={size} alt="" decoding="async" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ai.logoDark && <img data-v="dark" src={`/brands/${ai.logo}-dark.svg`} width={size} height={size} alt="" decoding="async" draggable={false} />}
    </span>
  );
}

const cache = new Map<string, LucideIcon>();
/** The logo as a drop-in for an icon component (the area's sidebar rows). */
export function logoIcon(ai: AiDef): LucideIcon {
  if (!cache.has(ai.id)) {
    const C = ({ className }: { className?: string }) => <AiLogo ai={ai} size={16} className={className} />;
    C.displayName = `AiLogo(${ai.id})`;
    cache.set(ai.id, C as unknown as LucideIcon);
  }
  return cache.get(ai.id)!;
}
