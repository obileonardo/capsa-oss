'use client';
/* Capture bar attachments (27 Oct, #88; references #1549-1554: ChatGPT, Mistral, WRITER, Claude, Expensify).
 * An image picked, pasted or dropped attaches to the bar as a thumbnail; nothing is kept until Send. Each one is checked,
 * measured and hashed as it arrives, so a refused or broken file says so at once and Send has nothing left to fail on.
 *   - A thumbnail is focusable: Delete or Backspace removes it, arrows move between them; Backspace in an empty field
 *     removes the last. The X is for pointers (and screen readers' virtual cursor).
 *   - Motion: a thumbnail grows in (scale .92 to 1, with opacity, @starting-style) and a pointer removal shrinks out, then
 *     the rest glide into place (transform only). Keyboard removals are instant. Reduced motion: no movement.
 *   - What the image is: Visual reference (default), Prompt, and your own types based on either (Settings › Types).
 *     One choice, because an item has one type. */
import { Check, X } from '@/components/ui/icons';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { TYPE_ICON } from '@/components/ui';
import { customTypes } from '@/lib/organise';
import { prepareAttachment, type ImagePrep } from '@/lib/capture/libraryImage';
import type { AppState, ArtifactType } from '@/lib/types';
import s from './library.module.css';

export const MAX_ATTACH = 10;

export interface Attachment {
  id: string;
  file: File;
  url: string;
  prep?: ImagePrep;
  leaving?: boolean;
}

const isImageFile = (f: File) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name);
const label = (a: Attachment) => a.prep?.name ?? (a.file.name && !/^image\.\w+$/i.test(a.file.name) ? a.file.name : 'Pasted image');

/** The bar's attached images. `onError` gets one plain sentence; `announce` is read out politely. */
export function useAttachments(onError: (msg: string) => void) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [announce, setAnnounce] = useState('');
  const list = useRef<Attachment[]>([]);
  list.current = items;
  const seq = useRef(0);
  const hashes = useRef(new Map<string, string>());
  // object URLs live as long as their thumbnail
  useEffect(() => () => { list.current.forEach(a => URL.revokeObjectURL(a.url)); }, []);

  const add = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const problems: string[] = [];
    const imgs = files.filter(f => { if (isImageFile(f)) return true; problems.push(`${f.name || 'That file'} isn’t an image. Use PNG, JPEG, WebP or GIF.`); return false; });
    const room = MAX_ATTACH - list.current.filter(a => !a.leaving).length;
    if (imgs.length > room) problems.push(`Up to ${MAX_ATTACH} images at a time.`);
    const take = imgs.slice(0, Math.max(0, room));
    const fresh: Attachment[] = take.map(f => ({ id: `att-${++seq.current}`, file: f, url: URL.createObjectURL(f) }));
    if (fresh.length) setItems(xs => [...xs, ...fresh]);
    let ok = 0;
    await Promise.all(fresh.map(async a => {
      const r = await prepareAttachment(a.file);
      const drop = () => { URL.revokeObjectURL(a.url); setItems(xs => xs.filter(x => x.id !== a.id)); };
      if ('error' in r) { drop(); problems.push(fresh.length > 1 || a.file.name ? `${a.file.name || 'That image'}: ${r.error}` : r.error); return; }
      // the same picture twice in one capture: kept once (hashes noted as they arrive, so a batch can't race past this)
      if ([...hashes.current.values()].includes(r.hash)) { drop(); problems.push(`${label({ ...a, prep: r })} is already attached.`); return; }
      hashes.current.set(a.id, r.hash); ok++;
      setItems(xs => xs.map(x => (x.id === a.id ? { ...x, prep: r } : x)));
    }));
    if (problems.length) onError(problems.length === 1 ? problems[0] : `${problems.length} files left out. ${problems[0]}`);
    if (ok > 0) setAnnounce(ok === 1 ? `Image attached: ${label(fresh.find(a => hashes.current.has(a.id))!)}` : `${ok} images attached.`);
  }, [onError]);

  /** `pointer` removals shrink out first; keyboard ones are instant. */
  const remove = useCallback((id: string, how: 'pointer' | 'key') => {
    const a = list.current.find(x => x.id === id);
    if (!a || a.leaving) return;
    hashes.current.delete(id);
    const gone = () => { URL.revokeObjectURL(a.url); setItems(xs => xs.filter(x => x.id !== id)); };
    const left = list.current.filter(x => x.id !== id && !x.leaving).length;
    setAnnounce(`Removed ${label(a)}. ${left ? `${left} attached.` : 'No images attached.'}`);
    if (how === 'key' || matchMedia('(prefers-reduced-motion: reduce)').matches) { gone(); return; }
    setItems(xs => xs.map(x => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(gone, 130);
  }, []);

  const clear = useCallback(() => { list.current.forEach(a => URL.revokeObjectURL(a.url)); hashes.current.clear(); setItems([]); }, []);
  const live = items.filter(a => !a.leaving);
  return { items, live, add, remove, clear, announce, reading: live.some(a => !a.prep) };
}

/** The thumbnails above the text. */
export function AttachTray({ items, onRemove, field }: {
  items: Attachment[]; onRemove: (id: string, how: 'pointer' | 'key') => void; field: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const hint = useId();
  const tray = useRef<HTMLUListElement>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const keyed = useRef(false);
  // the rest glide into place after a removal (FLIP, transform only); not after a keyboard removal
  useLayoutEffect(() => {
    const els = [...(tray.current?.querySelectorAll<HTMLElement>('[data-att]') ?? [])];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const el of els) {
      const id = el.dataset.att!, was = rects.current.get(id), now = el.getBoundingClientRect();
      if (was && !keyed.current && !reduce && (was.left !== now.left || was.top !== now.top)) {
        el.animate([{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }],
          { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      }
      rects.current.set(id, now);
    }
    keyed.current = false;
  }, [items]);
  const live = items.filter(a => !a.leaving);
  const onKey = (e: React.KeyboardEvent<HTMLElement>, a: Attachment) => {
    const i = live.findIndex(x => x.id === a.id);
    const focusAt = (j: number) => {
      const el = tray.current?.querySelectorAll<HTMLElement>('[data-att] [tabindex="0"]')[j];
      if (el) el.focus(); else field.current?.focus();
    };
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); keyed.current = true;
      // focus moves to the next thumbnail (or the one before, or the field) before this one goes, so it is never lost
      const els = tray.current?.querySelectorAll<HTMLElement>('[data-att] [tabindex="0"]');
      ((i < live.length - 1 ? els?.[i + 1] : els?.[i - 1]) ?? field.current)?.focus();
      onRemove(a.id, 'key');
    } else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(Math.min(i + 1, live.length - 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(Math.max(i - 1, 0)); }
    else if (e.key === 'ArrowDown' || (e.key.length === 1 && !e.metaKey && !e.ctrlKey)) { field.current?.focus(); }
  };
  if (!items.length) return null;
  return (
    <>
      <ul className={s.tray} ref={tray} aria-label="Attached images">
        {items.map(a => {
          const name = label(a);
          const i = live.indexOf(a);
          return (
            <li key={a.id} className={s.att} data-att={a.id} data-leaving={a.leaving || undefined} data-reading={!a.prep || undefined}>
              <span className={s.attImg} role="img" tabIndex={a.leaving ? -1 : 0} aria-describedby={hint} onKeyDown={e => onKey(e, a)}
                aria-label={`${name}${a.prep ? `, ${a.prep.prep.width} × ${a.prep.prep.height}` : ', checking'}, ${i + 1} of ${live.length}`} aria-busy={!a.prep || undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, never optimised */}
                <img src={a.url} alt="" draggable={false} />
              </span>
              <button type="button" className={s.attX} tabIndex={-1} aria-label={`Remove ${name}`} title="Remove" onClick={() => onRemove(a.id, 'pointer')}>
                <X aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <span id={hint} className="sr-only">Delete removes it.</span>
    </>
  );
}

/* ---------- what the image is ---------- */
export interface ImageKind { key: string; type: ArtifactType; customType?: string; label: string; short?: string }
export const DEFAULT_KIND = 'reference';

/** Visual reference and Prompt, then your own types based on either. */
export function imageKinds(state: AppState): ImageKind[] {
  return [
    { key: 'reference', type: 'reference', label: 'Visual reference', short: 'Reference' },
    { key: 'prompt', type: 'prompt', label: 'Prompt' },
    ...customTypes(state).filter(t => t.base === 'reference' || t.base === 'prompt').map(t => ({ key: t.id, type: t.base, customType: t.id, label: t.name })),
  ];
}

/** One choice, ticked. Arrow keys move the tick (a radio group). */
export function KindPicker({ kinds, value, onChange }: { kinds: ImageKind[]; value: string; onChange: (key: string) => void }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = kinds.findIndex(k => k.key === value);
    const next = kinds[(i + dir + kinds.length) % kinds.length];
    onChange(next.key);
    e.currentTarget.querySelector<HTMLElement>(`[data-kind="${next.key}"]`)?.focus(); // every choice is already on screen
  };
  return (
    <div className={s.kinds} role="radiogroup" aria-label="What the image is" onKeyDown={onKey}>
      {kinds.map(k => {
        const on = k.key === value;
        const Icon = on ? Check : TYPE_ICON[k.type];
        return (
          <button key={k.key} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-kind={k.key} className={`${s.cm} ${s.kind}`} onClick={() => onChange(k.key)}
            title={k.short ? undefined : k.label}>
            <Icon aria-hidden />
            {k.short ? <><span className={s.long}>{k.label}</span><span className={s.short}>{k.short}</span></> : <span className={s.kindLabel}>{k.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
