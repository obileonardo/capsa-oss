'use client';
/* Capture (design-references/mockups/capture.html, approved 23 Oct): a command-bar start ("What do you want to keep?" and
 * a Create group), then a composer with a breadcrumb, quiet pickers along the bottom and a black Keep. Typing or pasting
 * goes straight into the composer and the type is detected. Nothing is fetched: a pasted link shows what its address says
 * ("Not read yet"); a GitHub link can be read only when reading is on in Settings, and only when you press Read. */
import {
  ArrowLeft, Briefcase, Check, ChevronDown, ChevronRight, ExternalLink, FileText, Folder, ImagePlus, Inbox, Link2, MessageSquareText, Paperclip,
  Plus, Search, ShieldAlert, SquarePlay, StickyNote, SwatchBook, X, type LucideIcon,
} from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOutsideClose, useToast } from '@/components/ui';
import { captureLink, captureNote, captureText, createBoard, deleteReference, deleteSource, readGithubSource, updateReference, useAppState } from '@/lib/store';
import { captureImage, captureLinks, savedLinkFor } from '@/lib/store';
import { db } from '@/lib/db';
import { describeLink } from '@/lib/capture/extract';
import { findSensitive, maskSensitive, sensitiveSummary, type SensitiveHit } from '@/lib/capture/sensitive';
import { bulkLines, isBulkLinks } from '@/lib/capture/links';
import { DOC_ACCEPT, readDocument } from '@/lib/capture/readDocument';
import { parseGithub, readGithub, type GithubFile } from '@/lib/capture/github';
import { addFiles, imageFiles } from '@/lib/boards/capture';
import { has } from '@/lib/features';
import type { Source } from '@/lib/types';
import { BrandIcon } from '@/components/ui/BrandIcon';
import c from './capture.module.css';

type Kind = 'link' | 'prompt' | 'image' | 'file' | 'video' | 'note';
type Dest = { kind: 'inbox' } | { kind: 'collections' | 'projects' | 'boards'; id: string };
const KINDS: { k: Kind; label: string; Icon: LucideIcon }[] = [
  { k: 'link', label: 'Link', Icon: Link2 },
  { k: 'prompt', label: 'Prompt', Icon: MessageSquareText },
  { k: 'image', label: 'Image or screenshot', Icon: ImagePlus },
  { k: 'file', label: 'File', Icon: FileText },
  { k: 'video', label: 'Video', Icon: SquarePlay },
  { k: 'note', label: 'Note', Icon: StickyNote },
];
const TYPE_ICON: Record<Kind, LucideIcon> = { link: Link2, prompt: MessageSquareText, image: ImagePlus, file: FileText, video: SquarePlay, note: StickyNote };

const asUrl = (v: string): string | null => {
  const t = v.trim();
  if (!/^\S+$/.test(t) || !/^(https?:\/\/|www\.)/i.test(t)) return null;
  try { return new URL(t.startsWith('http') ? t : `https://${t}`).toString(); } catch { return null; }
};
/** Which field shows (link input, image split or text area): focus follows it when it changes. */
const shownKindKey = (v: string, chosen: boolean, k: Kind, file: boolean, doc = false) => (doc ? 'doc' : file ? 'image' : (chosen ? k : detect(v)) === 'link' || (chosen ? k : detect(v)) === 'video' ? 'url' : 'text');
const detect = (v: string): Kind => { const u = asUrl(v); return u ? (describeLink(u).kind === 'video' ? 'video' : 'link') : 'prompt'; };

/** Replays GitHub responses read in the dialog when the link is kept, so the repository is fetched once. */
function cachingFetch() {
  const seen = new Map<string, Response>();
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = String(input);
    const hit = seen.get(key);
    if (hit) return hit.clone();
    const r = await fetch(input, init);
    seen.set(key, r.clone());
    return r;
  }) as typeof fetch;
}

export default function CaptureDialog({ open, prefill, onClose }: { open: boolean; prefill?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const router = useRouter();
  const { state } = useAppState();
  const [stage, setStage] = useState<'start' | 'compose'>('start');
  const [kind, setKind] = useState<Kind>('prompt');
  const [chosenKind, setChosenKind] = useState(false); // false: follow detection
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<File | null>(null); // Capture › File (CAP-06): Markdown, text, a transcript or a PDF
  const [reading, setReading] = useState<string | null>(null); // progress while a file is read ("Page 3 of 12")
  const readAbort = useRef<AbortController | null>(null);
  const [dest, setDest] = useState<Dest>({ kind: 'inbox' });
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState(''); // what's typed in the start list (the composer's draft is kept separately)
  const [error, setError] = useState('');
  const [gh, setGh] = useState<{ state: 'idle' | 'reading' | 'read' | 'failed'; desc?: string; files?: string[] }>({ state: 'idle' });
  const ghFetch = useRef<typeof fetch | null>(null);
  const field = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  // XEV-15 (Track C): secrets or personal data found on this device in the text about to be kept; null when none or acknowledged
  const [sens, setSens] = useState<SensitiveHit[] | null>(null);
  const reset = useCallback(() => {
    setStage('start'); setQuery(''); setKind('prompt'); setChosenKind(false); setText(''); setFile(null); setDest({ kind: 'inbox' }); setActive(0); setError(''); setGh({ state: 'idle' }); ghFetch.current = null;
    setSens(null);
    setDoc(null); setReading(null); readAbort.current?.abort(); readAbort.current = null;
  }, []);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) {
      if (prefill) { setText(prefill); setKind(detect(prefill)); setStage('compose'); }
      d.showModal();
      field.current?.focus(); // showModal focuses the first control; the field is the one that matters
    }
    if (!open && d.open) d.close();
    if (!open) reset(); // fresh for next time, so a reopen never shows (or focuses) the last capture
  }, [open, prefill, reset]);
  // Focus moves with the text, in the same frame, so fast typing or a paste never loses a key when the start becomes the composer
  useLayoutEffect(() => {
    const f = field.current; if (!open || !f) return;
    f.focus(); if (typeof f.value !== 'string') return; const n = f.value.length; try { f.setSelectionRange(n, n); } catch { /* not a text field */ }
  }, [open, stage, file, shownKindKey(text, chosenKind, kind, !!file, !!doc)]);

  const linkMode = !file && !doc && (chosenKind ? kind === 'link' || kind === 'video' : detect(text) !== 'prompt');
  const url = linkMode ? asUrl(text) : null;
  const link = useMemo(() => (url ? describeLink(url) : null), [url]);
  const repo = link?.kind === 'github' && url ? parseGithub(url) : null;
  // CAP-04: the same address already saved (canonical form), so Keep offers "Open existing" first
  const dupe = useMemo(() => (url ? savedLinkFor(url) : undefined), [url, state.sources]); // eslint-disable-line react-hooks/exhaustive-deps
  // CPT-16: several links pasted at once, one per line
  const bulk = useMemo(() => (!file && !doc && !linkMode && !(chosenKind && (kind === 'prompt' || kind === 'note')) && isBulkLinks(text) ? bulkLines(text) : null), [file, doc, linkMode, chosenKind, kind, text]);
  const bulkSaved = useMemo(() => new Map((bulk ?? []).flatMap(l => (l.kind === 'link' ? [[l.line, savedLinkFor(l.url)] as const] : []))), [bulk, state.sources]); // eslint-disable-line react-hooks/exhaustive-deps
  const bulkNew = (bulk ?? []).filter(l => l.kind === 'link' && !bulkSaved.get(l.line));
  const shownKind: Kind = doc ? 'file' : file ? 'image' : chosenKind ? kind : detect(text);
  const crumb = doc ? 'File' : bulk ? 'Links' : file ? 'Image' : chosenKind && !linkMode ? (KINDS.find(k => k.k === kind)?.label ?? 'Prompt') : link ? (link.kind === 'github' ? 'GitHub repository' : link.kind === 'video' ? link.title : link.kind === 'x' ? 'Post on X' : 'Link')
    : KINDS.find(k => k.k === shownKind)?.label.replace(' or screenshot', '') ?? 'Prompt';

  const typeInto = (v: string) => { setText(v); setError(''); setSens(null); if (stage === 'start' && v) setStage('compose'); };
  // Back to the start list (crumb, Esc, Backspace in an empty composer); the draft (text, image) is kept for the next type
  const back = () => { setStage('start'); setError(''); setQuery(''); };
  const pick = (k: Kind) => {
    if (k === 'image') { fileInput.current?.click(); return; }
    if (k === 'file') { docInput.current?.click(); return; }
    setKind(k); setChosenKind(k !== 'link' && k !== 'video'); setStage('compose');
  };
  const destLabel = dest.kind === 'inbox' ? 'Inbox'
    : (dest.kind === 'collections' ? state.collections : dest.kind === 'projects' ? state.projects : state.boards.map(b => ({ id: b.id, name: b.title || 'Untitled board' }))).find(x => x.id === dest.id)?.name ?? 'Inbox';
  const destIcon: LucideIcon = dest.kind === 'collections' ? Folder : dest.kind === 'projects' ? Briefcase : dest.kind === 'boards' ? SwatchBook : Inbox;

  const onDoc = (f: File | null) => {
    if (!f) return;
    setDoc(f); setFile(null); setError(''); setStage('compose');
    setDest(d => (d.kind === 'boards' ? { kind: 'inbox' } : d));
  };
  const onFile = (f: File | null) => {
    if (!f || !imageFiles([f]).length) return;
    setFile(f); setDoc(null); setStage('compose');
    // an image goes to a board by default, or to the Inbox in a build without the Playground (lib/features.ts)
    const firstBoard = state.boards[0];
    setDest(!has('playground') ? { kind: 'inbox' } : firstBoard ? { kind: 'boards', id: firstBoard.id } : { kind: 'boards', id: '' });
  };

  const readRepo = async () => {
    if (!repo) return;
    setGh({ state: 'reading' });
    ghFetch.current = cachingFetch();
    const r = await readGithub(repo, ghFetch.current);
    if (!r.ok) { setGh({ state: 'failed', desc: r.reason }); return; }
    const readme = r.files.find((x: GithubFile) => /readme/i.test(x.path))?.text ?? r.files[0]?.text ?? '';
    const desc = readme.split(/\n{2,}/).map(p => p.replace(/^#+\s*/, '').replace(/[*_`>]/g, '').trim()).find(p => p.length > 30 && !/^!\[|^<|^\[!/.test(p));
    setGh({ state: 'read', desc, files: r.files.map(x => x.path.split('/').pop() ?? x.path) });
  };

  // force: Track A (keep a duplicate link anyway); override and sensChecked: Track C (masked text, secrets already asked about)
  const keep = async (force = false, override?: string, sensChecked = false) => {
    const v = (override ?? text).trim();
    const target: Source['target'] | undefined = dest.kind === 'collections' ? { collections: [dest.id] } : dest.kind === 'projects' ? { projects: [dest.id] } : undefined;
    const where = dest.kind === 'inbox' ? 'Inbox' : destLabel;
    if (doc) {
      if (reading) return;
      const ac = new AbortController(); readAbort.current = ac;
      setError(''); setReading('Reading…');
      try {
        const r = await readDocument(doc, { signal: ac.signal, onProgress: setReading });
        if (ac.signal.aborted) return;
        const src = r.capture(target);
        onClose();
        const n = src.candidates?.length ?? 0;
        toast({ message: n ? `Kept in Inbox · ${n} found` : 'Kept in Inbox · nothing to unpack', tone: 'ok', actions: [
          { label: 'Open', run: () => router.push(`/inbox/${src.id}`) }, { label: 'Undo', run: () => { deleteSource(src.id); } },
        ] });
      } catch (e) {
        if (!ac.signal.aborted) setError((e as Error).message);
      } finally { setReading(null); if (readAbort.current === ac) readAbort.current = null; }
      return;
    }
    if (file && (dest.kind === 'inbox' || !has('playground'))) {
      // CAP-10 (part): an image kept in the Inbox, where its text can be read on this device
      const src = await captureImage(file, file.name && !/^image\.\w+$/.test(file.name) ? file.name : 'Image', v);
      onClose();
      toast({ message: 'Kept in Inbox · image', tone: 'ok', actions: [
        { label: 'Open', run: () => router.push(`/inbox/${src.id}`) },
        { label: 'Undo', run: () => { deleteSource(src.id); void db.deleteBlob(src.image!.key); } },
      ] });
      return;
    }
    if (file) {
      let boardId = dest.kind === 'boards' ? dest.id : '';
      let made = false;
      if (!boardId) { boardId = createBoard('Captured images').id; made = true; }
      try {
        const r = await addFiles(boardId, null, [file]);
        const refId = r.refs[0]?.id;
        if (!refId) { setError(r.refused[0] ?? 'That image couldn’t be kept.'); return; }
        if (v) updateReference(refId, { note: v });
        onClose();
        const boardName = made ? 'Captured images' : destLabel;
        toast({ message: `Kept in ${boardName}`, tone: 'ok', actions: [
          { label: 'Open', run: () => router.push(`/boards/${boardId}?ref=${encodeURIComponent(refId)}`) },
          { label: 'Undo', run: () => { void deleteReference(refId); } },
        ] });
      } catch (e) { setError((e as Error).message); }
      return;
    }
    if (!v) { setError('Paste a link or type something to keep.'); field.current?.focus(); return; }
    if (bulk) {
      if (!bulkNew.length) { setError('These links are all saved already.'); return; }
      const { sources, undo } = captureLinks(bulkNew.map(l => (l.kind === 'link' ? l.url : '')), target);
      onClose();
      const known = bulk.filter(l => l.kind === 'link' && bulkSaved.get(l.line)).length;
      const repeats = bulk.filter(l => l.kind === 'repeat').length, invalid = bulk.filter(l => l.kind === 'invalid').length;
      const extra = [known && `${known} already saved`, repeats && `${repeats} repeated`, invalid && `${invalid} not ${invalid === 1 ? 'a link' : 'links'}`].filter(Boolean).join(' · ');
      toast({ message: `Kept ${sources.length} ${sources.length === 1 ? 'link' : 'links'} in Inbox${extra ? ` · ${extra}` : ''}`, tone: 'ok', actions: [
        { label: 'Open', run: () => router.push(sources.length === 1 ? `/inbox/${sources[0].id}` : '/inbox') }, { label: 'Undo', run: undo },
      ] });
      return;
    }
    if ((shownKind === 'link' || shownKind === 'video') && !url) { setError('That link doesn’t look complete. Check it and try again.'); return; }
    if (url && dupe && !force) { onClose(); router.push(`/inbox/${dupe.id}`); return; }
    if (url) {
      const src = captureLink({ url, target });
      onClose();
      if (repo && gh.state === 'read' && ghFetch.current) void readGithubSource(src.id, ghFetch.current);
      toast({ message: `Kept in Inbox · ${src.title}`, tone: 'ok', actions: [
        { label: 'Open', run: () => router.push(`/inbox/${src.id}`) },
        { label: 'Undo', run: () => { deleteSource(src.id); } },
      ] });
      return;
    }
    if (!sensChecked) { const hits = findSensitive(v); if (hits.length) { setSens(hits); return; } } // XEV-15: ask first
    if (shownKind === 'note') {
      const src = captureNote(v, target);
      onClose();
      toast({ message: 'Kept in Inbox · note', tone: 'ok', actions: [{ label: 'Open', run: () => router.push(`/inbox/${src.id}`) }, { label: 'Undo', run: () => { deleteSource(src.id); } }] });
      return;
    }
    const { src, kept, undo } = captureText(v, chosenKind && kind === 'prompt' ? 'prompt' : 'auto', target);
    onClose();
    const n = src.candidates?.length ?? 0;
    toast(kept
      ? { message: `Kept in ${dest.kind === 'inbox' ? 'Library' : where}`, tone: 'ok', actions: [{ label: 'Open', run: () => router.push(`/library/${kept.id}`) }, { label: 'Undo', run: undo }] }
      : { message: n ? `Kept in Inbox · ${n} found` : 'Kept in Inbox · note', tone: 'ok', actions: [{ label: 'Open', run: () => router.push(`/inbox/${src.id}`) }, { label: 'Undo', run: undo }] });
  };

  const onStartKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % KINDS.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a + KINDS.length - 1) % KINDS.length); }
    else if (e.key === 'Enter' && !query) { e.preventDefault(); pick(KINDS[active].k); }
  };
  // ↵ keeps (⌘↵ too); Shift+↵ is a new line
  const onComposeKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void keep(); }
    else if (e.key === 'Backspace' && !text && !file && !doc) { e.preventDefault(); back(); }
  };

  const TypeIcon = TYPE_ICON[shownKind];
  return (
    <dialog ref={ref} className={`dlg ${c.dlg}`} aria-label="Capture"
      onClose={() => { if (!ref.current?.open) onClose(); }} onCancel={e => { e.preventDefault(); if (stage === 'compose') back(); else onClose(); }}
      onMouseDown={e => { if (e.target === ref.current) onClose(); }}>
      {open && <div className={c.card}>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { onFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <input ref={docInput} type="file" accept={DOC_ACCEPT} hidden data-doc-input onChange={e => { onDoc(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        {stage === 'start' ? (<>
          <div className={c.cmdIn}>
            <Plus aria-hidden />
            <input id="cap-value" ref={el => { field.current = el; }} value={query} placeholder="What do you want to keep?" aria-label="What do you want to keep?"
              role="combobox" aria-expanded="true" aria-controls="cap-create" aria-activedescendant={`cap-opt-${KINDS[active].k}`} autoComplete="off"
              onChange={e => { const v = e.target.value; setQuery(v); if (v) { setFile(null); setChosenKind(false); typeInto(v); } }} onKeyDown={onStartKey}
              onPaste={e => {
                const f = imageFiles(e.clipboardData.files)[0]; if (f) { e.preventDefault(); onFile(f); return; }
                // a one-line field drops line breaks: several lines (links, a long prompt) go straight to the composer whole
                const t = e.clipboardData.getData('text/plain');
                if (/\n/.test(t.trim())) { e.preventDefault(); setFile(null); setDoc(null); setChosenKind(false); typeInto(t); }
              }} />
          </div>
          <div className={c.group} role="listbox" id="cap-create" aria-label="Create">
            <p className={c.groupHead} aria-hidden>Create</p>
            {KINDS.map(({ k, label, Icon }, i) => (
              <div key={k} id={`cap-opt-${k}`} role="option" aria-selected={i === active} className={c.opt} onMouseMove={() => setActive(i)} onClick={() => pick(k)}>
                <BrandIcon name={k} tier="tint" fallback={Icon} />{label}<span className={c.kbd} aria-hidden>↵</span>
              </div>
            ))}
          </div>
          <div className={c.foot} aria-hidden>
            <span><span className={c.kbd}>↑</span><span className={c.kbd}>↓</span>Move</span>
            <span><span className={c.kbd}>↵</span>Select</span>
            <span className={c.end}><span className={c.kbd}>Esc</span>Close</span>
          </div>
        </>) : (<>
          <div className={c.head}>
            <h2 className={c.crumb}>
              <button type="button" className={c.up} onClick={back} aria-label="Back to Capture" title="Back (Esc)"><ArrowLeft aria-hidden className={c.backArrow} />Capture</button>
              <ChevronRight aria-hidden className={c.sep} /><span>{crumb}</span>
            </h2>
            <button type="button" className={c.x} onClick={onClose} aria-label="Close (Esc)"><X aria-hidden /></button>
          </div>
          <div className={c.body}>
            {doc ? (
              <div className={c.docCard} aria-busy={!!reading} role="group" aria-label={`File: ${doc.name}`} tabIndex={-1}
                ref={el => { field.current = el as unknown as HTMLInputElement; }} onKeyDown={e => { if (e.target === e.currentTarget) onComposeKey(e); }}>
                <span className={c.docIcon} aria-hidden><FileText /></span>
                <div className={c.cardText}>
                  <span className={c.cardTitle}>{doc.name}</span>
                  <span className={c.cardSite}>{docLabel(doc)} · {sizeLabel(doc.size)}{reading && <span className={c.pill} role="status">{reading}</span>}</span>
                </div>
                {reading
                  ? <button type="button" className={c.readBtn} onClick={() => readAbort.current?.abort()}>Stop</button>
                  : <button type="button" className={c.rmDoc} onClick={() => { setDoc(null); back(); }} aria-label="Remove file"><X aria-hidden /></button>}
              </div>
            ) : (shownKind === 'link' || shownKind === 'video') && !file ? (<>
              <label className={c.url}><Link2 aria-hidden /><span className="sr-only">Link</span>
                <input id="cap-value" ref={el => { field.current = el; }} value={text} onChange={e => typeInto(e.target.value)} onKeyDown={onComposeKey} placeholder="Paste a link" autoComplete="off" spellCheck={false} />
              </label>
              {link && url && (
                <div className={c.preview}>
                  <div className={c.thumb} data-kind={link.kind} aria-hidden />
                  <div className={c.cardText}>
                    <span className={c.cardTitle}>{link.kind === 'github' ? link.title : link.display}</span>
                    <span className={c.cardSite}>
                      {siteLine(link, url, gh.files)}
                      {dupe && <span className={c.pill} data-dupe>Already saved</span>}
                      {repo && state.prefs.readGithub && gh.state === 'read'
                        ? <span className={c.pill} data-ok>Read from GitHub</span>
                        : repo && state.prefs.readGithub
                          ? <button type="button" className={c.readBtn} onClick={readRepo} disabled={gh.state === 'reading'}>{gh.state === 'reading' ? 'Reading…' : gh.state === 'failed' ? 'Couldn’t read · Try again' : 'Read from GitHub'}</button>
                          : <span className={c.pill}>Not read yet</span>}
                    </span>
                    {gh.state === 'read' && gh.desc && <p className={c.desc}>{gh.desc}</p>}
                  </div>
                </div>
              )}
            </>) : file ? (
              <div className={c.split}>
                <textarea id="cap-value" ref={el => { field.current = el; }} className={c.text} value={text} onChange={e => typeInto(e.target.value)} onKeyDown={onComposeKey} aria-label="Note" rows={5} />
                <div>
                  <div className={c.img}><ImagePreview file={file} /><button type="button" className={c.rm} onClick={() => { setFile(null); setDest({ kind: 'inbox' }); }} aria-label="Remove image"><X aria-hidden /></button></div>
                  <p className={c.fileName}>{file.name || 'Pasted image'} · {(file.size / 1048576).toFixed(1)} MB</p>
                </div>
              </div>
            ) : (
              <textarea id="cap-value" ref={el => { field.current = el; }} className={c.text} value={text} onChange={e => typeInto(e.target.value)} onKeyDown={onComposeKey}
                aria-label={bulk ? 'Links' : shownKind === 'note' ? 'Note' : 'Prompt'} rows={6} data-bulk={bulk ? '' : undefined}
                onPaste={e => { const f = imageFiles(e.clipboardData.files)[0]; if (f) { e.preventDefault(); onFile(f); } }} />
            )}
            {bulk && (
              <ul className={c.bulk} aria-label="Links to keep">
                {bulk.map(l => {
                  const saved = l.kind === 'link' ? bulkSaved.get(l.line) : undefined;
                  const label = l.kind === 'invalid' ? 'Not a link' : l.kind === 'repeat' ? `Same as line ${l.firstLine}` : saved ? 'Already saved' : 'New';
                  return (
                    <li key={l.line} data-state={l.kind === 'link' && !saved ? 'new' : l.kind === 'link' ? 'saved' : l.kind}>
                      <span className={c.bulkLine}>{l.kind === 'invalid' ? l.raw : l.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                      {saved
                        ? <a className={c.bulkState} href={`/inbox/${saved.id}`} onClick={e => { e.preventDefault(); onClose(); router.push(`/inbox/${saved.id}`); }}>{label}<ExternalLink aria-hidden /></a>
                        : <span className={c.bulkState}>{label}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {error && <p className={c.err} role="alert">{error}</p>}
            {sens && (
              <div className={c.sens} role="alert">
                <ShieldAlert aria-hidden />
                <span className={c.sensText}><b>Looks like {sens.length === 1 ? `${/^[AEIOaeio]/.test(sens[0].label) ? 'an' : 'a'} ${sens[0].label}` : `${sens.length} secrets or personal details`}</b>
                  {sens.length > 1 && <span> {sensitiveSummary(sens).map(g => `${g.label}${g.count > 1 ? ` ×${g.count}` : ''}`).join(', ')}</span>}</span>
                <button type="button" className="btn sm" onClick={() => void keep(false, maskSensitive(text, findSensitive(text)), true)}>Mask and keep</button>
                <button type="button" className="btn ghost sm" onClick={() => void keep(false, undefined, true)}>Keep as is</button>
              </div>
            )}
          </div>
          <div className={c.bar}>
            <DestMenu file={!!file} dest={dest} setDest={setDest} label={file && dest.kind === 'boards' && !dest.id ? 'New board' : destLabel} Icon={file && dest.kind !== 'inbox' ? SwatchBook : destIcon} />
            {!file && !doc && !bulk && <TypeMenu kind={shownKind} Icon={TypeIcon} onPick={k => { setKind(k); setChosenKind(true); }} />}
            {!doc && <button type="button" className={`${c.chip} ${c.icon}`} onClick={() => fileInput.current?.click()} aria-label="Attach an image" title="Attach an image"><Paperclip aria-hidden /></button>}
            {url && dupe ? (<>
              <button type="button" className={`${c.chip} ${c.saveAnyway}`} onClick={() => void keep(true)}>Save anyway</button>
              <button type="button" className={`${c.keep} ${c.keepNext}`} onClick={() => void keep()}>Open existing<span className={c.kbd} aria-hidden>↵</span></button>
            </>) : (
              <button type="button" className={c.keep} onClick={() => void keep()} disabled={!!reading} aria-busy={!!reading || undefined}>
                {bulk ? `Keep ${bulkNew.length} ${bulkNew.length === 1 ? 'link' : 'links'}` : 'Keep'}<span className={c.kbd} aria-hidden>↵</span>
              </button>
            )}
          </div>
        </>)}
      </div>}
    </dialog>
  );
}

function siteLine(link: ReturnType<typeof describeLink>, url: string, files?: string[]): ReactNode {
  if (link.kind === 'video') {
    const t = new URL(url).searchParams.get('t');
    const s = t ? Number(t.replace(/s$/, '')) : NaN;
    const at = Number.isFinite(s) ? ` · starts at ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
    return `${link.title.replace(' video', '')}${at}`;
  }
  if (link.kind === 'github') return files?.length ? `GitHub · ${files.join(', ')}` : 'GitHub';
  return link.host;
}

const sizeLabel = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const docLabel = (f: File) => (/\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? 'PDF' : /\.(srt|vtt)$/i.test(f.name) ? 'Transcript' : /\.(md|markdown|mdx)$/i.test(f.name) ? 'Markdown' : 'Text');

function ImagePreview({ file }: { file: File }) {
  const [src, setSrc] = useState('');
  useEffect(() => { const u = URL.createObjectURL(file); setSrc(u); return () => URL.revokeObjectURL(u); }, [file]);
  return src ? <img src={src} alt="" /> : null;
}

function usePop() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  return { open, setOpen, close, wrap };
}

/** Where it's kept: Inbox, a collection or a project (an image goes to a board). Search, then groups (Attio). */
function DestMenu({ file, dest, setDest, label, Icon }: { file: boolean; dest: Dest; setDest: (d: Dest) => void; label: string; Icon: LucideIcon }) {
  const { state } = useAppState();
  const { open, setOpen, close, wrap } = usePop();
  const [q, setQ] = useState('');
  const m = (n: string) => n.toLowerCase().includes(q.trim().toLowerCase());
  const item = (d: Dest, name: string, I: LucideIcon) => {
    const on = d.kind === dest.kind && ('id' in d ? 'id' in dest && dest.id === d.id : true);
    return (
      <button key={`${d.kind}-${'id' in d ? d.id : ''}`} type="button" role="menuitemradio" aria-checked={on} className={c.mi} onClick={() => { setDest(d); close(); }}>
        <I aria-hidden />{name}{on && <Check aria-hidden className={c.on} />}
      </button>
    );
  };
  const cols = state.collections.filter(x => m(x.name)), projs = state.projects.filter(x => m(x.name)), boards = state.boards.filter(b => m(b.title || 'Untitled board'));
  return (
    <span className={c.pop} ref={wrap}>
      <button type="button" className={c.chip} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon aria-hidden />{label}<ChevronDown aria-hidden className={c.chev} /></button>
      {open && (
        <div className={c.menu} role="menu" aria-label="Keep in" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
          <label className={c.menuSearch}><Search aria-hidden /><span className="sr-only">Find</span>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={file ? (has('playground') ? 'Find a board' : 'Find') : 'Find a collection or project'} /></label>
          {file ? (<>
            {m('inbox') && item({ kind: 'inbox' }, 'Inbox', Inbox)}
            {has('playground') && <>
              {boards.length > 0 && <p className={c.mh}>Boards</p>}
              {boards.map(b => item({ kind: 'boards', id: b.id }, b.title || 'Untitled board', SwatchBook))}
              {item({ kind: 'boards', id: '' }, 'New board', Plus)}
            </>}
          </>) : (<>
            {m('inbox') && item({ kind: 'inbox' }, 'Inbox', Inbox)}
            {cols.length > 0 && <p className={c.mh}>Collections</p>}
            {cols.map(x => item({ kind: 'collections', id: x.id }, x.name, Folder))}
            {projs.length > 0 && <p className={c.mh}>Projects</p>}
            {projs.map(x => item({ kind: 'projects', id: x.id }, x.name, Briefcase))}
          </>)}
        </div>
      )}
    </span>
  );
}

/** The detected type, changeable. */
function TypeMenu({ kind, Icon, onPick }: { kind: Kind; Icon: LucideIcon; onPick: (k: Kind) => void }) {
  const { open, setOpen, close, wrap } = usePop();
  const label = KINDS.find(k => k.k === kind)?.label ?? 'Prompt';
  return (
    <span className={c.pop} ref={wrap}>
      <button type="button" className={c.chip} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} aria-label={`Type: ${label}`}><BrandIcon name={kind} fallback={Icon} />{label}<ChevronDown aria-hidden className={c.chev} /></button>
      {open && (
        <div className={c.menu} role="menu" aria-label="Type" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
          {KINDS.filter(k => k.k !== 'image' && k.k !== 'file').map(({ k, label: l, Icon: I }) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={k === kind} className={c.mi} onClick={() => { onPick(k); close(); }} autoFocus={k === kind}>
              <BrandIcon name={k} tier="tint" fallback={I} />{l}{k === kind && <Check aria-hidden className={c.on} />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

