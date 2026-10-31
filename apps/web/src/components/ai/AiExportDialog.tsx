'use client';
/* Export a collection or project for an AI agent (Stage 8): pick a format, see exactly what will be written, then
 * download it or copy it. Made in this browser; nothing is uploaded. */
import { CircleOff, Copy, Download } from '@/components/ui/icons';
import { useMemo, useState } from 'react';
import { Dialog, useCopy, useToast } from '@/components/ui';
import { AI_FORMATS, buildAiExport, skillZip, type AiFormat } from '@/lib/aiExport';
import type { Artifact } from '@/lib/types';
import { keptFromAi, recordUse, useAppState } from '@/lib/store';
import { download } from '@/lib/zip';
import s from './ai.module.css';

export default function AiExportDialog({ open, onClose, name, note, items: all }: { open: boolean; onClose: () => void; name: string; note?: string; items: Artifact[] }) {
  const { state } = useAppState();
  const items = useMemo(() => all.filter(a => !keptFromAi(state, a)), [all, state]); // Don't send to AI
  const held = all.length - items.length;
  const copy = useCopy();
  const toast = useToast();
  const [fmt, setFmt] = useState<AiFormat>('claude');
  const out = useMemo(() => (open ? buildAiExport(fmt, name, items, state, note) : null), [open, fmt, name, items, state, note]);
  const save = async () => {
    if (!out) return;
    if (fmt === 'skill') download(await skillZip(name, items, state, note), out.name);
    else download(new Blob([out.text], { type: 'text/markdown' }), out.name);
    recordUse(items.map(a => a.id), 'export');
    toast({ message: `Downloaded ${out.name}`, tone: 'ok' });
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Export “${name}” for your AI`} size="xl"
      footer={<>
        <span className="hint">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
        <span className="spacer" />
        {fmt !== 'skill' && <button type="button" className="btn" disabled={!items.length} onClick={async () => { if (out && await copy(out.text, `Copied ${out.name}`)) recordUse(items.map(a => a.id), 'export'); }}><Copy aria-hidden />Copy</button>}
        <button type="button" className="btn primary" onClick={save} disabled={!items.length}><Download aria-hidden />Download {out?.name}</button>
      </>}>
      <div className={s.formats} role="radiogroup" aria-label="Format">
        {AI_FORMATS.map(f => (
          <button key={f.v} type="button" role="radio" aria-checked={fmt === f.v} className={s.format} onClick={() => setFmt(f.v)} title={f.sub}>
            <b>{f.label}</b>
          </button>
        ))}
      </div>
      {held > 0 && <p className={`hint ${s.heldOut}`}><CircleOff aria-hidden />{held} {held === 1 ? 'item' : 'items'} marked Don’t send to AI, left out</p>}
      {!items.length ? <p className="hint">{held ? 'Nothing to export' : 'Nothing to export yet'}</p> : (
        <div className={s.preview}><div className={s.codeBar}><span>{fmt === 'skill' ? 'Files in the ZIP' : out?.name}</span></div><pre aria-label="Preview">{out?.text}</pre></div>
      )}
    </Dialog>
  );
}
