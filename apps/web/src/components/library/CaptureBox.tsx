'use client';
/* Bottom capture box on the Library (shell-picks.html round 4, .cap).
 * Build-out Stage 2: it really captures, on this device only.
 *   - Pasted text is split into candidates by plain rules (lib/capture/extract.ts; no AI, nothing sent anywhere) and
 *     lands in the Inbox, ready to review. Each candidate keeps its exact words as evidence.
 *   - A link is saved to the Inbox with a title and site read from the address. Nothing is fetched: GitHub links wait
 *     for "Reading public GitHub links (asks first)" in Settings; videos, posts and articles wait for the service.
 *   - "to Library ▾" picks where kept items go: the Library alone, or also a collection or project, each with the
 *     sidebar's glyph (27 Oct, #88; reference #1555-1556, Linear: glyphs leading, the tick trailing).
 *   - Images (27 Oct, #88): Image picks files; pasting or dropping works too. They attach to the bar (CaptureAttach.tsx)
 *     with the text typed beside them and a choice of what they are; Send keeps one item per image, sharing the text
 *     (as the prompt for a Prompt, as notes otherwise). Before that (25 Oct) images were kept straight away.
 * Enter keeps it; Shift+Enter adds a line. */
import { ArrowUp, Check, ChevronDown, Image as ImageIcon, ImagePlus, LibraryBig, Link2, Play, TextCursorInput } from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutsideClose, useToast } from '@/components/ui';
import { brandGlyph } from '@/components/ui/BrandIcon';
import { linkFromPaste } from '@/components/shell/omni';
import { captureImageItems, captureLink, captureText, deleteSource, libraryImageByHash, savedLinkFor, useAppState } from '@/lib/store';
import { findSensitive, maskSensitive, type SensitiveHit } from '@/lib/capture/sensitive';
import { linkSavedMessage } from '@/lib/capture/messages';
import { attachTitle, LIBRARY_IMAGE_ACCEPT, roomFor } from '@/lib/capture/libraryImage';
import type { Source } from '@/lib/types';
import { AttachTray, DEFAULT_KIND, imageKinds, KindPicker, useAttachments } from './CaptureAttach';
import { groupIcon } from './groupIcons';
import s from './library.module.css';

type Mode = 'link' | 'prompt' | 'video';
const PLACEHOLDER: Record<Mode, string> = {
  link: 'Paste a link or a prompt',
  prompt: 'Paste a prompt',
  video: 'Paste a video link',
};
type Dest = { kind: 'library' } | { kind: 'collections' | 'projects'; id: string };
const LibraryGlyph = brandGlyph('library', LibraryBig); // the sidebar's Library glyph
type Dup = { title: string; id: string }[];


export default function CaptureBox() {
  const toast = useToast();
  const router = useRouter();
  const { state } = useAppState();
  const [mode, setMode] = useState<Mode>('link');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [dest, setDest] = useState<Dest>({ kind: 'library' });
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [dup, setDup] = useState<Dup | null>(null);
  const att = useAttachments(useCallback((m: string) => setError(m), []));
  const kinds = imageKinds(state);
  const [kindKey, setKindKey] = useState(DEFAULT_KIND);
  const kind = kinds.find(k => k.key === kindKey) ?? kinds[0]; // a type deleted in Settings falls back to Visual reference
  const withImages = att.live.length > 0;
  useEffect(() => { setDup(null); }, [att.live.length]);

  // A destination that was deleted elsewhere falls back to the Library.
  const destGroup = dest.kind === 'library' ? null : (dest.kind === 'collections' ? state.collections : state.projects).find(g => g.id === dest.id) ?? null;
  useEffect(() => { if (dest.kind !== 'library' && !destGroup) setDest({ kind: 'library' }); }, [dest, destGroup]);
  const destName = destGroup?.name ?? 'Library';
  const target: Source['target'] = dest.kind === 'library' || !destGroup ? undefined : { [dest.kind]: [dest.id] };

  // XEV-15 (Track C): secrets or personal data in the text, found on this device; asked about once before keeping
  const [sens, setSens] = useState<SensitiveHit[] | null>(null);

  /** Attached images, kept with the text: one item per image, the chosen type, the chosen destination. */
  const keepImages = async (override?: string, sensChecked = false, allowDuplicate = false) => {
    if (att.reading || busy) return;
    const text = (override ?? value).trim();
    if (text && !sensChecked) { const hits = findSensitive(text); if (hits.length) { setSens(hits); return; } }
    setSens(null);
    const ready = att.live.filter(a => a.prep);
    if (!allowDuplicate) {
      const found = ready.flatMap(a => { const d = libraryImageByHash(a.prep!.hash); return d ? [{ title: d.title, id: d.id }] : []; });
      if (found.length) { setDup(found); return; }
    }
    if (!(await roomFor(ready.reduce((n, a) => n + a.file.size, 0)))) { setError('There isn’t enough space on this device for these images.'); return; }
    setBusy(true);
    try {
      const n = ready.length;
      const r = await captureImageItems(ready.map((a, i) => ({ file: a.file, hash: a.prep!.hash, name: a.prep!.name, prep: a.prep!.prep, title: attachTitle(a.prep!.name, text, i, n) })),
        { type: kind.type, customType: kind.customType, text, target });
      att.clear(); setValue(''); setError(''); setDup(null);
      toast({ message: `Kept in ${destGroup ? destGroup.name : 'Library'} · ${kind.label}${n > 1 ? ` · ${n} images` : ''}`, tone: 'ok', duration: 8000, actions: [
        { label: 'Open', run: () => router.push(n === 1 ? `/library/${r.kept[0].id}` : `/inbox/${r.src.id}`) },
        { label: 'Undo', run: r.undo },
      ] });
    } catch {
      setError('This browser wouldn’t keep the images. The device may be out of space, or site storage is blocked.');
    } finally { setBusy(false); }
  };

  const keep = (override?: string, sensChecked = false) => {
    if (withImages) { void keepImages(override, sensChecked); return; }
    const v = (override ?? value).trim();
    if (!v) { setError('Paste a link or type something to keep.'); field.current?.focus(); return; }
    const url = linkFromPaste(v);
    if ((mode === 'link' || mode === 'video') && !url && /^\S+$/.test(v) && /^(https?:|www\.)/i.test(v)) {
      setError('That link doesn’t look complete. Check it and try again.'); return;
    }
    if (mode === 'video' && !url) { setError('Paste a link to the video.'); return; }
    const into = destGroup ? ` · for “${destGroup.name}”` : '';
    const saved = url ? savedLinkFor(url) : undefined; // CAP-04: the same address is already saved
    if (url && saved) {
      toast({ message: `Already saved · ${saved.title}`, duration: 10000, actions: [
        { label: 'Open existing', run: () => router.push(`/inbox/${saved.id}`) },
        { label: 'Save anyway', run: () => { const src = captureLink({ url, target }); toast({ message: linkSavedMessage(src, !!state.prefs.readGithub), tone: 'ok', action: { label: 'Undo', run: () => deleteSource(src.id) } }); } },
      ] });
    } else if (url) {
      const src = captureLink({ url, target });
      toast({ message: linkSavedMessage(src, !!state.prefs.readGithub), tone: 'ok', action: { label: 'Undo', run: () => deleteSource(src.id) } });
    } else {
      if (!sensChecked) { const hits = findSensitive(v); if (hits.length) { setSens(hits); return; } }
      setSens(null);
      // One clear prompt goes straight to the Library (and the chosen collection or project); several finds wait in the Inbox
      const { src, kept, undo } = captureText(v, mode === 'prompt' ? 'prompt' : 'auto', target);
      const n = src.candidates?.length ?? 0;
      toast(kept
        ? { message: `Kept in ${destGroup ? destGroup.name : 'Library'}`, tone: 'ok', actions: [{ label: 'Open', run: () => router.push(`/library/${kept.id}`) }, { label: 'Undo', run: undo }] }
        : n
          ? { message: `Kept in Inbox · ${n} found${into}`, tone: 'ok', duration: 8000, actions: [{ label: 'Open', run: () => router.push(`/inbox/${src.id}`) }, { label: 'Undo', run: undo }] }
          : { message: 'Kept in Inbox · note', tone: 'ok', duration: 8000, actions: [{ label: 'Open', run: () => router.push(`/inbox/${src.id}`) }, { label: 'Undo', run: undo }] });
    }
    setValue(''); setError('');
    router.prefetch('/inbox');
  };

  const attach = (files: File[]) => { setError(''); void att.add(files); field.current?.focus(); };

  const imageChip = (
    <button type="button" className={s.cm} onClick={() => picker.current?.click()} aria-label={withImages ? 'Add images' : 'Image: attach images'}
      title="Attach images, or paste or drop them here">
      {withImages ? <ImagePlus aria-hidden /> : <><ImageIcon aria-hidden />Image</>}
    </button>
  );
  const chip = (m: Mode, label: string, Icon: typeof Link2) => (
    <button type="button" className={s.cm} aria-pressed={mode === m} onClick={() => { setMode(m); setError(''); field.current?.focus(); }}>
      <Icon aria-hidden />{label}
    </button>
  );
  const asPrompt = kind.type === 'prompt';
  const canSend = withImages ? !att.reading && !busy : !!value.trim();

  return (
    <div className={s.capWrap} data-capture-box>
      <form className={s.cap} aria-label="Capture" data-drop={dropping || undefined} data-attached={withImages || undefined} aria-busy={busy || undefined}
        onSubmit={e => { e.preventDefault(); keep(); }}
        onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropping(true); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); }}
        onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDropping(false); attach([...e.dataTransfer.files]); }}>
        <input ref={picker} type="file" accept={`${LIBRARY_IMAGE_ACCEPT},.heic,.heif`} multiple hidden aria-hidden tabIndex={-1}
          onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; attach(fs); }} />
        <div className={s.capDrop} aria-hidden><ImagePlus />Drop images to attach</div>
        <AttachTray items={att.items} onRemove={att.remove} field={field} />
        <label htmlFor="lib-cap" className="sr-only">{withImages ? (asPrompt ? 'The prompt for the images' : 'Notes on the images') : 'Link or text to keep'}</label>
        <textarea id="lib-cap" ref={field} className={s.cin} rows={1} value={value}
          placeholder={withImages ? (asPrompt ? 'Add the prompt' : 'Add notes') : PLACEHOLDER[mode]}
          aria-invalid={!!error} aria-describedby={error ? 'lib-cap-err' : 'lib-cap-hint'} enterKeyHint="send"
          onChange={e => { setValue(e.target.value); setError(''); setSens(null); setDup(null); }}
          onPaste={e => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              // a pasted screenshot attaches; text that came with it (not just the file's name) goes into the field
              e.preventDefault();
              const t = e.clipboardData.getData('text/plain');
              if (t.trim() && !files.some(f => f.name && t.trim() === f.name)) {
                const el = e.currentTarget, a = el.selectionStart, b = el.selectionEnd;
                const next = value.slice(0, a) + t + value.slice(b);
                setValue(next);
                requestAnimationFrame(() => el.setSelectionRange(a + t.length, a + t.length));
              }
              attach(files);
              return;
            }
            if (mode === 'prompt' && linkFromPaste(e.clipboardData.getData('text'))) setMode('link');
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); keep(); return; }
            // Backspace in an empty field takes back the last image
            if (e.key === 'Backspace' && !value && att.live.length && e.currentTarget.selectionStart === 0) { e.preventDefault(); att.remove(att.live[att.live.length - 1].id, 'key'); }
          }} />
        <span id="lib-cap-hint" className="sr-only">{withImages
          ? 'Send keeps each image in your Library with this text. Backspace in the empty field removes the last image.'
          : 'Text is split into prompts, steps, templates and configs on this device and waits in the Inbox for review. Links are saved without being read. Paste or drop images to attach them.'}</span>
        <p className="sr-only" aria-live="polite">{att.announce}</p>
        {error && <p id="lib-cap-err" className={s.capErr} role="alert">{error}</p>}
        {sens && (
          <p className={s.capErr} role="alert">
            Looks like {sens.length === 1 ? `${/^[AEIOaeio]/.test(sens[0].label) ? 'an' : 'a'} ${sens[0].label}` : `${sens.length} secrets or personal details`}{' '}
            <button type="button" className="btn sm" onClick={() => keep(maskSensitive(value), true)}>Mask and keep</button>{' '}
            <button type="button" className="btn ghost sm" onClick={() => keep(undefined, true)}>Keep as is</button>
          </p>
        )}
        {dup && (
          <p className={s.capNote} role="alert">
            <span className={s.capNoteText}>{dup.length === 1 ? <>Already saved · {dup[0].title}</> : <>{dup.length} of these are already saved</>}</span>
            {dup.length === 1 && <button type="button" className="btn ghost sm" onClick={() => router.push(`/library/${dup[0].id}`)}>Open existing</button>}
            <button type="button" className="btn sm" onClick={() => void keepImages(undefined, true, true)}>Save anyway</button>
          </p>
        )}
        <div className={s.crow}>
          {withImages ? <>
            {imageChip}
            <span className={s.crowRule} aria-hidden />
            <KindPicker kinds={kinds} value={kind.key} onChange={k => { setKindKey(k); setDup(null); }} />
          </> : <>
            {chip('link', 'Link', Link2)}
            {chip('prompt', 'Prompt', TextCursorInput)}
            {imageChip}
            {chip('video', 'Video', Play)}
          </>}
          <span className={s.crowEnd}>
            <Destination dest={dest} name={destName} onPick={setDest} />
            <button type="submit" className={s.csend} aria-label="Keep (Enter)" title="Keep (Enter)" disabled={!canSend} aria-busy={busy || undefined}><ArrowUp aria-hidden /></button>
          </span>
        </div>
      </form>
    </div>
  );
}

/** "to Library ▾": where kept items go. Everything is reviewed in the Inbox first; the menu says so. Each row wears the
 * sidebar's glyph for it (Library, the collection's, the project's), in the person's icon style, on one grid with the
 * label; the tick for the current choice sits at the end, so it never moves a label. */
function Destination({ dest, name, onPick }: { dest: Dest; name: string; onPick: (d: Dest) => void }) {
  const { state } = useAppState();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) (menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLElement>('button'))?.focus(); }, [open]);
  const pick = (d: Dest) => { onPick(d); setOpen(false); trigger.current?.focus(); };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); trigger.current?.focus(); }
    else if (e.key === 'Tab') close();
  };
  const glyphOf = (d: Dest) => {
    if (d.kind === 'library') return LibraryGlyph;
    const g = (d.kind === 'collections' ? state.collections : state.projects).find(x => x.id === d.id);
    return groupIcon(g?.icon, d.kind);
  };
  const item = (d: Dest, label: string) => {
    const on = d.kind === dest.kind && (d.kind === 'library' || (dest.kind !== 'library' && d.id === dest.id));
    const G = glyphOf(d);
    return (
      <button key={d.kind === 'library' ? 'lib' : d.id} type="button" role="menuitemradio" aria-checked={on} tabIndex={-1} className={s.menuItem} onClick={() => pick(d)}>
        <G className={s.destGlyph} aria-hidden /><span className={s.menuLabel} title={label}>{label}</span>
        <span className={s.menucheck} aria-hidden>{on && <Check />}</span>
      </button>
    );
  };
  const Current = glyphOf(dest);
  return (
    <div className={s.ctoWrap} ref={wrap}>
      <button ref={trigger} type="button" className={`${s.cto} ${s.ctoBtn}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        aria-label={`Kept items go to: ${name}. Change`} title="Captures are reviewed in the Inbox first; kept items go here">
        to <Current className={s.destGlyph} aria-hidden /><b>{name}</b><ChevronDown aria-hidden />
      </button>
      {open && (
        <div className={`${s.menu} ${s.ctoMenu}`} role="menu" aria-label="Where kept items go" ref={menu} onKeyDown={onKey}>
          <div className={s.menuHead} aria-hidden>Reviewed in the Inbox first, then kept in</div>
          {item({ kind: 'library' }, 'Library')}
          {state.collections.length > 0 && <div className={s.menuHead} aria-hidden>Library, and the collection</div>}
          {state.collections.map(c => item({ kind: 'collections', id: c.id }, c.name))}
          {state.projects.length > 0 && <div className={s.menuHead} aria-hidden>Library, and the project</div>}
          {state.projects.map(p => item({ kind: 'projects', id: p.id }, p.name))}
        </div>
      )}
    </div>
  );
}
