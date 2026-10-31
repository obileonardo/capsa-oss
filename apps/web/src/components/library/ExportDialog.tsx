'use client';
/* Export: format options plus a readable preview (Fireflies + Obvious). Everything is generated in the browser. */
import { Bot, Braces, CircleOff, Copy, Download, FileText, Quote } from '@/components/ui/icons';
import { citations, type CiteFormat } from '@/lib/citations';
import { useMemo, useState } from 'react';
import { Dialog, useCopy, useToast } from '@/components/ui';
import { keptFromAi, useAppState, recordUse } from '@/lib/store';
import type { Artifact } from '@/lib/types';
import { download } from '@/lib/zip';
import { exportAgent, exportJSON, exportMarkdown, exportStamp, plural } from './lib';
import s from './library.module.css';

type Format = 'md' | 'json' | 'agent' | CiteFormat;
const FORMATS: { id: Format; label: string; hint: string; Icon: typeof FileText }[] = [
  { id: 'md', label: 'Markdown', hint: 'Readable notes with evidence', Icon: FileText },
  { id: 'json', label: 'JSON', hint: 'Every field, for scripts and backups', Icon: Braces },
  { id: 'agent', label: 'Agent instructions', hint: 'Paste into an agent’s instructions', Icon: Bot },
  // RUS-13 (Track C): citations of the sources behind the items
  { id: 'bibtex', label: 'BibTeX', hint: 'Cite the sources: BibTeX', Icon: Quote },
  { id: 'csl', label: 'CSL-JSON', hint: 'Cite the sources: CSL-JSON, for Zotero and others', Icon: Quote },
  { id: 'apa', label: 'APA', hint: 'Cite the sources: APA 7 text', Icon: Quote },
];
const CITE_FILE: Record<CiteFormat, { ext: string; type: string }> = { bibtex: { ext: 'bib', type: 'application/x-bibtex' }, csl: { ext: 'json', type: 'application/json' }, apa: { ext: 'txt', type: 'text/plain' } };
const isCite = (f: Format): f is CiteFormat => f === 'bibtex' || f === 'csl' || f === 'apa';

export default function ExportDialog({ open, onClose, items: all }: { open: boolean; onClose: () => void; items: Artifact[] }) {
  const { state } = useAppState();
  // Don't send to AI keeps items out of every export; backups still keep them
  const items = useMemo(() => all.filter(a => !keptFromAi(state, a)), [all, state]);
  const held = all.length - items.length;
  const [fmt, setFmt] = useState<Format>('md');
  const copy = useCopy();
  const toast = useToast();
  const cite = useMemo(() => (open && isCite(fmt) ? citations(items, state, fmt) : null), [open, fmt, items, state]);
  const text = useMemo(() => {
    if (!open) return '';
    if (cite) return cite.text;
    return fmt === 'json' ? exportJSON(items, state) : fmt === 'agent' ? exportAgent(items, state) : exportMarkdown(items, state);
  }, [open, fmt, items, state, cite]);

  const save = () => {
    const ext = isCite(fmt) ? CITE_FILE[fmt].ext : fmt === 'json' ? 'json' : 'md';
    const name = isCite(fmt) ? `capsa-citations-${exportStamp()}.${ext}` : `capsa-${fmt === 'agent' ? 'agent-instructions' : 'export'}-${exportStamp()}.${ext}`;
    download(new Blob([text], { type: isCite(fmt) ? CITE_FILE[fmt].type : fmt === 'json' ? 'application/json' : 'text/markdown' }), name);
    recordUse(items.map(a => a.id), 'export');
    toast({ message: `Downloaded ${name}`, tone: 'ok' });
  };
  const copyIt = async () => {
    const ok = await copy(text, fmt === 'agent' ? 'Copied as agent instructions' : isCite(fmt) ? `Copied ${FORMATS.find(f => f.id === fmt)!.label}` : `Copied ${fmt === 'json' ? 'JSON' : 'Markdown'}`);
    if (ok) recordUse(items.map(a => a.id), 'export');
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Export ${plural(items.length, 'item')}`} size="lg"
      footer={<>
        <span className="spacer" />
        {fmt === 'agent' ? (<>
          <button type="button" className="btn" onClick={save} disabled={!items.length}><Download aria-hidden />Download .md</button>
          <button type="button" className="btn primary" onClick={copyIt} disabled={!items.length}><Copy aria-hidden />Copy as agent instructions</button>
        </>) : (<>
          <button type="button" className="btn" onClick={copyIt} disabled={!items.length || (!!cite && !cite.cited)}><Copy aria-hidden />Copy</button>
          <button type="button" className="btn primary" onClick={save} disabled={!items.length || (!!cite && !cite.cited)}><Download aria-hidden />Download .{isCite(fmt) ? CITE_FILE[fmt].ext : fmt}</button>
        </>)}
      </>}>
      <div className={s.formats} role="group" aria-label="Format">
        {FORMATS.map(f => (
          <button key={f.id} type="button" aria-pressed={fmt === f.id} className={s.format} onClick={() => setFmt(f.id)} title={f.hint}>
            <f.Icon aria-hidden />
            <span><b>{f.label}</b></span>
          </button>
        ))}
      </div>
      {cite && (
        <p className={s.citeFacts} aria-live="polite">
          <span>{plural(cite.cited, 'source')}</span>
          {cite.notCitable > 0 && <span>{plural(cite.notCitable, 'item')} with no source</span>}
          {cite.missing.length > 0 && <span>Missing: {cite.missing.map(m => `${m.field} (${m.count})`).join(', ')}</span>}
        </p>
      )}
      {held > 0 && <p className={s.citeFacts}><span className={s.heldOut}><CircleOff aria-hidden />{plural(held, 'item')} marked Don’t send to AI, left out</span></p>}
      {items.length > 0 && (
        <div className={s.preview}>
          <div className={s.previewHead}><span>Preview</span><span>{text.split('\n').length} lines</span></div>
          <pre tabIndex={0} aria-label="Export preview">{text}</pre>
        </div>
      )}
    </Dialog>
  );
}
