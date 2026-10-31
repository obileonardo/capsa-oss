'use client';
/* Artifact detail (/library/[id]), LangChain-style: content left, metadata right.
 * The exact text stays as captured; the user's version lives in `yours` and is shown as theirs. */
import {
  ArrowLeft, Check, ChevronDown, CircleOff, Copy, Download, Eraser, FileQuestion, Library as LibraryIcon, PanelRight, PenLine, Sparkles, Trash2,
} from '@/components/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, useCopy, useOutsideClose, useToast } from '@/components/ui';
import PageTop from '@/components/shell/PageTop';
import { DemoNote } from '@/components/shell/PageParts';
import pk from '@/components/shell/page.module.css';
import { artifactById, deleteArtifact, keptFromAi, recordUse, sourceById, updateArtifact, useAppState } from '@/lib/store';
import type { Artifact } from '@/lib/types';
import { copyForAi } from '@/lib/aiExport';
import { EvidenceBlock, HistoryLog } from './DetailParts';
import ExportDialog from './ExportDialog';
import { ItemFacts } from './Panel';
import { BookmarkButton, TagEditor } from './Organise';
import { PanelSheet } from './LibraryView';
import { collectionColour } from './look';
import { useShell } from '@/components/shell/AppShell';
import { useMedia } from '@/components/inbox/useMedia';
import { createPortal } from 'react-dom';
import { explainerFor, isEdited, placeholders } from './lib';
import PromptFill, { ModelParams } from './PromptFill';
import { BeforeYouUse, NoAiToggle, RetiredNotice, SendToButtons } from './ReuseParts';
// Organise's parts of the page (release 3, lib/features.ts): notes, tried, merges, type fields, domains, links
import DomainsRow from '@/slots.gen/DomainsRow';
import FiledByRow from '@/slots.gen/FiledByRow';
import LinksBlock from '@/slots.gen/LinksBlock';
import MergedBlock from '@/slots.gen/MergedBlock';
import NoteRow from '@/slots.gen/NoteRow';
import SimilarBlock from '@/slots.gen/SimilarBlock';
import TriedRow from '@/slots.gen/TriedRow';
import { mergedInto } from '@/lib/organise';
import TypeFieldsRows from '@/slots.gen/TypeFieldsRows';
import { has } from '@/lib/features';
import { ImageFigure, useItemImage } from './ItemImage';
import d from './detail.module.css';
import s from './library.module.css';

export default function ArtifactDetail({ id }: { id: string }) {
  const { state } = useAppState();
  const a = artifactById(state, id);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  if (!a) return <NotFound id={id} />;
  return <Detail key={a.id} a={a} onDeleted={() => setGone(true)} />;
}

function NotFound({ id }: { id: string }) {
  const { state } = useAppState();
  const into = mergedInto(state, id); // MNT-06: merged away, so point to where it lives now
  if (into) return (
    <div className={pk.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: 'Library', href: '/library', icon: LibraryIcon }, { label: 'Merged' }]} />
      <h1 className="sr-only">Item merged</h1>
      <Empty icon={FileQuestion} title={`Merged into “${into.title}”`}
        action={<Link href={`/library/${into.id}`} className="btn primary">Open “{into.title}”</Link>} />
    </div>
  );
  return (
    <div className={pk.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: 'Library', href: '/library', icon: LibraryIcon }, { label: 'Not found' }]} />
      <h1 className="sr-only">Item not found</h1>
      <Empty icon={FileQuestion} title="This item isn’t in your library"
        action={<Link href="/library" className="btn primary"><ArrowLeft aria-hidden />Back to Library</Link>}>
        It may have been deleted, or the link came from another browser. Your library is kept only in this browser, so links don’t carry between devices.
        <span className={d.nfId}>ID: <code className="mono">{id}</code></span>
      </Empty>
    </div>
  );
}

type Version = 'exact' | 'yours';


function Detail({ a, onDeleted }: { a: Artifact; onDeleted: () => void }) {
  const { state } = useAppState();
  const router = useRouter();
  const toast = useToast();
  const copy = useCopy();
  const src = a.sourceId ? sourceById(state, a.sourceId) : undefined;
  const [version, setVersion] = useState<Version>(a.yours ? 'yours' : 'exact');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [level, setLevel] = useState<'simple' | 'technical'>('simple');
  const editBtn = useRef<HTMLButtonElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const explainer = useMemo(() => explainerFor(state, a), [state, a]);
  const { asideSlot } = useShell();
  const docked = useMedia('(min-width: 1100px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const cols = useMemo(() => state.collections.map((c, i) => ({ id: c.id, name: c.name, colour: collectionColour(i), icon: c.icon })).filter(c => (a.collections ?? []).includes(c.id)), [state.collections, a.collections]);
  // The side area holds compact facts only; everything you do to the item is in the main column or the top bar.
  const panel = (onClose?: () => void) => <ItemFacts a={a} src={src} cols={cols} onClose={onClose} />;

  useEffect(() => { document.title = `${a.title} · Capsa`; }, [a.title]);

  const shown = version === 'yours' ? a.yours ?? null : a.exact ?? null;
  const img = useItemImage(a); // an image item shows the picture; its text block only when it has text
  const noAi = keptFromAi(state, a); // PRV-02 (Track C): its own flag or a collection's
  const blanks = placeholders(shown);
  const userSupplied = a.evidence?.method === 'user_supplied';

  const copyAi = async () => { if (await copy(copyForAi(a, state), `Copied “${a.title}” for your AI`)) recordUse([a.id], 'copy'); };
  const doCopy = async () => {
    if (!shown) return;
    const ok = await copy(shown, version === 'yours' ? 'Copied your version' : 'Copied exact text');
    if (ok) { recordUse([a.id], 'copy'); setCopied(true); setTimeout(() => setCopied(false), 1200); }
  };

  const startEdit = () => {
    setDraft(a.yours ?? a.exact ?? '');
    setVersion('yours');
    setEditing(true);
    requestAnimationFrame(() => { const t = taRef.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } });
  };
  // Leaving the editor returns focus to the edit button once it is back on screen (a rAF could run before it re-mounts).
  const returnFocus = useRef(false);
  const refocus = () => { returnFocus.current = true; };
  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    (editBtn.current ?? document.getElementById('art-title'))?.focus();
  }, [editing]);
  const cancel = () => { setEditing(false); if (!a.yours) setVersion('exact'); refocus(); }; // nothing of yours yet: back to the text you started from
  const save = () => {
    const next = draft.replace(/\s+$/, '');
    const base = a.yours ?? a.exact ?? '';
    if (!next.trim()) return;
    if (next === base) { setEditing(false); toast({ message: 'No changes to save' }); refocus(); return; }
    const changed = updateArtifact(a.id, { yours: next }, a.yours ? 'Your version edited · exact text kept' : 'Your version saved · exact text kept');
    setEditing(false);
    setVersion('yours');
    if (changed) toast({ message: 'Saved your version', tone: 'ok' });
    refocus();
  };
  const discard = () => {
    const prev = a.yours ?? null;
    if (!prev) return;
    updateArtifact(a.id, { yours: null }, 'Your version discarded · exact text kept');
    setVersion('exact');
    toast({ message: 'Discarded your version', action: { label: 'Undo', run: () => { updateArtifact(a.id, { yours: prev }, 'Your version restored'); setVersion('yours'); } } });
  };
  const remove = () => {
    const title = a.title;
    onDeleted();
    const undo = deleteArtifact(a.id);
    router.push('/library');
    toast({ message: `Deleted “${title}”`, action: { label: 'Undo', run: undo } });
  };

  const voice = version === 'exact'
    ? (userSupplied ? 'Exactly as you pasted it' : 'Exactly as it appears in the source')
    : 'Your version · the exact text stays as captured';

  return (
    <div className={pk.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: 'Library', href: '/library', icon: LibraryIcon }, { label: a.title }]} actions={<>
        {a.demo && <DemoNote />}
        <BookmarkButton a={a} className="btn ghost sm icon" />
        <NoAiToggle a={a} inherited={noAi && !a.noAi} />
        <button type="button" className="btn ghost sm" onClick={() => setExportOpen(true)} aria-label="Export"><Download aria-hidden /><span className={d.tbLabel}>Export</span></button>
        <button type="button" className="btn ghost sm icon" onClick={remove} aria-label={`Delete ${a.title}`} title="Delete (Undo in the toast)"><Trash2 aria-hidden /></button>
        {!docked && <button type="button" className="btn sm" onClick={() => setSheetOpen(true)} aria-haspopup="dialog"><PanelRight aria-hidden />Details</button>}
      </>} />

      <div className={d.layout}>
        <article className={d.main} aria-labelledby="art-title">
          <header className={d.head}>
            <h1 id="art-title" className="page-title" tabIndex={-1}>{a.title}</h1>
            {a.purpose && <p className={d.purpose}><span className={d.aiMark}>AI summary</span>{a.purpose}</p>}
            {noAi && <p className={d.flags}><span className="tag neutral" title="Nothing is sent to AI today. When AI arrives, this stays out."><CircleOff aria-hidden />Don’t send to AI</span></p>}
          </header>

          {img && <ImageFigure a={a} />}
          {(!img || shown || editing) && <section className={d.block} aria-labelledby="txt-h">
            <div className={d.blockHead}>
              <h2 id="txt-h" className="sr-only">Text</h2>
              <div className="seg" role="group" aria-label="Version">
                <button type="button" aria-pressed={version === 'exact'} onClick={() => { setVersion('exact'); setEditing(false); }}>Exact</button>
                <button type="button" aria-pressed={version === 'yours'} onClick={() => setVersion('yours')}>
                  Your version{isEdited(a) && <span className={d.dot} aria-hidden />}
                </button>
              </div>
              <span className="spacer" />
              {!editing && version === 'yours' && a.yours && (
                <button type="button" className="btn ghost sm" onClick={discard}><Eraser aria-hidden />Discard</button>
              )}
              {!editing && shown && (
                <button ref={editBtn} type="button" className="btn ghost sm" onClick={startEdit}><PenLine aria-hidden />{a.yours ? 'Edit' : <><span className={s.long}>Edit your version</span><span className={s.short}>Edit</span></>}</button>
              )}
              {!editing && (
                <span className={d.copySplit}>
                  {shown && (
                    <button type="button" className={`btn sm ${d.copyBtn}`} data-copied={copied} onClick={doCopy}>
                      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                  <CopyMenu solo={!shown} onAi={noAi ? undefined : copyAi} send={shown && !noAi ? close => <SendToButtons a={a} text={shown} onDone={close} /> : undefined} />
                </span>
              )}
            </div>

            {editing ? (
              <div className={d.editWrap}>
                <label htmlFor="yours-ta" className="sr-only">Your version</label>
                <textarea id="yours-ta" ref={taRef} className={`textarea ${d.editor}`} value={draft} onChange={e => setDraft(e.target.value)}
                  rows={Math.min(16, Math.max(4, draft.split('\n').length + 1))} spellCheck
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
                    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
                  }} />
                <div className={d.editBar}>
                  <span className="spacer" />
                  <button type="button" className="btn sm" onClick={cancel} title="Cancel (Esc)">Cancel</button>
                  <button type="button" className="btn primary sm" onClick={save} disabled={!draft.trim()} title="Save (⌘↵). The exact text is kept.">Save your version</button>
                </div>
              </div>
            ) : shown ? (
              <pre className={d.code} data-copied={copied} data-v={version} tabIndex={0} aria-label={version === 'exact' ? 'Exact text' : 'Your version'} title={voice}>{shown}</pre>
            ) : version === 'exact' ? (
              <div className={d.none}>
                <b>No exact text captured</b>
              </div>
            ) : (
              <div className={d.none}>
                <b>No version of your own yet</b>
                <button type="button" className="btn sm" onClick={startEdit}><PenLine aria-hidden />{a.exact ? 'Start from the exact text' : 'Write your version'}</button>
              </div>
            )}
          </section>}

          {!editing && <RetiredNotice text={shown} />}
          {!editing && shown && <ModelParams text={shown} />}
          {!editing && shown && blanks.length > 0 && <PromptFill key={`${version}:${shown}`} text={shown} names={blanks} onCopied={() => recordUse([a.id], 'fill')} />}
          {!editing && <BeforeYouUse a={a} text={shown ?? a.exact ?? null} />}
          {/* Track B: your note and whether you tried it (CUR-09, CUR-10) */}
          {has('organise') ? <section className={`${d.block} ${d.labelCol}`} aria-label="Your notes">
            {TriedRow && <TriedRow a={a} />}
            {NoteRow && <NoteRow a={a} />}
          </section> : a.note && ( /* without Organise, a note made at capture still shows; editing it comes with Organise */
            <section className={`${d.block} ${d.labelCol}`} aria-label="Your notes">
              <div className={s.tagRow}><span className={s.tagHead}>Note</span><p className={d.noteRead}>{a.note}</p></div>
            </section>
          )}

          <EvidenceBlock a={a} src={src} board={a.boardId ? state.boards.find(b => b.id === a.boardId) : undefined} />
          {MergedBlock && <MergedBlock a={a} />}
          <section className={`${d.block} ${d.labelCol}`} aria-label="Tags and topics">
            <TagEditor a={a} />
            {TypeFieldsRows && <TypeFieldsRows a={a} />}
            {DomainsRow && <DomainsRow a={a} />}
            {FiledByRow && <FiledByRow a={a} />}
            {(a.useCases ?? []).length > 0 && (
              <div className={s.tagRow}><span className={s.tagHead}>Use cases</span><span className={d.useCases}>{a.useCases!.join(', ')}</span></div>
            )}
          </section>
          {LinksBlock && <LinksBlock a={a} />}
          {SimilarBlock && <SimilarBlock a={a} />}
          {explainer && (
            <section className={d.block} aria-labelledby="exp-h">
              <div className={d.sectionHead}>
                <h2 id="exp-h" className={d.h2}>Explainer</h2>
                <span className="tag ai"><Sparkles aria-hidden />AI-drafted explainer, not reviewed</span>
                <span className="spacer" />
                <div className="seg" role="group" aria-label="Explainer depth">
                  <button type="button" aria-pressed={level === 'simple'} onClick={() => setLevel('simple')}>Simple</button>
                  <button type="button" aria-pressed={level === 'technical'} onClick={() => setLevel('technical')}>Technical</button>
                </div>
              </div>
              <dl className={d.qa}>
                {explainer[level].map(([q, ans]) => <div key={q}><dt>{q}</dt><dd>{ans}</dd></div>)}
              </dl>
            </section>
          )}
          <HistoryLog a={a} />
        </article>

      </div>
      {docked && asideSlot && createPortal(panel(), asideSlot)}
      <PanelSheet item={!docked && sheetOpen ? a : undefined} onClose={() => setSheetOpen(false)}>
        {!docked && sheetOpen && panel(() => setSheetOpen(false))}
      </PanelSheet>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} items={[a]} />
    </div>
  );
}

/** The Copy button's menu: "Copy for AI" (the text with where it came from, fenced as content). With no text to copy
 * it stands alone as the item's only copy action. */
export function CopyMenu({ onAi, solo, send }: { /** absent for Don't send to AI */ onAi?: () => void; solo: boolean; /** Track C (RUS-04): the Send to rows */ send?: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  if (!onAi && !send) return null;
  if (solo) return onAi ? <button type="button" className="btn sm" onClick={onAi}><Sparkles aria-hidden />Copy for AI</button> : null;
  return (
    <span className={d.copyMore} ref={wrap}>
      <button ref={btn} type="button" className={`btn sm icon ${d.copyCaret}`} aria-haspopup="true" aria-expanded={open} aria-label="More ways to copy" title="More ways to copy" onClick={() => setOpen(o => !o)}><ChevronDown aria-hidden /></button>
      {open && (
        <div className={`menu ${d.copyPop}`} role="group" aria-label="More ways to copy" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus(); } }}>
          {onAi && <button type="button" autoFocus onClick={() => { close(); onAi(); }}><Sparkles aria-hidden />Copy for AI</button>}
          {send?.(close)}
        </div>
      )}
    </span>
  );
}
