'use client';
/* The segmented control: the second of the app's two switchers (TabBar.tsx has the rules for choosing). A small mode
 * toggle inside a row of controls: theme, view, group by, which version. Toggle buttons in a group (aria-pressed), each
 * a Tab stop, because each one is a setting rather than a place. Styled by the global .seg (globals.css, paper.css):
 * a 28 px track with the chosen segment raised, the same in every place it appears. */
import type { ReactNode } from 'react';

export interface SegOption<T extends string> { value: T; label?: ReactNode; icon?: ReactNode; title?: string; ariaLabel?: string }

export function Segmented<T extends string>({ label, labelledBy, value, options, onChange, className }: {
  label?: string; labelledBy?: string; value: T; options: readonly SegOption<T>[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={`seg${className ? ` ${className}` : ''}`} role="group" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} title={o.title} aria-label={o.ariaLabel}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
