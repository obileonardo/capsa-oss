'use client';
/* A glossary term in place (LRN-03, Track C): the word, dotted-underlined, opens its short definition on click, Enter or
 * Space (a disclosure, so it works by keyboard and touch), and on hover with a fine pointer. Esc or a click outside
 * closes it. The full list is on the Help page. */
import Link from 'next/link';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { glossaryTerm } from '@/lib/glossary';
import { useOutsideClose } from '@/components/ui';
import s from './term.module.css';

export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const g = glossaryTerm(id);
  const uid = useId();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const hover = useRef(false);
  if (!g) return <>{children}</>;
  const fine = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  return (
    <span className={s.wrap} ref={wrap}
      onMouseEnter={() => { if (fine()) { hover.current = true; setOpen(true); } }}
      onMouseLeave={() => { if (hover.current) { hover.current = false; setOpen(false); } }}>
      <button ref={btn} type="button" className={s.term} aria-expanded={open} aria-controls={`${uid}-d`}
        // a click on a definition that hovering opened keeps it open (pins it); otherwise it toggles
        onClick={() => { if (hover.current) { hover.current = false; setOpen(true); } else setOpen(o => !o); }}
        onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>{children ?? g.term}</button>
      {open && (
        <span id={`${uid}-d`} role="note" className={s.pop} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus(); } }}>
          <b>{g.term}</b>
          <span>{g.def}</span>
          <Link href={`/help/glossary#g-${g.id}`} className={s.more} onClick={close}>Glossary</Link>
        </span>
      )}
    </span>
  );
}
