'use client';
/* Mobile: every filter in one bottom sheet. Choices apply live; the footer shows the live result count. */
import { X } from '@/components/ui/icons';
import { useEffect, useRef, type ReactNode } from 'react';
import type { FacetOption } from './parts';
import type { Sort } from './lib';
import { SORT_ICON } from './look';
import s from './library.module.css';
import sh from './itemSheet.module.css';

export interface SheetFacet { key: string; label: string; allLabel: string; allIcon?: ReactNode; options: FacetOption[]; value: string; total: number; onChange: (v: string) => void }

export default function FilterSheet({ open, onClose, facets, sort, onSort, results, onClearAll, active }: {
  open: boolean; onClose: () => void; facets: SheetFacet[]; sort: Sort; onSort: (v: Sort) => void;
  results: number; onClearAll: () => void; active: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className={s.sheet} aria-labelledby="lib-sheet-h" onClose={() => { if (!ref.current?.open) onClose(); }}
      onCancel={e => { e.preventDefault(); onClose(); }} onMouseDown={e => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className={s.sheetCard}>
          <div className={s.sheetHead}>
            <span className={s.grab} aria-hidden />
            <h2 id="lib-sheet-h">Filters{active ? ` · ${active}` : ''}</h2>
            <button type="button" className={sh.close} onClick={onClose} aria-label="Close filters"><X aria-hidden /></button>
          </div>
          <div className={s.sheetBody}>
            <section className={s.sheetSec} aria-labelledby="sh-sort">
              <h3 id="sh-sort">Sort</h3>
              <div className="seg" role="group" aria-labelledby="sh-sort">
                {([['recent', 'Recent'], ['used', 'Used'], ['az', 'A–Z']] as const).map(([v, label]) => {
                  const I = SORT_ICON[v];
                  return <button key={v} type="button" aria-pressed={sort === v} onClick={() => onSort(v)}><I aria-hidden />{label}</button>;
                })}
              </div>
            </section>
            {facets.map(f => (
              <section key={f.key} className={s.sheetSec} aria-labelledby={`sh-${f.key}`}>
                <h3 id={`sh-${f.key}`}>{f.label}</h3>
                <div className={s.sheetChips} role="group" aria-labelledby={`sh-${f.key}`}>
                  {[{ value: '', label: f.allLabel, count: f.total, icon: f.allIcon } as FacetOption, ...f.options].map(o => (
                    <button key={o.value || 'all'} type="button" className="chip" aria-pressed={f.value === o.value} data-zero={o.count === 0}
                      onClick={() => f.onChange(o.value)}>
                      {o.icon}{o.label}<span className={s.chipCount}>{o.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className={s.sheetFoot}>
            <button type="button" className="btn ghost" onClick={onClearAll} disabled={!active}>Clear all</button>
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={onClose}>Show {results} {results === 1 ? 'result' : 'results'}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
