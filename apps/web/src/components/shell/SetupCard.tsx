'use client';
/* Set up Capsa (Elvis, 25 Oct: Slite #459's "Set up: 86% completed" at the foot of the sidebar). One card above the
 * footer, "Set up · 4 of 6" with a meter, until every step is done or it's hidden. It opens a checklist of six steps,
 * each read from the library itself (nothing is ticked by hand), each a link to where you do it. Hide puts it away,
 * with Undo. In the icon rail it isn't drawn. */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutsideClose, useToast } from '@/components/ui';
import { ArrowRight, Check, ListChecks } from '@/components/ui/icons';
import { setPrefs, useAppState } from '@/lib/store';
import type { AppState } from '@/lib/types';
import { has } from '@/lib/features';
import x from './setup.module.css';

export type SetupStep = { id: string; label: string; href: string; done: boolean };

/** The six steps, from what the library holds (five without the Playground). Demo data doesn't count: it's ours, not yours. */
export function setupSteps(s: AppState): SetupStep[] {
  return [
    { id: 'capture', label: 'Save your first item', href: '/library', done: s.artifacts.some(a => !a.demo) },
    { id: 'review', label: 'Review something in the Inbox', href: '/inbox', done: s.sources.some(v => !v.demo && v.status === 'reviewed') },
    { id: 'collection', label: 'Make a collection', href: '/collections', done: s.collections.some(c => !c.demo) },
    ...(has('playground') ? [{ id: 'board', label: 'Start a board', href: '/playground?show=boards', done: s.boards.some(b => !b.demo) }] : []),
    { id: 'ai', label: 'Add your AI', href: '/ai/overview', done: (s.prefs.ais ?? []).length > 0 },
    { id: 'backup', label: 'Back up your library', href: '/settings/data#backup', done: !!s.prefs.lastBackupAt },
  ];
}

export default function SetupCard({ rail }: { rail: boolean }) {
  const { state, ready } = useAppState();
  const toast = useToast();
  const steps = useMemo(() => setupSteps(state), [state]);
  const done = steps.filter(s => s.done).length;
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wrap = useOutsideClose(open, () => setOpen(false));
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>('a')?.focus(); }, [open]);
  if (rail || !ready || state.prefs.setupHidden || done === steps.length) return null;
  const close = () => { setOpen(false); btn.current?.focus(); };
  const hide = () => {
    setPrefs({ setupHidden: true });
    setOpen(false);
    toast({ message: 'Set up hidden', action: { label: 'Undo', run: () => setPrefs({ setupHidden: false }) } });
  };
  return (
    <div ref={wrap} className={x.wrap}>
      <button ref={btn} type="button" className={x.card} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={`Set up Capsa, ${done} of ${steps.length} done`}>
        <span className={x.top}><ListChecks aria-hidden /><b>Set up</b><span className={x.count}>{done} of {steps.length}</span></span>
        <span className={x.meter} aria-hidden><i style={{ width: `${Math.round((done / steps.length) * 100)}%` }} /></span>
      </button>
      {open && (
        <div ref={list} className={x.check} role="dialog" aria-label="Set up Capsa" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <div className={x.head}><b>Set up Capsa</b><span>{done} of {steps.length}</span></div>
          <ul className={x.steps}>
            {steps.map(s => (
              <li key={s.id}>
                <Link href={s.href} className={x.step} data-done={s.done} onClick={() => setOpen(false)}>
                  <span className={x.tick} aria-hidden>{s.done && <Check />}</span>
                  <span className={x.text}>{s.label}</span>
                  {s.done ? <span className="sr-only">, done</span> : <ArrowRight className={x.go} aria-hidden />}
                </Link>
              </li>
            ))}
          </ul>
          <div className={x.foot}><button type="button" className="btn ghost sm" onClick={hide}>Hide</button></div>
        </div>
      )}
    </div>
  );
}
