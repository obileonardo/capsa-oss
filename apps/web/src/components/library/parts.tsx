'use client';
/* Small shared pieces for the library screens: search highlighting, source icons, and the grey filter pills
 * that open a radio menu with live counts (Customer.io #1 / Arcade #14, as in the approved mockup). */
import { AtSign, ChevronDown, GitBranch, Newspaper, StickyNote, Video, X, type LucideIcon } from '@/components/ui/icons';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useOutsideClose } from '@/components/ui';
import type { SourceKind } from '@/lib/types';
import s from './library.module.css';

export const KIND_ICON: Record<SourceKind, LucideIcon> = { video: Video, github: GitBranch, article: Newspaper, x: AtSign, manual: StickyNote };

const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wraps search terms in <mark>. Splitting on a capture group puts matches at odd indices. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${terms.map(escRe).join('|')})`, 'gi'));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/** A short window of the text around the first term, for "matched in the text" hints. */
export function snippet(text: string, terms: string[], radius = 56): string {
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map(t => lower.indexOf(t)).filter(i => i >= 0));
  if (!isFinite(at)) return text.slice(0, radius * 2);
  const start = Math.max(0, at - radius), end = Math.min(text.length, at + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/** `label` is what the mobile sheet shows ("Prompt"); `long` is the menu and pill wording ("Prompts"). */
export interface FacetOption { value: string; label: string; long?: string; count?: number; icon?: ReactNode }

/** A grey pill that opens a radio menu. Arrow keys, Home/End, Escape and Tab behave like a menu button. */
export function MenuPill({ label, ariaLabel, text, lead, options, value, onChange, set, autoOpen, onOpenChange, align = 'left', extra }: {
  label: string; ariaLabel: string; text: ReactNode; lead?: ReactNode; options: FacetOption[]; value: string;
  onChange: (v: string) => void; set?: boolean; autoOpen?: boolean; onOpenChange?: (open: boolean) => void; align?: 'left' | 'right';
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const reported = useRef(open);
  useEffect(() => {
    if (reported.current !== open) { reported.current = open; onOpenChange?.(open); }
  }, [open, onOpenChange]);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const on = listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (on ?? listRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus();
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const pick = (v: string) => { onChange(v); setOpen(false); btn.current?.focus(); };

  return (
    <div className={s.facet} ref={wrap}>
      <button ref={btn} type="button" className={s.pill} data-set={!!set} aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}>
        {lead}
        <span className={s.pillText}>{text}</span>
        <ChevronDown aria-hidden className={s.pillChev} />
      </button>
      {extra}
      {open && (
        <div className={s.menu} data-align={align} role="menu" id={menuId} aria-label={label} ref={listRef} onKeyDown={onKey}>
          <div className={s.menuHead} aria-hidden>{label}</div>
          {options.map(o => (
            <button key={o.value || 'all'} type="button" role="menuitemradio" aria-checked={o.value === value} tabIndex={-1}
              className={s.menuItem} data-zero={o.count === 0} onClick={() => pick(o.value)}>
              <span className={s.radio} aria-hidden />
              {o.icon}
              <span className={s.menuLabel}>{o.long ?? o.label}</span>
              {o.count !== undefined && <span className={s.menuCount}>{o.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A filter facet: "All types ▾" until something is picked, then the pick in soft blue with a clear button. */
export function FacetPill({ label, allLabel, allIcon, pillText, lead, options, value, onChange, total, autoOpen, onOpenChange }: {
  label: string; allLabel: string; pillText: string; lead?: ReactNode; options: FacetOption[]; value: string;
  /** the "All …" row's glyph (every menu row has one) */
  allIcon?: ReactNode;
  onChange: (v: string) => void; total: number; autoOpen?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const current = options.find(o => o.value === value);
  const shown = current ? (current.long ?? current.label) : pillText;
  return (
    <MenuPill label={label} ariaLabel={`${label}: ${current ? (current.long ?? current.label) : allLabel}`} text={shown} lead={lead}
      options={[{ value: '', label: allLabel, count: total, icon: allIcon }, ...options]} value={value} onChange={onChange} set={!!value}
      autoOpen={autoOpen} onOpenChange={onOpenChange}
      extra={value ? (
        <button type="button" className={s.pillClear} aria-label={`Clear ${label} filter`} title={`Clear ${label.toLowerCase()} filter`} onClick={() => onChange('')}>
          <X aria-hidden />
        </button>
      ) : null} />
  );
}

/** The coloured dot used in labels, menus and group headers. */
export const Dot = ({ colour }: { colour: string }) => <i className={s.dot} style={{ background: colour }} aria-hidden />;
