'use client';
/* Deleting an Inbox source (24 Oct), the same everywhere: the card's ⋯ menu, Delete/Backspace on a card, the bin, the
 * right panel and the full review. Done items are refused; Processing asks first, because deleting stops it; the rest
 * go straight to Deleted with an Undo. Nothing is destroyed here (store.trashSource). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, useToast } from '@/components/ui';
import { trashSource } from '@/lib/store';
import type { Source } from '@/lib/types';
import { askToStop, columnOf, refuseDelete } from './moves';

export type DeleteOutcome = 'deleted' | 'asked' | 'refused';

export function useDeleteSource({ onDeleted, say }: { onDeleted?: (src: Source) => void; say?: (m: string) => void } = {}) {
  const toast = useToast();
  const [ask, setAsk] = useState<Source | null>(null);
  const stopBtn = useRef<HTMLButtonElement>(null);
  // the dialog has opened (its effect runs first): start on the one action
  useEffect(() => { if (ask) stopBtn.current?.focus(); }, [ask]);

  const run = useCallback((src: Source) => {
    const undo = trashSource(src.id, columnOf(src));
    if (!undo) return false;
    say?.(`${src.title}: moved to Deleted`);
    toast({ message: `Deleted “${src.title}”`, action: { label: 'Undo', run: () => { undo(); say?.(`Undone: ${src.title} is back`); } }, duration: 10000 });
    onDeleted?.(src);
    return true;
  }, [toast, onDeleted, say]);

  /** Delete, ask first (Processing), or refuse (Done, with the reason in a toast). */
  const request = useCallback((src: Source): DeleteOutcome => {
    const why = refuseDelete(src);
    if (why) { say?.(`Can’t delete: ${why}`); toast({ message: why, tone: 'plain' }); return 'refused'; }
    if (askToStop(src)) { setAsk(src); return 'asked'; }
    return run(src) ? 'deleted' : 'refused';
  }, [run, toast, say]);

  const close = () => setAsk(null);
  const dialog = (
    <Dialog open={!!ask} onClose={close} title="Stop and delete?" size="sm"
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={close}>Cancel</button>
        <button type="button" ref={stopBtn} className="btn primary" onClick={() => { const src = ask; close(); if (src) run(src); }}>Stop and delete</button></>}>
      <p style={{ margin: 0 }}>“{ask?.title}” is still processing. Deleting it stops that.</p>
    </Dialog>
  );
  return { request, dialog };
}
